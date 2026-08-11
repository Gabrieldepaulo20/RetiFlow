import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Download, Building2,
  PlusCircle, RefreshCcw, ChevronLeft, Eye, EyeOff, Sparkles, PencilLine, Printer,
  Wallet, CheckCircle2, RotateCcw, MessageCircle, AlertTriangle, ArrowRight, Upload,
  Clock3,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDatabaseDateTimeBR, formatDateBR, todayLocalISODate } from '@/lib/dates';
import { ClosingHtmlPreview } from '@/components/closing/ClosingHtmlPreview';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPdfPreviewWindow, downloadPdfBlob, downloadPdfUrl, openPdfInBrowser } from '@/lib/printPdf';
import {
  atualizarFechamentoPdf,
  finalizarFechamento,
  getAllFechamentos,
  getFechamentosAbertosCliente,
  registrarAcaoFechamento,
  getNotaDetalhesParaFechamento,
  uploadFechamentoPDF,
  getFechamentoPDFSignedUrl,
  normalizeFechamentoDadosJson,
  type FechamentoAbertoClienteItem,
  type FechamentosAbertosCliente,
  type FechamentoListItem,
  type FechamentoDadosJson,
  type FechamentoRecebimentoInicial,
  type FinalizarFechamentoResult,
} from '@/api/supabase/fechamentos';
import {
  getFinanceiroContas,
  insertFinanceiroAnexo,
  uploadFinanceiroComprovante,
  type FinanceiroConta,
} from '@/api/supabase/financeiro';
import { getNotasServico, mapStatusNome, type NotaServico } from '@/api/supabase/notas';
import { getClienteDetalhes } from '@/api/supabase/clientes';
import { useDocumentCustomization, useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import {
  canLoadMonthlyClosings,
  getMonthlyClosingDraftsStorageKey,
  scopeMonthlyClosings,
} from '@/services/domain/monthlyClosingIsolation';
import {
  getClosingCompetenceDate,
  getMonthlyClosingDateRange,
  mapWithConcurrency,
  parseDateInputValue,
  toDateInputValue,
  type MonthlyClosingDateMode,
} from '@/services/domain/monthlyClosing';
import {
  buildDadosFromDraft,
  canDiscountPreviewItem,
  clampPercent,
  computeDraftTotals,
  getDraftNotes,
  getIncludedDraftNotes,
  getPreviewNoteDiscountedOpenAmount,
  getPreviewNoteOpenAmount,
  getPreviewNoteReceivedAmount,
  getPreviewItems,
  recalcItemSubtotal,
  roundMoney,
  type ClosingDraft,
  type PreviewNote,
} from '@/services/domain/monthlyClosingDraft';
import {
  calculateInitialClosingPayment,
  centsToMoney,
  moneyToCents,
  type ClosingInitialPaymentMode,
  type ClosingInitialPaymentPlan,
} from '@/services/domain/monthlyClosingPayment';
import { PAYMENT_METHOD_LABELS, type IntakeNote, type NotePaymentStatus, type PaymentMethod } from '@/types';
import { isBillableNoteStatus } from '@/services/domain/intakeNotes';
import { toComparableTime } from '@/services/domain/dashboardFinance';
import {
  assertActiveSupportScopeUnchanged,
  captureActiveSupportScope,
  readActiveSupportContext,
  SupportScopeChangedAfterCommitError,
} from '@/services/auth/supportContext';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { ClosingPaymentDialog } from '@/components/closing/ClosingPaymentDialog';
import type { ClosingFinancialSummary } from '@/components/closing/closingFinancialSummary';
import { Textarea } from '@/components/ui/textarea';
import { generateId } from '@/lib/generateId';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const PALETTE = [
  { border: 'border-l-blue-400',    avatar: 'bg-blue-100 text-blue-700'   },
  { border: 'border-l-violet-400',  avatar: 'bg-violet-100 text-violet-700' },
  { border: 'border-l-emerald-400', avatar: 'bg-emerald-100 text-emerald-700' },
  { border: 'border-l-orange-400',  avatar: 'bg-orange-100 text-orange-700' },
  { border: 'border-l-teal-400',    avatar: 'bg-teal-100 text-teal-700'   },
  { border: 'border-l-rose-400',    avatar: 'bg-rose-100 text-rose-700'   },
] as const;

const CLOSING_NOTES_PAGE_SIZE = 1000;
const MAX_PAYMENT_PROOF_SIZE = 15 * 1024 * 1024;
const PAYMENT_PROOF_EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidLocalDate = (value: string) => parseDateInputValue(value) !== null;

async function getAllClosingCandidateNotes(
  clientId: string,
  supportContextActive: boolean,
): Promise<NotaServico[]> {
  const result: NotaServico[] = [];
  let offset = 0;

  while (true) {
    const page = await getNotasServico({
      p_fk_clientes: clientId,
      p_limite: CLOSING_NOTES_PAGE_SIZE,
      p_offset: offset,
      p_ordem_campo: 'registration',
      p_ordem_direcao: 'asc',
      ...(supportContextActive ? {} : { p_apenas_sem_fechamento: true }),
    });

    result.push(...page.dados);
    offset += page.dados.length;

    if (
      page.dados.length === 0
      || (page.total > 0
        ? result.length >= page.total
        : page.dados.length < CLOSING_NOTES_PAGE_SIZE)
    ) {
      break;
    }
  }

  return result;
}

interface AvailableClosingPeriod {
  key: string;
  month: string;
  year: string;
  label: string;
  noteCount: number;
}

const toMoney = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pctBR = (value: number) =>
  `${(Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

const getClosingReceivedAmount = (closing: FechamentoListItem) => Math.min(
  Math.max(0, asNumber(closing.valor_total)),
  Math.max(0, asNumber(closing.valor_recebido ?? closing.valorRecebido)),
);

const getClosingOpenAmount = (closing: FechamentoListItem) =>
  Math.max(0, Number((asNumber(closing.valor_total) - getClosingReceivedAmount(closing)).toFixed(2)));

const hasSameClosingFinancialState = (left: FechamentoListItem, right: FechamentoListItem) => (
  moneyToCents(asNumber(left.valor_total)) === moneyToCents(asNumber(right.valor_total))
  && moneyToCents(getClosingReceivedAmount(left)) === moneyToCents(getClosingReceivedAmount(right))
);

const toClosingFinancialSummary = (closing: FechamentoListItem): ClosingFinancialSummary => {
  const total = Math.max(0, asNumber(closing.valor_total));
  const received = getClosingReceivedAmount(closing);
  const open = getClosingOpenAmount(closing);
  return {
    total,
    received,
    open,
    status: open <= 0.004 ? 'PAGO' : received > 0 ? 'PARCIAL' : 'PENDENTE',
  };
};

const buildInitialPaymentPlan = (draft: ClosingDraft): ClosingInitialPaymentPlan => {
  const payment = draft.initialPayment;
  if (payment.mode === 'CUSTOM') {
    return { mode: 'CUSTOM', amountCents: payment.customAmountCents ?? 0 };
  }
  return { mode: payment.mode };
};

const validatePaymentProof = (file: File) => {
  if (file.size > MAX_PAYMENT_PROOF_SIZE) {
    throw new Error('O comprovante deve ter no máximo 15 MB.');
  }
  const allowedMime = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!allowedMime && !PAYMENT_PROOF_EXTENSIONS.test(file.name)) {
    throw new Error('Envie um comprovante PDF, JPG, PNG ou WebP.');
  }
};

function OpenClosingReminder({
  data,
  loading,
  error,
  onOpen,
  onRetry,
}: {
  data: FechamentosAbertosCliente | null;
  loading: boolean;
  error: boolean;
  onOpen: (item: FechamentoAbertoClienteItem) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
        <RefreshCcw className="mr-2 inline h-3.5 w-3.5 animate-spin" /> Conferindo saldos anteriores…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
        <span>Não foi possível conferir os fechamentos anteriores deste cliente.</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Tentar novamente
        </Button>
      </div>
    );
  }
  if (!data || data.quantidade === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Este cliente tem {data.quantidade} fechamento{data.quantidade === 1 ? '' : 's'} anterior{data.quantidade === 1 ? '' : 'es'} em aberto
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80">
            Saldo anterior total: <FinancialValue>R$ {toMoney(data.saldoTotal)}</FinancialValue>. O valor não será somado ao novo fechamento.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.fechamentos.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-amber-100"
              >
                {item.periodo} · <FinancialValue>R$ {toMoney(item.saldo)}</FinancialValue>
                <ArrowRight className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const createDraftId = () =>
  `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value : fallback;

const asNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizePreviewItem = (value: unknown, fallbackId: string): PreviewNote['itens'][number] | null => {
  if (!isRecord(value)) return null;
  const quantidade = asNumber(value.quantidade);
  const precoUnitario = asNumber(value.preco_unitario);
  const descontoPorcentagem = clampPercent(asNumber(value.desconto_porcentagem));
  const subtotal = asNumber(value.subtotal, quantidade * precoUnitario * (1 - descontoPorcentagem / 100));
  const descontoOriginal = clampPercent(asNumber(value.desconto_original, descontoPorcentagem));
  const subtotalOriginal = asNumber(value.subtotal_original, subtotal);

  return {
    id: asString(value.id, fallbackId),
    descricao: asString(value.descricao, 'Serviço realizado'),
    quantidade,
    preco_unitario: precoUnitario,
    desconto_original: descontoOriginal,
    desconto_porcentagem: descontoPorcentagem,
    subtotal_original: subtotalOriginal,
    subtotal,
  };
};

const normalizePreviewNote = (value: unknown): PreviewNote | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id, '');
  if (!id) return null;
  const total = asNumber(value.total);
  const itens = Array.isArray(value.itens)
    ? value.itens
        .map((item, index) => normalizePreviewItem(item, `${id}-item-${index}`))
        .filter((item): item is PreviewNote['itens'][number] => item !== null)
    : [];

  return {
    id,
    os: asString(value.os, 'O.S. sem número'),
    veiculo: asString(value.veiculo, 'Veículo não informado'),
    placa: typeof value.placa === 'string' && value.placa.trim() ? value.placa : null,
    total,
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
    paymentStatus:
      value.paymentStatus === 'PAGO'
        ? 'PAGO'
        : value.paymentStatus === 'PARCIAL'
          ? 'PARCIAL'
          : 'PENDENTE',
    valorRecebido: Math.max(
      0,
      Math.min(
        total,
        value.paymentStatus === 'PAGO' ? total : asNumber(value.valorRecebido),
      ),
    ),
    pagoEm: typeof value.pagoEm === 'string' ? value.pagoEm : null,
    itens: itens.length > 0 ? itens : [{
      id: `${id}-fallback`,
      descricao: 'Serviços realizados',
      quantidade: 1,
      preco_unitario: total,
      desconto_original: 0,
      desconto_porcentagem: 0,
      subtotal_original: total,
      subtotal: total,
    }],
  };
};

const normalizeDiscounts = (value: unknown) => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [key, clampPercent(asNumber(raw))]),
  );
};

const isInitialPaymentMode = (value: unknown): value is ClosingInitialPaymentMode => (
  value === 'NONE' || value === 'PERCENT_50' || value === 'PERCENT_60' || value === 'CUSTOM'
);

const isPaymentMethod = (value: unknown): value is PaymentMethod => (
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_LABELS, value)
);

const normalizeClosingDraft = (value: unknown, fallbackMonth: string, fallbackYear: string): ClosingDraft | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id, '');
  const clientId = asString(value.clientId, '');
  if (!id || !clientId) return null;

  const notes = Array.isArray(value.notes)
    ? value.notes.map(normalizePreviewNote).filter((note): note is PreviewNote => note !== null)
    : [];
  const month = asString(value.month, fallbackMonth);
  const year = asString(value.year, fallbackYear);
  const periodMode: MonthlyClosingDateMode = value.periodMode === 'custom' ? 'custom' : 'month';
  const includedNoteIds = Array.isArray(value.includedNoteIds)
    ? value.includedNoteIds.filter((noteId): noteId is string => typeof noteId === 'string')
    : notes.filter((note) => getPreviewNoteOpenAmount(note) > 0).map((note) => note.id);
  const closingId = typeof value.closingId === 'string' && UUID_PATTERN.test(value.closingId)
    ? value.closingId
    : generateId();
  const generationKey = typeof value.generationKey === 'string'
    && value.generationKey.trim().length > 0
    && value.generationKey.length <= 200
    ? value.generationKey
    : `finalizar-fechamento:${closingId}`;
  const rawPayment = isRecord(value.initialPayment) ? value.initialPayment : {};
  const paymentDate = typeof rawPayment.date === 'string' && isValidLocalDate(rawPayment.date)
    ? rawPayment.date
    : todayLocalISODate();

  return {
    id,
    closingId,
    generationKey,
    generationStartedAt: typeof value.generationStartedAt === 'string'
      && !Number.isNaN(new Date(value.generationStartedAt).getTime())
      ? value.generationStartedAt
      : null,
    clientId,
    clientName: asString(value.clientName, 'Cliente'),
    periodMode,
    startDate: typeof value.startDate === 'string' ? value.startDate : null,
    endDate: typeof value.endDate === 'string' ? value.endDate : null,
    cutoffDate: typeof value.cutoffDate === 'string' ? value.cutoffDate : null,
    month,
    year,
    periodLabel: asString(value.periodLabel, `${MONTHS[Number(month) - 1] ?? 'Período'} ${year}`),
    notes,
    includedNoteIds,
    discounts: normalizeDiscounts(value.discounts),
    initialPayment: {
      mode: isInitialPaymentMode(rawPayment.mode) ? rawPayment.mode : 'NONE',
      customAmountCents: Math.max(0, Math.trunc(asNumber(rawPayment.customAmountCents))),
      date: paymentDate,
      method: isPaymentMethod(rawPayment.method) ? rawPayment.method : 'PIX',
      accountId: asString(rawPayment.accountId, ''),
      observations: typeof rawPayment.observations === 'string' ? rawPayment.observations.slice(0, 1000) : '',
    },
    createdAt: asString(value.createdAt, new Date().toISOString()),
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
  };
};

const normalizeAvailablePeriods = (dates: string[]) => {
  const map = new Map<string, AvailableClosingPeriod>();
  for (const rawDate of dates) {
    const dt = new Date(toComparableTime(rawDate));
    if (Number.isNaN(dt.getTime())) continue;
    const month = String(dt.getMonth() + 1);
    const year = String(dt.getFullYear());
    const key = `${year}-${month.padStart(2, '0')}`;
    const current = map.get(key);
    if (current) {
      current.noteCount += 1;
      continue;
    }
    map.set(key, {
      key,
      month,
      year,
      label: `${MONTHS[dt.getMonth()]} ${year}`,
      noteCount: 1,
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.year !== b.year) return Number(b.year) - Number(a.year);
    return Number(b.month) - Number(a.month);
  });
};

const isAvailableForClosing = (note: IntakeNote) =>
  isBillableNoteStatus(note.status) && !note.closingId && Boolean(getClosingCompetenceDate(note));

const isInClosingDateRange = (note: IntakeNote, start: Date, end: Date) => {
  const competenceDate = getClosingCompetenceDate(note);
  if (!competenceDate) return false;
  const competenceTime = toComparableTime(competenceDate);
  return Number.isFinite(competenceTime)
    && competenceTime >= start.getTime()
    && competenceTime <= end.getTime();
};

