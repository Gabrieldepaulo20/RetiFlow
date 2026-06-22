import { useState, useMemo, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, Download, Building2,
  PlusCircle, RefreshCcw, ChevronLeft, Eye, EyeOff, Sparkles, PencilLine, Printer,
  Wallet, CheckCircle2, RotateCcw,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ClosingHtmlPreview } from '@/components/closing/ClosingHtmlPreview';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPdfPreviewWindow, openPdfInBrowser } from '@/lib/printPdf';
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
  type FechamentoListItem,
  type FechamentoDadosJson,
  type FechamentoNota,
} from '@/api/supabase/fechamentos';
import { getNotasServico } from '@/api/supabase/notas';
import { useDocumentCustomization, useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import {
  filterFechamentosForClientScope,
  getMonthlyClosingDraftsStorageKey,
} from '@/services/domain/monthlyClosingIsolation';
import { PAYMENT_METHOD_LABELS, type IntakeNote, type NotePaymentStatus, type PaymentMethod } from '@/types';
import { isBillableNoteStatus } from '@/services/domain/intakeNotes';

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

interface PreviewNote {
  id: string;
  os: string;
  veiculo: string;
  placa: string | null;
  total: number;
  updatedAt: string;
  /** Eixo financeiro: se já foi recebida (fora do total do fechamento) ou pendente. */
  paymentStatus: NotePaymentStatus;
  pagoEm: string | null;
  itens: Array<{
    id: string;
    descricao: string;
    quantidade: number;
    preco_unitario: number;
    desconto_porcentagem: number;
    subtotal: number;
  }>;
}

interface ClosingDraft {
  id: string;
  clientId: string;
  clientName: string;
  month: string;
  year: string;
  periodLabel: string;
  notes: PreviewNote[];
  includedNoteIds?: string[];
  discounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
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

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const recalcItemSubtotal = (item: PreviewNote['itens'][number]) => {
  const bruto = Math.max(0, item.quantidade) * Math.max(0, item.preco_unitario);
  return bruto * (1 - clampPercent(item.desconto_porcentagem) / 100);
};

const recalcNoteTotal = (items: PreviewNote['itens']) =>
  items.reduce((sum, item) => sum + recalcItemSubtotal(item), 0);

/** O.S. já recebida (paga) no período — informativa, nunca entra no total do fechamento. */
const isReceivedNote = (note: Pick<PreviewNote, 'paymentStatus'>) => note.paymentStatus === 'PAGO';

const getReceivedDraftNotes = (draft: Pick<ClosingDraft, 'notes'>) => draft.notes.filter(isReceivedNote);

const getIncludedDraftNotes = (draft: Pick<ClosingDraft, 'notes' | 'includedNoteIds'>) => {
  const base = draft.includedNoteIds
    ? draft.notes.filter((note) => new Set(draft.includedNoteIds).has(note.id))
    : draft.notes;
  // Notas já recebidas nunca entram no total/cascata do fechamento (só informativas).
  return base.filter((note) => !isReceivedNote(note));
};

const computeDraftTotals = (draft: Pick<ClosingDraft, 'notes' | 'discounts' | 'includedNoteIds'>) => {
  const includedNotes = getIncludedDraftNotes(draft);
  const totalOriginal = includedNotes.reduce((sum, note) => sum + note.total, 0);
  const totalComDesconto = includedNotes.reduce((sum, note) => {
    const desconto = draft.discounts[note.id] ?? 0;
    return sum + note.total * (1 - desconto / 100);
  }, 0);
  return { totalOriginal, totalComDesconto };
};

const buildDadosFromDraft = (draft: ClosingDraft): FechamentoDadosJson => {
  const totals = computeDraftTotals(draft);
  return {
    gerado_em: new Date().toISOString(),
    periodo: draft.periodLabel,
    cliente: { id: draft.clientId, nome: draft.clientName },
    notas: getIncludedDraftNotes(draft).map((note) => {
      const desconto = draft.discounts[note.id] ?? 0;
      return {
        id: note.id,
        os: note.os,
        veiculo: note.veiculo,
        placa: note.placa,
        itens: note.itens,
        total_original: note.total,
        desconto_nota: desconto,
        total_com_desconto: note.total * (1 - desconto / 100),
      };
    }),
    total_original: totals.totalOriginal,
    total_com_desconto: totals.totalComDesconto,
    recebidas: getReceivedDraftNotes(draft).map((note) => ({
      id: note.id,
      os: note.os,
      veiculo: note.veiculo,
      placa: note.placa,
      total: note.total,
      pago_em: note.pagoEm,
    })),
    total_ja_recebido: getReceivedDraftNotes(draft).reduce((sum, note) => sum + note.total, 0),
  };
};

const createDraftId = () =>
  `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

const getClosingCompetenceDate = (note: Pick<IntakeNote, 'finalizedAt' | 'updatedAt'>) =>
  note.finalizedAt ?? note.updatedAt;

const isAvailableForClosing = (note: IntakeNote) =>
  isBillableNoteStatus(note.status) && !note.closingId && Boolean(getClosingCompetenceDate(note));

const isInClosingPeriod = (note: IntakeNote, month: string, year: string) => {
  const competenceDate = getClosingCompetenceDate(note);
  if (!competenceDate) return false;
  const dt = new Date(competenceDate);
  return String(dt.getMonth() + 1) === month && String(dt.getFullYear()) === year;
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

/* ── Divergence check ───────────────────────────────────────────────────── */
function getDivergencias(fechamento: FechamentoListItem, notes: IntakeNote[]) {
  if (!fechamento.dados_json) return [];
  return fechamento.dados_json.notas.flatMap((n) => {
    const curr = notes.find((cn) => cn.id === n.id);
    if (!curr) return [];
    if (Math.abs(curr.totalAmount - n.total_com_desconto) < 0.01) return [];
    return [{ os: n.os, total_original: n.total_com_desconto, total_atual: curr.totalAmount, alterado_em: curr.updatedAt }];
  });
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

  // Preview state
  const [selMonth, setSelMonth] = useState(defaultMonth);
  const [selYear, setSelYear] = useState(defaultYear);
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
    setSelMonth(defaultMonth);
    setSelYear(defaultYear);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
    setPreviewDados(null);
  }, [currentScopeUserId, defaultMonth, defaultYear]);

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
      const parsed = JSON.parse(raw) as ClosingDraft[];
      setDrafts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDrafts([]);
    } finally {
      setDraftsHydratedKey(draftsStorageKey);
    }
  }, [draftsStorageKey]);

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
    if (!scopedClientIdSet.has(draft.clientId)) {
      toast({
        title: 'Rascunho fora do escopo atual',
        description: 'Este rascunho pertence a outra conta ou cliente e foi bloqueado nesta sessão.',
        variant: 'destructive',
      });
      return;
    }

    setActiveDraftId(draft.id);
    setSelClientId(draft.clientId);
    setSelMonth(draft.month);
    setSelYear(draft.year);
    setPreviewNotes(draft.notes);
    setDescontos(draft.discounts);
    setIncludedNoteIds(draft.includedNoteIds ?? draft.notes.map((note) => note.id));
    setEditingItems({});
  }, [scopedClientIdSet, toast]);

  const openDraft = useCallback((draft: ClosingDraft) => {
    loadDraftIntoEditor(draft);
    setDraftModalOpen(true);
  }, [loadDraftIntoEditor]);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
    [drafts, activeDraftId],
  );

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

  const openStoredClosingPdf = useCallback(async (fechamento: FechamentoListItem) => {
    if (!fechamento.pdf_url) return false;
    const previewWindow = createPdfPreviewWindow(`Fechamento ${fechamento.periodo}`);
    try {
      const url = await getFechamentoPDFSignedUrl(fechamento.pdf_url);
      const opened = openPdfInBrowser(url, {
        title: `Fechamento ${fechamento.periodo}`,
        previewWindow,
      });
      if (!opened) {
        toast({
          title: 'Pop-up bloqueado',
          description: 'Permita pop-ups para abrir o PDF em uma nova aba.',
          variant: 'destructive',
        });
      }
      return opened;
    } catch {
      previewWindow?.close();
      toast({ title: 'Erro ao abrir PDF', description: 'Não foi possível gerar link seguro.', variant: 'destructive' });
      return false;
    }
  }, [toast]);

  const openDraftPreview = useCallback((draft: ClosingDraft) => {
    loadDraftIntoEditor(draft);
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
    setReturnToDraftAfterPreview(false);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(true);
  }, [loadDraftIntoEditor]);

  const openActiveDraftPreview = useCallback(() => {
    if (!activeDraft) return;
    setGeneratedPreviewFechamento(null);
    setStoredPdfPreviewUrl(null);
    setStoredPdfPreviewTitle(null);
    setReturnToDraftAfterPreview(true);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(true);
  }, [activeDraft]);

  const openGeneratedPreview = useCallback(async (fechamento: FechamentoListItem) => {
    if (fechamento.dados_json) {
      setGeneratedPreviewFechamento(fechamento);
      setStoredPdfPreviewUrl(null);
      setStoredPdfPreviewTitle(null);
      setReturnToDraftAfterPreview(false);
      setDraftModalOpen(false);
      setTemplatePreviewOpen(true);
      return;
    }

    if (fechamento.pdf_url) {
      setTemplatePreviewLoading(true);
      try {
        const url = await getFechamentoPDFSignedUrl(fechamento.pdf_url);
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
  }, [toast]);

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
    if (!selMonth || !selYear) { toast({ title: 'Selecione um período válido', variant: 'destructive' }); return; }

    const mesNum = parseInt(selMonth);
    const anoNum = parseInt(selYear);
    const inicio = new Date(anoNum, mesNum - 1, 1);
    const fim = new Date(anoNum, mesNum, 0, 23, 59, 59);

    setLoadingPreview(true);
    try {
      const localClosingIdByNoteId = new Map(notes.map((note) => [note.id, note.closingId ?? null]));
      const notasFiltradas = IS_REAL_AUTH
        ? (await getNotasServico({ p_fk_clientes: selClientId, p_limite: 500, p_offset: 0 })).dados.filter((note) => {
            const closingId = note.fk_fechamentos ?? localClosingIdByNoteId.get(note.id_notas_servico);
            if (closingId) return false;
            if (!(note.finalizado_em || note.status.tipo_status === 'fechado')) return false;
            const dt = new Date(note.finalizado_em ?? note.created_at);
            return dt >= inicio && dt <= fim;
          }).map((note) => ({
            id: note.id_notas_servico,
            number: note.os,
            vehicleModel: note.veiculo.modelo,
            plate: note.veiculo.placa,
            totalAmount: note.total,
            updatedAt: note.finalizado_em ?? note.created_at,
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
        toast({ title: 'Nenhuma nota finalizada neste período', variant: 'destructive' });
        return;
      }

      const resultado: PreviewNote[] = [];

      for (const nota of notasFiltradas) {
        const det = IS_REAL_AUTH ? await getNotaDetalhesParaFechamento(nota.id) : null;
        resultado.push({
          id: nota.id,
          os: nota.number,
          veiculo: nota.vehicleModel,
          placa: nota.plate ?? null,
          total: nota.totalAmount,
          updatedAt: nota.updatedAt,
          paymentStatus: nota.paymentStatus,
          pagoEm: nota.pagoEm,
          itens: det?.itens_servico.map((i) => ({
            id: i.id_rel,
            descricao: i.descricao,
            quantidade: i.quantidade,
            preco_unitario: i.preco_unitario,
            desconto_porcentagem: i.desconto_porcentagem,
            subtotal: i.subtotal_item,
          })) ?? [{
            id: `${nota.id}-fallback`,
            descricao: 'Serviços realizados',
            quantidade: 1,
            preco_unitario: nota.totalAmount,
            desconto_porcentagem: 0,
            subtotal: nota.totalAmount,
          }],
        });
      }

      setPreviewNotes(resultado);
      setDescontos({});
      setIncludedNoteIds(resultado.filter((note) => note.paymentStatus !== 'PAGO').map((note) => note.id));
      setEditingItems({});
      const draftClient = clients.find((entry) => entry.id === selClientId);
      const periodLabel = `${MONTHS[mesNum - 1]} ${selYear}`;
      const timestamp = new Date().toISOString();
      const draft: ClosingDraft = {
        id: createDraftId(),
        clientId: selClientId,
        clientName: draftClient?.name ?? 'Cliente',
        month: selMonth,
        year: selYear,
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
  }, [selClientId, scopedClientIdSet, selMonth, selYear, notes, toast, clients, openDraft]);

  /* ── Computed totals ── */
  const totals = useMemo(() => {
    const included = new Set(includedNoteIds);
    return previewNotes.filter((note) => included.has(note.id)).map((n) => {
      const disc = descontos[n.id] ?? 0;
      return { id: n.id, totalBruto: n.total, totalComDesconto: n.total * (1 - disc / 100) };
    });
  }, [previewNotes, descontos, includedNoteIds]);

  const grandTotal = useMemo(() => totals.reduce((a, b) => a + b.totalComDesconto, 0), [totals]);
  const grandTotalOriginal = useMemo(() => totals.reduce((a, n) => a + n.totalBruto, 0), [totals]);
  // O.S. já recebidas no período (informativas, fora do total a pagar).
  const receivedNotes = useMemo(() => previewNotes.filter((note) => note.paymentStatus === 'PAGO'), [previewNotes]);
  const receivedTotal = useMemo(() => receivedNotes.reduce((sum, note) => sum + note.total, 0), [receivedNotes]);
  const includedNotesCount = includedNoteIds.length;
  const modalPreviewDados = useMemo(
    () => generatedPreviewFechamento?.dados_json ?? (activeDraft ? buildDadosFromDraft({
      ...activeDraft,
      notes: previewNotes,
      includedNoteIds,
      discounts: descontos,
    }) : null),
    [activeDraft, generatedPreviewFechamento, previewNotes, includedNoteIds, descontos],
  );
  const modalPreviewTitle = generatedPreviewFechamento
    ? `Fechamento ${generatedPreviewFechamento.periodo}`
    : storedPdfPreviewTitle
      ? storedPdfPreviewTitle
    : 'Template final do fechamento';
  const modalPreviewDescription = generatedPreviewFechamento
    ? 'Esta é a visualização do template salvo para este fechamento já gerado.'
    : storedPdfPreviewUrl
      ? 'Este PDF salvo está aberto dentro da tela para conferência rápida.'
    : 'Esta é a aparência de impressão e do PDF que ficará armazenado.';

  useEffect(() => {
    if (!draftModalOpen || !activeDraftId) return;
    setDrafts((current) => current.map((draft) => (
      draft.id === activeDraftId
        ? {
            ...draft,
            notes: previewNotes,
            includedNoteIds,
            discounts: descontos,
            updatedAt: new Date().toISOString(),
          }
        : draft
    )));
  }, [draftModalOpen, activeDraftId, previewNotes, includedNoteIds, descontos]);

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
        const nextItem = {
          ...item,
          [field]: field === 'desconto_porcentagem' ? clampPercent(safe) : Math.max(0, safe),
        };
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
  }, [scopedClientIdSet, toast, renderClosingPdfBlob, loadFechamentos, removeDraft, closeDraftModal, documentSettings]);

  const handleGerar = useCallback(async () => {
    if (!activeDraft) return;
    const draftSnapshot: ClosingDraft = {
      ...activeDraft,
      notes: previewNotes,
      includedNoteIds,
      discounts: descontos,
      updatedAt: new Date().toISOString(),
    };
    await generateDraft(draftSnapshot);
  }, [activeDraft, previewNotes, includedNoteIds, descontos, generateDraft]);

  /* ── Download PDF ── */
  const handleDownload = useCallback(async (fechamento: FechamentoListItem) => {
    if (fechamento.pdf_url) {
      const opened = await openStoredClosingPdf(fechamento);
      if (opened) await registrarAcaoFechamento({ p_id_fechamentos: fechamento.id_fechamentos, p_tipo: 'baixado' }).catch(() => {});
      return;
    }
    if (!fechamento.dados_json) { toast({ title: 'PDF não disponível', variant: 'destructive' }); return; }
    const previewWindow = createPdfPreviewWindow(`Fechamento ${fechamento.periodo}`);
    try {
      const blob = await renderClosingPdfBlob(fechamento.dados_json, fechamento.created_at);
      const url = URL.createObjectURL(blob);
      openPdfInBrowser(url, {
        title: `Fechamento ${fechamento.periodo}`,
        previewWindow,
        revokeObjectUrlAfterMs: 30_000,
      });
      await registrarAcaoFechamento({ p_id_fechamentos: fechamento.id_fechamentos, p_tipo: 'baixado' });
    } catch {
      previewWindow?.close();
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' });
    }
  }, [openStoredClosingPdf, renderClosingPdfBlob, toast]);

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
    () => (selMonth && selYear
      ? availableClosingNotes.filter((note) => isInClosingPeriod(note, selMonth, selYear))
      : []),
    [availableClosingNotes, selMonth, selYear],
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
  const hasNoClientsForSelectedPeriod = Boolean(selMonth && selYear && clientsForSelectedPeriod.length === 0);

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

  const handleClientSelect = useCallback((clientId: string) => {
    setActiveDraftId(null);
    setSelClientId(clientId);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
  }, []);

  const handleMonthSelect = useCallback((month: string) => {
    setSelMonth(month);
    setSelClientId('');
    setActiveDraftId(null);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
  }, []);

  const handleYearSelect = useCallback((year: string) => {
    setSelYear(year);
    setSelClientId('');
    setActiveDraftId(null);
    setPreviewNotes([]);
    setDescontos({});
    setIncludedNoteIds([]);
    setEditingItems({});
  }, []);

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
            Agrupa as O.S. pela data de finalização/entrega (competência). Isso pode diferir do Dashboard,
            que conta o faturamento pela data de entrada da O.S.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_110px_minmax(240px,1fr)_auto] lg:items-end">
            <div className="grid grid-cols-2 gap-2 sm:contents">
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
            <div className="flex-1 min-w-[180px]">
              <label className="mb-1.5 block text-xs text-muted-foreground">Cliente</label>
              <Select value={selClientId} onValueChange={handleClientSelect} disabled={!selMonth || !selYear || clientsForSelectedPeriod.length === 0}>
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
            <Button onClick={handleBuildPreview} disabled={loadingPreview || !selClientId || !selMonth || !selYear} className="w-full lg:min-w-[180px]">
              {loadingPreview ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
              Gerar rascunho
            </Button>
          </div>
          {hasNoClientsForSelectedPeriod && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Nenhum cliente tem O.S. entregue e sem fechamento em {MONTHS[Number(selMonth) - 1]} de {selYear}.
            </div>
          )}
          {selMonth && selYear && clientsForSelectedPeriod.length > 0 && !selClientId && (
            <p className="mt-2 text-xs text-muted-foreground">
              Escolha o cliente para fechar {MONTHS[Number(selMonth) - 1]} de {selYear}. Foram encontradas {selectedPeriodTotalNotes} O.S. em {clientsForSelectedPeriod.length} cliente{clientsForSelectedPeriod.length === 1 ? '' : 's'}.
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
              const initials = draft.clientName.slice(0, 2).toUpperCase();
              return (
                <Card key={draft.id} className={cn('border-l-4 overflow-hidden', palette.border)}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-10 sm:w-10', palette.avatar)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{draft.clientName}</p>
                          <Badge variant="secondary" className="text-xs">{draft.periodLabel}</Badge>
                          <Badge variant="outline" className="text-xs">Rascunho</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {draft.notes.length} OS · Total atual:
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
              const divs = getDivergencias(f, notes);
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
                          {divs.length > 0 && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Desatualizado
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {f.dados_json?.notas.length ?? 0} OS · Total:
                          <span className="font-semibold text-foreground ml-1">
                            R$ {f.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          {f.total_downloads > 0 && ` · ${f.total_downloads} download${f.total_downloads > 1 ? 's' : ''}`}
                        </p>
                        {isPago && f.pago_em && (
                          <p className="mt-0.5 text-xs text-emerald-700">
                            Recebido em {new Date(f.pago_em).toLocaleDateString('pt-BR')}
                            {f.pago_com ? ` · ${PAYMENT_METHOD_LABELS[f.pago_com as PaymentMethod] ?? f.pago_com}` : ''}
                          </p>
                        )}
                        {divs.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {divs.map((d, i) => (
                              <p key={i} className="text-xs text-destructive flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {d.os} · era R$ {d.total_original.toFixed(2)} → R$ {d.total_atual.toFixed(2)} ·{' '}
                                {new Date(d.alterado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            ))}
                          </div>
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
                        <Button size="sm" variant="outline" onClick={() => handleDownload(f)} className="flex-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 sm:flex-none">
                          <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
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
                {previewNotes.map((nota) => {
                  const disc = descontos[nota.id] ?? 0;
                  const totalComDesc = nota.total * (1 - disc / 100);
                  const editing = editingItems[nota.id] ?? true;
                  const isPaid = nota.paymentStatus === 'PAGO';
                  const included = !isPaid && includedNoteIds.includes(nota.id);
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
                                Já recebido{nota.pagoEm ? ` · ${new Date(nota.pagoEm).toLocaleDateString('pt-BR')}` : ''}
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
                            <p className="text-[11px] text-muted-foreground">Total</p>
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
                            <span className="text-right">Desc. item</span>
                            <span className="text-right">Subtotal</span>
                          </div>
                          {nota.itens.map((item) => (
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
                                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Desc. item</p>
                                {editing ? (
                                  <Input type="number" min="0" max="100" step="0.01" value={item.desconto_porcentagem} onChange={(e) => updatePreviewItem(nota.id, item.id, 'desconto_porcentagem', e.target.value)} className="h-8 text-xs lg:text-right" />
                                ) : (
                                  <p className="lg:text-right">{item.desconto_porcentagem > 0 ? `${item.desconto_porcentagem}%` : '—'}</p>
                                )}
                              </div>
                              <div>
                                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:hidden">Subtotal</p>
                                <p className="font-semibold lg:text-right">R$ {toMoney(item.subtotal)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="px-4 py-3 bg-muted/20 border-t border-border/30 flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>Desconto final desta O.S.:</span>
                            <Input type="number" min="0" max="100" step="1" value={descontos[nota.id] ?? ''} onChange={(e) => setDescontos((prev) => ({ ...prev, [nota.id]: parseFloat(e.target.value) || 0 }))} placeholder="0" className="w-20 h-8 text-xs text-center" />
                            <span>%</span>
                          </div>
                          <div className="text-right text-xs">
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
                      <p className="mt-2 text-sm text-muted-foreground">{includedNotesCount} de {previewNotes.length} O.S. marcadas · {activeDraft?.periodLabel ?? '—'}</p>
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
              ) : modalPreviewDados ? (
                <div className="h-full min-h-0 overflow-y-auto overscroll-contain scroll-smooth px-0 scrollbar-thin">
                  <ClosingHtmlPreview
                    dados={modalPreviewDados}
                    accentColor={templateSettings?.corFechamento}
                    documentSettings={documentSettings}
                  />
                </div>
              ) : storedPdfPreviewUrl ? (
                <iframe
                  title={storedPdfPreviewTitle ?? 'PDF do fechamento'}
                  src={storedPdfPreviewUrl}
                  className="h-full w-full border-0 bg-white"
                />
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
