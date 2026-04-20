import { useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PayableModalShell from '@/components/payables/PayableModalShell';
import { useData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';
import {
  AccountPayable,
  PAYABLE_ENTRY_SOURCE_LABELS,
  PAYABLE_HISTORY_ACTION_LABELS,
  PAYABLE_STATUS_COLORS,
  PAYABLE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECURRENCE_TYPE_LABELS,
} from '@/types';
import {
  calculatePayableRemainingBalance,
  canRegisterPayment,
  formatPayableRecurrenceLabel,
  getPayableDisplayStatus,
  isPayableOverdue,
} from '@/services/domain/payables';
import { ArrowUpRight, CalendarRange, CheckCircle2, Circle, Clock, Landmark, Layers3, Paperclip, Sparkles, Wallet } from 'lucide-react';

type PayableDetailsModalProps = {
  open: boolean;
  payableId?: string | null;
  onOpenChange: (open: boolean) => void;
  onRequestPayment?: (payable: AccountPayable) => void;
  onRequestEdit?: (payable: AccountPayable) => void;
};

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PayableDetailsModal({
  open,
  payableId,
  onOpenChange,
  onRequestPayment,
  onRequestEdit,
}: PayableDetailsModalProps) {
  const { getPayable, getAttachmentsForPayable, getHistoryForPayable, payableCategories, getInstallmentSiblings } = useData();

  // Mantém o último ID válido enquanto o modal anima o fechamento
  const lastIdRef = useRef<string | null>(null);
  if (payableId) lastIdRef.current = payableId;
  const resolvedId = open ? payableId : lastIdRef.current;

  const payable = resolvedId ? getPayable(resolvedId) : undefined;
  const attachments = payable ? getAttachmentsForPayable(payable.id) : [];
  const history = payable ? getHistoryForPayable(payable.id) : [];
  const category = payable ? payableCategories.find((item) => item.id === payable.categoryId) : undefined;

  if (!payable) {
    return (
      <PayableModalShell
        open={open}
        onOpenChange={onOpenChange}
        title="Detalhes da conta"
        description="Conta não encontrada ou removida da listagem."
      >
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          <span>Selecione uma conta válida para abrir os detalhes.</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </PayableModalShell>
    );
  }

  const displayStatus = getPayableDisplayStatus(payable);
  const recurrenceLabel = formatPayableRecurrenceLabel(payable, RECURRENCE_TYPE_LABELS[payable.recurrence]);
  const installmentSiblings = (payable.totalInstallments ?? 0) > 1 ? getInstallmentSiblings(payable) : [];

  return (
    <PayableModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={payable.title}
      description="Visão consolidada da conta, com origem, anexos, histórico e preparação para fluxos bancários futuros."
      desktopClassName="sm:max-w-5xl"
    >
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Status</p><div className="mt-2"><Badge className={cn(PAYABLE_STATUS_COLORS[displayStatus])}>{PAYABLE_STATUS_LABELS[displayStatus]}</Badge></div></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valor</p><p className="mt-2 text-lg font-semibold">{fmtBRL(payable.finalAmount)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Saldo atual</p><p className="mt-2 text-lg font-semibold">{fmtBRL(calculatePayableRemainingBalance(payable))}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Competência</p><p className="mt-2 text-sm font-medium">{payable.competencyDate ? format(parseISO(payable.competencyDate), 'MM/yyyy') : '—'}</p></CardContent></Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_360px]">
          <div className="space-y-6">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Resumo financeiro</p>
                    <p className="text-xs text-muted-foreground">Tudo que a cliente precisa bater o olho e entender.</p>
                  </div>
                  {payable.isUrgent ? <Badge variant="secondary">Urgente</Badge> : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 text-sm">
                  <div><span className="text-muted-foreground">Fornecedor:</span> <span className="font-medium">{payable.supplierName ?? 'Não informado'}</span></div>
                  <div><span className="text-muted-foreground">Categoria:</span> <span className="font-medium">{category?.name ?? 'Não definida'}</span></div>
                  <div><span className="text-muted-foreground">Documento:</span> <span className="font-medium">{payable.docNumber ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Vencimento:</span> <span className={cn('font-medium', isPayableOverdue(payable) && 'text-destructive')}>{format(parseISO(payable.dueDate), 'dd/MM/yyyy')}</span></div>
                  <div><span className="text-muted-foreground">Origem:</span> <span className="font-medium">{PAYABLE_ENTRY_SOURCE_LABELS[payable.entrySource ?? 'MANUAL']}</span></div>
                  <div><span className="text-muted-foreground">Forma prevista:</span> <span className="font-medium">{payable.paymentMethod ? PAYMENT_METHOD_LABELS[payable.paymentMethod] : 'Não definida'}</span></div>
                  <div><span className="text-muted-foreground">Recorrência:</span> <span className="font-medium">{recurrenceLabel ?? 'Sem recorrência'}</span></div>
                  <div><span className="text-muted-foreground">Execução bancária:</span> <span className="font-medium">{payable.paymentExecutionStatus ?? 'MANUAL'}</span></div>
                </div>
                {payable.observations ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                    {payable.observations}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {installmentSiblings.length > 1 ? (
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Layers3 className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Parcelas da série</p>
                    </div>
                    <Badge variant="outline">{payable.recurrenceIndex ?? 1} de {payable.totalInstallments}</Badge>
                  </div>
                  <div className="space-y-2">
                    {installmentSiblings.map((sibling) => {
                      const siblingStatus = getPayableDisplayStatus(sibling);
                      const isCurrent = sibling.id === payable.id;
                      const isPaid = sibling.status === 'PAGO';
                      const isOverdue = isPayableOverdue(sibling);
                      return (
                        <div
                          key={sibling.id}
                          className={cn(
                            'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                            isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border/50',
                          )}
                        >
                          <div className="shrink-0">
                            {isPaid ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : isOverdue ? (
                              <Clock className="h-4 w-4 text-destructive" />
                            ) : (
                              <Circle className={cn('h-4 w-4', isCurrent ? 'text-primary' : 'text-muted-foreground')} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn('text-xs font-medium', isCurrent && 'text-primary')}>
                                Parcela {sibling.recurrenceIndex ?? 1}/{sibling.totalInstallments}
                              </span>
                              {isCurrent ? <Badge variant="outline" className="h-4 px-1.5 text-[10px]">atual</Badge> : null}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              Vence {format(parseISO(sibling.dueDate), 'dd/MM/yyyy')}
                              {sibling.paidAt ? ` · pago ${format(parseISO(sibling.paidAt), 'dd/MM')}` : ''}
                            </span>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold tabular-nums">
                              {sibling.finalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <span className={cn('text-[10px] font-medium', PAYABLE_STATUS_COLORS[siblingStatus], 'rounded px-1 py-0.5')}>
                              {PAYABLE_STATUS_LABELS[siblingStatus]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground border-t border-border/50 pt-3">
                    <span>Total pago: <span className="font-medium text-foreground">{installmentSiblings.filter((s) => s.status === 'PAGO').reduce((sum, s) => sum + (s.paidAmount ?? s.finalAmount), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></span>
                    <span>Total da série: <span className="font-medium text-foreground">{installmentSiblings.reduce((sum, s) => sum + s.finalAmount, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></span>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Anexos e comprovantes</p>
                </div>
                {attachments.length > 0 ? (
                  <div className="space-y-2.5">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{attachment.filename}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{attachment.type} • {format(parseISO(attachment.createdAt), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                        <Button variant="outline" size="sm" disabled>Preview</Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Ainda não há anexo nessa conta. O front-end já está preparado para PDF, imagem, DOCX e comprovantes.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Histórico e auditoria</p>
                </div>
                {history.length > 0 ? (
                  <div className="space-y-2.5">
                    {history.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-border/60 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{PAYABLE_HISTORY_ACTION_LABELS[entry.action]}</p>
                          <span className="text-xs text-muted-foreground">{format(parseISO(entry.createdAt), 'dd/MM HH:mm')}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{entry.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum evento registrado até o momento.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Pagamento via banco</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  O módulo já está modelado para evoluir para Pix, boleto, agendamento e comprovante via provedor bancário.
                </p>
                <div className="grid gap-2">
                  <Button disabled className="justify-between"><span>Pagar via API bancária</span><Sparkles className="h-4 w-4" /></Button>
                  <Button disabled variant="outline" className="justify-between"><span>Agendar pagamento</span><ArrowUpRight className="h-4 w-4" /></Button>
                  <Button disabled variant="outline" className="justify-between"><span>Baixar comprovante</span><Wallet className="h-4 w-4" /></Button>
                </div>
                <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
                  Próxima etapa: conectar um provedor como Stark Bank para Pix, boletos, concessionárias e conciliação.
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => onRequestEdit?.(payable)}>Editar dados</Button>
              {canRegisterPayment(payable) ? <Button onClick={() => onRequestPayment?.(payable)}>Registrar pagamento</Button> : null}
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      </div>
    </PayableModalShell>
  );
}
