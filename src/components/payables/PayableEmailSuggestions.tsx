import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  Barcode,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Landmark,
  Link2,
  MailOpen,
  QrCode,
  ReceiptText,
  RefreshCw,
  Send,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { EmailSuggestion } from '@/types';
import { buildPayableHistoryDescription, findPayableForSuggestion, getSuggestionOverdueDays } from '@/services/domain/payables';
import { getGmailConnectionStatus, scanGmailPayables, startGmailOAuth, updateGmailAutoSyncSettings, type GmailConnectionStatus } from '@/api/supabase/gmail-payables';
import { getCategoryIcon } from '@/lib/payableCategoryIcon';
import { SupplierAvatar } from '@/components/payables/SupplierAvatar';

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const paymentIcons: Record<string, LucideIcon> = {
  BOLETO: Barcode,
  PIX: QrCode,
  TRANSFERENCIA: Send,
  CARTAO_CREDITO: CreditCard,
  CARTAO_DEBITO: CreditCard,
  DINHEIRO: Banknote,
  CHEQUE: Landmark,
  DEBITO_AUTOMATICO: Landmark,
};

type BrandProfile = {
  id: string;
  name: string;
  monogram: string;
  markClass: string;
  chipClass: string;
  railClass: string;
  cardClass: string;
  footerClass: string;
};

const brandProfiles: BrandProfile[] = [
  {
    id: 'nubank',
    name: 'Nubank',
    monogram: 'Nu',
    markClass: 'bg-[#820AD1] text-white shadow-sm',
    chipClass: 'border-purple-200 bg-purple-50 text-purple-800',
    railClass: 'bg-[#820AD1]',
    cardClass: 'border-purple-300 bg-gradient-to-r from-purple-50/95 via-white to-white',
    footerClass: 'border-purple-200 bg-purple-50/85',
  },
];

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getSuggestionBrand(suggestion: EmailSuggestion | null): BrandProfile | null {
  if (!suggestion) return null;
  const source = normalizeSearchText([
    suggestion.suggestedTitle,
    suggestion.suggestedSupplierName,
    suggestion.senderName,
    suggestion.senderEmail,
    suggestion.subject,
  ].filter(Boolean).join(' '));

  if (
    source.includes('nubank') ||
    source.includes('nu pagamentos') ||
    /(^|[\s@._-])nu([\s@._-]|$)/.test(source)
  ) {
    return brandProfiles.find((brand) => brand.id === 'nubank') ?? null;
  }

  return null;
}

function BrandMark({ brand, className }: { brand: BrandProfile; className?: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center font-black leading-none tracking-normal', className)}>
      {brand.monogram}
    </span>
  );
}

function BrandChip({ brand }: { brand: BrandProfile }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold shadow-sm', brand.chipClass)}>
      <BrandMark brand={brand} className="h-4 min-w-4 rounded bg-white/70 px-1 text-[11px]" />
      {brand.name}
    </span>
  );
}

function paymentMethodLabel(method: EmailSuggestion['suggestedPaymentMethod']) {
  const labels: Record<string, string> = {
    BOLETO: 'Boleto',
    PIX: 'Pix',
    TRANSFERENCIA: 'Transferência',
    CARTAO_CREDITO: 'Cartão crédito',
    CARTAO_DEBITO: 'Cartão débito',
    DINHEIRO: 'Dinheiro',
    CHEQUE: 'Cheque',
    DEBITO_AUTOMATICO: 'Débito auto.',
  };
  return labels[method] ?? 'Pagamento';
}

function PaymentMethodChip({ method }: { method: EmailSuggestion['suggestedPaymentMethod'] }) {
  const Icon = paymentIcons[method] ?? CircleDollarSign;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      {paymentMethodLabel(method)}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone = value >= 90
    ? 'bg-slate-900 text-white ring-slate-900'
    : value >= 75
      ? 'bg-cyan-700 text-white ring-cyan-700'
      : 'bg-amber-500 text-slate-950 ring-amber-500';
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1', tone)}><Sparkles className="h-2.5 w-2.5" />{value}% confiança</span>;
}

function GmailSyncMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[88px] rounded-lg border border-border/60 bg-background px-2.5 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold leading-none text-foreground">{value}</p>
    </div>
  );
}

