import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  RotateCcw,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  estornarParcelaFechamento,
  getFinanceiroAnexoSignedUrl,
  getParcelasFechamento,
  insertFinanceiroAnexo,
  registrarParcelaFechamento,
  uploadFinanceiroComprovante,
  type FinanceiroConta,
  type FechamentoParcela,
  type ParcelasFechamentoResumo,
} from '@/api/supabase/financeiro';
import type { FechamentoListItem } from '@/api/supabase/fechamentos';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  acquireFinancialIdempotencyAttempt,
  completeFinancialIdempotencyAttempt,
} from '@/services/domain/financialIdempotency';
import { parseDateInputValue } from '@/services/domain/monthlyClosing';
import {
  assertActiveSupportScopeUnchanged,
  captureActiveSupportScope,
  SupportScopeChangedAfterCommitError,
} from '@/services/auth/supportContext';
import {
  calculateInitialClosingPayment,
  centsToMoney,
  moneyToCents,
  type ClosingInitialPaymentMode,
} from '@/services/domain/monthlyClosingPayment';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/types';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const money = (value: number) => value.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseMoney(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function validateProof(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error('O comprovante deve ter no máximo 15 MB.');
  if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.test(file.name)) {
    throw new Error('Envie um comprovante PDF, JPG, PNG ou WebP.');
  }
}

function activeCount(summary: ParcelasFechamentoResumo | null) {
  return summary?.parcelasAtivas ?? 0;
}

type LoadSummaryOptions = {
  resetAmount?: boolean;
  notifyError?: boolean;
};

