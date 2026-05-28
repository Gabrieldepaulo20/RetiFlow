import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, BadgeCheck, Bot, CalendarCheck2, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Link2, MailOpen, ReceiptText, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { EmailSuggestion } from '@/types';
import { buildPayableHistoryDescription } from '@/services/domain/payables';
import { getGmailConnectionStatus, scanGmailPayables, startGmailOAuth, type GmailConnectionStatus } from '@/api/supabase/gmail-payables';

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone = value >= 90 ? 'bg-success/10 text-success' : value >= 75 ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning-foreground';
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tone)}><Sparkles className="h-2.5 w-2.5" />{value}% confiança</span>;
}

function SuggestionStatusBadge({ suggestion }: { suggestion: EmailSuggestion }) {
  if (suggestion.suggestedStatus === 'PAGO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <BadgeCheck className="h-3.5 w-3.5" /> Já paga
      </span>
    );
  }
  if (suggestion.suggestedStatus === 'AGENDADO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
        <Clock3 className="h-3.5 w-3.5" /> Agendada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
      <ReceiptText className="h-3.5 w-3.5" /> A pagar
    </span>
  );
}

function MetricBlock({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'paid' | 'due' }) {
  const toneClass = tone === 'paid'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : tone === 'due'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-border/70 bg-background text-foreground';
  return (
    <div className={cn('min-w-[132px] rounded-lg border px-3 py-2 shadow-sm', toneClass)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold leading-none">{value}</p>
    </div>
  );
}

type SuggestionCardProps = {
  suggestion: EmailSuggestion;
  categoryName: string;
  onAccept: () => void;
  onDismiss: () => void;
};

function SuggestionCard({ suggestion, categoryName, onAccept, onDismiss }: SuggestionCardProps) {
  const isPaid = suggestion.suggestedStatus === 'PAGO';
  const isScheduled = suggestion.suggestedStatus === 'AGENDADO';
  const railClass = isPaid ? 'bg-emerald-500' : isScheduled ? 'bg-sky-500' : 'bg-amber-500';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
    >
      <Card className={cn(
        'overflow-hidden border-border/70 bg-background shadow-sm transition-shadow hover:shadow-md',
        isPaid && 'border-emerald-200',
        isScheduled && 'border-sky-200',
      )}>
        <CardContent className="p-0">
          <div className="flex">
            <div className={cn('w-1.5 shrink-0', railClass)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className={cn(
                    'mt-0.5 shrink-0 rounded-xl p-2.5',
                    isPaid ? 'bg-emerald-50 text-emerald-700' : isScheduled ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700',
                  )}>
                    {isPaid ? <CheckCircle2 className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SuggestionStatusBadge suggestion={suggestion} />
                      <ConfidenceBadge value={suggestion.confidence} />
                    </div>
                    <p className="mt-2 text-base font-semibold leading-snug text-foreground">{suggestion.suggestedTitle || suggestion.subject}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {suggestion.senderName} &middot; recebido {format(parseISO(suggestion.receivedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {suggestion.emailSnippet ? (
                      <p className="mt-3 line-clamp-2 rounded-lg bg-muted/45 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        {suggestion.emailSnippet}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[450px]">
                  <MetricBlock label="Valor" value={fmtBRL(suggestion.suggestedAmount)} />
                  <MetricBlock
                    label={isPaid ? 'Vencimento original' : 'Vence em'}
                    value={format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}
                    tone={isPaid ? 'neutral' : 'due'}
                  />
                  {isPaid ? (
                    <MetricBlock
                      label="Pago em"
                      value={suggestion.suggestedPaidAt ? format(parseISO(suggestion.suggestedPaidAt), 'dd/MM/yyyy') : 'Confirmar data'}
                      tone="paid"
                    />
                  ) : (
                    <MetricBlock label="Categoria" value={categoryName} />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border/50 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isPaid ? <CalendarCheck2 className="h-4 w-4 text-emerald-600" /> : <CircleDollarSign className="h-4 w-4 text-amber-600" />}
                  <span>
                    {isPaid
                      ? 'A IA encontrou evidência de pagamento. Ao confirmar, a conta já entra como paga.'
                      : 'Ao confirmar, a conta entra para acompanhamento no contas a pagar.'}
                  </span>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground hover:text-destructive" onClick={onDismiss}>
                    <X className="h-3.5 w-3.5" />Ignorar
                  </Button>
                  <Button
                    size="sm"
                    className={cn('h-8 gap-1', isPaid && 'bg-emerald-600 text-white hover:bg-emerald-700')}
                    onClick={onAccept}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />{isPaid ? 'Adicionar paga' : 'Usar como conta'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PaidSuggestionDialog({
  suggestion,
  categoryName,
  open,
  onOpenChange,
  onConfirm,
}: {
  suggestion: EmailSuggestion | null;
  categoryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const paidDate = suggestion?.suggestedPaidAt ? format(parseISO(suggestion.suggestedPaidAt), 'dd/MM/yyyy') : 'Confirmar data';
  const dueDate = suggestion?.suggestedDueDate ? format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy') : 'Sem vencimento';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-cyan-500 px-6 py-5 text-white">
          <DialogHeader>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/30">
              <BadgeCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl text-white">Adicionar como conta paga?</DialogTitle>
            <DialogDescription className="text-emerald-50">
              A IA encontrou evidência de pagamento no e-mail. Confira os dados antes de lançar no contas a pagar.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conta identificada</p>
            <p className="mt-1 text-lg font-bold leading-snug text-foreground">{suggestion?.suggestedTitle ?? 'Conta paga'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{suggestion?.senderName ?? 'Gmail'} &middot; {categoryName}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Valor pago</p>
              <p className="mt-2 text-2xl font-black text-emerald-900">{suggestion ? fmtBRL(suggestion.suggestedAmount) : 'R$ 0,00'}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pago em</p>
              <p className="mt-2 text-xl font-bold text-foreground">{paidDate}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vencimento</p>
              <p className="mt-2 text-xl font-bold text-foreground">{dueDate}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <CalendarCheck2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">O lançamento já entra como pago</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Se confirmar, a conta será criada com status pago, valor pago preenchido e data de pagamento destacada para o histórico financeiro.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/25 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={onConfirm}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Adicionar conta paga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PayableEmailSuggestionsProps = {
  onCreated?: (payableId: string) => void;
};

export default function PayableEmailSuggestions({ onCreated }: PayableEmailSuggestionsProps) {
  const { emailSuggestions, refreshEmailSuggestions, acceptEmailSuggestion, dismissEmailSuggestion, payableCategories, addPayableHistoryEntry } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailActionLoading, setGmailActionLoading] = useState(false);
  const [paidSuggestionToConfirm, setPaidSuggestionToConfirm] = useState<EmailSuggestion | null>(null);

  const categoryById = useMemo(() => new Map(payableCategories.map((c) => [c.id, c])), [payableCategories]);
  const pending = useMemo(() => emailSuggestions.filter((s) => s.status === 'PENDING'), [emailSuggestions]);
  const paidPending = useMemo(() => pending.filter((s) => s.suggestedStatus === 'PAGO'), [pending]);
  const payablePending = useMemo(() => pending.filter((s) => s.suggestedStatus !== 'PAGO'), [pending]);
  const dismissed = useMemo(() => emailSuggestions.filter((s) => s.status === 'DISMISSED'), [emailSuggestions]);
  const accepted = useMemo(() => emailSuggestions.filter((s) => s.status === 'ACCEPTED'), [emailSuggestions]);

  useEffect(() => {
    let cancelled = false;
    setGmailLoading(true);
    getGmailConnectionStatus()
      .then((status) => {
        if (!cancelled) setGmailStatus(status);
      })
      .catch((error) => {
        if (!cancelled) {
          setGmailStatus({ connected: false, status: 'ERROR', last_error: error instanceof Error ? error.message : 'Falha ao consultar Gmail.' });
        }
      })
      .finally(() => {
        if (!cancelled) setGmailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnectGmail() {
    setGmailActionLoading(true);
    try {
      const { authUrl } = await startGmailOAuth();
      window.location.href = authUrl;
    } catch (error) {
      toast({
        title: 'Não foi possível conectar o Gmail',
        description: error instanceof Error ? error.message : 'Verifique a configuração OAuth.',
        variant: 'destructive',
      });
      setGmailActionLoading(false);
    }
  }

  async function handleScanGmail() {
    setGmailActionLoading(true);
    try {
      const result = await scanGmailPayables();
      await refreshEmailSuggestions();
      const status = await getGmailConnectionStatus();
      setGmailStatus(status);
      toast({
        title: result.created > 0 ? 'Sugestões atualizadas' : 'Busca concluída',
        description: `${result.created} sugestão${result.created === 1 ? '' : 'ões'} criada${result.created === 1 ? '' : 's'} · ${result.skipped} ignorada${result.skipped === 1 ? '' : 's'}.`,
        variant: result.errors.length > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível buscar no Gmail',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setGmailActionLoading(false);
    }
  }

  async function acceptSuggestionNow(suggestion: EmailSuggestion) {
    setPaidSuggestionToConfirm(null);
    const payable = await acceptEmailSuggestion(suggestion.id);
    if (!payable) return;
    addPayableHistoryEntry(buildPayableHistoryDescription({
      payableId: payable.id,
      action: 'CREATED',
      userId: user?.id ?? 'user-2',
    }));
    toast({
      title: suggestion.suggestedStatus === 'PAGO' ? 'Conta paga adicionada' : 'Conta criada a partir do e-mail',
      description: `"${payable.title}" já está na listagem.`,
    });
    onCreated?.(payable.id);
  }

  async function handleAccept(suggestion: EmailSuggestion) {
    if (suggestion.suggestedStatus === 'PAGO') {
      setPaidSuggestionToConfirm(suggestion);
      return;
    }
    await acceptSuggestionNow(suggestion);
  }

  async function handleDismiss(suggestion: EmailSuggestion) {
    await dismissEmailSuggestion(suggestion.id);
    toast({ title: 'Sugestão ignorada', description: 'Você pode encontrá-la no histórico se precisar.' });
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/60 bg-gradient-to-r from-slate-50 via-background to-cyan-50/50">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={cn('mt-0.5 rounded-xl p-2.5', gmailStatus?.connected ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary')}>
              {gmailStatus?.connected ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {gmailStatus?.connected ? 'Gmail conectado' : 'Conectar Gmail / Google Workspace'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {gmailStatus?.connected
                  ? `${gmailStatus.email ?? 'Conta conectada'}${gmailStatus.last_sync_at ? ` · última busca ${format(parseISO(gmailStatus.last_sync_at), "dd/MM/yyyy 'às' HH:mm")}` : ''}`
                  : 'Leia boletos, faturas e notas do e-mail com revisão antes de virar conta.'}
              </p>
              {gmailStatus?.last_error ? (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {gmailStatus.last_error}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant={gmailStatus?.connected ? 'outline' : 'default'} size="sm" onClick={() => void handleConnectGmail()} disabled={gmailLoading || gmailActionLoading}>
              {gmailStatus?.connected ? 'Reconectar' : 'Conectar Gmail'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleScanGmail()} disabled={!gmailStatus?.connected || gmailActionLoading}>
              <RefreshCw className={cn('mr-2 h-3.5 w-3.5', gmailActionLoading && 'animate-spin')} />
              Buscar agora
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Sugestões extraídas do e-mail</p>
            <p className="text-xs text-muted-foreground">Contas detectadas automaticamente na caixa de entrada — escolha o que usar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {paidPending.length > 0 ? <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />{paidPending.length} pagas detectadas</span> : null}
          {payablePending.length > 0 ? <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700"><ReceiptText className="h-3.5 w-3.5" />{payablePending.length} a pagar</span> : null}
          {accepted.length > 0 ? <span className="flex items-center gap-1 text-success"><BadgeCheck className="h-3.5 w-3.5" />{accepted.length} aceitas</span> : null}
          {dismissed.length > 0 ? <span>{dismissed.length} ignoradas</span> : null}
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center">
          <div className="rounded-full bg-muted/60 p-3">
            <MailOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Nenhuma sugestão pendente</p>
            <p className="mt-1 text-xs text-muted-foreground">Quando novas contas forem detectadas nos e-mails, elas aparecerão aqui para você revisar.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">{pending.length} pendente{pending.length !== 1 ? 's' : ''}</Badge>
            <p className="text-xs text-muted-foreground">Revise cada sugestão antes de aceitar</p>
          </div>
          <AnimatePresence mode="popLayout">
            {pending.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                categoryName={categoryById.get(suggestion.suggestedCategoryId)?.name ?? 'Categoria'}
                onAccept={() => { void handleAccept(suggestion); }}
                onDismiss={() => { void handleDismiss(suggestion); }}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {dismissed.length > 0 ? (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Ver {dismissed.length} ignorada{dismissed.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-3 space-y-2">
            {dismissed.map((suggestion) => (
              <div key={suggestion.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-3 text-sm opacity-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{suggestion.suggestedTitle}</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(suggestion.suggestedAmount)} &middot; vence {format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <PaidSuggestionDialog
        suggestion={paidSuggestionToConfirm}
        categoryName={paidSuggestionToConfirm ? categoryById.get(paidSuggestionToConfirm.suggestedCategoryId)?.name ?? 'Categoria' : 'Categoria'}
        open={paidSuggestionToConfirm !== null}
        onOpenChange={(open) => { if (!open) setPaidSuggestionToConfirm(null); }}
        onConfirm={() => { if (paidSuggestionToConfirm) void acceptSuggestionNow(paidSuggestionToConfirm); }}
      />
    </div>
  );
}
