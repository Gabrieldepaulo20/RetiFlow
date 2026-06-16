import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronDown, Landmark, Paperclip, ReceiptText, Save, Sparkles } from 'lucide-react';
import {
  AccountPayable,
  PayableEntrySource,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  RECURRENCE_TYPE_LABELS,
  RecurrenceType,
} from '@/types';
import {
  buildMeaningfulPayableTitle,
  buildPayableHistoryDescription,
  calculatePayableFinalAmount,
  classifyPayableMatch,
  PAYABLE_FIELD_LIMITS,
} from '@/services/domain/payables';
import { inferPayableAttachmentType } from '@/services/domain/payableFiles';
import {
  normalizeDecimalInputDraft,
  normalizeMoneyInput,
  normalizeWhitespace,
  onlyDigits,
  parsePositiveNumber,
  toTitleCasePtBr,
} from '@/services/domain/textNormalization';
import { insertAnexoContaPagar, uploadAnexoContaPagar } from '@/api/supabase/contas-pagar';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

type PayableQuickFormProps = {
  onCancel: () => void;
  onSaved?: (payable: AccountPayable) => void;
  entrySource?: PayableEntrySource;
  compact?: boolean;
  initialValues?: Partial<FormValues>;
  submitLabel?: string;
};

type InitialStatus = 'PENDENTE' | 'PAGO';

type FormValues = {
  title: string;
  categoryId: string;
  supplierName: string;
  favorecidoTipo: 'FORNECEDOR' | 'FUNCIONARIO';
  dueDate: string;
  amount: string;
  initialStatus: InitialStatus;
  paidAt: string;
  paidAmount: string;
  paymentMethod: PaymentMethod;
  recurrence: RecurrenceType;
  isInstallment: boolean;
  totalInstallments: string;
  recurrenceIndex: string;
  docNumber: string;
  observations: string;
  isUrgent: boolean;
};

const RECURRENCE_OPTIONS: RecurrenceType[] = [
  'NENHUMA',
  'SEMANAL',
  'QUINZENAL',
  'MENSAL',
  'BIMESTRAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
];

const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = [
  'PIX',
  'BOLETO',
  'TRANSFERENCIA',
  'DEBITO_AUTOMATICO',
  'DINHEIRO',
  'CHEQUE',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
];

function parseMoneyInput(value: string): number {
  return normalizeMoneyInput(value).value ?? 0;
}