export function ClosingPaymentDialog({
  closing,
  accounts,
  open,
  readOnly,
  canReverse,
  onClose,
  onChanged,
}: {
  closing: FechamentoListItem | null;
  accounts: FinanceiroConta[];
  open: boolean;
  readOnly: boolean;
  canReverse: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const loadRequestIdRef = useRef(0);
  const activeClosingIdRef = useRef<string | null>(null);
  const [loadedSummary, setLoadedSummary] = useState<ParcelasFechamentoResumo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocalISODate());
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [accountId, setAccountId] = useState('');
  const [observations, setObservations] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [reverseTarget, setReverseTarget] = useState<FechamentoParcela | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseEffectiveAt, setReverseEffectiveAt] = useState<string | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [attachingMovementId, setAttachingMovementId] = useState<string | null>(null);

  const defaultAccount = useMemo(
    () => accounts.find((item) => item.ativa && item.padrao) ?? accounts.find((item) => item.ativa),
    [accounts],
  );
  const closingId = closing?.id_fechamentos ?? null;
  activeClosingIdRef.current = open ? closingId : null;
  const summary = loadedSummary?.fechamentoId === closingId ? loadedSummary : null;

  const load = useCallback(async ({
    resetAmount = false,
    notifyError = true,
  }: LoadSummaryOptions = {}) => {
    if (!open || !closingId) return false;
    const requestedClosingId = closingId;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const operationScope = captureActiveSupportScope();
    setLoading(true);
    try {
      assertActiveSupportScopeUnchanged(operationScope);
      const next = await getParcelasFechamento(requestedClosingId);
      assertActiveSupportScopeUnchanged(operationScope);
      if (
        requestId !== loadRequestIdRef.current
        || activeClosingIdRef.current !== requestedClosingId
      ) return false;
      if (next.fechamentoId !== requestedClosingId) {
        throw new Error('O histórico retornado não corresponde ao fechamento aberto.');
      }
      setLoadedSummary(next);
      if (resetAmount) setAmount(next.valorAberto.toFixed(2));
      return true;
    } catch (error) {
      if (
        requestId !== loadRequestIdRef.current
        || activeClosingIdRef.current !== requestedClosingId
      ) return false;
      setLoadedSummary((current) => (
        current?.fechamentoId === requestedClosingId ? current : null
      ));
      if (notifyError) {
        toast({
          title: 'Não foi possível carregar os recebimentos',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      if (
        requestId === loadRequestIdRef.current
        && activeClosingIdRef.current === requestedClosingId
      ) setLoading(false);
    }
  }, [closingId, open, toast]);

  useEffect(() => {
    loadRequestIdRef.current += 1;
    setLoadedSummary(null);
    setLoading(false);
    if (!open || !closingId) {
      return () => { loadRequestIdRef.current += 1; };
    }
    setDate(todayLocalISODate());
    setMethod('PIX');
    setAccountId('');
    setAmount('');
    setObservations('');
    setProof(null);
    setReverseTarget(null);
    setReverseReason('');
    setReverseEffectiveAt(null);
    if (proofInputRef.current) proofInputRef.current.value = '';
    void load({ resetAmount: true });
    return () => { loadRequestIdRef.current += 1; };
  }, [closingId, load, open]);

  useEffect(() => {
    if (!open || !closingId || accountId || !defaultAccount?.id) return;
    setAccountId(defaultAccount.id);
  }, [accountId, closingId, defaultAccount?.id, open]);

  const count = activeCount(summary);
  const isSecondPayment = count === 1;
  const canReceive = Boolean(
    summary
    && summary.valorAberto > 0.004
    && count < 2
    && !readOnly,
  );
  const progress = summary?.valorTotal
    ? Math.min(100, Math.max(0, (summary.valorRecebido / summary.valorTotal) * 100))
    : 0;
  const operationBusy = busy || Boolean(attachingMovementId);

  const choosePercent = (mode: Extract<ClosingInitialPaymentMode, 'PERCENT_50' | 'PERCENT_60'>) => {
    if (!summary || isSecondPayment) return;
    const calculation = calculateInitialClosingPayment(moneyToCents(summary.valorAberto), { mode });
    setAmount(centsToMoney(calculation.amountCents).toFixed(2));
  };

  const handleReceive = async () => {
    if (!closing || !summary) return;
    const operationScope = captureActiveSupportScope();
    const value = parseMoney(amount);
    if (!parseDateInputValue(date)) {
      toast({ title: 'Informe uma data válida', variant: 'destructive' });
      return;
    }
    if (!accountId) {
      toast({ title: 'Selecione a conta financeira', variant: 'destructive' });
      return;
    }
    const valueCents = moneyToCents(value);
    const openCents = moneyToCents(summary.valorAberto);
    if (valueCents <= 0 || valueCents > openCents) {
      toast({
        title: 'Valor inválido',
        description: `Informe um valor entre R$ 0,01 e R$ ${money(summary.valorAberto)}.`,
        variant: 'destructive',
      });
      return;
    }
    if (isSecondPayment && valueCents !== openCents) {
      toast({
        title: 'A segunda parcela deve quitar o saldo',
        description: `O valor correto é R$ ${money(summary.valorAberto)}.`,
        variant: 'destructive',
      });
      return;
    }
    if (proof) {
      try {
        validateProof(proof);
      } catch (error) {
        toast({
          title: 'Comprovante inválido',
          description: error instanceof Error ? error.message : 'Confira o arquivo.',
          variant: 'destructive',
        });
        return;
      }
    }

    setBusy(true);
    try {
      let result: Awaited<ReturnType<typeof registrarParcelaFechamento>>;
      const rounded = centsToMoney(valueCents);
      try {
        assertActiveSupportScopeUnchanged(operationScope);
        const attempt = acquireFinancialIdempotencyAttempt({
          operation: 'parcela-fechamento',
          entityId: closing.id_fechamentos,
          fingerprint: {
            valorRecebidoEsperado: summary.valorRecebido,
            valor: rounded,
            data: date,
            conta: accountId,
            forma: method,
            observacoes: observations.trim(),
          },
        });
        result = await registrarParcelaFechamento({
          fechamentoId: closing.id_fechamentos,
          valor: rounded,
          valorRecebidoEsperado: summary.valorRecebido,
          dataEfetiva: `${date}T12:00:00-03:00`,
          contaId: accountId,
          formaPagamento: method,
          observacoes: observations.trim() || null,
          idempotencyKey: attempt.key,
        });
        completeFinancialIdempotencyAttempt(attempt);
        try {
          assertActiveSupportScopeUnchanged(operationScope);
        } catch {
          throw new SupportScopeChangedAfterCommitError('A parcela');
        }
      } catch (error) {
        if (error instanceof SupportScopeChangedAfterCommitError) {
          toast({ title: 'Pagamento salvo; contexto alterado', description: error.message });
          return;
        }
        toast({
          title: 'Não foi possível registrar a parcela',
          description: error instanceof Error ? error.message : 'O saldo pode ter mudado em outra sessão. Recarregue e tente novamente.',
          variant: 'destructive',
        });
        await load({ resetAmount: true });
        return;
      }

      let proofWarning = false;
      if (proof) {
        if (!result.movimentoId) {
          proofWarning = true;
        } else {
          try {
            assertActiveSupportScopeUnchanged(operationScope);
            const path = await uploadFinanceiroComprovante({ movimentoId: result.movimentoId, file: proof });
            assertActiveSupportScopeUnchanged(operationScope);
            await insertFinanceiroAnexo({
              movimentoId: result.movimentoId,
              nomeArquivo: proof.name,
              caminho: path,
              mimeType: proof.type || null,
              tamanhoBytes: proof.size,
            });
            assertActiveSupportScopeUnchanged(operationScope);
          } catch (error) {
            try {
              assertActiveSupportScopeUnchanged(operationScope);
            } catch {
              toast({
                title: 'Pagamento salvo; contexto alterado',
                description: new SupportScopeChangedAfterCommitError('A parcela').message,
              });
              return;
            }
            proofWarning = true;
          }
        }
      }

      try {
        assertActiveSupportScopeUnchanged(operationScope);
      } catch {
        toast({
          title: 'Pagamento salvo; contexto alterado',
          description: new SupportScopeChangedAfterCommitError('A parcela').message,
        });
        return;
      }
      toast({
        title: result.status === 'PAGO' ? 'Fechamento quitado' : 'Parcela registrada',
        description: proofWarning
          ? 'O pagamento foi salvo, mas o comprovante ficou pendente. Você pode anexá-lo no histórico.'
          : result.status === 'PAGO'
            ? 'As O.S. deste fechamento agora constam como pagas.'
            : `Ainda restam R$ ${money(result.valorAberto ?? Math.max(0, summary.valorAberto - rounded))}.`,
      });
      setProof(null);
      if (proofInputRef.current) proofInputRef.current.value = '';
      setObservations('');

      const [dialogRefresh, parentRefresh] = await Promise.allSettled([
        load({ resetAmount: true, notifyError: false }),
        Promise.resolve().then(() => onChanged()),
      ]);
      try {
        assertActiveSupportScopeUnchanged(operationScope);
      } catch {
        toast({
          title: 'Pagamento salvo; contexto alterado',
          description: new SupportScopeChangedAfterCommitError('A parcela').message,
        });
        return;
      }
      if (
        dialogRefresh.status === 'rejected'
        || (dialogRefresh.status === 'fulfilled' && !dialogRefresh.value)
        || parentRefresh.status === 'rejected'
      ) {
        toast({
          title: 'Pagamento salvo; atualização pendente',
          description: 'A parcela foi confirmada, mas parte da tela não atualizou. Feche e abra o fechamento novamente.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReverse = async () => {
    if (!closing || !reverseTarget || reverseReason.trim().length < 5) {
      toast({ title: 'Informe um motivo com pelo menos 5 caracteres.', variant: 'destructive' });
      return;
    }
    const operationScope = captureActiveSupportScope();
    setBusy(true);
    try {
      try {
        assertActiveSupportScopeUnchanged(operationScope);
        const effectiveAt = reverseEffectiveAt ?? new Date().toISOString();
        if (!reverseEffectiveAt) setReverseEffectiveAt(effectiveAt);
        const attempt = acquireFinancialIdempotencyAttempt({
          operation: 'estornar-parcela-fechamento',
          entityId: reverseTarget.id,
          fingerprint: {
            fechamento: closing.id_fechamentos,
            motivo: reverseReason.trim(),
            dataEfetiva: effectiveAt,
          },
        });
        const reverseInput = {
          fechamentoId: closing.id_fechamentos,
          movimentoId: reverseTarget.id,
          motivo: reverseReason.trim(),
          dataEfetiva: effectiveAt,
          idempotencyKey: attempt.key,
        };
        // Uma falha ambígua pode ser repetida manualmente com a mesma chave.
        // Não repetimos automaticamente erros de negócio nem cruzamos sessão.
        await estornarParcelaFechamento(reverseInput);
        completeFinancialIdempotencyAttempt(attempt);
        try {
          assertActiveSupportScopeUnchanged(operationScope);
        } catch {
          throw new SupportScopeChangedAfterCommitError('O estorno da parcela');
        }
      } catch (error) {
        if (error instanceof SupportScopeChangedAfterCommitError) {
          toast({ title: 'Estorno salvo; contexto alterado', description: error.message });
          return;
        }
        toast({
          title: 'Não foi possível estornar',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
        await load({ resetAmount: true, notifyError: false });
        return;
      }

      toast({
        title: 'Parcela estornada',
        description: 'O histórico foi preservado e o saldo em aberto foi recalculado.',
      });
      setReverseTarget(null);
      setReverseReason('');
      setReverseEffectiveAt(null);

      const [dialogRefresh, parentRefresh] = await Promise.allSettled([
        load({ resetAmount: true, notifyError: false }),
        Promise.resolve().then(() => onChanged()),
      ]);
      try {
        assertActiveSupportScopeUnchanged(operationScope);
      } catch {
        toast({
          title: 'Estorno salvo; contexto alterado',
          description: new SupportScopeChangedAfterCommitError('O estorno da parcela').message,
        });
        return;
      }
      if (
        dialogRefresh.status === 'rejected'
        || (dialogRefresh.status === 'fulfilled' && !dialogRefresh.value)
        || parentRefresh.status === 'rejected'
      ) {
        toast({
          title: 'Estorno salvo; atualização pendente',
          description: 'O estorno foi confirmado, mas parte da tela não atualizou. Feche e abra o fechamento novamente.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const openAttachment = async (attachment: FechamentoParcela['anexos'][number]) => {
    const operationScope = captureActiveSupportScope();
    const pendingWindow = window.open('about:blank', '_blank');
    if (!pendingWindow) {
      toast({
        title: 'Pop-up bloqueado',
        description: 'Permita pop-ups para abrir o comprovante.',
        variant: 'destructive',
      });
      return;
    }
    pendingWindow.opener = null;
    setOpeningAttachmentId(attachment.id);
    try {
      assertActiveSupportScopeUnchanged(operationScope);
      const signedUrl = await getFinanceiroAnexoSignedUrl(attachment.caminho, { anexoId: attachment.id });
      assertActiveSupportScopeUnchanged(operationScope);
      pendingWindow.location.href = signedUrl;
    } catch (error) {
      pendingWindow.close();
      toast({
        title: 'Não foi possível abrir o comprovante',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const attachProof = async (movementId: string, file: File) => {
    try {
      validateProof(file);
    } catch (error) {
      toast({
        title: 'Comprovante inválido',
        description: error instanceof Error ? error.message : 'Confira o arquivo.',
        variant: 'destructive',
      });
      return;
    }

    const operationScope = captureActiveSupportScope();
    setAttachingMovementId(movementId);
    try {
      assertActiveSupportScopeUnchanged(operationScope);
      const path = await uploadFinanceiroComprovante({ movimentoId: movementId, file });
      assertActiveSupportScopeUnchanged(operationScope);
      await insertFinanceiroAnexo({
        movimentoId: movementId,
        nomeArquivo: file.name,
        caminho: path,
        mimeType: file.type || null,
        tamanhoBytes: file.size,
      });
      try {
        assertActiveSupportScopeUnchanged(operationScope);
      } catch {
        throw new SupportScopeChangedAfterCommitError('O comprovante');
      }
      toast({ title: 'Comprovante anexado', description: 'O arquivo ficou guardado no histórico desta parcela.' });
      await load();
    } catch (error) {
      if (error instanceof SupportScopeChangedAfterCommitError) {
        toast({ title: 'Comprovante salvo; contexto alterado', description: error.message });
        return;
      }
      toast({
        title: 'Não foi possível anexar o comprovante',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setAttachingMovementId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !operationBusy && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
        <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-5">
          <DialogTitle>Pagamentos do fechamento</DialogTitle>
          <DialogDescription>
            {closing?.cliente?.nome ?? 'Cliente'} · {closing?.periodo ?? 'Período'} — até duas parcelas, com histórico e comprovantes.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando pagamentos
            </div>
          ) : summary ? (
            <>
              <section className="rounded-2xl border bg-slate-50 p-4">
                <div className="grid gap-3 min-[420px]:grid-cols-3">
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p><p className="mt-1 font-semibold"><FinancialValue>R$ {money(summary.valorTotal)}</FinancialValue></p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recebido</p><p className="mt-1 font-semibold text-emerald-700"><FinancialValue>R$ {money(summary.valorRecebido)}</FinancialValue></p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo</p><p className="mt-1 font-semibold text-amber-700"><FinancialValue>R$ {money(summary.valorAberto)}</FinancialValue></p></div>
                </div>
                <Progress value={progress} className="mt-3 h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {summary.status === 'PAGO'
                    ? 'Quitado. As O.S. vinculadas estão marcadas como pagas.'
                    : `${count} de 2 parcelas ativas registradas.`}
                </p>
              </section>

              {canReceive ? (
                <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                      <Wallet className="h-4 w-4" /> {isSecondPayment ? 'Quitar o saldo' : 'Registrar primeira parcela'}
                    </h3>
                    <p className="mt-1 text-xs text-emerald-800/80">
                      {isSecondPayment
                        ? 'A segunda e última parcela deve ser exatamente o saldo em aberto.'
                        : 'A primeira parcela pode ter qualquer valor até o total.'}
                    </p>
                  </div>

                  {!isSecondPayment ? (
                    <div className="grid grid-cols-3 gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => choosePercent('PERCENT_50')}>50%</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => choosePercent('PERCENT_60')}>60%</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setAmount(summary.valorAberto.toFixed(2))}>Total</Button>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="closing-payment-amount">Valor recebido agora</Label>
                      <Input
                        id="closing-payment-amount"
                        type="number"
                        min="0.01"
                        max={summary.valorAberto}
                        step="0.01"
                        value={amount}
                        readOnly={isSecondPayment}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="closing-payment-account">Conta financeira</Label>
                      <Select value={accountId} onValueChange={setAccountId}>
                        <SelectTrigger id="closing-payment-account"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {accounts.filter((item) => item.ativa).map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="closing-payment-method">Forma</Label>
                      <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                        <SelectTrigger id="closing-payment-method"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
                            <SelectItem key={value} value={value}>{PAYMENT_METHOD_LABELS[value]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="closing-payment-date">Data</Label>
                      <Input id="closing-payment-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="closing-proof">Comprovante opcional</Label>
                      <input
                        ref={proofInputRef}
                        id="closing-proof"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                      />
                      <Button type="button" variant="outline" className="w-full justify-start overflow-hidden" onClick={() => proofInputRef.current?.click()}>
                        <Upload className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">{proof?.name ?? 'Selecionar arquivo'}</span>
                      </Button>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="closing-payment-observations">Observações</Label>
                      <Textarea id="closing-payment-observations" value={observations} onChange={(event) => setObservations(event.target.value)} maxLength={1000} rows={2} placeholder="Ex.: cheque nº 1234" />
                    </div>
                  </div>
                  <Button type="button" disabled={busy} onClick={() => void handleReceive()} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                    {isSecondPayment ? `Quitar R$ ${money(summary.valorAberto)}` : 'Registrar parcela'}
                  </Button>
                </section>
              ) : readOnly && summary.valorAberto > 0.004 ? (
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  Modo suporte: histórico disponível somente para leitura.
                </p>
              ) : count >= 2 && summary.valorAberto > 0.004 ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                  Este fechamento já possui duas parcelas ativas e ainda tem saldo. Revise a conciliação antes de continuar.
                </p>
              ) : null}

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Histórico de parcelas</h3>
                  <p className="text-xs text-muted-foreground">Estornos permanecem visíveis para auditoria.</p>
                </div>
                {summary.parcelas.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Nenhuma parcela registrada.</div>
                ) : summary.parcelas.map((item) => (
                  <article key={item.id} className="rounded-xl border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">Parcela {item.numero}</p>
                          <Badge variant="secondary" className={item.ativa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}>
                            {item.ativa ? 'Ativa' : 'Estornada'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(item.dataEfetiva).toLocaleDateString('pt-BR')} · {item.contaNome ?? 'Conta'}
                          {item.formaPagamento ? ` · ${PAYMENT_METHOD_LABELS[item.formaPagamento]}` : ''}
                        </p>
                      </div>
                      <p className={item.ativa ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500 line-through'}>
                        <FinancialValue>R$ {money(item.valor)}</FinancialValue>
                      </p>
                    </div>
                    {item.observacoes ? <p className="mt-2 text-xs text-muted-foreground">{item.observacoes}</p> : null}
                    {!item.ativa && item.motivoEstorno ? <p className="mt-2 text-xs text-rose-700">Estorno: {item.motivoEstorno}</p> : null}
                    {item.anexos.length ? (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {item.anexos.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-left text-xs hover:bg-muted"
                            onClick={() => void openAttachment(attachment)}
                            disabled={openingAttachmentId === attachment.id}
                          >
                            {openingAttachmentId === attachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                            <span className="min-w-0 flex-1 truncate">{attachment.nomeArquivo}</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!readOnly ? (
                      <label
                        className={cn(
                          'mt-3 inline-flex h-10 cursor-pointer items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted',
                          attachingMovementId === item.id && 'pointer-events-none opacity-60',
                        )}
                      >
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void attachProof(item.id, file);
                          }}
                        />
                        {attachingMovementId === item.id
                          ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          : <Upload className="mr-2 h-3.5 w-3.5" />}
                        Anexar comprovante
                      </label>
                    ) : null}
                    {canReverse && item.podeEstornar && item.ativa && !readOnly ? (
                      reverseTarget?.id === item.id ? (
                        <div className="mt-3 space-y-2 border-t pt-3">
                          <Label htmlFor={`closing-reverse-reason-${item.id}`}>Motivo do estorno</Label>
                          <Textarea id={`closing-reverse-reason-${item.id}`} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={2} placeholder="Explique a correção" />
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => { setReverseTarget(null); setReverseReason(''); setReverseEffectiveAt(null); }}>Cancelar</Button>
                            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void handleReverse()}>
                              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
                              Confirmar estorno
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" className="mt-3 text-rose-700" onClick={() => { setReverseTarget(item); setReverseReason(''); setReverseEffectiveAt(new Date().toISOString()); }}>
                          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Corrigir esta parcela
                        </Button>
                      )
                    ) : null}
                  </article>
                ))}
              </section>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Histórico indisponível.</div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={onClose} disabled={operationBusy}>
            {summary?.status === 'PAGO' ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Paperclip className="mr-2 h-4 w-4" />}
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
