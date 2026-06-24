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
  ChevronDown,
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
  ShieldCheck,
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
import { logError } from '@/lib/monitoring';
import { EmailSuggestion } from '@/types';
import { buildPayableHistoryDescription, classifyEmailSuggestionForReview, getSuggestionOverdueDays, summarizeSenderHistory, type PayableMatchResult } from '@/services/domain/payables';
import { getGmailConnectionStatus, scanGmailPayables, startGmailOAuth, updateGmailAutoSyncSettings, type GmailConnectionStatus } from '@/api/supabase/gmail-payables';
import { getCategoryIcon } from '@/lib/payableCategoryIcon';
import { SupplierAvatar } from '@/components/payables/SupplierAvatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { DismissReason } from '@/api/supabase/sugestoes-email';

const DISMISS_REASONS: { value: DismissReason; label: string }[] = [
  { value: 'NAO_E_CONTA', label: 'Não é uma conta a pagar' },
  { value: 'DUPLICADO', label: 'Já está cadastrada' },
  { value: 'SPAM', label: 'É spam / golpe' },
  { value: 'OUTRO', label: 'Só ignorar' },
];

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Resumo curto do trecho do e-mail: limpa espaços e corta em ~140 chars, no fim de palavra. */
function shortSnippet(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
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

type TrustLevel = 'high' | 'mid' | 'low';

/** Nível de confiança consolidado: funde confiança + risco do remetente + sinais. */
function getTrustLevel(suggestion: EmailSuggestion): TrustLevel {
  const hasFraud = (suggestion.fraudSignals ?? []).length > 0;
  if (suggestion.senderRisk === 'ALTO' || hasFraud) return 'low';
  if (suggestion.confidence < 80 || suggestion.senderRisk === 'MEDIO' || suggestion.suggestedStatus === 'INCERTO') return 'mid';
  return 'high';
}

/** Uma pílula só, em vez de 3 badges + listas de sinais. Passa segurança sem ruído. */
function TrustPill({ suggestion }: { suggestion: EmailSuggestion }) {
  const level = getTrustLevel(suggestion);
  const verified = (suggestion.verificationSignals ?? []).length;
  const cfg = level === 'high'
    ? { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Icon: ShieldCheck, label: 'Confiável' }
    : level === 'mid'
      ? { cls: 'bg-amber-50 text-amber-900 ring-amber-300', Icon: AlertCircle, label: 'Confira' }
      : { cls: 'bg-rose-50 text-rose-800 ring-rose-300', Icon: AlertCircle, label: 'Risco' };
  const title = `Confiança ${suggestion.confidence}%`
    + (suggestion.senderRisk && suggestion.senderRisk !== 'BAIXO' ? ` · remetente ${suggestion.senderRisk.toLowerCase()}` : '')
    + (verified > 0 ? ` · ${verified} verificação${verified === 1 ? '' : 'ões'}` : '');
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 sm:text-xs', cfg.cls)}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
      <span className="opacity-70">· {suggestion.confidence}%</span>
    </span>
  );
}

function GmailSyncMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-center shadow-sm sm:min-w-[104px] sm:px-2.5 sm:py-2 sm:text-left">
      <p className="line-clamp-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">{label}</p>
      <p className="mt-0.5 text-sm font-bold leading-none text-foreground sm:text-base">{value}</p>
    </div>
  );
}

function SuggestionStatusBadge({ suggestion }: { suggestion: EmailSuggestion }) {
  if (suggestion.suggestedStatus === 'INCERTO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-300 sm:px-2.5 sm:py-1 sm:text-xs">
        <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Revisar
      </span>
    );
  }
  if (suggestion.suggestedStatus === 'PAGO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:px-2.5 sm:py-1 sm:text-xs">
        <BadgeCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Já paga
      </span>
    );
  }
  if (suggestion.suggestedStatus === 'AGENDADO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200 sm:px-2.5 sm:py-1 sm:text-xs">
        <Clock3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Agendada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-300 sm:px-2.5 sm:py-1 sm:text-xs">
      <ReceiptText className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> A pagar
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
    <div className={cn('min-w-[72px] rounded-lg border px-2 py-1 shadow-sm', toneClass)}>
      <p className={cn('text-[9px] font-bold uppercase tracking-wide', labelClass)}>{label}</p>
      <p className="mt-0.5 text-xs font-bold leading-none">{value}</p>
    </div>
  );
}

