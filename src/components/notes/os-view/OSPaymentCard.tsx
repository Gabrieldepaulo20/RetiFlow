/**
 * Eixo financeiro da O.S. — separado do fluxo, como manda o modelo de domínio.
 *
 * O design de referência traz um "histórico de lançamentos". O RetiFlow não tem
 * endpoint que liste os lançamentos de UMA nota (`get_financeiro_lancamentos`
 * filtra por período/direção/origem/busca, não por nota), então este card mostra
 * só o que é verificável: status, forma, data do último recebimento e o
 * agregado recebido/em aberto. Nada de lista fabricada.
 *
 * As ações replicam exatamente as regras que já existiam nas duas telas:
 * registrar exige estágio faturável + PENDENTE; estornar exige PAGO + ADMIN.
 */

import { useState } from 'react';
import { CreditCard, RotateCcw, Wallet } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type IntakeNote,
  type NotePaymentStatus,
  type PaymentMethod,
} from '@/types';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { OSCard, OSCardTitle, OSDivider, OSField } from './OSCard';
import { buildOSPaymentSummary, formatOSCurrency, formatOSDate } from './osViewModel';

const PAYMENT_PILL: Record<NotePaymentStatus, string> = {
  PENDENTE: 'border-os-warn-line bg-os-warn-soft text-os-warn-ink',
  PARCIAL: 'border-os-accent/30 bg-os-accent-soft text-os-accent-ink',
  PAGO: 'border-os-done/30 bg-os-done-soft text-os-done-ink',
};

const PAYMENT_DOT: Record<NotePaymentStatus, string> = {
  PENDENTE: 'bg-os-warn-dot',
  PARCIAL: 'bg-os-accent',
  PAGO: 'bg-os-done',
};

export interface OSPaymentHandlers {
  onRegistrar: (input: { paidWith: PaymentMethod; paidAt: string }) => Promise<void>;
  onEstornar: () => Promise<void>;
}

interface OSPaymentCardProps extends OSPaymentHandlers {
  note: IntakeNote;
  /** Estorno é ação de ADMIN — a tela informa quem está logado. */
  isAdmin: boolean;
  className?: string;
}

export function OSPaymentCard({
  note,
  isAdmin,
  onRegistrar,
  onEstornar,
  className,
}: OSPaymentCardProps) {
  const { toast } = useToast();
  const summary = buildOSPaymentSummary(note);
  const [forma, setForma] = useState<PaymentMethod>('PIX');
  const [data, setData] = useState(() => todayLocalISODate());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canRegistrar = summary.isBillable && note.paymentStatus === 'PENDENTE';
  const canEstornar = summary.isBillable && note.paymentStatus === 'PAGO' && isAdmin;

  const registrar = async () => {
    setIsSubmitting(true);
    try {
      await onRegistrar({
        paidWith: forma,
        paidAt: new Date(`${data}T12:00:00`).toISOString(),
      });
      toast({
        title: `${note.number} recebida`,
        description: `Pagamento via ${PAYMENT_METHOD_LABELS[forma]} registrado.`,
      });
    } catch (error) {
      toast({
        title: 'Não foi possível registrar o recebimento',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const estornar = async () => {
    setIsSubmitting(true);
    try {
      await onEstornar();
      toast({
        title: `${note.number} estornada`,
        description: 'Recebimento revertido para pendente.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível estornar o recebimento',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OSCard className={cn('flex flex-col gap-[18px] p-5 sm:px-6', className)}>
      <OSCardTitle
        icon={CreditCard}
        aside={
          <span
            className={cn(
              'inline-flex items-center gap-[7px] rounded-full border px-3 py-1.5 text-[12.5px] font-semibold',
              PAYMENT_PILL[note.paymentStatus],
            )}
          >
            <span className={cn('h-[7px] w-[7px] rounded-full', PAYMENT_DOT[note.paymentStatus])} />
            {PAYMENT_STATUS_LABELS[note.paymentStatus]}
          </span>
        }
      >
        Pagamento
      </OSCardTitle>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
        <OSField label="Forma registrada">
          {note.paidWith ? PAYMENT_METHOD_LABELS[note.paidWith] : '—'}
        </OSField>
        <OSField label="Data do recebimento" mono>
          {formatOSDate(note.paidAt)}
        </OSField>
      </div>

      <OSDivider />

      {/*
       * Histórico por lançamento chega com o módulo de pagamentos. Até lá o bloco
       * fica marcado como "Em breve" — sem linhas fabricadas, porque hoje não há
       * endpoint que liste os lançamentos de uma nota.
       */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-os-stone">Histórico de lançamentos</span>
          <span className="rounded-full border border-os-line bg-os-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-os-fog">
            Em breve
          </span>
        </div>
        <p className="rounded-[10px] border border-dashed border-os-line bg-os-subtle px-3.5 py-3 text-[12.5px] leading-relaxed text-os-stone">
          A lista de pagamentos e estornos desta O.S. aparece aqui quando o módulo
          de pagamentos entrar. Por enquanto, o card mostra o total recebido e o
          saldo em aberto.
        </p>
      </div>

      {!summary.isBillable ? (
        <p className="text-[13px] leading-relaxed text-os-stone">
          O recebimento é registrado quando a O.S. chega a um estágio faturável
          (Entregue, Recusada ou Sem Conserto).
        </p>
      ) : null}

      {canRegistrar || canEstornar ? (
        <>
          <OSDivider />
          <div className="flex flex-wrap gap-2.5">
            {canRegistrar ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="h-11 flex-1 gap-2 rounded-[11px] bg-os-accent font-os text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(226,96,11,0.8)] hover:bg-os-accent-hover"
                    disabled={isSubmitting}
                  >
                    <Wallet className="h-4 w-4" /> Registrar recebimento
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Registrar recebimento de {note.number}</AlertDialogTitle>
                    <AlertDialogDescription>
                      Confirme a forma e a data do recebimento de{' '}
                      {formatOSCurrency(summary.open > 0 ? summary.open : summary.total)}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Forma de pagamento
                      </label>
                      <Select value={forma} onValueChange={(value) => setForma(value as PaymentMethod)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
                            <SelectItem key={method} value={method}>
                              {PAYMENT_METHOD_LABELS[method]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Data do recebimento
                      </label>
                      <Input type="date" value={data} onChange={(event) => setData(event.target.value)} />
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-os-accent text-white hover:bg-os-accent-hover"
                      onClick={() => void registrar()}
                    >
                      Confirmar recebimento
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}

            {canEstornar ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 flex-1 gap-2 rounded-[11px] border-os-danger-line bg-os-surface font-os text-sm font-semibold text-os-danger hover:bg-os-danger-soft hover:text-os-danger-ink"
                    disabled={isSubmitting}
                  >
                    <RotateCcw className="h-4 w-4" /> Estornar recebimento
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Estornar recebimento de {note.number}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A O.S. volta para "A receber" e o saldo em aberto é recalculado.
                      Use apenas para corrigir um lançamento.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-os-danger text-white hover:bg-os-danger-ink"
                      onClick={() => void estornar()}
                    >
                      Confirmar estorno
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </>
      ) : null}
    </OSCard>
  );
}

export default OSPaymentCard;