function SenderRiskBadge({ risk }: { risk?: 'BAIXO' | 'MEDIO' | 'ALTO' }) {
  if (!risk || risk === 'BAIXO') return null;
  const isHigh = risk === 'ALTO';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
      isHigh ? 'bg-rose-600 text-white ring-rose-600' : 'bg-amber-100 text-amber-900 ring-amber-300',
    )}>
      <AlertCircle className="h-3 w-3" />
      {isHigh ? 'Remetente suspeito' : 'Remetente a revisar'}
    </span>
  );
}

function SuggestionStatusBadge({ suggestion }: { suggestion: EmailSuggestion }) {
  if (suggestion.suggestedStatus === 'INCERTO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-300">
        <AlertCircle className="h-3.5 w-3.5" /> Revisar
      </span>
    );
  }
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
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-300">
      <ReceiptText className="h-3.5 w-3.5" /> A pagar
    </span>
  );
}

function MetricBlock({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'paid' | 'due' }) {
  const toneClass = tone === 'paid'
    ? 'border-emerald-300 bg-emerald-100 text-emerald-950'
    : tone === 'due'
      ? 'border-amber-300 bg-amber-100 text-amber-950'
      : 'border-slate-200 bg-white text-slate-950';
  const labelClass = tone === 'paid'
    ? 'text-emerald-800'
    : tone === 'due'
      ? 'text-amber-800'
      : 'text-slate-600';
  return (
    <div className={cn('min-w-[92px] rounded-lg border px-2.5 py-1.5 shadow-sm', toneClass)}>
      <p className={cn('text-[10px] font-bold uppercase tracking-wide', labelClass)}>{label}</p>
      <p className="mt-0.5 text-sm font-bold leading-none">{value}</p>
    </div>
  );
}

type SuggestionCardProps = {
  suggestion: EmailSuggestion;
  categoryName: string;
  categoryIcon?: string | null;
  overdueDays?: number | null;
  readOnly?: boolean;
  onAccept: () => void;
  onMarkPaid?: () => void;
  onDismiss: () => void;
};