export default function PayableQuickForm({
  onCancel,
  onSaved,
  entrySource = 'MANUAL',
  compact = false,
  initialValues,
  submitLabel = 'Salvar conta',
}: PayableQuickFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    addPayable,
    payables,
    payableCategories,
    payableSuppliers,
    addPayableAttachment,
    addPayableHistoryEntry,
  } = useData();

  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [duplicateToConfirm, setDuplicateToConfirm] = useState<AccountPayable | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormValues>({
    title: initialValues?.title ?? '',
    categoryId: initialValues?.categoryId ?? payableCategories[0]?.id ?? 'paycat-1',
    supplierName: initialValues?.supplierName ?? '',
    favorecidoTipo: initialValues?.favorecidoTipo ?? 'FORNECEDOR',
    dueDate: initialValues?.dueDate ?? '',
    amount: initialValues?.amount ?? '',
    initialStatus: initialValues?.initialStatus ?? 'PENDENTE',
    paidAt: initialValues?.paidAt ?? new Date().toISOString().slice(0, 10),
    paidAmount: initialValues?.paidAmount ?? '',
    paymentMethod: initialValues?.paymentMethod ?? 'PIX',
    recurrence: initialValues?.recurrence ?? 'NENHUMA',
    isInstallment: initialValues?.isInstallment ?? false,
    totalInstallments: initialValues?.totalInstallments ?? '2',
    recurrenceIndex: initialValues?.recurrenceIndex ?? '1',
    docNumber: initialValues?.docNumber ?? '',
    observations: initialValues?.observations ?? '',
    isUrgent: initialValues?.isUrgent ?? false,
  });

  const supplierOptions = useMemo(
    () => payableSuppliers.filter((supplier) => supplier.isActive).map((supplier) => supplier.name),
    [payableSuppliers],
  );

  const resolvedAmount = useMemo(() => calculatePayableFinalAmount(parseMoneyInput(form.amount)), [form.amount]);
  const paidAmountValue = useMemo(
    () => parseMoneyInput(form.paidAmount) || resolvedAmount,
    [form.paidAmount, resolvedAmount],
  );

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    setAttachment(event.target.files?.[0] ?? null);
  }

  async function savePayable(options: { allowDuplicate?: boolean } = {}) {
    if (saving) return;

    const supplierName = toTitleCasePtBr(form.supplierName);
    const amountResult = parsePositiveNumber(form.amount, { allowZero: false, fieldLabel: 'valor' });

    if (!form.title.trim() || !form.categoryId || !supplierName || !form.dueDate || amountResult.error) {
      toast({
        title: 'Preencha os campos obrigatórios',
        description: amountResult.error ?? 'Descrição, categoria, fornecedor, valor e vencimento são essenciais para cadastrar a conta.',
        variant: 'destructive',
      });
      return;
    }

    const originalAmount = amountResult.value ?? 0;
    const totalInstallmentsResult = form.isInstallment
      ? parsePositiveNumber(form.totalInstallments, { allowZero: false, integer: true, fieldLabel: 'total de parcelas' })
      : { value: undefined, error: null };
    const recurrenceIndexResult = form.isInstallment
      ? parsePositiveNumber(form.recurrenceIndex, { allowZero: false, integer: true, fieldLabel: 'parcela atual' })
      : { value: undefined, error: null };

    if (form.isInstallment && (totalInstallmentsResult.error || recurrenceIndexResult.error)) {
      toast({
        title: 'Parcelamento inválido',
        description: totalInstallmentsResult.error ?? recurrenceIndexResult.error ?? 'Informe parcelas válidas.',
        variant: 'destructive',
      });
      return;
    }

    const totalInstallments = form.isInstallment ? Math.max(2, totalInstallmentsResult.value ?? 2) : undefined;
    const recurrenceIndex = form.isInstallment ? Math.max(1, recurrenceIndexResult.value ?? 1) : undefined;

    if (form.isInstallment && recurrenceIndex && totalInstallments && recurrenceIndex > totalInstallments) {
      toast({
        title: 'Parcelamento inválido',
        description: 'A parcela atual não pode ser maior que o total de parcelas.',
        variant: 'destructive',
      });
      return;
    }

    const title = toTitleCasePtBr(buildMeaningfulPayableTitle({
      title: form.title,
      supplierName,
      docNumber: form.docNumber,
      dueDate: form.dueDate,
      recurrenceIndex,
      totalInstallments,
    }));

    const matchedSupplier = payableSuppliers.find(
      (supplier) => supplier.name.toLowerCase() === supplierName.toLowerCase(),
    );

    // Classifica em vez de bloquear por igualdade exata: só pede confirmação em
    // duplicidade provável. Parcela/recorrência/casos a revisar passam direto
    // (parcelas legítimas não são tratadas como duplicata).
    const match = classifyPayableMatch(
      {
        supplierId: matchedSupplier?.id,
        supplierName,
        docNumber: form.docNumber.trim() || undefined,
        originalAmount,
        dueDate: form.dueDate,
        recurrence: form.recurrence,
        recurrenceIndex,
        totalInstallments,
      },
      payables,
    );

    if (match.kind === 'duplicidade_provavel' && match.match && !options.allowDuplicate) {
      setDuplicateToConfirm(match.match);
      return;
    }
    if (match.kind === 'revisar' && match.match) {
      toast({
        title: 'Lançamento parecido encontrado',
        description: `${match.reasons.join(' · ')}. Confira se não é a mesma conta antes de salvar.`,
      });
    }

    const isPaid = form.initialStatus === 'PAGO';
    const recurrence = form.isInstallment && form.recurrence === 'NENHUMA' ? 'MENSAL' : form.recurrence;

    setSaving(true);
    try {
      const payable = await addPayable({
        title,
        supplierId: matchedSupplier?.id,
        supplierName,
        favorecidoTipo: form.favorecidoTipo,
        categoryId: form.categoryId,
        docNumber: normalizeWhitespace(form.docNumber) || undefined,
        dueDate: form.dueDate,
        issueDate: new Date().toISOString().slice(0, 10),
        originalAmount,
        finalAmount: resolvedAmount,
        status: isPaid ? 'PAGO' : 'PENDENTE',
        paymentMethod: form.paymentMethod,
        paidWith: isPaid ? form.paymentMethod : undefined,
        paidAmount: isPaid ? Math.max(paidAmountValue, resolvedAmount) : undefined,
        paidAt: isPaid ? form.paidAt : undefined,
        recurrence,
        recurrenceIndex,
        totalInstallments,
        observations: normalizeWhitespace(form.observations) || undefined,
        isUrgent: form.isUrgent,
        entrySource,
        paymentExecutionStatus: 'MANUAL',
        createdByUserId: user?.id ?? 'user-2',
      });

      addPayableHistoryEntry(
        buildPayableHistoryDescription({
          payableId: payable.id,
          action: 'CREATED',
          userId: user?.id ?? 'user-2',
        }),
      );

      if (attachment) {
        const type = inferPayableAttachmentType(attachment);
        let url = `local-upload://${attachment.name}`;
        let attachmentSaved = true;

        if (IS_REAL_AUTH) {
          try {
            url = await uploadAnexoContaPagar({ contaPagarId: payable.id, file: attachment });
            await insertAnexoContaPagar({
              p_fk_contas_pagar: payable.id,
              p_tipo: type,
              p_nome_arquivo: attachment.name,
              p_url: url,
            });
          } catch {
            attachmentSaved = false;
          }
        }

        if (attachmentSaved) {
          addPayableAttachment({
            payableId: payable.id,
            type,
            filename: attachment.name,
            url,
            createdByUserId: user?.id ?? 'user-2',
          });
          addPayableHistoryEntry(
            buildPayableHistoryDescription({
              payableId: payable.id,
              action: 'ATTACHMENT_ADDED',
              userId: user?.id ?? 'user-2',
              extra: { filename: attachment.name },
            }),
          );
        } else {
          toast({
            title: 'Conta criada sem anexo',
            description: 'O arquivo não foi salvo no Storage. Tente anexar novamente nos detalhes da conta.',
            variant: 'destructive',
          });
        }
      }

      toast({
        title: isPaid ? 'Conta registrada como paga' : 'Conta cadastrada com sucesso',
        description: isPaid
          ? 'O lançamento entrou no histórico e já impacta as despesas pagas do período.'
          : 'A conta já aparece na listagem de contas a pagar para acompanhamento.',
      });

      setDuplicateToConfirm(null);
      onSaved?.(payable);
    } catch (error) {
      toast({
        title: 'Não foi possível salvar a conta',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void savePayable();
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className={compact ? 'grid gap-4 md:grid-cols-2' : 'grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]'}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Descrição da conta *</Label>
              <Input
                value={form.title}
                onChange={(event) => setField('title', event.target.value.slice(0, PAYABLE_FIELD_LIMITS.title))}
                onBlur={() => setField('title', toTitleCasePtBr(form.title))}
                placeholder="Ex.: Salário João Maio, boleto peças abril, reforma do barracão"
                maxLength={PAYABLE_FIELD_LIMITS.title}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Select value={form.categoryId} onValueChange={(value) => setField('categoryId', value)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {payableCategories.filter((category) => category.isActive).map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>{form.favorecidoTipo === 'FUNCIONARIO' ? 'Funcionário *' : 'Fornecedor *'}</Label>
                <div className="flex rounded-lg border border-border/70 p-0.5 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setField('favorecidoTipo', 'FORNECEDOR')}
                    className={`rounded-md px-2 py-0.5 transition-colors ${form.favorecidoTipo !== 'FUNCIONARIO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Fornecedor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const maoDeObra = payableCategories.find((c) => /m[aã]o\s*de\s*obra/i.test(c.name));
                      setForm((prev) => ({
                        ...prev,
                        favorecidoTipo: 'FUNCIONARIO',
                        categoryId: maoDeObra?.id ?? prev.categoryId,
                      }));
                    }}
                    className={`rounded-md px-2 py-0.5 transition-colors ${form.favorecidoTipo === 'FUNCIONARIO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Funcionário
                  </button>
                </div>
              </div>
              <Input
                list="payable-suppliers"
                value={form.supplierName}
                onChange={(event) => setField('supplierName', event.target.value.slice(0, PAYABLE_FIELD_LIMITS.supplierName))}
                onBlur={() => setField('supplierName', toTitleCasePtBr(form.supplierName))}
                placeholder={form.favorecidoTipo === 'FUNCIONARIO' ? 'Nome do funcionário' : 'Digite ou escolha um fornecedor'}
              />
              <datalist id="payable-suppliers">
                {supplierOptions.map((supplier) => <option key={supplier} value={supplier} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(event) => setField('amount', normalizeDecimalInputDraft(event.target.value))} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Input type="date" value={form.dueDate} onChange={(event) => setField('dueDate', event.target.value)} />
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Como essa conta entra no sistema?</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setField('initialStatus', 'PENDENTE')}>
                <div className={form.initialStatus === 'PENDENTE' ? 'rounded-2xl border border-primary bg-primary/5 p-3 text-left' : 'rounded-2xl border border-border/60 p-3 text-left'}>
                  <p className="text-sm font-semibold">A pagar</p>
                  <p className="mt-1 text-xs text-muted-foreground">Vai para a fila de vencimento e cobrança interna.</p>
                </div>
              </button>
              <button type="button" onClick={() => setField('initialStatus', 'PAGO')}>
                <div className={form.initialStatus === 'PAGO' ? 'rounded-2xl border border-emerald-500 bg-emerald-500/5 p-3 text-left' : 'rounded-2xl border border-border/60 p-3 text-left'}>
                  <p className="text-sm font-semibold">Já pago</p>
                  <p className="mt-1 text-xs text-muted-foreground">Registra direto como saída já liquidada.</p>
                </div>
              </button>
            </div>
          </div>

          {form.initialStatus === 'PAGO' ? (
            <div className="grid gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Data do pagamento</Label>
                <Input type="date" value={form.paidAt} onChange={(event) => setField('paidAt', event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor pago</Label>
                <Input inputMode="decimal" value={form.paidAmount} onChange={(event) => setField('paidAmount', normalizeDecimalInputDraft(event.target.value))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de pagamento</Label>
                <Select value={form.paymentMethod} onValueChange={(value) => setField('paymentMethod', value as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>{PAYMENT_METHOD_LABELS[option]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between rounded-2xl">
                <span>Detalhes adicionais</span>
                <ChevronDown className={detailsOpen ? 'h-4 w-4 rotate-180 transition-transform' : 'h-4 w-4 transition-transform'} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Documento</Label>
                  <Input
                    value={form.docNumber}
                    onChange={(event) => setField('docNumber', event.target.value.slice(0, PAYABLE_FIELD_LIMITS.docNumber))}
                    onBlur={() => setField('docNumber', normalizeWhitespace(form.docNumber))}
                    placeholder="NF, boleto, guia ou recibo"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Recorrência</Label>
                  <Select value={form.recurrence} onValueChange={(value) => setField('recurrence', value as RecurrenceType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{RECURRENCE_TYPE_LABELS[option]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Conta parcelada</p>
                    <p className="text-xs text-muted-foreground">Use para máquinas, reformas ou compras maiores.</p>
                  </div>
                  <Switch checked={form.isInstallment} onCheckedChange={(checked) => setField('isInstallment', checked)} />
                </div>
                {form.isInstallment ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Total de parcelas</Label>
                      <Input inputMode="numeric" value={form.totalInstallments} onChange={(event) => setField('totalInstallments', onlyDigits(event.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Parcela atual</Label>
                      <Input inputMode="numeric" value={form.recurrenceIndex} onChange={(event) => setField('recurrenceIndex', onlyDigits(event.target.value))} />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea
                  value={form.observations}
                  onChange={(event) => setField('observations', event.target.value.slice(0, PAYABLE_FIELD_LIMITS.observations))}
                  onBlur={() => setField('observations', normalizeWhitespace(form.observations))}
                  placeholder="Informações úteis para o financeiro, negociação, vínculo com obra ou fornecedor."
                  rows={4}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-2xl border border-dashed border-border/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Anexo da conta</p>
                      <p className="text-xs text-muted-foreground">PDF, imagem, DOCX ou comprovante.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => attachmentInputRef.current?.click()}>
                      <Paperclip className="mr-2 h-4 w-4" />
                      Anexar
                    </Button>
                  </div>
                  <input ref={attachmentInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={onAttachmentChange} className="hidden" />
                  {attachment ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
                      <span className="truncate">{attachment.name}</span>
                      <Badge variant="secondary">{inferPayableAttachmentType(attachment)}</Badge>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Urgência</p>
                      <p className="text-xs text-muted-foreground">Destaque visual na operação.</p>
                    </div>
                    <Switch checked={form.isUrgent} onCheckedChange={(checked) => setField('isUrgent', checked)} />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-background p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/70">Resumo do lançamento</p>
                <p className="mt-2 text-3xl font-display font-bold tracking-tight">
                  {resolvedAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>Fornecedor: <span className="font-medium text-foreground">{form.supplierName || 'A definir'}</span></p>
              <p>Vencimento: <span className="font-medium text-foreground">{form.dueDate || 'Não informado'}</span></p>
              <p>Status inicial: <span className="font-medium text-foreground">{form.initialStatus === 'PAGO' ? 'Já pago' : 'A pagar'}</span></p>
              <p>Origem: <span className="font-medium text-foreground">{entrySource === 'CAMERA_CAPTURE' ? 'Foto / câmera' : entrySource === 'IA_IMPORT' ? 'Importação por IA' : entrySource === 'AUTO_SERIES' ? 'Série automática' : 'Cadastro manual'}</span></p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Landmark className="h-4 w-4 text-primary" />
              Preparação para financeiro robusto
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Compatível com parcelas e recorrência desde o cadastro.</li>
              <li>• Salários entram como Mão de Obra, com recorrência mensal e comprovante anexado.</li>
              <li>• Estrutura pronta para anexar documentos e comprovantes.</li>
              <li>• Pensado para futura integração com pagamento via API bancária.</li>
            </ul>
          </div>

          {compact ? null : (
            <div className="rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
              Esse formulário prioriza velocidade. Campos secundários ficaram em “Detalhes adicionais” para o financeiro não travar em cadastros do dia a dia.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/60 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving}>
          <Save className={saving ? 'mr-2 h-4 w-4 animate-pulse' : 'mr-2 h-4 w-4'} />
          {submitLabel}
        </Button>
      </div>
    </form>
    <AlertDialog open={duplicateToConfirm !== null} onOpenChange={(open) => { if (!open) setDuplicateToConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Esta conta parece duplicada</AlertDialogTitle>
          <AlertDialogDescription>
            Já existe um lançamento parecido: <strong>{duplicateToConfirm?.title}</strong>. Se for a mesma conta, não cadastre de novo. Se for uma parcela diferente ou uma cobrança realmente separada, você pode confirmar mesmo assim.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Revisar dados</AlertDialogCancel>
          <AlertDialogAction onClick={() => void savePayable({ allowDuplicate: true })}>
            Inserir mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
