import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Wallet, CheckCircle2, RotateCcw,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDateBR } from '@/lib/dates';
import { ClosingHtmlPreview } from '@/components/closing/ClosingHtmlPreview';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPdfPreviewWindow, downloadPdfBlob, downloadPdfUrl, openPdfInBrowser } from '@/lib/printPdf';
import {
  getFechamentos,
  insertFechamento,
  updateFechamento,
  registrarAcaoFechamento,
  getNotaDetalhesParaFechamento,
  uploadFechamentoPDF,
  getFechamentoPDFSignedUrl,
  buildFechamentoDocumentSnapshotParams,
  marcarFechamentoPago,
  estornarFechamentoPago,
  normalizeFechamentoDadosJson,
  type FechamentoListItem,
  type FechamentoDadosJson,
  type FechamentoNota,
} from '@/api/supabase/fechamentos';
import { getNotasServico, mapStatusNome } from '@/api/supabase/notas';
import { useDocumentCustomization, useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import {
  filterFechamentosForClientScope,
  getMonthlyClosingDraftsStorageKey,
} from '@/services/domain/monthlyClosingIsolation';
import {
  getClosingCompetenceDate,
  getMonthlyClosingDateRange,
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
  getPreviewItems,
  recalcItemSubtotal,
  recalcNoteTotal,
  type ClosingDraft,
  type PreviewNote,
} from '@/services/domain/monthlyClosingDraft';
import { PAYMENT_METHOD_LABELS, type IntakeNote, type NotePaymentStatus, type PaymentMethod } from '@/types';
import { isBillableNoteStatus } from '@/services/domain/intakeNotes';
import { readStoredSupportContext } from '@/services/auth/supportContext';

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

interface AvailableClosingPeriod {
  key: string;
  month: string;
  year: string;
  label: string;
  noteCount: number;
}

const toMoney = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  return {
    id: asString(value.id, fallbackId),
    descricao: asString(value.descricao, 'Serviço realizado'),
    quantidade,
    preco_unitario: precoUnitario,
    desconto_porcentagem: descontoPorcentagem,
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
    paymentStatus: value.paymentStatus === 'PAGO' ? 'PAGO' : 'PENDENTE',
    pagoEm: typeof value.pagoEm === 'string' ? value.pagoEm : null,
    itens: itens.length > 0 ? itens : [{
      id: `${id}-fallback`,
      descricao: 'Serviços realizados',
      quantidade: 1,
      preco_unitario: total,
      desconto_porcentagem: 0,
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
    : notes.filter((note) => note.paymentStatus !== 'PAGO').map((note) => note.id);

  return {
    id,
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
    createdAt: asString(value.createdAt, new Date().toISOString()),
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
  };
};

const normalizeAvailablePeriods = (dates: string[]) => {
  const map = new Map<string, AvailableClosingPeriod>();
  for (const rawDate of dates) {
    const dt = new Date(rawDate);
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
  const dt = new Date(competenceDate);
  return dt >= start && dt <= end;
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
  const { notes, clients } = useData();
  const { operationalUser, user, isSupportImpersonating } = useAuth();
  const { toast } = useToast();
  const { data: templateSettings } = useDocumentTemplateSettings();
  const { data: documentSettings } = useDocumentCustomization('closing_report');

  const now = new Date();
  const defaultMonth = String(now.getMonth() + 1);
  const defaultYear = String(now.getFullYear());
  const defaultCustomStartDate = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultCustomEndDate = toDateInputValue(now);
  const [fechamentos, setFechamentos] = useState<FechamentoListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  // Pagamento do fechamento (B2B): marcar pago + cascata.
  const [payFechamento, setPayFechamento] = useState<FechamentoListItem | null>(null);
  const [payData, setPayData] = useState(() => new Date().toISOString().slice(0, 10));
  const [payForma, setPayForma] = useState<PaymentMethod>('PIX');
  const [payBusy, setPayBusy] = useState(false);
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

  // Generation
  const [generating, setGenerating] = useState(false);
  const [previewDados, setPreviewDados] = useState<FechamentoDadosJson | null>(null);

  const currentScopeUserId = IS_REAL_AUTH ? operationalUser?.id ?? null : 'development';
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
    setFechamentos([]);
    setActiveDraftId(null);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(false);
    setReturnToDraftAfterPreview(false);
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
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
  }, [currentScopeUserId, defaultCustomEndDate, defaultCustomStartDate, defaultMonth, defaultYear]);

  /* ── Load fechamentos ── */
  const loadFechamentos = useCallback(async () => {
    if (!IS_REAL_AUTH || !currentScopeUserId) {
      setFechamentos([]);
      return;
    }
    if (scopedClientIds.length === 0) {
      setFechamentos([]);
      return;
    }

    setLoadingList(true);
    try {
      const { dados } = await getFechamentos({ p_limite: 100 });
      setFechamentos(filterFechamentosForClientScope(dados, scopedClientIds));
    } catch {
      setFechamentos([]);
      toast({ title: 'Erro ao carregar fechamentos', variant: 'destructive' });
    } finally {
      setLoadingList(false);
    }
  }, [currentScopeUserId, scopedClientIds, toast]);

  useEffect(() => { void loadFechamentos(); }, [loadFechamentos]);

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
      return;
    }

    if (!scopedClientIdSet.has(safeDraft.clientId)) {
      toast({
        title: 'Rascunho fora do escopo atual',
        description: 'Este rascunho pertence a outra conta ou cliente e foi bloqueado nesta sessão.',
        variant: 'destructive',
      });
      return;
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
    setIncludedNoteIds(safeDraft.includedNoteIds ?? safeDraft.notes.filter((note) => note.paymentStatus !== 'PAGO').map((note) => note.id));
    setEditingItems({});
  }, [defaultCustomEndDate, defaultCustomStartDate, defaultMonth, defaultYear, scopedClientIdSet, toast]);

  const openDraft = useCallback((draft: ClosingDraft) => {
    loadDraftIntoEditor(draft);
    setDraftModalOpen(true);
  }, [loadDraftIntoEditor]);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
    [drafts, activeDraftId],
  );

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
    setTemplatePreviewOpen(false);
    setTemplatePreviewLoading(false);
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
    if (returnToDraftAfterPreview) {
      setReturnToDraftAfterPreview(false);
      setDraftModalOpen(true);
    }
  }, [returnToDraftAfterPreview]);

  const closeDraftModal = useCallback(() => {
    setDraftModalOpen(false);
    setTemplatePreviewOpen(false);
    setTemplatePreviewLoading(false);
    setReturnToDraftAfterPreview(false);
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
  }, []);

  const renderClosingPdfBlob = useCallback(async (dados: FechamentoDadosJson, geradoEm: string) => {
    const [{ pdf }, { ClosingPDFTemplate }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/components/closing/ClosingPDFTemplate'),
    ]);

    return pdf(
      <ClosingPDFTemplate
        dados={dados}
        geradoEm={geradoEm}
        accentColor={templateSettings?.corFechamento}
        documentSettings={documentSettings}
      />,
    ).toBlob();
  }, [documentSettings, templateSettings?.corFechamento]);

  const openClosingPdfPreview = useCallback(async (dados: FechamentoDadosJson, title: string) => {
    const previewWindow = createPdfPreviewWindow(title);
    setTemplatePreviewLoading(true);
    try {
      const blob = await renderClosingPdfBlob(dados, dados.gerado_em);
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
  ) => {
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(title);
    setReturnToDraftAfterPreview(returnToDraft);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(true);
    setTemplatePreviewLoading(true);
    try {
      const blob = await renderClosingPdfBlob(dados, dados.gerado_em);
      const url = URL.createObjectURL(blob);
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = url;
      setStoredPdfPreviewUrl(url);
    } catch {
      toast({ title: 'Erro ao gerar visualização', description: 'Não foi possível montar o PDF do fechamento.', variant: 'destructive' });
    } finally {
      setTemplatePreviewLoading(false);
    }
  }, [renderClosingPdfBlob, toast]);

  const openDraftPreview = useCallback((draft: ClosingDraft) => {
    loadDraftIntoEditor(draft);
    void showClosingPdfPreview(buildDadosFromDraft(draft), `Fechamento ${draft.periodLabel}`, false);
  }, [loadDraftIntoEditor, showClosingPdfPreview]);

  const openActiveDraftPreview = useCallback(() => {
    const dados = modalPreviewDadosRef.current;
    if (!dados) return;
    void showClosingPdfPreview(dados, `Fechamento ${dados.periodo}`, true);
  }, [showClosingPdfPreview]);

  const openGeneratedPreview = useCallback(async (fechamento: FechamentoListItem) => {
    if (fechamento.dados_json) {
      const dados = normalizeFechamentoDadosJson(fechamento.dados_json) ?? fechamento.dados_json;
      await showClosingPdfPreview(dados, `Fechamento ${fechamento.periodo}`, false);
      return;
    }

    if (fechamento.pdf_url) {
      setTemplatePreviewLoading(true);
      try {
        const url = await getFechamentoPDFSignedUrl(fechamento.pdf_url, {
          fechamentoId: fechamento.id_fechamentos,
        });
        setGeneratedPreviewFechamento(null);
        setStoredPdfPreviewUrl(url);
        setStoredPdfPreviewTitle(`Fechamento ${fechamento.periodo}`);
        setReturnToDraftAfterPreview(false);
        setDraftModalOpen(false);
        setTemplatePreviewOpen(true);
      } catch {
        toast({ title: 'Erro ao abrir visualização', description: 'Não foi possível gerar link seguro do PDF.', variant: 'destructive' });
      } finally {
        setTemplatePreviewLoading(false);
      }
      return;
    }

    toast({ title: 'Visualização indisponível', description: 'Este fechamento não possui template salvo nem PDF armazenado.', variant: 'destructive' });
  }, [toast, showClosingPdfPreview]);

  const removeDraft = useCallback((draftId: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== draftId));
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
      closeDraftModal();
    }
  }, [activeDraftId, closeDraftModal]);

  /* ── Build local draft ── */
  const handleBuildPreview = useCallback(async () => {
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
      const supportContextActive = Boolean(readStoredSupportContext());
      const notasFiltradas = IS_REAL_AUTH
        ? (await getNotasServico({
            p_fk_clientes: selClientId,
            p_limite: 1000,
            p_offset: 0,
            p_data_inicio: toDateInputValue(inicio),
            p_data_fim: toDateInputValue(fim),
            p_ordem_campo: 'date',
            p_ordem_direcao: 'asc',
            ...(supportContextActive ? {} : { p_apenas_sem_fechamento: true }),
          })).dados.filter((note) => {
            const closingId = note.fk_fechamentos ?? localClosingIdByNoteId.get(note.id_notas_servico);
            if (closingId) return false;
            if (!isBillableNoteStatus(mapStatusNome(note.status?.nome ?? ''))) return false;
            const dt = new Date(note.created_at);
            if (Number.isNaN(dt.getTime())) return false;
            return dt >= inicio && dt <= fim;
          }).map((note) => ({
            id: note.id_notas_servico,
            number: asString(note.os, 'O.S. sem número'),
            vehicleModel: asString(note.veiculo?.modelo, 'Veículo não informado'),
            plate: typeof note.veiculo?.placa === 'string' && note.veiculo.placa.trim() ? note.veiculo.placa : null,
            totalAmount: asNumber(note.total),
            updatedAt: asString(note.created_at, new Date().toISOString()),
            paymentStatus: (note.payment_status === 'PAGO' ? 'PAGO' : 'PENDENTE') as NotePaymentStatus,
            pagoEm: note.pago_em ?? null,
          }))
        : notes.filter((n) => {
            if (!isAvailableForClosing(n)) return false;
            if (n.clientId !== selClientId) return false;
            const dt = new Date(getClosingCompetenceDate(n));
            return dt >= inicio && dt <= fim;
          }).map((note) => ({
            id: note.id,
            number: note.number,
            vehicleModel: note.vehicleModel,
            plate: note.plate ?? '',
            totalAmount: note.totalAmount,
            updatedAt: getClosingCompetenceDate(note),
            paymentStatus: note.paymentStatus,
            pagoEm: note.paidAt ?? null,
          }));

      if (notasFiltradas.length === 0) {
        toast({ title: 'Nenhuma O.S. faturável criada neste período', variant: 'destructive' });
        return;
      }

      const resultado: PreviewNote[] = [];

      for (const nota of notasFiltradas) {
        const det = IS_REAL_AUTH ? await getNotaDetalhesParaFechamento(nota.id) : null;
        const itensServico = Array.isArray(det?.itens_servico) ? det.itens_servico : [];
        const fallbackItem = {
          id: `${nota.id}-fallback`,
          descricao: 'Serviços realizados',
          quantidade: 1,
          preco_unitario: nota.totalAmount,
          desconto_porcentagem: 0,
          subtotal: nota.totalAmount,
        };
        resultado.push({
          id: nota.id,
          os: nota.number,
          veiculo: nota.vehicleModel,
          placa: nota.plate ?? null,
          total: nota.totalAmount,
          updatedAt: nota.updatedAt,
          paymentStatus: nota.paymentStatus,
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
                  desconto_porcentagem: descontoPorcentagem,
                  subtotal: asNumber(i.subtotal_item, quantidade * precoUnitario * (1 - descontoPorcentagem / 100)),
                };
              })
            : [fallbackItem],
        });
      }

      setPreviewNotes(resultado);
      setDescontos({});
      setIncludedNoteIds(resultado.filter((note) => note.paymentStatus !== 'PAGO').map((note) => note.id));
      setEditingItems({});
      const draftClient = clients.find((entry) => entry.id === selClientId);
      const periodLabel = selectedPeriodRange.label;
      const timestamp = new Date().toISOString();
      const draft: ClosingDraft = {
        id: createDraftId(),
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
        includedNoteIds: resultado.filter((note) => note.paymentStatus !== 'PAGO').map((note) => note.id),
        discounts: {},
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
  }, [clients, customEndDate, customStartDate, notes, openDraft, periodMode, scopedClientIdSet, selClientId, selectedPeriodRange, toast]);

  const safePreviewNotes = useMemo(
    () => (Array.isArray(previewNotes) ? previewNotes : []),
    [previewNotes],
  );

  /* ── Computed totals ── */
  const totals = useMemo(() => {
    const included = new Set(includedNoteIds);
    return safePreviewNotes.filter((note) => included.has(note.id)).map((n) => {
      const disc = clampPercent(descontos[n.id] ?? 0);
      return { id: n.id, totalBruto: n.total, totalComDesconto: n.total * (1 - disc / 100) };
    });
  }, [safePreviewNotes, descontos, includedNoteIds]);

  const grandTotal = useMemo(() => totals.reduce((a, b) => a + b.totalComDesconto, 0), [totals]);
  const grandTotalOriginal = useMemo(() => totals.reduce((a, n) => a + n.totalBruto, 0), [totals]);
  // O.S. já recebidas no período (informativas, fora do total a pagar).
  const receivedNotes = useMemo(() => safePreviewNotes.filter((note) => note.paymentStatus === 'PAGO'), [safePreviewNotes]);
  const receivedTotal = useMemo(() => receivedNotes.reduce((sum, note) => sum + note.total, 0), [receivedNotes]);
  const includedNotesCount = totals.length;
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
    field: 'descricao' | 'quantidade' | 'preco_unitario' | 'desconto_porcentagem',
    value: string,
  ) => {
    setPreviewNotes((current) => current.map((note) => {
      if (note.id !== noteId) return note;
      const itens = note.itens.map((item) => {
        if (item.id !== itemId) return item;
        if (field === 'descricao') {
          return { ...item, descricao: value };
        }
        const numeric = parseFloat(value.replace(',', '.'));
        const safe = Number.isFinite(numeric) ? numeric : 0;
        const changedItem = {
          ...item,
          [field]: field === 'desconto_porcentagem' ? clampPercent(safe) : Math.max(0, safe),
        };
        const nextItem = canDiscountPreviewItem(changedItem)
          ? changedItem
          : { ...changedItem, desconto_porcentagem: 0 };
        return { ...nextItem, subtotal: recalcItemSubtotal(nextItem) };
      });
      return { ...note, itens, total: recalcNoteTotal(itens) };
    }));
  }, []);

  const toggleNoteInClosing = useCallback((noteId: string, checked: boolean) => {
    setIncludedNoteIds((current) => {
      if (checked) return current.includes(noteId) ? current : [...current, noteId];
      return current.filter((id) => id !== noteId);
    });
  }, []);

  /* ── Gerar fechamento ── */
  const generateDraft = useCallback(async (draft: ClosingDraft) => {
    setGenerating(true);
    try {
      if (isSupportImpersonating || readStoredSupportContext()) {
        toast({
          title: 'Geração bloqueada em modo suporte',
          description: 'Você pode revisar o rascunho em suporte, mas a gravação do fechamento precisa ser feita na sessão real da Retífica Premium.',
          variant: 'destructive',
        });
        return;
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
      const geradoEm = new Date().toISOString();
      const mesNum = parseInt(draft.month);
      const periodLabel = draft.periodLabel;
      const dados = buildDadosFromDraft(draft);
      const notasDados: FechamentoNota[] = dados.notas;
      const totals = computeDraftTotals(draft);
      const pdfBlob = await renderClosingPdfBlob({ ...dados, gerado_em: geradoEm }, geradoEm);

      // 1. Insert fechamento header
      const idFechamento = await insertFechamento({
        p_fk_clientes: draft.clientId,
        p_mes: MONTHS[mesNum - 1],
        p_ano: parseInt(draft.year),
        p_periodo: periodLabel,
        p_label: `Fechamento ${periodLabel} — ${draft.clientName}`,
        p_valor_total: totals.totalComDesconto,
      });

      // 2. Save snapshot
      const pdfUrl = await uploadFechamentoPDF(idFechamento, pdfBlob);
      if (!pdfUrl) {
        throw new Error('O fechamento foi montado, mas o PDF não conseguiu ser salvo no storage.');
      }

      // 3. Save immutable snapshot and link selected O.S. to this closing.
      await updateFechamento(idFechamento, {
        p_dados_json: {
          ...dados,
          gerado_em: geradoEm,
          notas: notasDados,
        },
        p_pdf_url: pdfUrl,
        ...buildFechamentoDocumentSnapshotParams(documentSettings),
      });

      // 4. Audit action
      try {
        await registrarAcaoFechamento({
          p_id_fechamentos: idFechamento,
          p_tipo: 'pdf_gerado',
          p_mensagem: `PDF gerado. Total: R$ ${totals.totalComDesconto.toFixed(2)}`,
        });
      } catch { /* non-blocking */ }

      toast({ title: 'Fechamento gerado com sucesso!', description: 'PDF salvo no Supabase Storage.' });
      setPreviewDados({ ...dados, gerado_em: geradoEm });
      removeDraft(draft.id);
      await loadFechamentos();
      closeDraftModal();
    } catch (err) {
      const description = err instanceof Error ? err.message : 'Tente novamente.';
      toast({ title: 'Erro ao gerar fechamento', description, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [isSupportImpersonating, scopedClientIdSet, toast, renderClosingPdfBlob, loadFechamentos, removeDraft, closeDraftModal, documentSettings]);

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
    const filename = ['Fechamento', fechamento.cliente?.nome, fechamento.periodo]
      .filter(Boolean)
      .join(' ');
    setDownloadingId(fechamento.id_fechamentos);
    try {
      if (fechamento.pdf_url) {
        const url = await getFechamentoPDFSignedUrl(fechamento.pdf_url, {
          fechamentoId: fechamento.id_fechamentos,
          downloadFilename: filename,
        });
        downloadPdfUrl(url, filename);
      } else if (fechamento.dados_json) {
        const blob = await renderClosingPdfBlob(fechamento.dados_json, fechamento.created_at);
        downloadPdfBlob(blob, filename);
      } else {
        toast({ title: 'PDF não disponível', variant: 'destructive' });
        return;
      }
      await registrarAcaoFechamento({ p_id_fechamentos: fechamento.id_fechamentos, p_tipo: 'baixado' }).catch(() => {});
    } catch (err) {
      toast({
        title: 'Erro ao baixar PDF',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  }, [renderClosingPdfBlob, toast]);

  const handleMarcarPago = useCallback(async () => {
    if (!payFechamento) return;
    setPayBusy(true);
    try {
      await marcarFechamentoPago(payFechamento.id_fechamentos, {
        pagoEm: new Date(`${payData}T12:00:00`).toISOString(),
        pagoCom: payForma,
      });
      toast({ title: 'Fechamento pago', description: 'As O.S. pendentes deste fechamento foram marcadas como pagas.' });
      setPayFechamento(null);
      await loadFechamentos();
    } catch (err) {
      toast({ title: 'Erro ao marcar pago', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setPayBusy(false);
    }
  }, [payFechamento, payData, payForma, toast, loadFechamentos]);

  const handleEstornarFechamento = useCallback(async (fechamento: FechamentoListItem) => {
    try {
      await estornarFechamentoPago(fechamento.id_fechamentos);
      toast({ title: 'Pagamento estornado', description: 'O fechamento voltou para pendente e as O.S. pagas por ele foram revertidas.' });
      await loadFechamentos();
    } catch (err) {
      toast({ title: 'Erro ao estornar', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    }
  }, [toast, loadFechamentos]);

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

    await openClosingPdfPreview(modalPreviewDados, `Fechamento ${modalPreviewDados.periodo}`);
  }, [modalPreviewDados, openClosingPdfPreview, storedPdfPreviewTitle, storedPdfPreviewUrl, toast]);

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
    if (clientsForSelectedPeriod.some(({ client }) => client.id === selClientId)) return;
    setSelClientId('');
    setActiveDraftId(null);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
  }, [clientsForSelectedPeriod, selClientId]);

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

      <Card>
        <CardContent className="p-3 sm:p-4">
          <p className="text-sm font-medium">Novo rascunho de fechamento</p>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Agrupa as O.S. pela data de entrada/criação e considera apenas O.S. faturáveis ainda sem fechamento.
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
                          <span className="font-semibold text-foreground ml-1">R$ {toMoney(totals.totalComDesconto)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Salvo em {new Date(draft.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
                        <Button size="sm" variant="outline" onClick={() => openDraft(draft)} className="justify-center">
                          <PencilLine className="w-3.5 h-3.5 mr-1.5" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openDraftPreview(draft)} className="justify-center">
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                        </Button>
                        <Button size="sm" onClick={() => void generateDraft(draft)} disabled={generating} className="col-span-2 justify-center sm:col-span-1">
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

        {loadingList ? (
          <div className="flex justify-center py-12"><DualSpinner /></div>
        ) : fechamentos.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
            Nenhum fechamento gerado ainda.
          </div>
        ) : (
          <div className="grid gap-3">
            {fechamentos.map((f, idx) => {
              const palette = PALETTE[idx % PALETTE.length];
              const initials = (f.cliente?.nome ?? 'SEM CLIENTE').slice(0, 2).toUpperCase();
              const isPago = f.status_pagamento === 'PAGO';
              return (
                <Card key={f.id_fechamentos} className={cn('border-l-4 overflow-hidden', palette.border)}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0', palette.avatar)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{f.cliente?.nome ?? '—'}</p>
                          <Badge variant="secondary" className="text-xs">{f.periodo}</Badge>
                          <Badge className={cn('text-xs gap-1', isPago ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                            {isPago ? <CheckCircle2 className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
                            {isPago ? 'Pago' : 'A receber'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {Array.isArray(f.dados_json?.notas) ? f.dados_json.notas.length : 0} OS · Total:
                          <span className="font-semibold text-foreground ml-1">
                            R$ {f.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          {f.total_downloads > 0 && ` · ${f.total_downloads} download${f.total_downloads > 1 ? 's' : ''}`}
                        </p>
                        {isPago && f.pago_em && (
                          <p className="mt-0.5 text-xs text-emerald-700">
                            Recebido em {formatDateBR(f.pago_em) ?? 'data não registrada'}
                            {f.pago_com ? ` · ${PAYMENT_METHOD_LABELS[f.pago_com as PaymentMethod] ?? f.pago_com}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Visualizar template do fechamento ${f.periodo}`}
                          onClick={() => void openGeneratedPreview(f)}
                          className="flex-1 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 sm:flex-none"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(f)}
                          disabled={downloadingId === f.id_fechamentos}
                          className="flex-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 sm:flex-none"
                        >
                          {downloadingId === f.id_fechamentos
                            ? <RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5 mr-1.5" />} PDF
                        </Button>
                        {!isPago ? (
                          <Button
                            size="sm"
                            onClick={() => { setPayForma('PIX'); setPayData(new Date().toISOString().slice(0, 10)); setPayFechamento(f); }}
                            disabled={isSupportImpersonating}
                            title={isSupportImpersonating ? 'Indisponível em modo suporte' : undefined}
                            className="col-span-2 justify-center bg-emerald-600 text-white hover:bg-emerald-700 sm:col-span-1 sm:flex-none"
                          >
                            <Wallet className="w-3.5 h-3.5 mr-1.5" /> Marcar pago
                          </Button>
                        ) : user?.role === 'ADMIN' ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" disabled={isSupportImpersonating} className="col-span-2 justify-center sm:col-span-1 sm:flex-none">
                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Estornar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Estornar pagamento de {f.periodo}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O fechamento volta para "A receber" e as O.S. que foram pagas por ele voltam para pendente.
                                  Use apenas para corrigir um lançamento.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Voltar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void handleEstornarFechamento(f)}>Confirmar estorno</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
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
                  <Button variant="outline" onClick={openActiveDraftPreview} disabled={!modalPreviewDados}>
                    <Eye className="w-4 h-4 mr-2" /> Visualizar
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
              <div className="grid min-h-full gap-0 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="p-4 sm:p-5 space-y-4">
                {safePreviewNotes.map((nota) => {
                  const disc = clampPercent(descontos[nota.id] ?? 0);
                  const totalComDesc = nota.total * (1 - disc / 100);
                  const editing = editingItems[nota.id] ?? true;
                  const isPaid = nota.paymentStatus === 'PAGO';
                  const included = !isPaid && includedNoteIds.includes(nota.id);
                  const itens = getPreviewItems(nota);
                  const itensBruto = itens.reduce((sum, item) => (
                    sum + (Math.max(0, item.quantidade) * Math.max(0, item.preco_unitario))
                  ), 0);
                  const descontoItens = Math.max(0, itensBruto - nota.total);
                  const descontoFinalOs = Math.max(0, nota.total - totalComDesc);
                  return (
                    <Card key={nota.id} className={cn('overflow-hidden border-border/70 transition', !included && 'opacity-70', isPaid && 'bg-muted/30')}>
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
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingItems((prev) => ({ ...prev, [nota.id]: !editing }))}>
                            {editing ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <PencilLine className="mr-1.5 h-3.5 w-3.5" />}
                            {editing ? 'Recolher' : 'Editar'}
                          </Button>
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground">Total O.S.</p>
                            <p className="font-bold text-primary text-sm">R$ {toMoney(totalComDesc)}</p>
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
                                  {editing ? (
                                    <Input value={item.descricao} onChange={(e) => updatePreviewItem(nota.id, item.id, 'descricao', e.target.value)} className="h-8 text-xs" />
                                  ) : (
                                    <span className="break-words">{item.descricao}</span>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Qtd</p>
                                  {editing ? (
                                    <Input type="number" min="0" step="1" value={item.quantidade} onChange={(e) => updatePreviewItem(nota.id, item.id, 'quantidade', e.target.value)} className="h-8 text-xs text-center" />
                                  ) : (
                                    <p className="lg:text-center">{item.quantidade}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Unit.</p>
                                  {editing ? (
                                    <Input type="number" min="0" step="0.01" value={item.preco_unitario} onChange={(e) => updatePreviewItem(nota.id, item.id, 'preco_unitario', e.target.value)} className="h-8 text-xs lg:text-right" />
                                  ) : (
                                    <p className="lg:text-right">R$ {toMoney(item.preco_unitario)}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Desc. %</p>
                                  {editing ? (
                                    <div className="relative">
                                      <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={canApplyItemDiscount ? item.desconto_porcentagem : ''}
                                        disabled={!canApplyItemDiscount}
                                        onChange={(e) => updatePreviewItem(nota.id, item.id, 'desconto_porcentagem', e.target.value)}
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
                                    <p className="mt-1 text-[10px] font-medium text-emerald-700 lg:text-right">-R$ {toMoney(descontoItem)}</p>
                                  ) : null}
                                </div>
                                <div>
                                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Total item</p>
                                  <p className="font-semibold lg:text-right">R$ {toMoney(item.subtotal)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-4 py-3 bg-muted/20 border-t border-border/30 flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>Desconto final da O.S. inteira:</span>
                            <Input type="number" min="0" max="100" step="1" value={descontos[nota.id] ?? ''} onChange={(e) => setDescontos((prev) => ({ ...prev, [nota.id]: clampPercent(parseFloat(e.target.value) || 0) }))} placeholder="0" className="w-20 h-8 text-xs text-center" />
                            <span>%</span>
                          </div>
                          <div className="text-right text-xs">
                            {descontoItens > 0 ? <p className="text-muted-foreground">Itens: -R$ {toMoney(descontoItens)}</p> : null}
                            {descontoFinalOs > 0 ? <p className="text-muted-foreground">Final: -R$ {toMoney(descontoFinalOs)}</p> : null}
                            <p className="font-bold">R$ {toMoney(totalComDesc)}</p>
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
                      <p className="mt-1 text-3xl font-bold text-primary">R$ {toMoney(grandTotal)}</p>
                      {grandTotalOriginal !== grandTotal && <p className="mt-1 text-xs text-muted-foreground">Bruto: R$ {toMoney(grandTotalOriginal)}</p>}
                      {receivedNotes.length > 0 && (
                        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          Já recebido no período: <span className="font-semibold">R$ {toMoney(receivedTotal)}</span>
                          {' '}({receivedNotes.length} O.S. — não somadas no total)
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border bg-background p-4 shadow-sm space-y-2 text-sm text-muted-foreground">
                      <p>1. Este popup serve para edição e revisão das O.S.</p>
                      <p>2. O botão visualizar mostra o template final em outro popup.</p>
                      <p>3. Só o botão gerar fechamento grava no banco.</p>
                    </div>
                    <Button
                      onClick={handleGerar}
                      disabled={generating || !activeDraft || includedNotesCount === 0}
                      className="h-12 w-full bg-destructive text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
                      size="lg"
                    >
                      <RefreshCcw className={cn('mr-2 h-4 w-4', generating && 'animate-spin')} />
                      Gerar fechamento
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

      {/* Marcar fechamento como pago (cascata para as O.S. pendentes do fechamento) */}
      <Dialog open={!!payFechamento} onOpenChange={(open) => { if (!open) setPayFechamento(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar fechamento como pago</DialogTitle>
            <DialogDescription>
              {payFechamento?.cliente?.nome ?? 'Cliente'} · {payFechamento?.periodo ?? ''} — R$ {(payFechamento?.valor_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.
              As O.S. pendentes deste fechamento serão marcadas como pagas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Forma de pagamento</label>
              <Select value={payForma} onValueChange={(v) => setPayForma(v as PaymentMethod)}>
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
              <Input type="date" value={payData} onChange={(e) => setPayData(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFechamento(null)} disabled={payBusy}>Cancelar</Button>
            <Button onClick={() => void handleMarcarPago()} disabled={payBusy} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {payBusy ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Wallet className="w-4 h-4 mr-2" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