type SuggestionCardProps = {
  suggestion: EmailSuggestion;
  categoryName: string;
  categoryIcon?: string | null;
  overdueDays?: number | null;
  readOnly?: boolean;
  reviewReasons?: string[];
  existingMatch?: PayableMatchResult | null;
  onAccept: () => void;
  onMarkPaid?: () => void;
  onDismiss: (motivo: DismissReason) => void;
};

function SuggestionCard({ suggestion, categoryName, categoryIcon, overdueDays, readOnly = false, reviewReasons = [], existingMatch, onAccept, onMarkPaid, onDismiss }: SuggestionCardProps) {
  const isPaid = suggestion.suggestedStatus === 'PAGO';
  const isScheduled = suggestion.suggestedStatus === 'AGENDADO';
  const isReview = suggestion.suggestedStatus === 'INCERTO';
  const isHighRisk = suggestion.senderRisk === 'ALTO';
  const verificationSignals = suggestion.verificationSignals ?? [];
  const fraudSignals = suggestion.fraudSignals ?? [];
  const [allowHighRisk, setAllowHighRisk] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  // Conta parecida já cadastrada (quase-duplicado): mantém na lista, mas avisa.
  const similarExisting = existingMatch?.match && existingMatch.kind === 'revisar' ? existingMatch.match : null;
  const hasDetails = Boolean(suggestion.emailSnippet) || verificationSignals.length > 0 || fraudSignals.length > 0 || reviewReasons.length > 0;
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
      layout="position"
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
              <div className="flex flex-col gap-2 p-2.5 sm:gap-2.5 sm:p-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-2.5 sm:gap-3">
                  <div className="relative mt-0.5 shrink-0">
                    {brand ? (
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9', iconClass)}>
                        <BrandMark brand={brand} className="text-sm sm:text-base" />
                      </div>
                    ) : (
                      <SupplierAvatar name={suggestion.suggestedSupplierName} categoryIcon={categoryIcon} size={32} />
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-slate-950 text-white shadow-sm">
                      <StatusIcon className="h-2.5 w-2.5" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <TrustPill suggestion={suggestion} />
                      {isPaid || isScheduled || isReview ? <SuggestionStatusBadge suggestion={suggestion} /> : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{suggestion.suggestedTitle || suggestion.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{suggestion.suggestedSupplierName || suggestion.senderName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {brand ? <BrandChip brand={brand} /> : null}
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                        <CategoryIcon className="h-3.5 w-3.5 text-slate-500" />
                        {categoryName}
                      </span>
                      <PaymentMethodChip method={suggestion.suggestedPaymentMethod} />
                    </div>
                    {similarExisting ? (
                      <p
                        className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200"
                        title={existingMatch?.reasons.length ? existingMatch.reasons.join(' · ') : undefined}
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="shrink-0">Já existe parecida:</span>
                        <span className="truncate font-bold">{similarExisting.title}</span>
                      </p>
                    ) : null}
                    {!isPaid && overdueDays != null && onMarkPaid && !readOnly ? (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 sm:mt-3 sm:px-3 sm:py-2">
                        <p className="flex min-w-0 items-start gap-1.5 text-[11px] font-medium leading-snug text-amber-900 sm:text-xs">
                          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span className="line-clamp-2">Venceu há {overdueDays} dia{overdueDays > 1 ? 's' : ''} — provavelmente já foi paga.</span>
                        </p>
                        <Button size="sm" className="h-7 shrink-0 gap-1 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-700 sm:px-2.5 sm:text-xs" onClick={onMarkPaid}>
                          <CheckCircle2 className="hidden h-3.5 w-3.5 sm:block" />Paga
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={cn('grid gap-1.5', isPaid ? 'grid-cols-3 lg:min-w-[260px]' : 'grid-cols-2 lg:min-w-[172px]')}>
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

              {showEmail && hasDetails ? (
                <div className="border-t border-slate-200/70 bg-white/70 px-2.5 py-2.5 sm:px-3">
                  <p className="text-[11px] text-slate-500">
                    {suggestion.senderName} &middot; {suggestion.senderEmail} &middot; recebido {format(parseISO(suggestion.receivedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  {reviewReasons.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {reviewReasons.slice(0, 5).map((reason) => (
                        <span key={reason} className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
                          {reason}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {verificationSignals.length > 0 || fraudSignals.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
                    <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
                      {shortSnippet(suggestion.emailSnippet)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!readOnly ? (
              <div className={cn('flex flex-wrap items-center justify-between gap-2 border-t px-2.5 py-1.5 sm:px-3', footerClass)}>
                {hasDetails ? (
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-slate-600 hover:bg-white/60 hover:text-slate-900" onClick={() => setShowEmail((v) => !v)}>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showEmail && 'rotate-180')} />
                    Ver e-mail
                  </Button>
                ) : <span className="hidden sm:block" />}
                <div className="flex flex-1 items-center justify-end gap-1.5 sm:flex-none sm:gap-2">
                  {isHighRisk && !allowHighRisk ? (
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-rose-700 hover:bg-rose-100 hover:text-rose-800" onClick={() => setAllowHighRisk(true)}>
                      Criar mesmo assim
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1 border-slate-300 bg-white/80 px-2 text-slate-700 hover:bg-white hover:text-destructive sm:px-3">
                        <X className="h-3.5 w-3.5" />Ignorar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {DISMISS_REASONS.map((reason) => (
                        <DropdownMenuItem key={reason.value} onClick={() => onDismiss(reason.value)}>
                          {reason.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    disabled={isHighRisk && !allowHighRisk}
                    title={isHighRisk && !allowHighRisk ? 'Remetente com sinais de fraude — confirme antes de criar.' : undefined}
                    className={cn('h-8 gap-1 px-2 sm:px-3', isPaid && 'bg-emerald-600 text-white hover:bg-emerald-700')}
                    onClick={onAccept}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />{isPaid ? 'Adicionar paga' : isReview ? 'Revisar e usar' : 'Usar conta'}
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

type ReviewSuggestion = {
  suggestion: EmailSuggestion;
  reasons: string[];
};

function ReviewSuggestionDialog({
  review,
  categoryName,
  open,
  onOpenChange,
  onConfirm,
}: {
  review: ReviewSuggestion | null;
  categoryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const suggestion = review?.suggestion ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar após revisão?</DialogTitle>
          <DialogDescription>
            Esta sugestão tem algum sinal que impede criação direta. Confira os dados antes de lançar no contas a pagar.
          </DialogDescription>
        </DialogHeader>

        {suggestion ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-semibold">{suggestion.suggestedTitle}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {suggestion.suggestedSupplierName} · {fmtBRL(suggestion.suggestedAmount)} · vence {format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Categoria: {categoryName}</p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Motivos da revisão</p>
              <ul className="mt-2 space-y-1 text-sm text-amber-950">
                {(review?.reasons.length ? review.reasons : ['Sugestão exige confirmação manual']).map((reason) => (
                  <li key={reason}>- {reason}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button onClick={onConfirm}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Confirmar criação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PayableEmailSuggestionsProps = {
  onCreated?: (payableId: string) => void;
  /** Modo suporte: status, OAuth, scan e ações usam contexto auditado da empresa acessada. */
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
  const [reviewSuggestionToConfirm, setReviewSuggestionToConfirm] = useState<ReviewSuggestion | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanIntervalHours, setAutoScanIntervalHours] = useState(12);

  const categoryById = useMemo(() => new Map(payableCategories.map((c) => [c.id, c])), [payableCategories]);
  const pendingAll = useMemo(() => emailSuggestions.filter((s) => s.status === 'PENDING'), [emailSuggestions]);
  // Aprendizado por remetente (#3): histórico de decisões alimenta a revisão.
  const senderHistory = useMemo(() => summarizeSenderHistory(emailSuggestions), [emailSuggestions]);
  const reviewedPending = useMemo(
    () => pendingAll.map((suggestion) => ({
      suggestion,
      disposition: classifyEmailSuggestionForReview(suggestion, payables, senderHistory),
    })),
    [pendingAll, payables, senderHistory],
  );
  // Casamento com conta já existente, por sugestão — alimenta o selo "Já existe parecida".
  const matchBySuggestionId = useMemo(() => {
    const map = new Map<string, PayableMatchResult | null>();
    for (const item of reviewedPending) map.set(item.suggestion.id, item.disposition.match);
    return map;
  }, [reviewedPending]);
  const alreadyRegistered = useMemo(
    () => reviewedPending.filter((item) => item.disposition.bucket === 'duplicate'),
    [reviewedPending],
  );
  const quarantinedPending = useMemo(
    () => reviewedPending.filter((item) => item.disposition.bucket === 'quarantine'),
    [reviewedPending],
  );
  const paidPending = useMemo(
    () => reviewedPending.filter((item) => item.disposition.bucket === 'receipt').map((item) => item.suggestion),
    [reviewedPending],
  );
  const payablePending = useMemo(
    () => reviewedPending
      .filter((item) => item.disposition.bucket === 'main')
      .map((item) => item.suggestion)
      .sort((a, b) => b.confidence - a.confidence),
    [reviewedPending],
  );
  const reviewPending = useMemo(
    () => reviewedPending
      .filter((item) => item.disposition.bucket === 'review')
      .sort((a, b) => b.suggestion.confidence - a.suggestion.confidence),
    [reviewedPending],
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
    try {
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
    } catch (error) {
      await refreshEmailSuggestions().catch((refreshError) => {
        logError(refreshError, 'PayableEmailSuggestions.refreshAfterAcceptError');
      });
      toast({
        title: 'Não foi possível criar a conta',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  }

  async function handleAccept(suggestion: EmailSuggestion) {
    const disposition = classifyEmailSuggestionForReview(suggestion, payables, senderHistory);
    if (disposition.bucket === 'quarantine' || disposition.bucket === 'duplicate') {
      toast({
        title: disposition.bucket === 'quarantine' ? 'Item em quarentena' : 'Conta parecida para revisar',
        description: 'Esta sugestão precisa ser revisada fora da lista principal antes de virar conta.',
        variant: 'destructive',
      });
      return;
    }
    if (suggestion.suggestedStatus === 'PAGO') {
      setPaidSuggestionToConfirm(suggestion);
      return;
    }
    if (disposition.bucket === 'review') {
      setReviewSuggestionToConfirm({
        suggestion,
        reasons: disposition.reasons.length > 0 ? disposition.reasons : ['Sugestão exige confirmação manual'],
      });
      return;
    }
    await acceptSuggestionNow(suggestion);
  }

  async function handleMarkPaid(suggestion: EmailSuggestion) {
    // Cobrança vencida que o usuário confirma já ter sido paga: cria a conta e
    // registra o pagamento total na data de hoje, em um passo.
    try {
      const payable = await acceptEmailSuggestion(suggestion.id);
      if (!payable) return;
      await updatePayable(payable.id, {
        status: 'PAGO',
        paidAmount: payable.finalAmount,
        paidAt: new Date().toISOString(),
        paidWith: payable.paymentMethod,
      });
      addPayableHistoryEntry(buildPayableHistoryDescription({
        payableId: payable.id,
        action: 'PAID',
        userId: user?.id ?? 'user-2',
        extra: { paidAmount: payable.finalAmount },
      }));
      toast({ title: 'Conta criada e marcada como paga', description: `"${payable.title}" já entrou como quitada.` });
      onCreated?.(payable.id);
    } catch (error) {
      await refreshEmailSuggestions().catch((refreshError) => {
        logError(refreshError, 'PayableEmailSuggestions.refreshAfterMarkPaidError');
      });
      toast({
        title: 'Não foi possível criar como paga',
        description: error instanceof Error ? error.message : 'Tente novamente. Nenhuma sugestão deve ser considerada quitada sem confirmação.',
        variant: 'destructive',
      });
    }
  }

  async function handleDismiss(suggestion: EmailSuggestion, motivo: DismissReason) {
    await dismissEmailSuggestion(suggestion.id, motivo);
    toast({ title: 'Sugestão ignorada', description: 'Você pode encontrá-la no histórico se precisar.' });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <>
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {gmailStatus?.connected ? (
            <div className="col-span-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 sm:col-span-1">
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
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
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

      {(paidPending.length > 0 || payablePending.length > 0 || reviewPending.length > 0 || quarantinedPending.length > 0 || accepted.length > 0 || dismissed.length > 0) ? (
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
          {reviewPending.length > 0 ? <span>{reviewPending.length} para revisão</span> : null}
          {quarantinedPending.length > 0 ? <span className="font-medium text-rose-700">{quarantinedPending.length} em quarentena</span> : null}
          {accepted.length > 0 ? <span>{accepted.length} aceita{accepted.length !== 1 ? 's' : ''}</span> : null}
          {dismissed.length > 0 ? <span>{dismissed.length} ignorada{dismissed.length !== 1 ? 's' : ''}</span> : null}
        </div>
      ) : null}

      {pendingAll.length === 0 ? (
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
        <div className="space-y-4 sm:space-y-6">
          {paidPending.length > 0 ? (
            <section className="space-y-2.5 sm:space-y-3">
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
                      existingMatch={matchBySuggestionId.get(suggestion.id)}
                      onAccept={() => { void handleAccept(suggestion); }}
                      onDismiss={(motivo) => { void handleDismiss(suggestion, motivo); }}
                    />
                  );
                })}
              </AnimatePresence>
            </section>
          ) : null}

          {payablePending.length > 0 ? (
            <section className="space-y-2.5 sm:space-y-3">
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
                      existingMatch={matchBySuggestionId.get(suggestion.id)}
                      onAccept={() => { void handleAccept(suggestion); }}
                      onMarkPaid={() => { void handleMarkPaid(suggestion); }}
                      onDismiss={(motivo) => { void handleDismiss(suggestion, motivo); }}
                    />
                  );
                })}
              </AnimatePresence>
            </section>
          ) : null}

          {reviewPending.length > 0 ? (
            <details className="group rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                {reviewPending.length} sugest{reviewPending.length !== 1 ? 'ões' : 'ão'} para revisão — criação exige confirmação
              </summary>
              <div className="mt-3 space-y-3">
                <AnimatePresence mode="popLayout">
                  {reviewPending.map(({ suggestion, disposition }) => {
                    const category = categoryById.get(suggestion.suggestedCategoryId);
                    return (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        categoryName={category?.name ?? 'Categoria'}
                        categoryIcon={category?.icon}
                        overdueDays={getSuggestionOverdueDays(suggestion)}
                        reviewReasons={disposition.reasons}
                        existingMatch={disposition.match}
                        onAccept={() => { void handleAccept(suggestion); }}
                        onMarkPaid={() => { void handleMarkPaid(suggestion); }}
                        onDismiss={(motivo) => { void handleDismiss(suggestion, motivo); }}
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
            {alreadyRegistered.length} já {alreadyRegistered.length === 1 ? 'cadastrada' : 'cadastradas'} no controle — não precisa adicionar de novo
          </summary>
          <div className="mt-3 space-y-2">
            {alreadyRegistered.map(({ suggestion, disposition }) => (
              <div key={suggestion.id} className="flex items-center gap-3 rounded-xl border border-emerald-200/60 bg-white/70 px-4 py-2.5 text-sm">
                <SupplierAvatar name={suggestion.suggestedSupplierName} categoryIcon={categoryById.get(suggestion.suggestedCategoryId)?.icon} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{suggestion.suggestedTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtBRL(suggestion.suggestedAmount)} &middot; vence {format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}
                    {disposition.match?.match ? ` · parecida com "${disposition.match.match.title}"` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { void handleDismiss(suggestion, 'DUPLICADO'); }}>
                  Arquivar
                </Button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {quarantinedPending.length > 0 ? (
        <details className="group rounded-2xl border border-rose-200/80 bg-rose-50/50 p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-rose-800 hover:text-rose-900">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            <AlertCircle className="h-3.5 w-3.5" />
            {quarantinedPending.length} item{quarantinedPending.length !== 1 ? 's' : ''} suspeito{quarantinedPending.length !== 1 ? 's' : ''} ocultado{quarantinedPending.length !== 1 ? 's' : ''} da lista principal
          </summary>
          <div className="mt-3 space-y-2">
            {quarantinedPending.map(({ suggestion, disposition }) => (
              <div key={suggestion.id} className="rounded-xl border border-rose-200 bg-white/80 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{suggestion.suggestedTitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{suggestion.senderName} · {fmtBRL(suggestion.suggestedAmount)} · {suggestion.confidence}% confiança</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(disposition.reasons.length > 0 ? disposition.reasons : ['Risco alto']).slice(0, 4).map((reason) => (
                        <span key={reason} className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">{reason}</span>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-rose-700" onClick={() => { void handleDismiss(suggestion, 'SPAM'); }}>
                    Arquivar
                  </Button>
                </div>
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
      <ReviewSuggestionDialog
        review={reviewSuggestionToConfirm}
        categoryName={reviewSuggestionToConfirm ? categoryById.get(reviewSuggestionToConfirm.suggestion.suggestedCategoryId)?.name ?? 'Categoria' : 'Categoria'}
        open={reviewSuggestionToConfirm !== null}
        onOpenChange={(open) => { if (!open) setReviewSuggestionToConfirm(null); }}
        onConfirm={() => {
          if (!reviewSuggestionToConfirm) return;
          const suggestion = reviewSuggestionToConfirm.suggestion;
          setReviewSuggestionToConfirm(null);
          void acceptSuggestionNow(suggestion);
        }}
      />
    </div>
  );
}
