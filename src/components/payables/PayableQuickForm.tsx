import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronDown, Landmark, Paperclip, ReceiptText, Save, Sparkles } from 'lucide-react';
import {
  AccountPayable,
  PayableAttachmentFileType,
  PayableEntrySource,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  RECURRENCE_TYPE_LABELS,
  RecurrenceType,
} from '@/types';
import {
  buildPayableHistoryDescription,
  calculatePayableFinalAmount,
  findPayableDuplicate,
  PAYABLE_FIELD_LIMITS,
} from '@/services/domain/payables';
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
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferAttachmentType(file: File): PayableAttachmentFileType {
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.includes('boleto')) return 'BOLETO';
  if (lower.includes('nota') || lower.includes('nf')) return 'NOTA_FISCAL';
  if (lower.includes('comp') || lower.includes('recibo') || file.type.startsWith('image/')) return 'COMPROVANTE';
  if (lower.includes('contrato')) return 'CONTRATO';
  return 'OUTRO';
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
  const [form, setForm] = useState<FormValues>({
    title: initialValues?.title ?? '',
    categoryId: initialValues?.categoryId ?? payableCategories[0]?.id ?? 'paycat-1',
    supplierName: initialValues?.supplierName ?? '',
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const title = form.title.trim();
    const supplierName = form.supplierName.trim();
    const originalAmount = parseMoneyInput(form.amount);

    if (!title || !form.categoryId || !supplierName || !form.dueDate || originalAmount <= 0) {
      toast({
        title: 'Preencha os campos obrigatórios',
        description: 'Descrição, categoria, fornecedor, valor e vencimento são essenciais para cadastrar a conta.',
        variant: 'destructive',
      });
      return;
    }

    const matchedSupplier = payableSuppliers.find(
      (supplier) => supplier.name.toLowerCase() === supplierName.toLowerCase(),
    );

    const duplicate = findPayableDuplicate(
      {
        supplierId: matchedSupplier?.id,
        supplierName,
        docNumber: form.docNumber.trim() || undefined,
        originalAmount,
        dueDate: form.dueDate,
      },
      payables,
    );

    if (duplicate) {
      toast({
        title: 'Conta possivelmente duplicada',
        description: `Já existe um lançamento parecido: ${duplicate.title}.`,
        variant: 'destructive',
      });
      return;
    }

    const isPaid = form.initialStatus === 'PAGO';
    const totalInstallments = form.isInstallment ? Math.max(2, Number(form.totalInstallments) || 2) : undefined;
    const recurrenceIndex = form.isInstallment ? Math.max(1, Number(form.recurrenceIndex) || 1) : undefined;
    const recurrence = form.isInstallment && form.recurrence === 'NENHUMA' ? 'MENSAL' : form.recurrence;

    const payable = await addPayable({
      title,
      supplierId: matchedSupplier?.id,
      supplierName,
      categoryId: form.categoryId,
      docNumber: form.docNumber.trim() || undefined,
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
      observations: form.observations.trim() || undefined,
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
      const type = inferAttachmentType(attachment);
      let url = `local-upload://${attachment.name}`;

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
          // storage indisponível — mantém referência local
        }
      }

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
    }

    toast({
      title: isPaid ? 'Conta registrada como paga' : 'Conta cadastrada com sucesso',
      description: isPaid
        ? 'O lançamento entrou no histórico e já impacta as despesas pagas do período.'
        : 'A conta já aparece na listagem de contas a pagar para acompanhamento.',
    });

    onSaved?.(payable);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className={compact ? 'grid gap-4 md:grid-cols-2' : 'grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]'}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Descrição da conta *</Label>
              <Input
                value={form.title}
                onChange={(event) => setField('title', event.target.value.slice(0, PAYABLE_FIELD_LIMITS.title))}
                placeholder="Ex.: Boleto peças abril, reforma do barracão, notinha do mercado"
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
              <Label>Fornecedor *</Label>
              <Input
                list="payable-suppliers"
                value={form.supplierName}
                onChange={(event) => setField('supplierName', event.target.value.slice(0, PAYABLE_FIELD_LIMITS.supplierName))}
                placeholder="Digite ou escolha um fornecedor"
              />
              <datalist id="payable-suppliers">
                {supplierOptions.map((supplier) => <option key={supplier} value={supplier} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(event) => setField('amount', event.target.value)} placeholder="0,00" />
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
                <Input inputMode="decimal" value={form.paidAmount} onChange={(event) => setField('paidAmount', event.target.value)} placeholder="0,00" />
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
                      <Input inputMode="numeric" value={form.totalInstallments} onChange={(event) => setField('totalInstallments', event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Parcela atual</Label>
                      <Input inputMode="numeric" value={form.recurrenceIndex} onChange={(event) => setField('recurrenceIndex', event.target.value)} />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea
                  value={form.observations}
                  onChange={(event) => setField('observations', event.target.value.slice(0, PAYABLE_FIELD_LIMITS.observations))}
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
                      <Badge variant="secondary">{inferAttachmentType(attachment)}</Badge>
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
        <Button type="submit">
          <Save className="mr-2 h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