function SuggestionCard({ suggestion, categoryName, categoryIcon, overdueDays, readOnly = false, onAccept, onMarkPaid, onDismiss }: SuggestionCardProps) {
  const isPaid = suggestion.suggestedStatus === 'PAGO';
  const isScheduled = suggestion.suggestedStatus === 'AGENDADO';
  const isReview = suggestion.suggestedStatus === 'INCERTO';
  const isHighRisk = suggestion.senderRisk === 'ALTO';
  const verificationSignals = suggestion.verificationSignals ?? [];
  const fraudSignals = suggestion.fraudSignals ?? [];
  const [allowHighRisk, setAllowHighRisk] = useState(false);
  const brand = getSuggestionBrand(suggestion);
  const CategoryIcon = getCategoryIcon(categoryIcon);
  const StatusIcon = isReview ? AlertCircle : isPaid ? CheckCircle2 : isScheduled ? Clock3 : MailOpen;
  const railClass = brand && !isReview ? brand.railClass : isReview ? 'bg-rose-600' : isPaid ? 'bg-emerald-600' : isScheduled ? 'bg-cyan-600' : 'bg-amber-500';
  const cardClass = isPaid
    ? brand
      ? brand.cardClass
      : 'border-emerald-300 bg-gradient-to-r from-emerald-50/80 via-white to-white'
    : isReview
      ? 'border-rose-300 bg-gradient-to-r from-rose-50/85 via-white to-white'
      : isScheduled
        ? brand
          ? brand.cardClass
          : 'border-cyan-300 bg-gradient-to-r from-cyan-50/80 via-white to-white'
        : brand
          ? brand.cardClass
          : 'border-amber-300 bg-gradient-to-r from-amber-50/90 via-white to-white';
  const iconClass = isPaid
    ? brand ? brand.markClass : 'bg-emerald-600 text-white shadow-sm'
    : isReview
      ? 'bg-rose-600 text-white shadow-sm'
      : isScheduled
        ? brand ? brand.markClass : 'bg-cyan-600 text-white shadow-sm'
        : brand ? brand.markClass : 'bg-amber-400 text-slate-950 shadow-sm';
  const footerClass = isPaid
    ? brand ? brand.footerClass : 'border-emerald-200 bg-emerald-50/85'
    : isReview
      ? 'border-rose-200 bg-rose-50/85'
      : isScheduled
        ? brand ? brand.footerClass : 'border-cyan-200 bg-cyan-50/85'
        : brand ? brand.footerClass : 'border-amber-200 bg-amber-50/85';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
    >
      <Card className={cn(
        'overflow-hidden border shadow-sm transition-shadow hover:shadow-md',
        cardClass,
        isHighRisk && 'border-rose-400 ring-1 ring-rose-300',
      )}>
        <CardContent className="p-0">
          <div className="flex">
            <div className={cn('w-1.5 shrink-0', railClass)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 p-3.5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="relative mt-0.5 shrink-0">
                    {brand ? (
                      <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', iconClass)}>
                        <BrandMark brand={brand} className="text-lg" />
                      </div>
                    ) : (
                      <SupplierAvatar name={suggestion.suggestedSupplierName} categoryIcon={categoryIcon} size={44} />
                    )}
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-950 text-white shadow-sm">
                      <StatusIcon className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SuggestionStatusBadge suggestion={suggestion} />
                      <ConfidenceBadge value={suggestion.confidence} />
                      <SenderRiskBadge risk={suggestion.senderRisk} />
                    </div>
                    <p className="mt-2 text-base font-semibold leading-snug text-foreground">{suggestion.suggestedTitle || suggestion.subject}</p>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      {suggestion.senderName} &middot; recebido {format(parseISO(suggestion.receivedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {brand ? <BrandChip brand={brand} /> : null}
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                        <CategoryIcon className="h-3.5 w-3.5 text-slate-500" />
                        {categoryName}
                      </span>
                      <PaymentMethodChip method={suggestion.suggestedPaymentMethod} />
                    </div>
                    {verificationSignals.length > 0 || fraudSignals.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {verificationSignals.map((signal) => (
                          <span key={`v-${signal}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                            <BadgeCheck className="h-3 w-3" />{signal}
                          </span>
                        ))}
                        {fraudSignals.map((signal) => (
                          <span key={`f-${signal}`} className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                            <AlertCircle className="h-3 w-3" />{signal}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {suggestion.emailSnippet ? (
                      <p className="mt-3 line-clamp-2 rounded-lg border border-slate-200 bg-white/85 px-3 py-2 text-xs font-medium leading-relaxed text-slate-700">
                        {suggestion.emailSnippet}
                      </p>
                    ) : null}
                    {!isPaid && overdueDays != null && onMarkPaid && !readOnly ? (
                      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-start gap-1.5 text-xs font-medium text-amber-900">
                          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          Venceu há {overdueDays} dia{overdueDays > 1 ? 's' : ''} — provavelmente já foi paga.
                        </p>
                        <Button size="sm" className="h-7 shrink-0 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700" onClick={onMarkPaid}>
                          <CheckCircle2 className="h-3.5 w-3.5" />Criar como paga
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={cn('grid gap-2', isPaid ? 'grid-cols-3 lg:min-w-[320px]' : 'grid-cols-2 lg:min-w-[220px]')}>
                  <MetricBlock label="Valor" value={fmtBRL(suggestion.suggestedAmount)} />
                  <MetricBlock
                    label={isPaid ? 'Venc. original' : 'Vence em'}
                    value={format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}
                    tone={isPaid ? 'neutral' : 'due'}
                  />
                  {isPaid ? (
                    <MetricBlock
                      label="Pago em"
                      value={suggestion.suggestedPaidAt ? format(parseISO(suggestion.suggestedPaidAt), 'dd/MM/yyyy') : 'Confirmar'}
                      tone="paid"
                    />
                  ) : null}
                </div>
              </div>

              {!readOnly ? (
              <div className={cn('flex items-center justify-end gap-2 border-t px-4 py-2', footerClass)}>
                <div className="flex items-center gap-2 sm:justify-end">
                  {isHighRisk && !allowHighRisk ? (
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-rose-700 hover:bg-rose-100 hover:text-rose-800" onClick={() => setAllowHighRisk(true)}>
                      Criar mesmo assim
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" className="h-8 gap-1 border-slate-300 bg-white/80 text-slate-700 hover:bg-white hover:text-destructive" onClick={onDismiss}>
                    <X className="h-3.5 w-3.5" />Ignorar
                  </Button>
                  <Button
                    size="sm"
                    disabled={isHighRisk && !allowHighRisk}
                    title={isHighRisk && !allowHighRisk ? 'Remetente com sinais de fraude — confirme antes de criar.' : undefined}
                    className={cn('h-8 gap-1', isPaid && 'bg-emerald-600 text-white hover:bg-emerald-700')}
                    onClick={onAccept}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />{isPaid ? 'Adicionar paga' : isReview ? 'Revisar e usar' : 'Usar como conta'}
                  </Button>
                </div>
              </div>
              ) : null}
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
  categoryIcon,
  open,
  onOpenChange,
  onConfirm,
}: {
  suggestion: EmailSuggestion | null;
  categoryName: string;
  categoryIcon?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const paidDate = suggestion?.suggestedPaidAt ? format(parseISO(suggestion.suggestedPaidAt), 'dd/MM/yyyy') : 'Confirmar data';
  const dueDate = suggestion?.suggestedDueDate ? format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy') : 'Sem vencimento';
  const brand = getSuggestionBrand(suggestion);
  const CategoryIcon = getCategoryIcon(categoryIcon);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden border-emerald-200 p-0 shadow-2xl [&>button]:text-white [&>button]:opacity-90 [&>button:hover]:opacity-100">
        <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-cyan-700 px-6 py-5 text-white">
          <DialogHeader>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/30">
              <BadgeCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl text-white">Adicionar como conta paga?</DialogTitle>
            <DialogDescription className="font-medium text-emerald-50">
              A IA encontrou evidência de pagamento no e-mail. Confira os dados antes de lançar no contas a pagar.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conta identificada</p>
            <div className="mt-2 flex items-start gap-3">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1', brand ? brand.markClass : 'bg-emerald-100 text-emerald-800 ring-emerald-200')}>
                {brand ? <BrandMark brand={brand} className="text-base" /> : <CategoryIcon className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-foreground">{suggestion?.suggestedTitle ?? 'Conta paga'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {brand ? <BrandChip brand={brand} /> : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                    <CategoryIcon className="h-3.5 w-3.5 text-slate-500" />
                    {categoryName}
                  </span>
                  {suggestion ? <PaymentMethodChip method={suggestion.suggestedPaymentMethod} /> : null}
                </div>
                <p className="mt-2 text-sm font-medium text-slate-600">{suggestion?.senderName ?? 'Gmail'}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Valor pago</p>
              <p className="mt-2 text-2xl font-black text-emerald-900">{suggestion ? fmtBRL(suggestion.suggestedAmount) : 'R$ 0,00'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Pago em</p>
              <p className="mt-2 text-xl font-bold text-slate-950">{paidDate}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Vencimento</p>
              <p className="mt-2 text-xl font-bold text-slate-950">{dueDate}</p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-600 p-2 text-white">
                <CalendarCheck2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">O lançamento já entra como pago</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">
                  Se confirmar, a conta será criada com status pago, valor pago preenchido e data de pagamento destacada para o histórico financeiro.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-slate-50 px-6 py-4">
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
  /** Modo suporte: esconde Gmail/scan; sugestões continuam acionáveis via RPCs auditadas por contexto. */
  supportMode?: boolean;
};

export default function PayableEmailSuggestions({ onCreated, supportMode = false }: PayableEmailSuggestionsProps) {
  const { emailSuggestions, refreshEmailSuggestions, acceptEmailSuggestion, dismissEmailSuggestion, payableCategories, payables, updatePayable, addPayableHistoryEntry } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailActionLoading, setGmailActionLoading] = useState(false);
  const [paidSuggestionToConfirm, setPaidSuggestionToConfirm] = useState<EmailSuggestion | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanIntervalHours, setAutoScanIntervalHours] = useState(12);

  const categoryById = useMemo(() => new Map(payableCategories.map((c) => [c.id, c])), [payableCategories]);
  const pendingAll = useMemo(() => emailSuggestions.filter((s) => s.status === 'PENDING'), [emailSuggestions]);
  // Sugestões cuja conta equivalente JÁ existe (import por IA ou cadastro manual) → fora da lista
  // ativa, para uma seção "já cadastradas" — evita duplicata e inconsistência entre origens.
  const alreadyRegistered = useMemo(
    () => pendingAll.filter((s) => findPayableForSuggestion(s, payables) != null),
    [pendingAll, payables],
  );
  const pending = useMemo(
    () => pendingAll.filter((s) => findPayableForSuggestion(s, payables) == null),
    [pendingAll, payables],
  );
  const paidPending = useMemo(() => pending.filter((s) => s.suggestedStatus === 'PAGO'), [pending]);
  const payablePendingAll = useMemo(() => pending.filter((s) => s.suggestedStatus !== 'PAGO'), [pending]);
  // Confiança < 55 vai para a seção "Incertas", para não poluir a lista principal.
  const payablePending = useMemo(
    () => payablePendingAll.filter((s) => s.confidence >= 55).sort((a, b) => b.confidence - a.confidence),
    [payablePendingAll],
  );
  const uncertainPending = useMemo(
    () => payablePendingAll.filter((s) => s.confidence < 55).sort((a, b) => b.confidence - a.confidence),
    [payablePendingAll],
  );
  const dismissed = useMemo(() => emailSuggestions.filter((s) => s.status === 'DISMISSED'), [emailSuggestions]);
  const accepted = useMemo(() => emailSuggestions.filter((s) => s.status === 'ACCEPTED'), [emailSuggestions]);

  function applyGmailStatus(status: GmailConnectionStatus) {
    setGmailStatus(status);
    setAutoScanEnabled(Boolean(status.auto_sync_enabled));
    setAutoScanIntervalHours([6, 12, 24].includes(status.auto_sync_interval_hours ?? 12)
      ? status.auto_sync_interval_hours ?? 12
      : 12);
  }

  useEffect(() => {
    // Em modo suporte não consultamos o Gmail: a conexão é da empresa (auth uid dela),
    // não do suporte — chamar aqui mostraria o Gmail do suporte. Painel fica oculto.
    if (supportMode) {
      setGmailLoading(false);
      return;
    }
    let cancelled = false;
    setGmailLoading(true);
    getGmailConnectionStatus()
      .then((status) => {
        if (!cancelled) applyGmailStatus(status);
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
  }, [supportMode]);

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

  async function handleScanGmail(options: { silent?: boolean } = {}) {
    setGmailActionLoading(true);
    try {
      const result = await scanGmailPayables();
      await refreshEmailSuggestions();
      const status = await getGmailConnectionStatus();
      applyGmailStatus(status);
      const reconciled = result.reconciled ?? 0;
      if (!options.silent || result.created > 0 || reconciled > 0) {
        toast({
          title: result.created > 0 || reconciled > 0 ? 'Sugestões atualizadas' : 'Busca concluída',
          description: `${result.created} criada${result.created === 1 ? '' : 's'}`
            + (reconciled > 0 ? ` · ${reconciled} marcada${reconciled === 1 ? '' : 's'} como paga` : '')
            + ` · ${result.skipped} ignorada${result.skipped === 1 ? '' : 's'}.`,
          variant: result.errors.length > 0 ? 'destructive' : 'default',
        });
      }
    } catch (error) {
      if (!options.silent) {
        toast({
          title: 'Não foi possível buscar no Gmail',
          description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
          variant: 'destructive',
        });
      }
    } finally {
      setGmailActionLoading(false);
    }
  }

  async function handleAutoScanEnabledChange(enabled: boolean) {
    setGmailActionLoading(true);
    try {
      const status = await updateGmailAutoSyncSettings(enabled, autoScanIntervalHours);
      applyGmailStatus(status);
      toast({
        title: enabled ? 'Busca automática ativada' : 'Busca automática pausada',
        description: enabled
          ? 'O Retiflow continuará buscando novas contas mesmo com esta página fechada.'
          : 'Você ainda pode buscar novas contas manualmente.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível atualizar a busca automática',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setGmailActionLoading(false);
    }
  }

  async function handleAutoScanIntervalChange(value: string) {
    const intervalHours = Number(value);
    setGmailActionLoading(true);
    try {
      const status = await updateGmailAutoSyncSettings(autoScanEnabled, intervalHours);
      applyGmailStatus(status);
    } catch (error) {
      toast({
        title: 'Não foi possível alterar o intervalo',
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

  async function handleMarkPaid(suggestion: EmailSuggestion) {
    // Cobrança vencida que o usuário confirma já ter sido paga: cria a conta e
    // registra o pagamento total na data de hoje, em um passo.
    const payable = await acceptEmailSuggestion(suggestion.id);
    if (!payable) return;
    try {
      await updatePayable(payable.id, {
        status: 'PAGO',
        paidAmount: payable.finalAmount,
        paidAt: new Date().toISOString(),
        paidWith: payable.paymentMethod,
      });
    } catch (error) {
      toast({
        title: 'Conta criada, mas falhou ao marcar como paga',
        description: error instanceof Error ? error.message : 'Registre o pagamento manualmente.',
        variant: 'destructive',
      });
      onCreated?.(payable.id);
      return;
    }
    addPayableHistoryEntry(buildPayableHistoryDescription({
      payableId: payable.id,
      action: 'PAID',
      userId: user?.id ?? 'user-2',
      extra: { paidAmount: payable.finalAmount },
    }));
    toast({ title: 'Conta criada e marcada como paga', description: `"${payable.title}" já entrou como quitada.` });
    onCreated?.(payable.id);
  }

  async function handleDismiss(suggestion: EmailSuggestion) {
    await dismissEmailSuggestion(suggestion.id);
    toast({ title: 'Sugestão ignorada', description: 'Você pode encontrá-la no histórico se precisar.' });
  }

  return (
    <div className="space-y-6">
      {supportMode ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
          Modo suporte — sugestões da empresa acessada. Aceitar e ignorar são auditados; conectar Gmail e buscar novos e-mails continuam exclusivos da própria empresa.
        </div>
      ) : null}
      {!supportMode ? (
      <>
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {gmailStatus?.connected ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {gmailStatus?.connected ? gmailStatus.email ?? 'Gmail conectado' : 'Gmail desconectado'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {gmailStatus?.connected
                ? gmailStatus.last_sync_at
                  ? `Última busca ${format(parseISO(gmailStatus.last_sync_at), "dd/MM 'às' HH:mm")}`
                  : 'Pronto pra primeira busca'
                : 'Conecte sua conta pra começar a receber sugestões'}
            </p>
            {gmailStatus?.last_error ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3" />
                {gmailStatus.last_error}
              </p>
            ) : null}
            {autoScanEnabled && gmailStatus?.next_auto_sync_at ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Próxima busca automática {format(parseISO(gmailStatus.next_auto_sync_at), "dd/MM 'às' HH:mm")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gmailStatus?.connected ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5">
              <Switch
                id="payables-autoscan-toggle"
                checked={autoScanEnabled}
                onCheckedChange={(enabled) => void handleAutoScanEnabledChange(enabled)}
                disabled={gmailActionLoading}
              />
              <Label htmlFor="payables-autoscan-toggle" className="cursor-pointer text-xs font-medium text-foreground">Auto</Label>
              {autoScanEnabled ? (
                <Select value={String(autoScanIntervalHours)} onValueChange={(value) => void handleAutoScanIntervalChange(value)} disabled={gmailActionLoading}>
                  <SelectTrigger className="h-7 w-[110px] border-border/60 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">A cada 6h</SelectItem>
                    <SelectItem value="12">A cada 12h</SelectItem>
                    <SelectItem value="24">1x por dia</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void handleScanGmail()} disabled={!gmailStatus?.connected || gmailActionLoading}>
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', gmailActionLoading && 'animate-spin')} />
            Buscar agora
          </Button>
          <Button variant={gmailStatus?.connected ? 'ghost' : 'default'} size="sm" onClick={() => void handleConnectGmail()} disabled={gmailLoading || gmailActionLoading}>
            <Link2 className="mr-2 h-3.5 w-3.5" />
            {gmailStatus?.connected ? 'Reconectar' : 'Conectar Gmail'}
          </Button>
        </div>
      </div>

      {gmailStatus?.connected && gmailStatus.last_sync_at ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <GmailSyncMetric label="E-mails lidos" value={gmailStatus.last_scan_messages_count ?? 0} />
            <GmailSyncMetric label="Anexos" value={gmailStatus.last_scan_attachments_count ?? 0} />
            <GmailSyncMetric label="Sugestões novas" value={gmailStatus.last_scan_suggestions_count ?? 0} />
            <GmailSyncMetric label="Pagas conciliadas" value={gmailStatus.last_scan_reconciled_count ?? 0} />
            <GmailSyncMetric label="Ignorados" value={gmailStatus.last_scan_skipped_count ?? 0} />
            <GmailSyncMetric label="Pendências" value={gmailStatus.last_scan_errors_count ?? 0} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Resumo da última busca. E-mails sem cobrança clara ou já analisados são ignorados com segurança.
          </p>
        </div>
      ) : null}
      </>
      ) : null}

      {(paidPending.length > 0 || payablePending.length > 0 || accepted.length > 0 || dismissed.length > 0) ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {paidPending.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              {paidPending.length} paga{paidPending.length !== 1 ? 's' : ''}
            </span>
          ) : null}
          {payablePending.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
              <ReceiptText className="h-3.5 w-3.5" />
              {payablePending.length} a pagar
            </span>
          ) : null}
          {accepted.length > 0 ? <span>{accepted.length} aceita{accepted.length !== 1 ? 's' : ''}</span> : null}
          {dismissed.length > 0 ? <span>{dismissed.length} ignorada{dismissed.length !== 1 ? 's' : ''}</span> : null}
        </div>
      ) : null}

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
        <div className="space-y-6">
          {paidPending.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                  <BadgeCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Pagas detectadas</p>
                  <p className="text-[11px] font-medium text-emerald-700/80">Aceite pra registrar como já quitadas</p>
                </div>
                <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{paidPending.length}</span>
              </div>
              <AnimatePresence mode="popLayout">
                {paidPending.map((suggestion) => {
                  const category = categoryById.get(suggestion.suggestedCategoryId);
                  return (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      categoryName={category?.name ?? 'Categoria'}
                      categoryIcon={category?.icon}
                      onAccept={() => { void handleAccept(suggestion); }}
                      onDismiss={() => { void handleDismiss(suggestion); }}
                    />
                  );
                })}
              </AnimatePresence>
            </section>
          ) : null}

          {payablePending.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                  <ReceiptText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-900">A pagar detectadas</p>
                  <p className="text-[11px] font-medium text-amber-700/80">Revise e adicione no controle</p>
                </div>
                <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{payablePending.length}</span>
              </div>
              <AnimatePresence mode="popLayout">
                {payablePending.map((suggestion) => {
                  const category = categoryById.get(suggestion.suggestedCategoryId);
                  return (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      categoryName={category?.name ?? 'Categoria'}
                      categoryIcon={category?.icon}
                      overdueDays={getSuggestionOverdueDays(suggestion)}
                      onAccept={() => { void handleAccept(suggestion); }}
                      onMarkPaid={() => { void handleMarkPaid(suggestion); }}
                      onDismiss={() => { void handleDismiss(suggestion); }}
                    />
                  );
                })}
              </AnimatePresence>
            </section>
          ) : null}

          {uncertainPending.length > 0 ? (
            <details className="group rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                {uncertainPending.length} sugest{uncertainPending.length !== 1 ? 'ões' : 'ão'} incerta{uncertainPending.length !== 1 ? 's' : ''} (baixa confiança) — revise antes de usar
              </summary>
              <div className="mt-3 space-y-3">
                <AnimatePresence mode="popLayout">
                  {uncertainPending.map((suggestion) => {
                    const category = categoryById.get(suggestion.suggestedCategoryId);
                    return (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        categoryName={category?.name ?? 'Categoria'}
                        categoryIcon={category?.icon}
                        overdueDays={getSuggestionOverdueDays(suggestion)}
                        onAccept={() => { void handleAccept(suggestion); }}
                        onMarkPaid={() => { void handleMarkPaid(suggestion); }}
                        onDismiss={() => { void handleDismiss(suggestion); }}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            </details>
          ) : null}
        </div>
      )}

      {alreadyRegistered.length > 0 ? (
        <details className="group rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-emerald-800 hover:text-emerald-900">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            <BadgeCheck className="h-3.5 w-3.5" />
            {alreadyRegistered.length} já cadastrada{alreadyRegistered.length !== 1 ? 's' : ''} no contas a pagar — não recria duplicata
          </summary>
          <div className="mt-3 space-y-2">
            {alreadyRegistered.map((suggestion) => (
              <div key={suggestion.id} className="flex items-center gap-3 rounded-xl border border-emerald-200/60 bg-white/70 px-4 py-2.5 text-sm">
                <SupplierAvatar name={suggestion.suggestedSupplierName} categoryIcon={categoryById.get(suggestion.suggestedCategoryId)?.icon} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{suggestion.suggestedTitle}</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(suggestion.suggestedAmount)} &middot; vence {format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { void handleDismiss(suggestion); }}>
                  Arquivar
                </Button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

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
        categoryIcon={paidSuggestionToConfirm ? categoryById.get(paidSuggestionToConfirm.suggestedCategoryId)?.icon : undefined}
        open={paidSuggestionToConfirm !== null}
        onOpenChange={(open) => { if (!open) setPaidSuggestionToConfirm(null); }}
        onConfirm={() => { if (paidSuggestionToConfirm) void acceptSuggestionNow(paidSuggestionToConfirm); }}
      />
    </div>
  );
}