/* ── Dual-ring spinner ─────────────────────────────────────────────────── */
function DualSpinner() {
  return (
    <div className="relative w-14 h-14">
      <svg className="absolute inset-0 animate-spin" viewBox="0 0 56 56" style={{ animationDuration: '1s' }}>
        <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="3.5"
          strokeLinecap="round" strokeDasharray="90 66" className="text-primary" />
      </svg>
      <svg className="absolute inset-0" viewBox="0 0 56 56"
        style={{ animation: 'spin-ccw 1.5s linear infinite' }}>
        <circle cx="28" cy="28" r="16" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeDasharray="7 5" className="text-primary/50" />
      </svg>
      <style>{`@keyframes spin-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }`}</style>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function MonthlyClosing() {
  const [searchParams] = useSearchParams();
  const { notes, clients, registrarRecebimentoNota, estornarRecebimentoNota, refreshNotes } = useData();
  const { operationalUser, user, isSupportImpersonating } = useAuth();
  const { toast } = useToast();
  const currentScopeUserId = IS_REAL_AUTH ? operationalUser?.id ?? null : 'development';
  const activeSupportScope = readActiveSupportContext();
  const supportContextActive = Boolean(
    isSupportImpersonating
    && currentScopeUserId
    && activeSupportScope?.targetUserId === currentScopeUserId,
  );
  const supportContextInvalid = Boolean(isSupportImpersonating || activeSupportScope)
    && !supportContextActive;
  const documentQueriesEnabled = !supportContextInvalid && Boolean(currentScopeUserId);
  const documentQueryScope = supportContextActive ? activeSupportScope?.sessionId : null;
  const templateSettingsQuery = useDocumentTemplateSettings(
    currentScopeUserId,
    documentQueriesEnabled,
    documentQueryScope,
  );
  const documentSettingsQuery = useDocumentCustomization(
    'closing_report',
    currentScopeUserId,
    documentQueriesEnabled,
    documentQueryScope,
  );
  const { data: templateSettings } = templateSettingsQuery;
  const { data: documentSettings } = documentSettingsQuery;
  const supportDocumentSettingsReady = Boolean(
    !supportContextInvalid
    && documentQueriesEnabled
    && currentScopeUserId
    && templateSettingsQuery.isReady
    && templateSettingsQuery.expectedUserId === currentScopeUserId
    && templateSettings?.fkUsuarios === currentScopeUserId
    && documentSettingsQuery.isReady
    && documentSettingsQuery.expectedUserId === currentScopeUserId
    && documentSettings?.fkUsuarios === currentScopeUserId,
  );
  const supportDocumentSettingsError = Boolean(
    documentQueriesEnabled
    && (
      templateSettingsQuery.isError
      || templateSettingsQuery.isScopeMismatch
      || documentSettingsQuery.isError
      || documentSettingsQuery.isScopeMismatch
    ),
  );
  const supportDocumentSettingsRefreshing = Boolean(
    templateSettingsQuery.isFetching || documentSettingsQuery.isFetching,
  );
  const retrySupportDocumentSettings = useCallback(() => {
    void Promise.all([
      templateSettingsQuery.refetch(),
      documentSettingsQuery.refetch(),
    ]);
  }, [documentSettingsQuery, templateSettingsQuery]);

  const now = new Date();
  const defaultMonth = String(now.getMonth() + 1);
  const defaultYear = String(now.getFullYear());
  const defaultCustomStartDate = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultCustomEndDate = toDateInputValue(now);
  const [fechamentos, setFechamentos] = useState<FechamentoListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  // Filtro/ordenação da lista de fechamentos gerados.
  const [fechamentoBusca, setFechamentoBusca] = useState('');
  const [fechamentoStatus, setFechamentoStatus] = useState<'todos' | 'pago' | 'pendente'>('todos');
  const [fechamentoOrdem, setFechamentoOrdem] = useState<'recentes' | 'valor'>('recentes');
  // Gerando link do WhatsApp para compartilhar o PDF do fechamento.
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [paymentClosing, setPaymentClosing] = useState<FechamentoListItem | null>(null);
  const [returnToDraftAfterPayment, setReturnToDraftAfterPayment] = useState(false);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceiroConta[]>([]);
  const [financeAccountsScopeKey, setFinanceAccountsScopeKey] = useState<string | null>(null);
  const [financeAccountsError, setFinanceAccountsError] = useState(false);
  const [loadingFinanceAccounts, setLoadingFinanceAccounts] = useState(false);
  const [openClosings, setOpenClosings] = useState<FechamentosAbertosCliente | null>(null);
  const [loadingOpenClosings, setLoadingOpenClosings] = useState(false);
  const [openClosingsError, setOpenClosingsError] = useState(false);
  const [initialPaymentProof, setInitialPaymentProof] = useState<File | null>(null);
  const initialPaymentProofInputRef = useRef<HTMLInputElement | null>(null);
  const fechamentosRequestRef = useRef(0);
  const openClosingsRequestRef = useRef(0);
  const financeAccountsRequestRef = useRef(0);
  const generatedPreviewRequestRef = useRef(0);
  const directClosingHandledRef = useRef<string | null>(null);
  // Marcar uma O.S. do rascunho como já paga (sai do total do fechamento).
  const [payNota, setPayNota] = useState<PreviewNote | null>(null);
  const [payNotaData, setPayNotaData] = useState(() => todayLocalISODate());
  const [payNotaForma, setPayNotaForma] = useState<PaymentMethod>('PIX');
  const [payNotaBusy, setPayNotaBusy] = useState(false);
  // Fechamento gerado com o painel de descontos aberto (consulta visual).
  const [descontosAbertos, setDescontosAbertos] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ClosingDraft[]>([]);
  const [draftsHydratedKey, setDraftsHydratedKey] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [returnToDraftAfterPreview, setReturnToDraftAfterPreview] = useState(false);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);
  const [generatedPreviewFechamento, setGeneratedPreviewFechamento] = useState<FechamentoListItem | null>(null);
  const [storedPdfPreviewUrl, setStoredPdfPreviewUrl] = useState<string | null>(null);
  const [storedPdfPreviewTitle, setStoredPdfPreviewTitle] = useState<string | null>(null);
  const [previewFinancialSummary, setPreviewFinancialSummary] = useState<ClosingFinancialSummary | undefined>();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Object URL do PDF renderizado no preview (WYSIWYG). Mantido em ref para revogar
  // o anterior ao gerar um novo e no unmount, sem vazar memória.
  const previewObjectUrlRef = useRef<string | null>(null);
  // Última versão de `modalPreviewDados` (rascunho ativo em edição), lida sob demanda
  // ao abrir a visualização sem recriar os callbacks a cada tecla.
  const modalPreviewDadosRef = useRef<FechamentoDadosJson | null>(null);

  // Preview state
  const [periodMode, setPeriodMode] = useState<MonthlyClosingDateMode>('month');
  const [selMonth, setSelMonth] = useState(defaultMonth);
  const [selYear, setSelYear] = useState(defaultYear);
  const [customStartDate, setCustomStartDate] = useState(defaultCustomStartDate);
  const [customEndDate, setCustomEndDate] = useState(defaultCustomEndDate);
  const [selClientId, setSelClientId] = useState('');
  const [previewNotes, setPreviewNotes] = useState<PreviewNote[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [descontos, setDescontos] = useState<Record<string, number>>({});
  const [includedNoteIds, setIncludedNoteIds] = useState<string[]>([]);
  const [editingItems, setEditingItems] = useState<Record<string, boolean>>({});

  const currentFinanceAccountsScopeKey = currentScopeUserId
    ? `${currentScopeUserId}:${documentQueryScope ?? 'self'}`
    : null;
  const scopedFinanceAccounts = useMemo(
    () => financeAccountsScopeKey === currentFinanceAccountsScopeKey ? financeAccounts : [],
    [currentFinanceAccountsScopeKey, financeAccounts, financeAccountsScopeKey],
  );

  // Generation
  const [generating, setGenerating] = useState(false);
  const [previewDados, setPreviewDados] = useState<FechamentoDadosJson | null>(null);

  const draftsStorageKey = useMemo(
    () => getMonthlyClosingDraftsStorageKey(currentScopeUserId),
    [currentScopeUserId],
  );
  const scopedClientIds = useMemo(
    () => clients.map((client) => client.id).sort(),
    [clients],
  );
  const scopedClientIdSet = useMemo(
    () => new Set(scopedClientIds),
    [scopedClientIds],
  );

  useEffect(() => {
    generatedPreviewRequestRef.current += 1;
    setTemplatePreviewLoading(false);
    setFechamentos([]);
    setActiveDraftId(null);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(false);
    setReturnToDraftAfterPreview(false);
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
    setPreviewFinancialSummary(undefined);
    setPaymentClosing(null);
    setReturnToDraftAfterPayment(false);
    setOpenClosings(null);
    setOpenClosingsError(false);
    setFinanceAccounts([]);
    setFinanceAccountsScopeKey(null);
    setFinanceAccountsError(false);
    setLoadingFinanceAccounts(false);
    setInitialPaymentProof(null);
    setSelClientId('');
    setPeriodMode('month');
    setSelMonth(defaultMonth);
    setSelYear(defaultYear);
    setCustomStartDate(defaultCustomStartDate);
    setCustomEndDate(defaultCustomEndDate);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
    setPreviewDados(null);
  }, [currentScopeUserId, defaultCustomEndDate, defaultCustomStartDate, defaultMonth, defaultYear, documentQueryScope]);

  /* ── Load fechamentos ── */
  const loadFechamentos = useCallback(async () => {
    const requestId = fechamentosRequestRef.current + 1;
    fechamentosRequestRef.current = requestId;
    if (supportContextInvalid) {
      if (requestId === fechamentosRequestRef.current) setFechamentos([]);
      return true;
    }
    if (!canLoadMonthlyClosings({
      realAuth: IS_REAL_AUTH,
      scopeUserId: currentScopeUserId,
      supportContextActive,
      scopedClientIds,
    })) {
      if (requestId === fechamentosRequestRef.current) setFechamentos([]);
      return true;
    }

    setLoadingList(true);
    try {
      const dados = await getAllFechamentos();
      if (requestId !== fechamentosRequestRef.current) return false;
      // A RPC de suporte ja resolve sessao/alvo e filtra pelo dono do cliente.
      // Nao depender da carga assíncrona de clientes evita o falso estado vazio
      // observado em tablets. Fora do suporte, o filtro local segue fail-closed.
      setFechamentos(scopeMonthlyClosings(dados, scopedClientIds, supportContextActive));
      return true;
    } catch {
      if (requestId === fechamentosRequestRef.current) {
        // Preserva a última lista válida: falha de rede não equivale a ausência.
        toast({ title: 'Erro ao carregar fechamentos', variant: 'destructive' });
      }
      return false;
    } finally {
      if (requestId === fechamentosRequestRef.current) setLoadingList(false);
    }
  }, [currentScopeUserId, scopedClientIds, supportContextActive, supportContextInvalid, toast]);

  useEffect(() => { void loadFechamentos(); }, [loadFechamentos]);

  const loadFreshClosing = useCallback(async (fechamento: FechamentoListItem) => {
    const operationScope = captureActiveSupportScope();
    assertActiveSupportScopeUnchanged(operationScope);
    const dados = await getAllFechamentos({
      ...(fechamento.cliente?.id ? { p_fk_clientes: fechamento.cliente.id } : {}),
    });
    assertActiveSupportScopeUnchanged(operationScope);
    const fresh = dados.find((item) => item.id_fechamentos === fechamento.id_fechamentos);
    if (!fresh) throw new Error('O fechamento não foi encontrado ao atualizar o saldo.');

    setFechamentos((current) => current.map((item) => (
      item.id_fechamentos === fresh.id_fechamentos ? fresh : item
    )));
    return fresh;
  }, []);

  const loadFinanceAccounts = useCallback(async () => {
    const requestId = financeAccountsRequestRef.current + 1;
    financeAccountsRequestRef.current = requestId;
    const operationScope = captureActiveSupportScope();
    // A RPC contextual devolve somente as contas da empresa atendida. Em um
    // contexto divergente, mantemos a tela fail-closed.
    if (!IS_REAL_AUTH || !currentScopeUserId || supportContextInvalid) {
      if (requestId === financeAccountsRequestRef.current) {
        setFinanceAccounts([]);
        setFinanceAccountsScopeKey(null);
        setFinanceAccountsError(false);
        setLoadingFinanceAccounts(false);
      }
      return;
    }
    setLoadingFinanceAccounts(true);
    setFinanceAccountsError(false);
    try {
      assertActiveSupportScopeUnchanged(operationScope);
      const accounts = await getFinanceiroContas();
      assertActiveSupportScopeUnchanged(operationScope);
      if (requestId === financeAccountsRequestRef.current) {
        setFinanceAccounts(accounts.filter((account) => account.ativa));
        setFinanceAccountsScopeKey(currentFinanceAccountsScopeKey);
      }
    } catch {
      if (requestId === financeAccountsRequestRef.current) {
        setFinanceAccounts([]);
        setFinanceAccountsScopeKey(null);
        setFinanceAccountsError(true);
      }
    } finally {
      if (requestId === financeAccountsRequestRef.current) setLoadingFinanceAccounts(false);
    }
  }, [currentFinanceAccountsScopeKey, currentScopeUserId, supportContextInvalid]);

  useEffect(() => { void loadFinanceAccounts(); }, [loadFinanceAccounts]);

  useEffect(() => {
    setDraftsHydratedKey(null);
    if (!draftsStorageKey) {
      setDrafts([]);
      return;
    }

    try {
      const raw = window.localStorage.getItem(draftsStorageKey);
      if (!raw) {
        setDrafts([]);
        setDraftsHydratedKey(draftsStorageKey);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const normalized = Array.isArray(parsed)
        ? parsed
            .map((draft) => normalizeClosingDraft(draft, defaultMonth, defaultYear))
            .filter((draft): draft is ClosingDraft => draft !== null)
        : [];
      setDrafts(normalized);
    } catch {
      setDrafts([]);
    } finally {
      setDraftsHydratedKey(draftsStorageKey);
    }
  }, [defaultMonth, defaultYear, draftsStorageKey]);

  useEffect(() => {
    if (!draftsStorageKey || draftsHydratedKey !== draftsStorageKey) return;

    try {
      window.localStorage.setItem(draftsStorageKey, JSON.stringify(drafts));
    } catch {
      // noop
    }
  }, [drafts, draftsHydratedKey, draftsStorageKey]);

  const availableClosingNotes = useMemo(
    () => notes.filter(isAvailableForClosing),
    [notes],
  );

  const availablePeriods = useMemo(
    () => normalizeAvailablePeriods(availableClosingNotes.map(getClosingCompetenceDate).filter(Boolean) as string[]),
    [availableClosingNotes],
  );

  const loadDraftIntoEditor = useCallback((draft: ClosingDraft) => {
    const safeDraft = normalizeClosingDraft(draft, defaultMonth, defaultYear);
    if (!safeDraft) {
      toast({
        title: 'Rascunho inválido',
        description: 'Este rascunho estava incompleto e não pôde ser aberto com segurança.',
        variant: 'destructive',
      });
      return null;
    }

    if (!scopedClientIdSet.has(safeDraft.clientId)) {
      toast({
        title: scopedClientIdSet.size === 0 ? 'Clientes ainda não carregados' : 'Rascunho fora do escopo atual',
        description: scopedClientIdSet.size === 0
          ? 'Aguarde a carga dos clientes da empresa atendida e tente novamente.'
          : 'Este rascunho pertence a outra conta ou cliente e foi bloqueado nesta sessão.',
        variant: 'destructive',
      });
      return null;
    }

    setActiveDraftId(safeDraft.id);
    setSelClientId(safeDraft.clientId);
    setPeriodMode(safeDraft.periodMode ?? 'month');
    if (safeDraft.periodMode === 'custom') {
      const legacyCutoff = parseDateInputValue(safeDraft.cutoffDate ?? '');
      setCustomStartDate(
        safeDraft.startDate
          ?? (legacyCutoff ? toDateInputValue(new Date(legacyCutoff.getFullYear(), legacyCutoff.getMonth(), 1)) : defaultCustomStartDate),
      );
      setCustomEndDate(safeDraft.endDate ?? safeDraft.cutoffDate ?? defaultCustomEndDate);
    } else {
      setCustomStartDate(defaultCustomStartDate);
      setCustomEndDate(defaultCustomEndDate);
    }
    setSelMonth(safeDraft.month);
    setSelYear(safeDraft.year);
    setPreviewNotes(safeDraft.notes);
    setDescontos(safeDraft.discounts);
    setIncludedNoteIds(
      safeDraft.includedNoteIds
      ?? safeDraft.notes.filter((note) => getPreviewNoteOpenAmount(note) > 0).map((note) => note.id),
    );
    setEditingItems({});
    setInitialPaymentProof(null);
    if (initialPaymentProofInputRef.current) initialPaymentProofInputRef.current.value = '';
    return safeDraft;
  }, [defaultCustomEndDate, defaultCustomStartDate, defaultMonth, defaultYear, scopedClientIdSet, toast]);

  const openDraft = useCallback((draft: ClosingDraft) => {
    if (!loadDraftIntoEditor(draft)) return;
    setDraftModalOpen(true);
  }, [loadDraftIntoEditor]);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
    [drafts, activeDraftId],
  );
  const defaultFinanceAccount = useMemo(
    () => scopedFinanceAccounts.find((account) => account.padrao) ?? scopedFinanceAccounts[0] ?? null,
    [scopedFinanceAccounts],
  );

  const reminderClientId = activeDraft?.clientId ?? selClientId;
  const loadOpenClosings = useCallback(async (clientId: string) => {
    const requestId = openClosingsRequestRef.current + 1;
    openClosingsRequestRef.current = requestId;
    if (!IS_REAL_AUTH || !clientId || supportContextInvalid) {
      if (requestId === openClosingsRequestRef.current) {
        setOpenClosings(null);
        setOpenClosingsError(false);
      }
      return;
    }
    setLoadingOpenClosings(true);
    setOpenClosingsError(false);
    try {
      const result = await getFechamentosAbertosCliente(clientId);
      if (requestId === openClosingsRequestRef.current) setOpenClosings(result);
    } catch {
      if (requestId === openClosingsRequestRef.current) {
        setOpenClosings((current) => current?.clienteId === clientId ? current : null);
        setOpenClosingsError(true);
      }
    } finally {
      if (requestId === openClosingsRequestRef.current) setLoadingOpenClosings(false);
    }
  }, [supportContextInvalid]);

  useEffect(() => {
    if (!reminderClientId) {
      void loadOpenClosings('');
      return;
    }
    void loadOpenClosings(reminderClientId);
  }, [loadOpenClosings, reminderClientId]);

  const selectedPeriodRange = useMemo(
    () => getMonthlyClosingDateRange({
      mode: periodMode,
      month: selMonth,
      year: selYear,
      startDate: customStartDate,
      endDate: customEndDate,
    }),
    [customEndDate, customStartDate, periodMode, selMonth, selYear],
  );

  // Revoga o PDF de preview ao desmontar (o anterior já é revogado ao gerar um novo).
  useEffect(() => () => {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
  }, []);

  const closeTemplatePreview = useCallback(() => {
    generatedPreviewRequestRef.current += 1;
    setTemplatePreviewOpen(false);
    setTemplatePreviewLoading(false);
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
    setPreviewFinancialSummary(undefined);
    if (returnToDraftAfterPreview) {
      setReturnToDraftAfterPreview(false);
      setDraftModalOpen(true);
    }
  }, [returnToDraftAfterPreview]);

  const closeDraftModal = useCallback(() => {
    generatedPreviewRequestRef.current += 1;
    setDraftModalOpen(false);
    setTemplatePreviewOpen(false);
    setTemplatePreviewLoading(false);
    setReturnToDraftAfterPreview(false);
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
    setPreviewFinancialSummary(undefined);
  }, []);

  const renderClosingPdfBlob = useCallback(async (
    dados: FechamentoDadosJson,
    geradoEm: string,
    financialSummary?: ClosingFinancialSummary,
  ) => {
    const [verifiedTemplateSettings, verifiedDocumentSettings, { pdf }, { ClosingPDFTemplate }] = await Promise.all([
      templateSettingsQuery.requireData(),
      documentSettingsQuery.requireData(),
      import('@react-pdf/renderer'),
      import('@/components/closing/ClosingPDFTemplate'),
    ]);

    return pdf(
      <ClosingPDFTemplate
        dados={dados}
        geradoEm={geradoEm}
        accentColor={verifiedTemplateSettings.corFechamento}
        documentSettings={verifiedDocumentSettings}
        financialSummary={financialSummary}
      />,
    ).toBlob();
  }, [documentSettingsQuery, templateSettingsQuery]);

  const renderStableGeneratedClosing = useCallback(async (source: FechamentoListItem) => {
    let fresh = await loadFreshClosing(source);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dados = normalizeFechamentoDadosJson(fresh.dados_json);
      if (!dados) return { fresh, dados: null, blob: null };

      const blob = await renderClosingPdfBlob(
        dados,
        dados.gerado_em ?? fresh.created_at,
        toClosingFinancialSummary(fresh),
      );
      const verified = await loadFreshClosing(fresh);
      if (hasSameClosingFinancialState(fresh, verified)) {
        return { fresh: verified, dados, blob };
      }
      fresh = verified;
    }
    throw new Error('O saldo mudou enquanto o PDF era preparado. Tente novamente.');
  }, [loadFreshClosing, renderClosingPdfBlob]);

  const applyClosingPreviewBlob = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = url;
    setStoredPdfPreviewUrl(url);
  }, []);

  const openClosingPdfPreview = useCallback(async (
    dados: FechamentoDadosJson,
    title: string,
    financialSummary?: ClosingFinancialSummary,
  ) => {
    const previewWindow = createPdfPreviewWindow(title);
    setTemplatePreviewLoading(true);
    try {
      const blob = await renderClosingPdfBlob(dados, dados.gerado_em, financialSummary);
      const url = URL.createObjectURL(blob);
      const opened = openPdfInBrowser(url, {
        title,
        previewWindow,
        revokeObjectUrlAfterMs: 30_000,
      });
      if (!opened) {
        toast({
          title: 'Pop-up bloqueado',
          description: 'Permita pop-ups para abrir o PDF em uma nova aba.',
          variant: 'destructive',
        });
      }
    } catch {
      previewWindow?.close();
      toast({ title: 'Erro ao abrir visualização', description: 'Não foi possível gerar o PDF do fechamento.', variant: 'destructive' });
    } finally {
      setTemplatePreviewLoading(false);
    }
  }, [renderClosingPdfBlob, toast]);

  // WYSIWYG: renderiza o PDF real (mesmo blob do download) e exibe no iframe A4.
  // Assim a visualização é idêntica ao arquivo baixado, sem aproximação em HTML.
  const showClosingPdfPreview = useCallback(async (
    dados: FechamentoDadosJson,
    title: string,
    returnToDraft: boolean,
    financialSummary?: ClosingFinancialSummary,
  ) => {
    const requestId = generatedPreviewRequestRef.current + 1;
    generatedPreviewRequestRef.current = requestId;
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(title);
    setPreviewFinancialSummary(financialSummary);
    setReturnToDraftAfterPreview(returnToDraft);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(true);
    setTemplatePreviewLoading(true);
    try {
      const blob = await renderClosingPdfBlob(dados, dados.gerado_em, financialSummary);
      if (requestId !== generatedPreviewRequestRef.current) return;
      applyClosingPreviewBlob(blob);
    } catch {
      if (requestId !== generatedPreviewRequestRef.current) return;
      toast({ title: 'Erro ao gerar visualização', description: 'Não foi possível montar o PDF do fechamento.', variant: 'destructive' });
    } finally {
      if (requestId === generatedPreviewRequestRef.current) {
        setTemplatePreviewLoading(false);
      }
    }
  }, [applyClosingPreviewBlob, renderClosingPdfBlob, toast]);

  const openDraftPreview = useCallback((draft: ClosingDraft) => {
    if (!supportDocumentSettingsReady) {
      toast({
        title: 'Documento da empresa ainda não confirmado',
        description: 'Aguarde o template real carregar antes de visualizar o fechamento.',
        variant: 'destructive',
      });
      return;
    }
    const safeDraft = loadDraftIntoEditor(draft);
    if (!safeDraft) return;
    const totals = computeDraftTotals(safeDraft);
    const payment = calculateInitialClosingPayment(
      moneyToCents(totals.totalComDesconto),
      buildInitialPaymentPlan(safeDraft),
    );
    void showClosingPdfPreview(
      buildDadosFromDraft(safeDraft),
      `Fechamento ${safeDraft.periodLabel}`,
      false,
      {
        total: totals.totalComDesconto,
        received: centsToMoney(payment.amountCents),
        open: centsToMoney(payment.balanceCents),
        status: payment.balanceCents === 0 && payment.amountCents > 0
          ? 'PAGO'
          : payment.amountCents > 0 ? 'PARCIAL' : 'PENDENTE',
        planned: true,
      },
    );
  }, [loadDraftIntoEditor, showClosingPdfPreview, supportDocumentSettingsReady, toast]);

  const openActiveDraftPreview = useCallback(() => {
    if (!supportDocumentSettingsReady) return;
    const dados = modalPreviewDadosRef.current;
    if (!dados || !activeDraft) return;
    const payment = calculateInitialClosingPayment(
      moneyToCents(dados.total_com_desconto),
      buildInitialPaymentPlan(activeDraft),
    );
    void showClosingPdfPreview(dados, `Fechamento ${dados.periodo}`, true, {
      total: dados.total_com_desconto,
      received: centsToMoney(payment.amountCents),
      open: centsToMoney(payment.balanceCents),
      status: payment.balanceCents === 0 && payment.amountCents > 0
        ? 'PAGO'
        : payment.amountCents > 0 ? 'PARCIAL' : 'PENDENTE',
      planned: true,
    });
  }, [activeDraft, showClosingPdfPreview, supportDocumentSettingsReady]);

  const openGeneratedPreview = useCallback(async (fechamento: FechamentoListItem) => {
    if (!supportDocumentSettingsReady) {
      toast({
        title: 'Documento da empresa ainda não confirmado',
        description: 'Aguarde o template real carregar antes de visualizar o fechamento.',
        variant: 'destructive',
      });
      return;
    }
    const requestId = generatedPreviewRequestRef.current + 1;
    generatedPreviewRequestRef.current = requestId;
    setTemplatePreviewLoading(true);
    try {
      const rendered = await renderStableGeneratedClosing(fechamento);
      if (requestId !== generatedPreviewRequestRef.current) return;
      let { fresh } = rendered;
      if (rendered.dados && rendered.blob) {
        setGeneratedPreviewFechamento(null);
        setStoredPdfPreviewUrl(null);
        setStoredPdfPreviewTitle(`Fechamento ${fresh.periodo}`);
        setPreviewFinancialSummary(toClosingFinancialSummary(fresh));
        setReturnToDraftAfterPreview(false);
        setDraftModalOpen(false);
        setTemplatePreviewOpen(true);
        applyClosingPreviewBlob(rendered.blob);
        return;
      }

      if (fresh.pdf_url && getClosingReceivedAmount(fresh) > 0.004) {
        throw new Error(
          'Este fechamento legado não possui snapshot para atualizar o PDF após um recebimento.',
        );
      }

      if (fresh.pdf_url) {
        const url = await getFechamentoPDFSignedUrl(fresh.pdf_url, {
          fechamentoId: fresh.id_fechamentos,
        });
        if (requestId !== generatedPreviewRequestRef.current) return;
        const verified = await loadFreshClosing(fresh);
        if (requestId !== generatedPreviewRequestRef.current) return;
        if (!hasSameClosingFinancialState(fresh, verified)) {
          throw new Error('O saldo mudou enquanto o PDF era preparado. Tente novamente.');
        }
        fresh = verified;
        setGeneratedPreviewFechamento(null);
        setStoredPdfPreviewUrl(url);
        setStoredPdfPreviewTitle(`Fechamento ${fresh.periodo}`);
        setPreviewFinancialSummary(toClosingFinancialSummary(fresh));
        setReturnToDraftAfterPreview(false);
        setDraftModalOpen(false);
        setTemplatePreviewOpen(true);
        return;
      }

      throw new Error('Este fechamento não possui template salvo nem PDF armazenado.');
    } catch (error) {
      if (requestId === generatedPreviewRequestRef.current) {
        toast({
          title: 'Erro ao abrir visualização',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      }
    } finally {
      if (requestId === generatedPreviewRequestRef.current) setTemplatePreviewLoading(false);
    }
  }, [applyClosingPreviewBlob, loadFreshClosing, renderStableGeneratedClosing, supportDocumentSettingsReady, toast]);

  const directClosingId = searchParams.get('fechamento');
  useEffect(() => {
    if (!supportDocumentSettingsReady || !directClosingId || loadingList || directClosingHandledRef.current === directClosingId) return;
    const closing = fechamentos.find((item) => item.id_fechamentos === directClosingId);
    if (!closing) return;
    directClosingHandledRef.current = directClosingId;
    void openGeneratedPreview(closing);
  }, [directClosingId, fechamentos, loadingList, openGeneratedPreview, supportDocumentSettingsReady]);

  const removeDraft = useCallback((draftId: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== draftId));
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
      closeDraftModal();
    }
  }, [activeDraftId, closeDraftModal]);

  /* ── Build local draft ── */
  const handleBuildPreview = useCallback(async () => {
    if (supportContextInvalid) {
      toast({
        title: 'Sessão de suporte ainda não validada',
        description: 'Aguarde a confirmação do alvo antes de consultar ou criar um rascunho.',
        variant: 'destructive',
      });
      return;
    }
    const operationScope = captureActiveSupportScope();
    if (
      supportContextActive
      && operationScope?.targetUserId !== currentScopeUserId
    ) {
      toast({
        title: 'Sessão de suporte divergente',
        description: 'Atualize a página antes de consultar as O.S. da empresa atendida.',
        variant: 'destructive',
      });
      return;
    }
    if (!selClientId) { toast({ title: 'Selecione um cliente', variant: 'destructive' }); return; }
    if (!scopedClientIdSet.has(selClientId)) {
      toast({
        title: 'Cliente fora do escopo atual',
        description: 'Atualize a página e selecione um cliente pertencente à conta atual.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedPeriodRange) { toast({ title: 'Selecione um período válido', variant: 'destructive' }); return; }

    const inicio = selectedPeriodRange.start;
    const fim = selectedPeriodRange.end;

    setLoadingPreview(true);
    try {
      const localClosingIdByNoteId = new Map(notes.map((note) => [note.id, note.closingId ?? null]));
      const notasFiltradas = IS_REAL_AUTH
        ? (await getAllClosingCandidateNotes(selClientId, supportContextActive)).filter((note) => {
            const closingId = note.fk_fechamentos ?? localClosingIdByNoteId.get(note.id_notas_servico);
            if (closingId) return false;
            if (!isBillableNoteStatus(mapStatusNome(note.status?.nome ?? ''))) return false;
            const competenceDate = getClosingCompetenceDate({
              createdAt: note.created_at,
              deadline: note.prazo || undefined,
              finalizedAt: note.finalizado_em ?? undefined,
            });
            const competenceTime = toComparableTime(competenceDate);
            return Number.isFinite(competenceTime)
              && competenceTime >= inicio.getTime()
              && competenceTime <= fim.getTime();
          }).map((note) => ({
            id: note.id_notas_servico,
            number: asString(note.os, 'O.S. sem número'),
            vehicleModel: asString(note.veiculo?.modelo, 'Veículo não informado'),
            plate: typeof note.veiculo?.placa === 'string' && note.veiculo.placa.trim() ? note.veiculo.placa : null,
            totalAmount: asNumber(note.total),
            updatedAt: getClosingCompetenceDate({
              createdAt: note.created_at,
              deadline: note.prazo || undefined,
              finalizedAt: note.finalizado_em ?? undefined,
            }),
            paymentStatus: (
              note.payment_status === 'PAGO'
                ? 'PAGO'
                : note.payment_status === 'PARCIAL'
                  ? 'PARCIAL'
                  : 'PENDENTE'
            ) as NotePaymentStatus,
            valorRecebido: asNumber(note.valor_recebido),
            pagoEm: note.pago_em ?? null,
          }))
        : notes.filter((n) => {
            if (!isAvailableForClosing(n)) return false;
            if (n.clientId !== selClientId) return false;
            const competenceTime = toComparableTime(getClosingCompetenceDate(n));
            return Number.isFinite(competenceTime)
              && competenceTime >= inicio.getTime()
              && competenceTime <= fim.getTime();
          }).map((note) => ({
            id: note.id,
            number: note.number,
            vehicleModel: note.vehicleModel,
            plate: note.plate ?? '',
            totalAmount: note.totalAmount,
            updatedAt: getClosingCompetenceDate(note),
            paymentStatus: note.paymentStatus,
            valorRecebido: asNumber(note.valorRecebido),
            pagoEm: note.paidAt ?? null,
          }));
      assertActiveSupportScopeUnchanged(operationScope);

      if (notasFiltradas.length === 0) {
        toast({ title: 'Nenhuma O.S. faturável entregue neste período', variant: 'destructive' });
        return;
      }

      // O detalhe de cada O.S. ainda vem de uma RPC individual. Executar com
      // concorrência limitada elimina a espera sequencial sem saturar a
      // instância pequena do Supabase em fechamentos grandes.
      const resultado = await mapWithConcurrency(notasFiltradas, 6, async (nota): Promise<PreviewNote> => {
        assertActiveSupportScopeUnchanged(operationScope);
        const det = IS_REAL_AUTH ? await getNotaDetalhesParaFechamento(nota.id) : null;
        assertActiveSupportScopeUnchanged(operationScope);
        const itensServico = Array.isArray(det?.itens_servico) ? det.itens_servico : [];
        const fallbackItem = {
          id: `${nota.id}-fallback`,
          descricao: 'Serviços realizados',
          quantidade: 1,
          preco_unitario: nota.totalAmount,
          desconto_original: 0,
          desconto_porcentagem: 0,
          subtotal_original: nota.totalAmount,
          subtotal: nota.totalAmount,
        };
        return {
          id: nota.id,
          os: nota.number,
          veiculo: nota.vehicleModel,
          placa: nota.plate ?? null,
          total: nota.totalAmount,
          updatedAt: nota.updatedAt,
          paymentStatus: nota.paymentStatus,
          valorRecebido: nota.paymentStatus === 'PAGO'
            ? nota.totalAmount
            : Math.min(nota.totalAmount, Math.max(0, nota.valorRecebido)),
          pagoEm: nota.pagoEm,
          itens: itensServico.length > 0
            ? itensServico.map((i, index) => {
                const quantidade = asNumber(i.quantidade);
                const precoUnitario = asNumber(i.preco_unitario);
                const descontoPorcentagem = clampPercent(asNumber(i.desconto_porcentagem));
                return {
                  id: asString(i.id_rel, `${nota.id}-item-${index}`),
                  descricao: asString(i.descricao, 'Serviço realizado'),
                  quantidade,
                  preco_unitario: precoUnitario,
                  desconto_original: descontoPorcentagem,
                  desconto_porcentagem: descontoPorcentagem,
                  subtotal_original: asNumber(i.subtotal_item, quantidade * precoUnitario * (1 - descontoPorcentagem / 100)),
                  subtotal: asNumber(i.subtotal_item, quantidade * precoUnitario * (1 - descontoPorcentagem / 100)),
                };
              })
            : [fallbackItem],
        };
      });

      assertActiveSupportScopeUnchanged(operationScope);

      setPreviewNotes(resultado);
      setDescontos({});
      setIncludedNoteIds(resultado.filter((note) => getPreviewNoteOpenAmount(note) > 0).map((note) => note.id));
      setEditingItems({});
      const draftClient = clients.find((entry) => entry.id === selClientId);
      const periodLabel = selectedPeriodRange.label;
      const timestamp = new Date().toISOString();
      const closingId = generateId();
      const draft: ClosingDraft = {
        id: createDraftId(),
        closingId,
        generationKey: `finalizar-fechamento:${closingId}`,
        generationStartedAt: null,
        clientId: selClientId,
        clientName: draftClient?.name ?? 'Cliente',
        periodMode,
        startDate: periodMode === 'custom' ? customStartDate : null,
        endDate: periodMode === 'custom' ? customEndDate : null,
        cutoffDate: null,
        month: selectedPeriodRange.month,
        year: selectedPeriodRange.year,
        periodLabel,
        notes: resultado,
        includedNoteIds: resultado.filter((note) => getPreviewNoteOpenAmount(note) > 0).map((note) => note.id),
        discounts: {},
        initialPayment: {
          mode: 'NONE',
          date: todayLocalISODate(),
          method: 'PIX',
          accountId: defaultFinanceAccount?.id ?? '',
          observations: '',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      setDrafts((current) => [draft, ...current]);
      openDraft(draft);
      toast({ title: 'Rascunho gerado', description: 'Ele ficou salvo localmente e pode ser retomado depois.' });
    } catch (err) {
      const description = err instanceof Error ? err.message : 'Tente novamente.';
      toast({ title: 'Erro ao montar o rascunho', description, variant: 'destructive' });
    } finally {
      setLoadingPreview(false);
    }
  }, [clients, currentScopeUserId, customEndDate, customStartDate, defaultFinanceAccount?.id, notes, openDraft, periodMode, scopedClientIdSet, selClientId, selectedPeriodRange, supportContextActive, supportContextInvalid, toast]);

  const safePreviewNotes = useMemo(
    () => (Array.isArray(previewNotes) ? previewNotes : []),
    [previewNotes],
  );

  /* ── Computed totals ── */
  const totals = useMemo(() => {
    const included = new Set(includedNoteIds);
    return safePreviewNotes
      .filter((note) => included.has(note.id) && getPreviewNoteOpenAmount(note) > 0)
      .map((n) => {
      const openAmount = getPreviewNoteOpenAmount(n);
      return {
        id: n.id,
        totalBruto: roundMoney(openAmount),
        totalComDesconto: getPreviewNoteDiscountedOpenAmount(n),
      };
      });
  }, [safePreviewNotes, includedNoteIds]);

  const grandTotal = useMemo(
    () => roundMoney(totals.reduce((sum, item) => sum + item.totalComDesconto, 0)),
    [totals],
  );
  const grandTotalOriginal = useMemo(
    () => roundMoney(totals.reduce((sum, item) => sum + item.totalBruto, 0)),
    [totals],
  );
  // Partes já recebidas no período (inclusive parcial), fora do total a pagar.
  const receivedNotes = useMemo(
    () => safePreviewNotes.filter((note) => getPreviewNoteReceivedAmount(note) > 0),
    [safePreviewNotes],
  );
  const receivedTotal = useMemo(
    () => roundMoney(receivedNotes.reduce((sum, note) => sum + getPreviewNoteReceivedAmount(note), 0)),
    [receivedNotes],
  );
  const includedNotesCount = totals.length;
  const initialPaymentCalculation = useMemo(() => (
    activeDraft
      ? calculateInitialClosingPayment(moneyToCents(grandTotal), buildInitialPaymentPlan(activeDraft))
      : calculateInitialClosingPayment(moneyToCents(grandTotal), { mode: 'NONE' })
  ), [activeDraft, grandTotal]);
  const initialPaymentAccountReady = Boolean(
    activeDraft?.initialPayment.accountId
    && scopedFinanceAccounts.some((account) => (
      account.ativa && account.id === activeDraft.initialPayment.accountId
    )),
  );
  const initialPaymentReady = Boolean(
    activeDraft
    && (
      activeDraft.initialPayment.mode === 'NONE'
      || (
        initialPaymentCalculation.valid
        && isValidLocalDate(activeDraft.initialPayment.date)
        && initialPaymentAccountReady
      )
    ),
  );

  const updateInitialPayment = useCallback((
    changes: Partial<ClosingDraft['initialPayment']>,
  ) => {
    if (!activeDraftId) return;
    setDrafts((current) => current.map((draft) => (
      draft.id === activeDraftId
        ? {
            ...draft,
            initialPayment: { ...draft.initialPayment, ...changes },
            updatedAt: new Date().toISOString(),
          }
        : draft
    )));
  }, [activeDraftId]);

  const activeDraftInitialPaymentMode = activeDraft?.initialPayment.mode;
  useEffect(() => {
    if (!supportContextInvalid || !activeDraftInitialPaymentMode || activeDraftInitialPaymentMode === 'NONE') return;
    updateInitialPayment({ mode: 'NONE' });
    setInitialPaymentProof(null);
    if (initialPaymentProofInputRef.current) initialPaymentProofInputRef.current.value = '';
  }, [activeDraftInitialPaymentMode, supportContextInvalid, updateInitialPayment]);

  const selectInitialPaymentMode = useCallback((mode: ClosingInitialPaymentMode) => {
    updateInitialPayment({
      mode,
      accountId: activeDraft?.initialPayment.accountId || defaultFinanceAccount?.id || '',
      date: activeDraft?.initialPayment.date || todayLocalISODate(),
    });
    if (mode === 'NONE') {
      setInitialPaymentProof(null);
      if (initialPaymentProofInputRef.current) initialPaymentProofInputRef.current.value = '';
    }
  }, [activeDraft?.initialPayment.accountId, activeDraft?.initialPayment.date, defaultFinanceAccount?.id, updateInitialPayment]);

  const openClosingPayments = useCallback((closing: FechamentoListItem, returnToDraft = false) => {
    setReturnToDraftAfterPayment(returnToDraft);
    if (returnToDraft) setDraftModalOpen(false);
    setPaymentClosing(closing);
  }, []);

  const openReminderPayment = useCallback((item: FechamentoAbertoClienteItem) => {
    const existing = fechamentos.find((closing) => closing.id_fechamentos === item.id);
    const clientId = reminderClientId;
    const clientName = clients.find((client) => client.id === clientId)?.name ?? activeDraft?.clientName ?? 'Cliente';
    openClosingPayments(existing ?? {
      id_fechamentos: item.id,
      mes: '',
      ano: 0,
      periodo: item.periodo,
      label: item.label,
      valor_total: item.valorTotal,
      valor_recebido: item.valorRecebido,
      valorRecebido: item.valorRecebido,
      status_pagamento: item.status,
      pago_em: null,
      pago_com: null,
      versao: 1,
      total_regeneracoes: 0,
      total_edicoes: 0,
      total_downloads: 0,
      created_at: item.createdAt ?? new Date().toISOString(),
      updated_at: null,
      cliente: clientId ? { id: clientId, nome: clientName } : null,
      dados_json: null,
      pdf_url: null,
    }, draftModalOpen);
  }, [activeDraft?.clientName, clients, draftModalOpen, fechamentos, openClosingPayments, reminderClientId]);

  const closePaymentDialog = useCallback(() => {
    setPaymentClosing(null);
    if (returnToDraftAfterPayment) {
      setReturnToDraftAfterPayment(false);
      setDraftModalOpen(true);
    }
  }, [returnToDraftAfterPayment]);

  const handleClosingPaymentChanged = useCallback(async () => {
    const [closingsRefresh, notesRefresh] = await Promise.allSettled([
      loadFechamentos(),
      refreshNotes(),
    ]);
    const clientId = paymentClosing?.cliente?.id ?? reminderClientId;
    if (clientId) await loadOpenClosings(clientId);
    if (
      closingsRefresh.status === 'rejected'
      || (closingsRefresh.status === 'fulfilled' && !closingsRefresh.value)
      || notesRefresh.status === 'rejected'
    ) {
      throw new Error('O pagamento foi salvo, mas a lista ainda não refletiu a atualização.');
    }
  }, [loadFechamentos, loadOpenClosings, paymentClosing?.cliente?.id, refreshNotes, reminderClientId]);
  const modalPreviewDados = useMemo(
    () => {
      if (generatedPreviewFechamento) {
        return normalizeFechamentoDadosJson(generatedPreviewFechamento.dados_json);
      }
      return activeDraft ? buildDadosFromDraft({
        ...activeDraft,
        notes: safePreviewNotes,
        includedNoteIds,
        discounts: descontos,
      }) : null;
    },
    [activeDraft, generatedPreviewFechamento, safePreviewNotes, includedNoteIds, descontos],
  );
  modalPreviewDadosRef.current = modalPreviewDados;
  const modalPreviewTitle = storedPdfPreviewTitle ?? 'Prévia do fechamento';
  const modalPreviewDescription = 'Prévia real do PDF em tamanho A4 — é exatamente o arquivo que será baixado.';

  // Resumo financeiro dos fechamentos gerados (interface, não altera o PDF).
  const resumoFechamentos = useMemo(() => {
    const faturado = fechamentos.reduce((sum, f) => sum + (f.valor_total ?? 0), 0);
    const recebido = fechamentos.reduce((sum, f) => sum + getClosingReceivedAmount(f), 0);
    return {
      total: fechamentos.length,
      faturado,
      recebido,
      aReceber: Math.max(0, faturado - recebido),
    };
  }, [fechamentos]);

  // Lista de fechamentos após busca/filtro/ordenação.
  const fechamentosFiltrados = useMemo(() => {
    const q = fechamentoBusca.trim().toLowerCase();
    const filtrados = fechamentos.filter((f) => {
      if (fechamentoStatus === 'pago' && f.status_pagamento !== 'PAGO') return false;
      if (fechamentoStatus === 'pendente' && f.status_pagamento === 'PAGO') return false;
      if (q && !`${f.cliente?.nome ?? ''} ${f.periodo ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...filtrados].sort((a, b) => (
      fechamentoOrdem === 'valor'
        ? (b.valor_total ?? 0) - (a.valor_total ?? 0)
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
  }, [fechamentos, fechamentoBusca, fechamentoStatus, fechamentoOrdem]);

  useEffect(() => {
    if (!draftModalOpen || !activeDraftId) return;
    setDrafts((current) => current.map((draft) => (
      draft.id === activeDraftId
        ? {
            ...draft,
            notes: safePreviewNotes,
            includedNoteIds,
            discounts: descontos,
            updatedAt: new Date().toISOString(),
          }
        : draft
    )));
  }, [draftModalOpen, activeDraftId, safePreviewNotes, includedNoteIds, descontos]);

  const updatePreviewItem = useCallback((
    noteId: string,
    itemId: string,
    value: string,
  ) => {
    setPreviewNotes((current) => current.map((note) => {
      if (note.id !== noteId) return note;
      const itens = note.itens.map((item) => {
        if (item.id !== itemId) return item;
        const numeric = parseFloat(value.replace(',', '.'));
        const nextDiscount = Number.isFinite(numeric)
          ? clampPercent(Math.max(item.desconto_original, numeric))
          : item.desconto_original;
        const nextItem = { ...item, desconto_porcentagem: nextDiscount };
        return { ...nextItem, subtotal: recalcItemSubtotal(nextItem) };
      });
      // `note.total` é o valor original persistido da O.S. A edição do
      // fechamento altera apenas o subtotal líquido dos itens no snapshot.
      return { ...note, itens };
    }));
  }, []);

  const resetPreviewItemDiscount = useCallback((
    noteId: string,
    itemId: string,
  ) => {
    setPreviewNotes((current) => current.map((note) => {
      if (note.id !== noteId) return note;
      const itens = note.itens.map((item) => {
        if (item.id !== itemId) return item;
        const nextItem = { ...item, desconto_porcentagem: item.desconto_original };
        return { ...nextItem, subtotal: item.subtotal_original };
      });
      return { ...note, itens };
    }));
  }, []);

  const toggleNoteInClosing = useCallback((noteId: string, checked: boolean) => {
    setIncludedNoteIds((current) => {
      if (checked) return current.includes(noteId) ? current : [...current, noteId];
      return current.filter((id) => id !== noteId);
    });
  }, []);

  // Marca a O.S. do rascunho como já recebida: registra o recebimento na nota
  // (via DataContext) e reflete localmente para ela sair do total do fechamento.
  const confirmMarcarNotaPaga = useCallback(async () => {
    if (!payNota) return;
    const paidAt = new Date(`${payNotaData}T12:00:00`).toISOString();
    setPayNotaBusy(true);
    try {
      await registrarRecebimentoNota(payNota.id, { paidWith: payNotaForma, paidAt });
      setPreviewNotes((current) => current.map((note) => (
        note.id === payNota.id
          ? {
              ...note,
              paymentStatus: 'PAGO',
              valorRecebido: note.total,
              pagoEm: paidAt,
            }
          : note
      )));
      setIncludedNoteIds((current) => current.filter((id) => id !== payNota.id));
      toast({ title: 'O.S. marcada como recebida', description: `${payNota.os} saiu do total do fechamento e ficou como já recebida.` });
      setPayNota(null);
    } catch (error) {
      if (error instanceof SupportScopeChangedAfterCommitError) {
        setPayNota(null);
        toast({
          title: 'Recebimento salvo; contexto alterado',
          description: error.message,
        });
        return;
      }
      toast({
        title: 'Não foi possível registrar o recebimento',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setPayNotaBusy(false);
    }
  }, [payNota, payNotaData, payNotaForma, registrarRecebimentoNota, toast]);

  // Desfaz o recebimento de uma O.S. dentro do rascunho (estorno) e a devolve ao total.
  const desfazerNotaPaga = useCallback(async (note: PreviewNote) => {
    try {
      await estornarRecebimentoNota(note.id, 'Correção no rascunho do fechamento');
      setPreviewNotes((current) => current.map((n) => (
        n.id === note.id
          ? { ...n, paymentStatus: 'PENDENTE', valorRecebido: 0, pagoEm: null }
          : n
      )));
      setIncludedNoteIds((current) => (current.includes(note.id) ? current : [...current, note.id]));
      toast({ title: 'Recebimento desfeito', description: `${note.os} voltou para o total do fechamento.` });
    } catch (error) {
      if (error instanceof SupportScopeChangedAfterCommitError) {
        toast({
          title: 'Estorno salvo; contexto alterado',
          description: error.message,
        });
        return;
      }
      toast({
        title: 'Não foi possível estornar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }, [estornarRecebimentoNota, toast]);

  /* ── Gerar fechamento ── */
  const generateDraft = useCallback(async (draft: ClosingDraft) => {
    setGenerating(true);
    try {
      const operationScope = captureActiveSupportScope();
      if (supportContextInvalid || (isSupportImpersonating && !operationScope)) {
        throw new Error('A sessão de suporte ainda não foi validada. Aguarde a confirmação do contexto e tente novamente.');
      }
      if (
        operationScope
        && (
          !supportContextActive
          || !supportDocumentSettingsReady
          || templateSettings?.fkUsuarios !== operationScope.targetUserId
          || documentSettings?.fkUsuarios !== operationScope.targetUserId
        )
      ) {
        throw new Error('A configuração real do documento da empresa atendida ainda não foi confirmada. Aguarde o carregamento e tente novamente.');
      }
      if (!scopedClientIdSet.has(draft.clientId)) {
        toast({
          title: 'Fechamento bloqueado',
          description: 'Este rascunho não pertence à conta atual.',
          variant: 'destructive',
        });
        return;
      }
      if (getIncludedDraftNotes(draft).length === 0) {
        toast({ title: 'Selecione pelo menos uma O.S.', description: 'Marque as O.S. que devem entrar neste fechamento.', variant: 'destructive' });
        return;
      }
      const mesNum = parseInt(draft.month);
      const periodLabel = draft.periodLabel;
      const totals = computeDraftTotals(draft);
      if (totals.totalComDesconto <= 0) {
        toast({
          title: 'O fechamento precisa ter valor positivo',
          description: 'Revise os descontos e as O.S. selecionadas antes de gerar.',
          variant: 'destructive',
        });
        return;
      }
      const payment = calculateInitialClosingPayment(
        moneyToCents(totals.totalComDesconto),
        buildInitialPaymentPlan(draft),
      );
      const hasInitialPayment = draft.initialPayment.mode !== 'NONE';
      if (hasInitialPayment && !payment.valid) {
        toast({
          title: 'Valor da entrada inválido',
          description: 'A primeira parcela deve ser maior que zero e não pode ultrapassar o fechamento.',
          variant: 'destructive',
        });
        return;
      }
      const paymentAccountReady = scopedFinanceAccounts.some((account) => (
        account.ativa && account.id === draft.initialPayment.accountId
      ));
      if (hasInitialPayment && (!paymentAccountReady || !isValidLocalDate(draft.initialPayment.date))) {
        toast({
          title: 'Complete os dados da entrada',
          description: 'Selecione uma conta financeira ativa e uma data válida para o recebimento.',
          variant: 'destructive',
        });
        return;
      }
      const proof = draft.id === activeDraftId ? initialPaymentProof : null;
      if (proof) validatePaymentProof(proof);

      const geradoEm = draft.generationStartedAt ?? new Date().toISOString();
      if (!draft.generationStartedAt) {
        const persistedDraft = { ...draft, generationStartedAt: geradoEm };
        const nextDrafts = drafts.map((item) => item.id === draft.id ? persistedDraft : item);
        setDrafts(nextDrafts);
        if (draftsStorageKey && draftsHydratedKey === draftsStorageKey) {
          try {
            window.localStorage.setItem(draftsStorageKey, JSON.stringify(nextDrafts));
          } catch {
            // O fluxo continua; o backend ainda protege o retry pela chave estável.
          }
        }
      }

      // Não deriva da chave livre do rascunho: ela pode ter até 200 caracteres,
      // enquanto a RPC também limita a chave da parcela a 200.
      const initialPaymentIdempotencyKey = `parcela-inicial:${draft.closingId}`;
      const initialPaymentData: FechamentoRecebimentoInicial | null = hasInitialPayment ? {
        valor: centsToMoney(payment.amountCents),
        data_efetiva: `${draft.initialPayment.date}T12:00:00-03:00`,
        conta_id: draft.initialPayment.accountId,
        forma_pagamento: draft.initialPayment.method,
        observacoes: draft.initialPayment.observations.trim() || null,
        chave_idempotencia: initialPaymentIdempotencyKey,
      } : null;
      const dados: FechamentoDadosJson & { competencia: NonNullable<FechamentoDadosJson['competencia']> } = {
        ...buildDadosFromDraft(draft),
        gerado_em: geradoEm,
        recebimento_inicial: initialPaymentData,
      };
      const plannedSummary: ClosingFinancialSummary = {
        total: totals.totalComDesconto,
        received: centsToMoney(payment.amountCents),
        open: centsToMoney(payment.balanceCents),
        status: payment.balanceCents === 0 && payment.amountCents > 0
          ? 'PAGO'
          : payment.amountCents > 0 ? 'PARCIAL' : 'PENDENTE',
      };

      // Renderizar antes da transação evita gravar um fechamento cujo snapshot não
      // consegue produzir documento. Storage continua pós-commit por não participar
      // da transação Postgres.
      const warnings: string[] = [];
      const preflightPdfBlob = await renderClosingPdfBlob(dados, geradoEm, plannedSummary);
      assertActiveSupportScopeUnchanged(operationScope);
      const finalizeInput = {
        id: draft.closingId,
        clienteId: draft.clientId,
        mes: MONTHS[mesNum - 1],
        ano: parseInt(draft.year),
        periodo: periodLabel,
        label: `Fechamento ${periodLabel} — ${draft.clientName}`,
        valorTotal: totals.totalComDesconto,
        dadosJson: dados,
        idempotencyKey: draft.generationKey,
        customization: documentSettings,
        pagamentoInicial: initialPaymentData ? {
          valor: initialPaymentData.valor,
          dataEfetiva: initialPaymentData.data_efetiva,
          contaId: initialPaymentData.conta_id,
          formaPagamento: initialPaymentData.forma_pagamento,
          observacoes: initialPaymentData.observacoes,
          idempotencyKey: initialPaymentData.chave_idempotencia,
        } : null,
      };

      // Erros de negócio e de transporte chegam hoje pelo mesmo contrato.
      // Não repetimos automaticamente: o rascunho e a chave estável permitem
      // uma nova tentativa manual idempotente sem correr o risco de trocar o
      // tenant entre chamadas.
      const result: FinalizarFechamentoResult = await finalizarFechamento(finalizeInput);

      const stopPostCommitIfScopeChanged = () => {
        let changed = result.supportScopeChangedAfterCommit === true;
        if (!changed) {
          try {
            assertActiveSupportScopeUnchanged(operationScope);
          } catch {
            changed = true;
          }
        }
        if (!changed) return false;

        closeDraftModal();
        toast({
          title: 'Fechamento gravado; contexto alterado',
          description: 'O servidor confirmou a criação, mas a sessão de suporte mudou durante a resposta. Reabra a empresa correta para atualizar a lista.',
        });
        return true;
      };

      if (stopPostCommitIfScopeChanged()) {
        return;
      }

      const committedSummary: ClosingFinancialSummary = {
        total: totals.totalComDesconto,
        received: result.valorRecebido,
        open: result.valorAberto,
        status: result.status,
      };
      try {
        const pdfBlob = Math.abs(result.valorRecebido - plannedSummary.received) <= 0.004
          && Math.abs(result.valorAberto - plannedSummary.open) <= 0.004
          && result.status === plannedSummary.status
          ? preflightPdfBlob
          : await renderClosingPdfBlob(dados, geradoEm, committedSummary);
        if (stopPostCommitIfScopeChanged()) return;
        const pdfUrl = await uploadFechamentoPDF(result.id, pdfBlob, {
          versionCents: moneyToCents(result.valorRecebido),
        });
        if (stopPostCommitIfScopeChanged()) return;
        await atualizarFechamentoPdf(result.id, pdfUrl, {
          expectedValorRecebido: result.valorRecebido,
        });
        if (stopPostCommitIfScopeChanged()) return;
      } catch {
        if (stopPostCommitIfScopeChanged()) return;
        warnings.push('O fechamento e o pagamento foram salvos, mas o PDF ficou pendente; ele será regenerado ao compartilhar.');
      }

      if (stopPostCommitIfScopeChanged()) return;
      if (proof && result.movimentoId) {
        try {
          const path = await uploadFinanceiroComprovante({ movimentoId: result.movimentoId, file: proof });
          if (stopPostCommitIfScopeChanged()) return;
          await insertFinanceiroAnexo({
            movimentoId: result.movimentoId,
            nomeArquivo: proof.name,
            caminho: path,
            mimeType: proof.type || null,
            tamanhoBytes: proof.size,
          });
          if (stopPostCommitIfScopeChanged()) return;
        } catch {
          if (stopPostCommitIfScopeChanged()) return;
          warnings.push('A parcela foi salva, mas o comprovante ficou pendente e pode ser anexado no histórico.');
        }
      }

      if (stopPostCommitIfScopeChanged()) return;
      try {
        await registrarAcaoFechamento({
          p_id_fechamentos: result.id,
          p_tipo: 'pdf_gerado',
          p_mensagem: `Fechamento finalizado. Total: R$ ${totals.totalComDesconto.toFixed(2)}; recebido: R$ ${result.valorRecebido.toFixed(2)}.`,
        });
      } catch {
        warnings.push('O fechamento foi salvo, mas o registro complementar de geração do PDF ficou pendente.');
      }
      if (stopPostCommitIfScopeChanged()) return;

      if (stopPostCommitIfScopeChanged()) return;
      setPreviewDados(dados);
      setInitialPaymentProof(null);
      removeDraft(draft.id);
      await loadFechamentos();
      if (stopPostCommitIfScopeChanged()) return;
      try {
        await refreshNotes();
      } catch {
        warnings.push('Os dados foram salvos, mas a lista de O.S. precisa ser atualizada novamente.');
      }
      if (stopPostCommitIfScopeChanged()) return;
      await loadOpenClosings(draft.clientId);
      if (stopPostCommitIfScopeChanged()) return;
      closeDraftModal();
      toast({
        title: result.status === 'PAGO' ? 'Fechamento gerado e quitado' : 'Fechamento gerado com sucesso',
        description: warnings.length > 0
          ? warnings.join(' ')
          : result.status === 'PARCIAL'
            ? `Entrada salva. Restam R$ ${toMoney(result.valorAberto)}.`
            : result.status === 'PAGO'
              ? 'O pagamento integral foi registrado e as O.S. foram marcadas como pagas.'
              : 'O fechamento foi salvo sem recebimento inicial.',
      });
    } catch (err) {
      const description = err instanceof Error ? err.message : 'Tente novamente.';
      toast({ title: 'Erro ao gerar fechamento', description, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [activeDraftId, closeDraftModal, documentSettings, drafts, draftsHydratedKey, draftsStorageKey, initialPaymentProof, isSupportImpersonating, loadFechamentos, loadOpenClosings, refreshNotes, removeDraft, renderClosingPdfBlob, scopedClientIdSet, scopedFinanceAccounts, supportContextActive, supportContextInvalid, supportDocumentSettingsReady, templateSettings?.fkUsuarios, toast]);

  const handleGerar = useCallback(async () => {
    if (!activeDraft) return;
    const draftSnapshot: ClosingDraft = {
      ...activeDraft,
      notes: safePreviewNotes,
      includedNoteIds,
      discounts: descontos,
      updatedAt: new Date().toISOString(),
    };
    await generateDraft(draftSnapshot);
  }, [activeDraft, safePreviewNotes, includedNoteIds, descontos, generateDraft]);

  /* ── Download PDF (direto para o disco, sem abrir guias) ── */
  const handleDownload = useCallback(async (fechamento: FechamentoListItem) => {
    if (!supportDocumentSettingsReady) {
      toast({
        title: 'Documento da empresa ainda não confirmado',
        description: 'Aguarde o template real carregar antes de baixar o fechamento.',
        variant: 'destructive',
      });
      return;
    }
    const operationScope = captureActiveSupportScope();
    if (supportContextInvalid || (isSupportImpersonating && !operationScope)) {
      toast({
        title: 'Sessão de suporte ainda não validada',
        description: 'Aguarde a confirmação da empresa atendida antes de baixar o PDF.',
        variant: 'destructive',
      });
      return;
    }
    const auditDownload = async (closingId: string) => {
      try {
        await registrarAcaoFechamento({ p_id_fechamentos: closingId, p_tipo: 'baixado' });
      } catch (error) {
        if (operationScope) {
          throw new Error(
            `O PDF não foi baixado porque a auditoria do suporte falhou. ${error instanceof Error ? error.message : 'Tente novamente.'}`,
          );
        }
      }
      assertActiveSupportScopeUnchanged(operationScope);
    };

    setDownloadingId(fechamento.id_fechamentos);
    try {
      assertActiveSupportScopeUnchanged(operationScope);
      const rendered = await renderStableGeneratedClosing(fechamento);
      assertActiveSupportScopeUnchanged(operationScope);
      let { fresh } = rendered;
      const filename = ['Fechamento', fresh.cliente?.nome, fresh.periodo]
        .filter(Boolean)
        .join(' ');
      // Preferimos re-renderizar do snapshot imutável (dados_json): assim o arquivo
      // baixado usa SEMPRE o template atual (ex.: "Total:") e bate 1:1 com o preview,
      // sem depender do PDF antigo salvo no Storage. pdf_url fica só como fallback.
      if (rendered.dados && rendered.blob) {
        await auditDownload(fresh.id_fechamentos);
        downloadPdfBlob(rendered.blob, filename);
      } else if (fresh.pdf_url && getClosingReceivedAmount(fresh) <= 0.004) {
        const url = await getFechamentoPDFSignedUrl(fresh.pdf_url, {
          fechamentoId: fresh.id_fechamentos,
          downloadFilename: filename,
        });
        assertActiveSupportScopeUnchanged(operationScope);
        const verified = await loadFreshClosing(fresh);
        assertActiveSupportScopeUnchanged(operationScope);
        if (!hasSameClosingFinancialState(fresh, verified)) {
          throw new Error('O saldo mudou enquanto o PDF era preparado. Tente novamente.');
        }
        fresh = verified;
        await auditDownload(fresh.id_fechamentos);
        downloadPdfUrl(url, filename);
      } else if (fresh.pdf_url) {
        throw new Error(
          'Este fechamento legado não possui snapshot para atualizar o PDF após um recebimento.',
        );
      } else {
        toast({ title: 'PDF não disponível', variant: 'destructive' });
        return;
      }
    } catch (err) {
      toast({
        title: 'Erro ao baixar PDF',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  }, [isSupportImpersonating, loadFreshClosing, renderStableGeneratedClosing, supportContextInvalid, supportDocumentSettingsReady, toast]);

  const ensureClosingPdf = useCallback(async (fechamento: FechamentoListItem) => {
    const operationScope = captureActiveSupportScope();
    assertActiveSupportScopeUnchanged(operationScope);
    const dados = normalizeFechamentoDadosJson(fechamento.dados_json);
    if (!dados) {
      if (fechamento.pdf_url && getClosingReceivedAmount(fechamento) <= 0.004) {
        return fechamento.pdf_url;
      }
      if (fechamento.pdf_url) {
        throw new Error(
          'Este fechamento legado não possui snapshot para atualizar o PDF após um recebimento.',
        );
      }
      throw new Error('Este fechamento não possui snapshot para regenerar o PDF.');
    }
    const blob = await renderClosingPdfBlob(
      dados,
      dados.gerado_em ?? fechamento.created_at,
      toClosingFinancialSummary(fechamento),
    );
    assertActiveSupportScopeUnchanged(operationScope);
    const received = getClosingReceivedAmount(fechamento);
    const path = await uploadFechamentoPDF(fechamento.id_fechamentos, blob, {
      versionCents: moneyToCents(received),
    });
    assertActiveSupportScopeUnchanged(operationScope);
    await atualizarFechamentoPdf(fechamento.id_fechamentos, path, {
      expectedValorRecebido: received,
    });
    assertActiveSupportScopeUnchanged(operationScope);
    setFechamentos((current) => current.map((item) => (
      item.id_fechamentos === fechamento.id_fechamentos ? { ...item, pdf_url: path } : item
    )));
    return path;
  }, [renderClosingPdfBlob]);

  /* ── Compartilhar no WhatsApp (link do PDF assinado, validade estendida) ── */
  const handleShareWhatsApp = useCallback(async (fechamento: FechamentoListItem) => {
    if (!supportDocumentSettingsReady) {
      toast({
        title: 'Documento da empresa ainda não confirmado',
        description: 'Aguarde o template real carregar antes de preparar o WhatsApp.',
        variant: 'destructive',
      });
      return;
    }
    const operationScope = captureActiveSupportScope();
    if (supportContextInvalid || (isSupportImpersonating && !operationScope)) {
      toast({
        title: 'Sessão de suporte ainda não validada',
        description: 'Aguarde a confirmação da empresa atendida antes de preparar o WhatsApp.',
        variant: 'destructive',
      });
      return;
    }
    const pendingWindow = window.open('about:blank', '_blank');
    if (!pendingWindow) {
      toast({
        title: 'Pop-up bloqueado',
        description: 'Permita pop-ups para abrir o WhatsApp no tablet ou navegador.',
        variant: 'destructive',
      });
      return;
    }
    pendingWindow.opener = null;
    setSharingId(fechamento.id_fechamentos);
    try {
      assertActiveSupportScopeUnchanged(operationScope);
      // Render, vínculo e assinatura podem demorar. A cada tentativa a RPC só
      // vincula o PDF se o recebido ainda for o exibido e uma leitura posterior
      // confirma que PDF, mensagem e saldo pertencem ao mesmo snapshot.
      let freshClosing = await loadFreshClosing(fechamento);
      assertActiveSupportScopeUnchanged(operationScope);
      let url = '';
      let stable = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const pdfPath = await ensureClosingPdf(freshClosing);
          assertActiveSupportScopeUnchanged(operationScope);
          url = await getFechamentoPDFSignedUrl(pdfPath, {
            fechamentoId: freshClosing.id_fechamentos,
            expiresIn: 60 * 60 * 24 * 7,
          });
          assertActiveSupportScopeUnchanged(operationScope);
          const verifiedClosing = await loadFreshClosing(freshClosing);
          assertActiveSupportScopeUnchanged(operationScope);
          if (hasSameClosingFinancialState(freshClosing, verifiedClosing)) {
            freshClosing = verifiedClosing;
            stable = true;
            break;
          }
          freshClosing = verifiedClosing;
        } catch (error) {
          assertActiveSupportScopeUnchanged(operationScope);
          if (attempt === 2) throw error;
          freshClosing = await loadFreshClosing(freshClosing);
          assertActiveSupportScopeUnchanged(operationScope);
        }
      }
      if (!stable) {
        throw new Error('O saldo mudou enquanto o PDF era preparado. Tente compartilhar novamente.');
      }
      const clientId = freshClosing.cliente?.id;
      const cliente = clients.find((c) => c.id === clientId);
      let clientPhone = cliente?.phone ?? '';
      if (!clientPhone && clientId) {
        const details = await getClienteDetalhes(clientId);
        assertActiveSupportScopeUnchanged(operationScope);
        const contacts = Array.isArray(details.contatos) ? details.contatos : [];
        const phoneContact = contacts.find((contact) => {
          if (!contact || typeof contact !== 'object') return false;
          const type = String((contact as Record<string, unknown>).tipo ?? '').toLowerCase();
          return type.includes('telefone') || type.includes('celular') || type.includes('whatsapp');
        }) as Record<string, unknown> | undefined;
        clientPhone = typeof phoneContact?.valor === 'string' ? phoneContact.valor : '';
      }
      const digits = clientPhone.replace(/\D/g, '');
      const phone = digits ? (digits.length <= 11 ? `55${digits}` : digits) : '';
      const mensagem = `Olá! Segue o fechamento de ${freshClosing.periodo}`
        + `${freshClosing.cliente?.nome ? ` — ${freshClosing.cliente.nome}` : ''}.`
        + `\nTotal: R$ ${toMoney(freshClosing.valor_total)}.`
        + `\nRecebido: R$ ${toMoney(getClosingReceivedAmount(freshClosing))}.`
        + `\nSaldo: R$ ${toMoney(getClosingOpenAmount(freshClosing))}.`
        + `\n\nPDF (link válido por 7 dias): ${url}`;
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
      try {
        await registrarAcaoFechamento({
          p_id_fechamentos: freshClosing.id_fechamentos,
          p_tipo: 'compartilhado',
          p_mensagem: 'Link privado do fechamento preparado para abertura no WhatsApp.',
        });
      } catch (error) {
        // No suporte, a auditoria faz parte da autorização operacional. No
        // fluxo normal ela continua complementar e não pode bloquear o cliente.
        if (operationScope) {
          throw new Error(
            `O WhatsApp não foi aberto porque a auditoria do suporte falhou. ${error instanceof Error ? error.message : 'Tente novamente.'}`,
          );
        }
      }
      assertActiveSupportScopeUnchanged(operationScope);
      pendingWindow.location.href = waUrl;
      toast({
        title: 'WhatsApp aberto',
        description: 'O link do fechamento foi preparado e auditado. Confirme o envio no WhatsApp.',
      });
    } catch (err) {
      pendingWindow.close();
      toast({
        title: 'Erro ao gerar link do WhatsApp',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSharingId(null);
    }
  }, [clients, ensureClosingPdf, isSupportImpersonating, loadFreshClosing, supportContextInvalid, supportDocumentSettingsReady, toast]);

  const handlePrintPreview = useCallback(async () => {
    if (storedPdfPreviewUrl) {
      const previewWindow = createPdfPreviewWindow(storedPdfPreviewTitle ?? 'Fechamento');
      const opened = openPdfInBrowser(storedPdfPreviewUrl, {
        title: storedPdfPreviewTitle ?? 'Fechamento',
        previewWindow,
      });
      if (!opened) {
        toast({
          title: 'Pop-up bloqueado',
          description: 'Permita pop-ups para abrir o PDF em uma nova aba.',
          variant: 'destructive',
        });
      }
      return;
    }

    if (!modalPreviewDados) {
      toast({ title: 'Nenhum fechamento selecionado', variant: 'destructive' });
      return;
    }

    await openClosingPdfPreview(
      modalPreviewDados,
      `Fechamento ${modalPreviewDados.periodo}`,
      previewFinancialSummary,
    );
  }, [modalPreviewDados, openClosingPdfPreview, previewFinancialSummary, storedPdfPreviewTitle, storedPdfPreviewUrl, toast]);

  const years = useMemo(() => {
    const y = Number(defaultYear);
    return [...new Set([
      ...availablePeriods.map((period) => period.year),
      ...[y - 1, y, y + 1].map(String),
    ])].sort((a, b) => Number(b) - Number(a));
  }, [availablePeriods, defaultYear]);

  const monthOptionsForYear = useMemo(() => {
    const counts = new Map(
      availablePeriods
        .filter((period) => period.year === selYear)
        .map((period) => [period.month, period.noteCount]),
    );

    return MONTHS.map((label, index) => {
      const month = String(index + 1);
      return {
        key: `${selYear}-${month.padStart(2, '0')}`,
        month,
        year: selYear,
        label,
        noteCount: counts.get(month) ?? 0,
      };
    });
  }, [availablePeriods, selYear]);

  const activeClients = useMemo(() => clients.filter((c) => c.isActive).sort((a, b) => a.name.localeCompare(b.name)), [clients]);

  const closingNotesForSelectedPeriod = useMemo(
    () => (selectedPeriodRange
      ? availableClosingNotes.filter((note) => isInClosingDateRange(note, selectedPeriodRange.start, selectedPeriodRange.end))
      : []),
    [availableClosingNotes, selectedPeriodRange],
  );

  const clientsForSelectedPeriod = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of closingNotesForSelectedPeriod) {
      counts.set(note.clientId, (counts.get(note.clientId) ?? 0) + 1);
    }

    return activeClients
      .map((client) => ({ client, noteCount: counts.get(client.id) ?? 0 }))
      .filter((item) => item.noteCount > 0);
  }, [activeClients, closingNotesForSelectedPeriod]);

  const selectedPeriodTotalNotes = closingNotesForSelectedPeriod.length;
  const hasNoClientsForSelectedPeriod = Boolean(selectedPeriodRange && clientsForSelectedPeriod.length === 0);

  useEffect(() => {
    if (!selClientId) return;
    // Um rascunho salvo já foi validado contra o escopo em openDraft(). A
    // lista de O.S. do DataContext pode ainda estar hidratando no tablet; não
    // apague a seleção do modal durante essa janela.
    if (activeDraftId) return;
    if (clientsForSelectedPeriod.some(({ client }) => client.id === selClientId)) return;
    setSelClientId('');
    setActiveDraftId(null);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
  }, [activeDraftId, clientsForSelectedPeriod, selClientId]);

  const clearCurrentDraftSelection = useCallback(() => {
    setSelClientId('');
    setActiveDraftId(null);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
  }, []);

  const handleClientSelect = useCallback((clientId: string) => {
    setActiveDraftId(null);
    setSelClientId(clientId);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
  }, []);

  const handlePeriodModeSelect = useCallback((mode: MonthlyClosingDateMode) => {
    setPeriodMode(mode);
    if (mode === 'custom') {
      const start = parseDateInputValue(customStartDate);
      if (start) {
        setSelMonth(String(start.getMonth() + 1));
        setSelYear(String(start.getFullYear()));
      }
    }
    clearCurrentDraftSelection();
  }, [clearCurrentDraftSelection, customStartDate]);

  const handleCustomStartDateChange = useCallback((value: string) => {
    setCustomStartDate(value);
    const start = parseDateInputValue(value);
    if (start) {
      setSelMonth(String(start.getMonth() + 1));
      setSelYear(String(start.getFullYear()));
    }
    clearCurrentDraftSelection();
  }, [clearCurrentDraftSelection]);

  const handleCustomEndDateChange = useCallback((value: string) => {
    setCustomEndDate(value);
    clearCurrentDraftSelection();
  }, [clearCurrentDraftSelection]);

  const handleMonthSelect = useCallback((month: string) => {
    setSelMonth(month);
    clearCurrentDraftSelection();
  }, [clearCurrentDraftSelection]);

  const handleYearSelect = useCallback((year: string) => {
    setSelYear(year);
    clearCurrentDraftSelection();
  }, [clearCurrentDraftSelection]);

  return (
    <div className="space-y-5 overflow-x-hidden">
      {generating && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
          <DualSpinner />
          <p className="text-sm font-medium text-muted-foreground">Gerando fechamento e PDF...</p>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Fechamento Mensal</h1>
          <p className="text-muted-foreground text-sm">Crie rascunhos locais, revise em popup e só depois gere no banco.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadFechamentos} disabled={loadingList}>
            <RefreshCcw className={cn('w-4 h-4 mr-2', loadingList && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {supportDocumentSettingsError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Não foi possível carregar o documento da empresa atendida</p>
            <p className="mt-0.5 text-xs text-red-900/80">
              A visualização, o download e a criação permanecem bloqueados para evitar usar dados de outra empresa.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={retrySupportDocumentSettings}
            disabled={supportDocumentSettingsRefreshing}
            className="shrink-0 border-red-300 bg-white hover:bg-red-100"
          >
            <RefreshCcw className={cn('mr-2 h-4 w-4', supportDocumentSettingsRefreshing && 'animate-spin')} />
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-3 sm:p-4">
          <p className="text-sm font-medium">Novo rascunho de fechamento</p>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Agrupa as O.S. pela data de entrega informada no prazo. Quando ela não existe, usa a criação.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[220px_minmax(330px,440px)_minmax(240px,1fr)_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Período</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={periodMode === 'month' ? 'default' : 'ghost'}
                  className="h-9 px-2 text-xs"
                  onClick={() => handlePeriodModeSelect('month')}
                >
                  Mês inteiro
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={periodMode === 'custom' ? 'default' : 'ghost'}
                  className="h-9 px-2 text-xs"
                  onClick={() => handlePeriodModeSelect('custom')}
                >
                  Personalizado
                </Button>
              </div>
            </div>
            {periodMode === 'month' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Mês</label>
                  <Select value={selMonth} onValueChange={handleMonthSelect}>
                    <SelectTrigger className="w-full" aria-label="Selecionar mês do fechamento">
                      <SelectValue placeholder="Escolha o mês" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptionsForYear.map((period) => (
                        <SelectItem key={period.key} value={period.month}>
                          {period.noteCount > 0 ? `${period.label} (${period.noteCount})` : period.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Ano</label>
                  <Select value={selYear} onValueChange={handleYearSelect} disabled={years.length === 0}>
                    <SelectTrigger className="w-full" aria-label="Selecionar ano do fechamento"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-2 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Data inicial</label>
                    <DatePicker
                      value={customStartDate}
                      onChange={handleCustomStartDateChange}
                      placeholder="Data inicial"
                      ariaLabel="Selecionar data inicial do fechamento"
                      className="h-10 bg-background text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Data final</label>
                    <DatePicker
                      value={customEndDate}
                      onChange={handleCustomEndDateChange}
                      placeholder="Data final"
                      ariaLabel="Selecionar data final do fechamento"
                      className="h-10 bg-background text-xs sm:text-sm"
                    />
                  </div>
                </div>
                <div className="mt-2 rounded-xl border border-primary/15 bg-background/75 px-2.5 py-1.5 text-[11px] font-medium text-primary">
                  {selectedPeriodRange
                    ? `Fechamento de ${selectedPeriodRange.helperLabel}`
                    : 'Escolha a data inicial e a data final.'}
                </div>
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <label className="mb-1.5 block text-xs text-muted-foreground">Cliente</label>
              <Select value={selClientId} onValueChange={handleClientSelect} disabled={!selectedPeriodRange || clientsForSelectedPeriod.length === 0}>
                <SelectTrigger aria-label="Selecionar cliente do fechamento">
                  <SelectValue placeholder={hasNoClientsForSelectedPeriod ? 'Nenhum cliente no período' : 'Selecionar cliente'} />
                </SelectTrigger>
                <SelectContent>
                  {clientsForSelectedPeriod.map(({ client, noteCount }) => (
                    <SelectItem key={client.id} value={client.id}>{client.name} ({noteCount})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleBuildPreview} disabled={loadingPreview || !selClientId || !selectedPeriodRange} className="w-full lg:min-w-[180px]">
              {loadingPreview ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
              Gerar rascunho
            </Button>
          </div>
          {selClientId && !activeDraft ? (
            <div className="mt-3">
              <OpenClosingReminder
                data={openClosings}
                loading={loadingOpenClosings}
                error={openClosingsError}
                onOpen={openReminderPayment}
                onRetry={() => void loadOpenClosings(reminderClientId)}
              />
            </div>
          ) : null}
          {periodMode === 'custom' && !selectedPeriodRange && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Escolha uma data inicial e uma data final válidas. A data inicial não pode ser maior que a final.
            </div>
          )}
          {hasNoClientsForSelectedPeriod && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Nenhum cliente tem O.S. faturável e sem fechamento no período {selectedPeriodRange?.helperLabel ?? 'selecionado'}.
            </div>
          )}
          {selectedPeriodRange && clientsForSelectedPeriod.length > 0 && !selClientId && (
            <p className="mt-2 text-xs text-muted-foreground">
              Escolha o cliente para fechar {selectedPeriodRange.helperLabel}. Foram encontradas {selectedPeriodTotalNotes} O.S. faturáveis em {clientsForSelectedPeriod.length} cliente{clientsForSelectedPeriod.length === 1 ? '' : 's'}.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Rascunhos salvos</h2>
            <p className="text-sm text-muted-foreground">Eles ficam aqui embaixo para você sair e voltar quando quiser.</p>
          </div>
          <Badge variant="secondary">{drafts.length}</Badge>
        </div>

        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-muted-foreground text-sm">
            Nenhum rascunho salvo ainda.
          </div>
        ) : (
          <div className="grid gap-3">
            {drafts.map((draft, idx) => {
              const palette = PALETTE[idx % PALETTE.length];
              const totals = computeDraftTotals(draft);
              const draftPayment = calculateInitialClosingPayment(
                moneyToCents(totals.totalComDesconto),
                buildInitialPaymentPlan(draft),
              );
              const draftClientName = asString(draft.clientName, 'Cliente');
              const draftNotes = getDraftNotes(draft);
              const initials = draftClientName.slice(0, 2).toUpperCase();
              return (
                <Card key={draft.id} className={cn('border-l-4 overflow-hidden', palette.border)}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-10 sm:w-10', palette.avatar)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{draftClientName}</p>
                          <Badge variant="secondary" className="text-xs">{draft.periodLabel}</Badge>
                          <Badge variant="outline" className="text-xs">Rascunho</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {draftNotes.length} OS · Total atual:
                          <span className="font-semibold text-foreground ml-1"><FinancialValue>R$ {toMoney(totals.totalComDesconto)}</FinancialValue></span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Salvo em {new Date(draft.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {draftPayment.amountCents > 0 ? (
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            Ao gerar: receber <FinancialValue>R$ {toMoney(centsToMoney(draftPayment.amountCents))}</FinancialValue>
                            {' '}· restará <FinancialValue>R$ {toMoney(centsToMoney(draftPayment.balanceCents))}</FinancialValue>
                          </p>
                        ) : null}
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
                        <Button size="sm" variant="outline" onClick={() => openDraft(draft)} className="justify-center">
                          <PencilLine className="w-3.5 h-3.5 mr-1.5" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openDraftPreview(draft)} disabled={!supportDocumentSettingsReady} className="justify-center">
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                        </Button>
                        <Button size="sm" onClick={() => void generateDraft(draft)} disabled={generating || !supportDocumentSettingsReady} className="col-span-2 justify-center sm:col-span-1">
                          <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Gerar fechamento
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeDraft(draft.id)} className="col-span-2 justify-center text-muted-foreground sm:col-span-1">
                          <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Remover
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Fechamentos gerados</h2>
            <p className="text-sm text-muted-foreground">Aqui ficam os registros já gravados no banco.</p>
          </div>
        </div>

        {!loadingList && fechamentos.length > 0 && (
          <>
            {/* Resumo financeiro (interface) */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border bg-background p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fechamentos</p>
                <p className="mt-0.5 text-lg font-bold">{resumoFechamentos.total}</p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Faturado</p>
                <p className="mt-0.5 text-lg font-bold"><FinancialValue>R$ {toMoney(resumoFechamentos.faturado)}</FinancialValue></p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recebido</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-700"><FinancialValue>R$ {toMoney(resumoFechamentos.recebido)}</FinancialValue></p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A receber</p>
                <p className="mt-0.5 text-lg font-bold text-amber-700"><FinancialValue>R$ {toMoney(resumoFechamentos.aReceber)}</FinancialValue></p>
              </div>
            </div>

            {/* Busca / filtro / ordenação */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={fechamentoBusca}
                onChange={(e) => setFechamentoBusca(e.target.value)}
                placeholder="Buscar por cliente ou período…"
                className="h-9 sm:max-w-xs"
                aria-label="Buscar fechamento"
              />
              <div className="flex gap-2">
                <Select value={fechamentoStatus} onValueChange={(v) => setFechamentoStatus(v as typeof fechamentoStatus)}>
                  <SelectTrigger className="h-9 w-[150px]" aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">A receber</SelectItem>
                    <SelectItem value="pago">Pagos</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={fechamentoOrdem} onValueChange={(v) => setFechamentoOrdem(v as typeof fechamentoOrdem)}>
                  <SelectTrigger className="h-9 w-[160px]" aria-label="Ordenar"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recentes">Mais recentes</SelectItem>
                    <SelectItem value="valor">Maior valor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {loadingList ? (
          <div className="flex justify-center py-12"><DualSpinner /></div>
        ) : fechamentos.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
            Nenhum fechamento gerado ainda.
          </div>
        ) : fechamentosFiltrados.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
            Nenhum fechamento encontrado para o filtro.
          </div>
        ) : (
          <div className="grid gap-3">
            {fechamentosFiltrados.map((f, idx) => {
              const palette = PALETTE[idx % PALETTE.length];
              const initials = (f.cliente?.nome ?? 'SEM CLIENTE').slice(0, 2).toUpperCase();
              const isPago = f.status_pagamento === 'PAGO';
              const valorRecebido = getClosingReceivedAmount(f);
              const valorEmAberto = getClosingOpenAmount(f);
              const isParcial = !isPago && valorRecebido > 0;
              // Consulta visual dos descontos aplicados por O.S. (a partir do snapshot imutável).
              const notasFechamento = Array.isArray(f.dados_json?.notas) ? f.dados_json.notas : [];
              const notasComDesconto = notasFechamento.filter((n) => (n.total_original - n.total_com_desconto) > 0.005);
              const descontoTotal = notasComDesconto.reduce((sum, n) => sum + (n.total_original - n.total_com_desconto), 0);
              const descontosVisiveis = descontosAbertos === f.id_fechamentos;
              return (
                <Card
                  key={f.id_fechamentos}
                  className={cn(
                    'border-l-4 overflow-hidden transition-colors',
                    palette.border,
                    isPago && 'bg-slate-100/80 saturate-[.6]',
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0', palette.avatar)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{f.cliente?.nome ?? '—'}</p>
                          <Badge variant="secondary" className="text-xs">{f.periodo}</Badge>
                          <Badge className={cn(
                            'text-xs gap-1',
                            isPago
                              ? 'bg-emerald-100 text-emerald-700'
                              : isParcial
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700',
                          )}>
                            {isPago ? <CheckCircle2 className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
                            {isPago ? 'Pago' : isParcial ? 'Parcial' : 'A receber'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {Array.isArray(f.dados_json?.notas) ? f.dados_json.notas.length : 0} OS · Total:
                          <span className="font-semibold text-foreground ml-1">
                            <FinancialValue>R$ {f.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</FinancialValue>
                          </span>
                          {f.total_downloads > 0 && ` · ${f.total_downloads} download${f.total_downloads > 1 ? 's' : ''}`}
                        </p>
                        {valorRecebido > 0 && (
                          <p className={cn('mt-0.5 text-xs', isPago ? 'text-emerald-700' : 'text-blue-700')}>
                            Recebido: <FinancialValue>R$ {toMoney(valorRecebido)}</FinancialValue>
                            {!isPago && <> · Em aberto: <FinancialValue>R$ {toMoney(valorEmAberto)}</FinancialValue></>}
                            {f.pago_em ? ` · ${formatDateBR(f.pago_em) ?? 'data não registrada'}` : ''}
                            {f.pago_com ? ` · ${PAYMENT_METHOD_LABELS[f.pago_com as PaymentMethod] ?? f.pago_com}` : ''}
                          </p>
                        )}
                        {descontoTotal > 0.005 && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => setDescontosAbertos((cur) => (cur === f.id_fechamentos ? null : f.id_fechamentos))}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              Desconto total: <FinancialValue>R$ {toMoney(descontoTotal)}</FinancialValue>
                              <span className="text-muted-foreground">· {descontosVisiveis ? 'ocultar' : `ver ${notasComDesconto.length} O.S.`}</span>
                            </button>
                            {descontosVisiveis && (
                              <div className="mt-2 space-y-1 rounded-lg border bg-muted/30 p-3">
                                {notasComDesconto.map((n) => (
                                  <div key={n.id} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="truncate text-muted-foreground">
                                      {n.os}{n.desconto_nota > 0 ? ` · ${pctBR(n.desconto_nota)}` : ''}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                      <span className="text-muted-foreground line-through"><FinancialValue>R$ {toMoney(n.total_original)}</FinancialValue></span>
                                      {' → '}
                                      <span className="font-semibold text-foreground"><FinancialValue>R$ {toMoney(n.total_com_desconto)}</FinancialValue></span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                          Criado em {formatDatabaseDateTimeBR(f.created_at) ?? 'data não registrada'}
                        </p>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Visualizar template do fechamento ${f.periodo}`}
                          onClick={() => void openGeneratedPreview(f)}
                          disabled={!supportDocumentSettingsReady}
                          className="flex-1 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 sm:flex-none"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(f)}
                          disabled={!supportDocumentSettingsReady || downloadingId === f.id_fechamentos}
                          className="flex-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 sm:flex-none"
                        >
                          {downloadingId === f.id_fechamentos
                            ? <RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5 mr-1.5" />} PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleShareWhatsApp(f)}
                          disabled={supportContextInvalid || !supportDocumentSettingsReady || sharingId === f.id_fechamentos}
                          title={supportContextInvalid
                            ? 'Aguarde a validação da sessão de suporte'
                            : !supportDocumentSettingsReady
                              ? 'Aguarde o documento real da empresa'
                              : 'Abrir no WhatsApp'}
                          className="flex-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 sm:flex-none"
                        >
                          {sharingId === f.id_fechamentos
                            ? <RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            : <MessageCircle className="w-3.5 h-3.5 mr-1.5" />} WhatsApp
                        </Button>
                        <Button
                          size="sm"
                          variant={isPago ? 'outline' : 'default'}
                          onClick={() => openClosingPayments(f)}
                          className={cn(
                            'col-span-2 justify-center sm:col-span-1 sm:flex-none',
                            !isPago && 'bg-emerald-600 text-white hover:bg-emerald-700',
                          )}
                        >
                          <Wallet className="w-3.5 h-3.5 mr-1.5" /> Pagamentos
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={draftModalOpen} onOpenChange={(open) => { if (!open) closeDraftModal(); else setDraftModalOpen(true); }}>
        <DialogContent className="h-[94dvh] max-h-[94dvh] w-[calc(100vw-1rem)] max-w-[min(1380px,calc(100vw-1rem))] gap-0 overflow-hidden p-0 [&>button]:right-3 [&>button]:top-3">
          <DialogTitle className="sr-only">Editar rascunho de fechamento</DialogTitle>
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b px-4 py-3 pr-12 sm:px-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Rascunho de fechamento</p>
                  <h3 className="text-xl font-semibold mt-1">{activeDraft?.clientName ?? 'Cliente'}</h3>
                  <p className="text-sm text-muted-foreground">{activeDraft?.periodLabel ?? '—'}</p>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Button variant="outline" onClick={openActiveDraftPreview} disabled={!modalPreviewDados || !supportDocumentSettingsReady}>
                    <Eye className="w-4 h-4 mr-2" /> Visualizar
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
              <div className="grid min-h-full gap-0 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="p-4 sm:p-5 space-y-4">
                {safePreviewNotes.map((nota) => {
                  const valorRecebidoNota = getPreviewNoteReceivedAmount(nota);
                  const saldoAbertoNota = getPreviewNoteOpenAmount(nota);
                  const totalComDesc = getPreviewNoteDiscountedOpenAmount(nota);
                  const editing = editingItems[nota.id] ?? true;
                  const isPaid = saldoAbertoNota <= 0;
                  const isPartial = !isPaid && valorRecebidoNota > 0;
                  const included = !isPaid && includedNoteIds.includes(nota.id);
                  const itens = getPreviewItems(nota);
                  const descontoItens = roundMoney(Math.max(0, saldoAbertoNota - totalComDesc));
                  return (
                    <Card
                      key={nota.id}
                      aria-disabled={isPaid}
                      className={cn(
                        'overflow-hidden border-border/70 transition',
                        !included && 'opacity-70',
                        isPaid && 'border-muted-foreground/20 bg-muted/60 opacity-60 grayscale-[0.2] shadow-none',
                      )}
                    >
                      <div className="bg-muted/40 border-b border-border/50 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <label className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background transition', isPaid ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary/50')}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={included}
                              disabled={isPaid}
                              onChange={(event) => toggleNoteInClosing(nota.id, event.target.checked)}
                              aria-label={`Incluir O.S. ${nota.os} no fechamento`}
                            />
                          </label>
                          <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{nota.os}</p>
                            {isPaid ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                                Já recebido{formatDateBR(nota.pagoEm) ? ` · ${formatDateBR(nota.pagoEm)}` : ''}
                              </Badge>
                            ) : (
                              <>
                                {isPartial && (
                                  <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                                    Parcial · R$ {toMoney(valorRecebidoNota)} recebido
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px]">Editável</Badge>
                                <Badge className={cn('text-[10px]', included ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                                  {included ? 'Entra no fechamento' : 'Fora deste fechamento'}
                                </Badge>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{nota.veiculo}{nota.placa ? ` · ${nota.placa}` : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isPaid ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                              onClick={() => desfazerNotaPaga(nota)}
                              disabled={supportContextInvalid}
                              title={supportContextInvalid ? 'Aguarde a validação da sessão de suporte' : undefined}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Desfazer
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                              onClick={() => { setPayNotaForma('PIX'); setPayNotaData(todayLocalISODate()); setPayNota(nota); }}
                              disabled={supportContextInvalid}
                              title={supportContextInvalid ? 'Aguarde a validação da sessão de suporte' : undefined}
                            >
                              <Wallet className="mr-1.5 h-3.5 w-3.5" /> {isPartial ? 'Quitar saldo' : 'Marcar paga'}
                            </Button>
                          )}
                          {!isPaid && (
                            <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingItems((prev) => ({ ...prev, [nota.id]: !editing }))}>
                              {editing ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <PencilLine className="mr-1.5 h-3.5 w-3.5" />}
                              {editing ? 'Recolher' : 'Descontos'}
                            </Button>
                          )}
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground">{isPartial ? 'Saldo a fechar' : 'Total O.S.'}</p>
                            <p className="font-bold text-primary text-sm"><FinancialValue>R$ {toMoney(totalComDesc)}</FinancialValue></p>
                            {isPartial && (
                              <p className="text-[10px] text-blue-700">
                                O.S. <FinancialValue>R$ {toMoney(nota.total)}</FinancialValue>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <CardContent className={cn('p-0', !included && 'pointer-events-none')}>
                        <div className="divide-y divide-border/30">
                          <div className="hidden grid-cols-[minmax(180px,1fr)_76px_104px_104px_112px] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                            <span>Descrição</span>
                            <span className="text-center">Qtd</span>
                            <span className="text-right">Unit.</span>
                            <span className="text-right">Desc. %</span>
                            <span className="text-right">Total item</span>
                          </div>
                          {itens.map((item) => {
                            const canApplyItemDiscount = canDiscountPreviewItem(item);
                            const brutoItem = Math.max(0, item.quantidade) * Math.max(0, item.preco_unitario);
                            const descontoItem = Math.max(0, brutoItem - item.subtotal);

                            return (
                              <div
                                key={item.id}
                                className="grid gap-3 px-4 py-3 text-xs lg:grid-cols-[minmax(180px,1fr)_76px_104px_104px_112px] lg:items-center"
                              >
                                <div className="min-w-0">
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Descrição</p>
                                  <span className="break-words">{item.descricao}</span>
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Qtd</p>
                                  <p className="lg:text-center">{item.quantidade}</p>
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Unit.</p>
                                  <p className="lg:text-right"><FinancialValue>R$ {toMoney(item.preco_unitario)}</FinancialValue></p>
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Desc. %</p>
                                  {editing ? (
                                    <div className="relative">
                                      <Input
                                        type="number"
                                        min={item.desconto_original}
                                        max="100"
                                        step="0.01"
                                        value={canApplyItemDiscount && item.desconto_porcentagem > 0 ? item.desconto_porcentagem : ''}
                                        disabled={!canApplyItemDiscount}
                                        onChange={(e) => updatePreviewItem(nota.id, item.id, e.target.value)}
                                        placeholder={canApplyItemDiscount ? '0' : '-'}
                                        className="h-8 pr-6 text-xs disabled:opacity-60 lg:text-right"
                                      />
                                      {canApplyItemDiscount && (
                                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="lg:text-right">{canApplyItemDiscount && item.desconto_porcentagem > 0 ? `${item.desconto_porcentagem}%` : '-'}</p>
                                  )}
                                  {canApplyItemDiscount && descontoItem > 0 ? (
                                    <p className="mt-1 text-[10px] font-medium text-emerald-700 lg:text-right"><FinancialValue>-R$ {toMoney(descontoItem)}</FinancialValue></p>
                                  ) : null}
                                  {editing && item.desconto_original > 0 ? (
                                    <p className="mt-1 text-[10px] text-muted-foreground lg:text-right">
                                      O.S.: {item.desconto_original}%
                                    </p>
                                  ) : null}
                                  {editing && item.desconto_porcentagem > item.desconto_original ? (
                                    <button
                                      type="button"
                                      className="mt-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline lg:ml-auto lg:block"
                                      onClick={() => resetPreviewItemDiscount(nota.id, item.id)}
                                    >
                                      Restaurar
                                    </button>
                                  ) : null}
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Total item</p>
                                  <p className="font-semibold lg:text-right"><FinancialValue>R$ {toMoney(item.subtotal)}</FinancialValue></p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-4 py-3 bg-muted/20 border-t border-border/30 flex items-center justify-between gap-4 flex-wrap">
                          <p className="text-xs text-muted-foreground">O desconto é aplicado somente nos itens escolhidos acima.</p>
                          <div className="text-right text-xs">
                            {descontoItens > 0 ? <p className="font-medium text-emerald-700">Desconto aplicado: <FinancialValue>-R$ {toMoney(descontoItens)}</FinancialValue></p> : null}
                            <p className="font-bold"><FinancialValue>R$ {toMoney(totalComDesc)}</FinancialValue></p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

                <div className="border-t bg-muted/20 p-4 sm:p-5 xl:border-l xl:border-t-0">
                  <div className="space-y-4 xl:sticky xl:top-4">
                    <div className="rounded-2xl border bg-background p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Total a pagar no fechamento</p>
                      <p className="mt-2 text-sm text-muted-foreground">{includedNotesCount} de {safePreviewNotes.length} O.S. marcadas · {activeDraft?.periodLabel ?? '—'}</p>
                      <p className="mt-1 text-3xl font-bold text-primary"><FinancialValue>R$ {toMoney(grandTotal)}</FinancialValue></p>
                      {grandTotalOriginal !== grandTotal && (
                        <div className="mt-2 space-y-0.5 text-xs">
                          <p className="text-muted-foreground">Bruto: <FinancialValue>R$ {toMoney(grandTotalOriginal)}</FinancialValue></p>
                          <p className="font-medium text-emerald-700">Desconto total: <FinancialValue>-R$ {toMoney(grandTotalOriginal - grandTotal)}</FinancialValue></p>
                        </div>
                      )}
                      {receivedNotes.length > 0 && (
                        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          Recebimentos anteriores: <span className="font-semibold"><FinancialValue>R$ {toMoney(receivedTotal)}</FinancialValue></span>
                          {' '}({receivedNotes.length} O.S. — somente os saldos abertos entram acima)
                        </div>
                      )}
                    </div>
                    <OpenClosingReminder
                      data={openClosings}
                      loading={loadingOpenClosings}
                      error={openClosingsError}
                      onOpen={openReminderPayment}
                      onRetry={() => void loadOpenClosings(reminderClientId)}
                    />
                    {supportContextActive ? (
                      <div
                        role="note"
                        className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 shadow-sm"
                      >
                        <p className="font-semibold">
                          {supportDocumentSettingsReady
                            ? 'Criação controlada em modo suporte'
                            : supportDocumentSettingsError
                              ? 'Falha ao carregar o documento da empresa atendida'
                              : 'Validando o documento da empresa atendida'}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-blue-900/80">
                          {supportDocumentSettingsReady
                            ? 'Fechamentos, entradas, parcelas, estornos, comprovantes, PDF e WhatsApp usam a empresa atendida e registram o Mega Master e a sessão de suporte.'
                            : supportDocumentSettingsError
                              ? 'Tente carregar novamente. A geração de documentos continua bloqueada para não usar dados de outra empresa.'
                              : 'A geração será liberada somente depois que o template real da empresa for confirmado pelo servidor.'}
                        </p>
                        {supportDocumentSettingsError ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-3 border-blue-300 bg-white"
                            onClick={retrySupportDocumentSettings}
                            disabled={supportDocumentSettingsRefreshing}
                          >
                            <RefreshCcw className={cn('mr-2 h-4 w-4', supportDocumentSettingsRefreshing && 'animate-spin')} />
                            Tentar novamente
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {activeDraft ? (
                      supportContextInvalid ? (
                        <div
                          role="note"
                          className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 shadow-sm"
                        >
                          <p className="font-semibold">Sessão de suporte ainda não validada</p>
                          <p className="mt-1 text-xs leading-relaxed text-blue-900/80">
                            A leitura e as ações permanecem bloqueadas até o operador, a empresa atendida e a sessão ativa voltarem a coincidir.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
                        <div>
                          <p className="text-sm font-semibold text-emerald-950">Recebimento ao gerar</p>
                          <p className="mt-0.5 text-xs text-emerald-900/70">
                            Opcional. A entrada e o fechamento serão gravados juntos; o saldo fica para a segunda parcela.
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ['NONE', 'Sem entrada'],
                            ['PERCENT_50', '50%'],
                            ['PERCENT_60', '60%'],
                            ['CUSTOM', 'Outro valor'],
                          ] as const).map(([mode, label]) => (
                            <Button
                              key={mode}
                              type="button"
                              size="sm"
                              variant={activeDraft.initialPayment.mode === mode ? 'default' : 'outline'}
                              onClick={() => selectInitialPaymentMode(mode)}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>

                        {activeDraft.initialPayment.mode !== 'NONE' ? (
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            {financeAccountsError ? (
                              <div
                                role="alert"
                                className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 sm:col-span-2 xl:col-span-1 2xl:col-span-2"
                              >
                                <span>Não foi possível carregar as contas financeiras. A entrada fica bloqueada até atualizar.</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-10 self-start border-amber-300 bg-white"
                                  disabled={loadingFinanceAccounts}
                                  onClick={() => void loadFinanceAccounts()}
                                >
                                  <RefreshCcw className={cn('mr-2 h-4 w-4', loadingFinanceAccounts && 'animate-spin')} />
                                  Tentar novamente
                                </Button>
                              </div>
                            ) : loadingFinanceAccounts && scopedFinanceAccounts.length === 0 ? (
                              <div
                                role="status"
                                className="rounded-xl border bg-background p-3 text-xs text-muted-foreground sm:col-span-2 xl:col-span-1 2xl:col-span-2"
                              >
                                Carregando contas financeiras…
                              </div>
                            ) : null}
                            {activeDraft.initialPayment.mode === 'CUSTOM' ? (
                              <div className="space-y-1.5 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                                <label className="text-xs font-medium text-muted-foreground">Valor da primeira parcela</label>
                                <Input
                                  type="number"
                                  min="0.01"
                                  max={grandTotal}
                                  step="0.01"
                                  value={centsToMoney(activeDraft.initialPayment.customAmountCents ?? 0) || ''}
                                  onChange={(event) => updateInitialPayment({ customAmountCents: moneyToCents(Number(event.target.value)) })}
                                  placeholder="0,00"
                                />
                              </div>
                            ) : null}
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground">Conta financeira</label>
                              <Select
                                value={activeDraft.initialPayment.accountId}
                                disabled={loadingFinanceAccounts || financeAccountsError}
                                onValueChange={(accountId) => updateInitialPayment({ accountId })}
                              >
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {scopedFinanceAccounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>{account.nome}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground">Forma</label>
                              <Select value={activeDraft.initialPayment.method} onValueChange={(method) => updateInitialPayment({ method: method as PaymentMethod })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
                                    <SelectItem key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground">Data</label>
                              <Input type="date" value={activeDraft.initialPayment.date} onChange={(event) => updateInitialPayment({ date: event.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground">Comprovante opcional</label>
                              <input
                                ref={initialPaymentProofInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                className="sr-only"
                                onChange={(event) => setInitialPaymentProof(event.target.files?.[0] ?? null)}
                              />
                              <Button type="button" variant="outline" className="w-full justify-start overflow-hidden" onClick={() => initialPaymentProofInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4 shrink-0" />
                                <span className="truncate">{initialPaymentProof?.name ?? 'Selecionar'}</span>
                              </Button>
                            </div>
                            <div className="space-y-1.5 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground">Observações</label>
                              <Textarea
                                value={activeDraft.initialPayment.observations}
                                onChange={(event) => updateInitialPayment({ observations: event.target.value })}
                                maxLength={1000}
                                rows={2}
                                placeholder="Ex.: cheque nº 1234"
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="grid grid-cols-3 gap-2 rounded-xl border bg-white p-3 text-xs">
                          <div><p className="text-muted-foreground">Total</p><p className="mt-1 font-semibold"><FinancialValue>R$ {toMoney(grandTotal)}</FinancialValue></p></div>
                          <div><p className="text-muted-foreground">Recebido</p><p className="mt-1 font-semibold text-emerald-700"><FinancialValue>R$ {toMoney(centsToMoney(initialPaymentCalculation.amountCents))}</FinancialValue></p></div>
                          <div><p className="text-muted-foreground">Restará</p><p className="mt-1 font-semibold text-amber-700"><FinancialValue>R$ {toMoney(centsToMoney(initialPaymentCalculation.balanceCents))}</FinancialValue></p></div>
                        </div>
                        {!initialPaymentReady ? (
                          <p className="text-xs font-medium text-rose-700">
                            Informe um valor válido, a data e a conta financeira para salvar a entrada.
                          </p>
                        ) : null}
                        </div>
                      )
                    ) : null}
                    <div className="rounded-2xl border bg-background p-4 shadow-sm space-y-2 text-sm text-muted-foreground">
                      <p>1. Este popup serve para edição e revisão das O.S.</p>
                      <p>2. O botão visualizar mostra o template final em outro popup.</p>
                      <p>3. Só o botão gerar fechamento grava no banco.</p>
                    </div>
                    <Button
                      onClick={handleGerar}
                      disabled={generating || !activeDraft || includedNotesCount === 0 || !initialPaymentReady || !supportDocumentSettingsReady}
                      className="h-12 w-full bg-destructive text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
                      size="lg"
                    >
                      <RefreshCcw className={cn('mr-2 h-4 w-4', generating && 'animate-spin')} />
                      {activeDraft?.initialPayment.mode === 'NONE'
                        ? 'Gerar sem entrada'
                        : `Gerar e receber R$ ${toMoney(centsToMoney(initialPaymentCalculation.amountCents))}`}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templatePreviewOpen} onOpenChange={(open) => { if (open) setTemplatePreviewOpen(true); else closeTemplatePreview(); }}>
        <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-[calc(100vw-1rem)] max-w-[min(1200px,calc(100vw-1rem))] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl [&>button]:right-3 [&>button]:top-3">
          <DialogTitle className="sr-only">Visualização do template do fechamento</DialogTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b px-4 py-3 pr-12 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Visualização</p>
                  <h3 className="mt-1 text-lg font-semibold">{modalPreviewTitle}</h3>
                  <p className="text-sm text-muted-foreground">
                    {modalPreviewDescription}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void handlePrintPreview()}
                  disabled={templatePreviewLoading || (!modalPreviewDados && !storedPdfPreviewUrl)}
                >
                  <Printer className="mr-2 h-4 w-4" /> Abrir PDF
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-muted/40">
              {templatePreviewLoading ? (
                <div className="flex h-full items-center justify-center">
                  <DualSpinner />
                </div>
              ) : storedPdfPreviewUrl ? (
                // PDF real (A4) — idêntico ao arquivo que será baixado.
                <iframe
                  title={storedPdfPreviewTitle ?? 'PDF do fechamento'}
                  src={storedPdfPreviewUrl}
                  className="h-full w-full border-0 bg-white"
                />
              ) : modalPreviewDados ? (
                // Fallback só se a renderização do PDF falhar.
                <div className="h-full min-h-0 overflow-y-auto overscroll-contain scroll-smooth px-0 scrollbar-thin">
                  <ClosingHtmlPreview
                    dados={modalPreviewDados}
                    accentColor={templateSettings?.corFechamento}
                    documentSettings={documentSettings}
                    financialSummary={previewFinancialSummary}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Nenhum rascunho selecionado.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ClosingPaymentDialog
        closing={paymentClosing}
        accounts={scopedFinanceAccounts}
        open={Boolean(paymentClosing)}
        readOnly={supportContextInvalid}
        canReverse={supportContextActive || user?.role === 'ADMIN'}
        onClose={closePaymentDialog}
        onChanged={handleClosingPaymentChanged}
      />

      {/* Marcar uma O.S. do rascunho como já recebida (sai do total do fechamento) */}
      <Dialog open={!!payNota} onOpenChange={(open) => { if (!open) setPayNota(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar O.S. como já paga</DialogTitle>
            <DialogDescription>
              {payNota?.os ?? ''}{payNota?.veiculo ? ` · ${payNota.veiculo}` : ''} — saldo de <FinancialValue>R$ {toMoney(payNota ? getPreviewNoteOpenAmount(payNota) : 0)}</FinancialValue>.
              O saldo sai do total deste fechamento e o valor integral recebido fica auditável no período.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Forma de pagamento</label>
              <Select value={payNotaForma} onValueChange={(v) => setPayNotaForma(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Data do recebimento</label>
              <Input type="date" value={payNotaData} onChange={(e) => setPayNotaData(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayNota(null)} disabled={payNotaBusy}>Cancelar</Button>
            <Button onClick={() => void confirmMarcarNotaPaga()} disabled={payNotaBusy} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {payNotaBusy ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Wallet className="w-4 h-4 mr-2" />}
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
