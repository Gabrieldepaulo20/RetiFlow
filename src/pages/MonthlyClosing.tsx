import { useState, useMemo, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, Download, Building2,
  PlusCircle, RefreshCcw, Share2, ChevronLeft, Eye, EyeOff, Sparkles, PencilLine, Printer,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ClosingHtmlPreview } from '@/components/closing/ClosingHtmlPreview';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { openPdfPrintDialog } from '@/lib/printPdf';
import {
  getFechamentos,
  insertFechamento,
  updateFechamento,
  registrarAcaoFechamento,
  getNotaDetalhesParaFechamento,
  uploadFechamentoPDF,
  getFechamentoPDFSignedUrl,
  type FechamentoListItem,
  type FechamentoDadosJson,
  type FechamentoNota,
} from '@/api/supabase/fechamentos';
import { getNotasServico } from '@/api/supabase/notas';
import { useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import type { IntakeNote } from '@/types';

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
  placa: string;
  total: number;
  updatedAt: string;
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

const DRAFTS_STORAGE_KEY = 'retiflow:monthly-closing-drafts:v1';

const toMoney = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const recalcItemSubtotal = (item: PreviewNote['itens'][number]) => {
  const bruto = Math.max(0, item.quantidade) * Math.max(0, item.preco_unitario);
  return bruto * (1 - clampPercent(item.desconto_porcentagem) / 100);
};

const recalcNoteTotal = (items: PreviewNote['itens']) =>
  items.reduce((sum, item) => sum + recalcItemSubtotal(item), 0);

const computeDraftTotals = (draft: Pick<ClosingDraft, 'notes' | 'discounts'>) => {
  const totalOriginal = draft.notes.reduce((sum, note) => sum + note.total, 0);
  const totalComDesconto = draft.notes.reduce((sum, note) => {
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
    notas: draft.notes.map((note) => {
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
  const { toast } = useToast();
  const { data: templateSettings } = useDocumentTemplateSettings();

  const now = new Date();
  const defaultMonth = String(now.getMonth() + 1);
  const defaultYear = String(now.getFullYear());
  const [fechamentos, setFechamentos] = useState<FechamentoListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [drafts, setDrafts] = useState<ClosingDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [returnToDraftAfterPreview, setReturnToDraftAfterPreview] = useState(false);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);

  // Preview state
  const [selMonth, setSelMonth] = useState(defaultMonth);
  const [selYear, setSelYear] = useState(defaultYear);
  const [selClientId, setSelClientId] = useState('');
  const [availablePeriods, setAvailablePeriods] = useState<AvailableClosingPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [previewNotes, setPreviewNotes] = useState<PreviewNote[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [descontos, setDescontos] = useState<Record<string, number>>({});
  const [editingItems, setEditingItems] = useState<Record<string, boolean>>({});

  // Generation
  const [generating, setGenerating] = useState(false);
  const [previewDados, setPreviewDados] = useState<FechamentoDadosJson | null>(null);

  /* ── Load fechamentos ── */
  const loadFechamentos = useCallback(async () => {
    if (!IS_REAL_AUTH) return;
    setLoadingList(true);
    try {
      const { dados } = await getFechamentos({ p_limite: 100 });
      setFechamentos(dados);
    } catch {
      toast({ title: 'Erro ao carregar fechamentos', variant: 'destructive' });
    } finally {
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => { void loadFechamentos(); }, [loadFechamentos]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ClosingDraft[];
      if (Array.isArray(parsed)) {
        setDrafts(parsed);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // noop
    }
  }, [drafts]);

  useEffect(() => {
    if (!selClientId) {
      setAvailablePeriods([]);
      setSelMonth(defaultMonth);
      setSelYear(defaultYear);
      return;
    }

    let cancelled = false;
    const loadPeriods = async () => {
      setLoadingPeriods(true);
      try {
        const fallback = normalizeAvailablePeriods(
          notes
            .filter((note) => note.clientId === selClientId && note.status === 'FINALIZADO' && (note.finalizedAt ?? note.updatedAt))
            .map((note) => note.finalizedAt ?? note.updatedAt),
        );

        const periods = IS_REAL_AUTH
          ? normalizeAvailablePeriods(
              (await getNotasServico({ p_fk_clientes: selClientId, p_limite: 500, p_offset: 0 })).dados
                .filter((note) => note.finalizado_em || note.status.tipo_status === 'fechado')
                .map((note) => note.finalizado_em ?? note.created_at),
            )
          : fallback;

        const nextPeriods = periods.length > 0 ? periods : fallback;
        if (cancelled) return;

        setAvailablePeriods(nextPeriods);
        if (nextPeriods.length === 0) {
          setSelMonth('');
          return;
        }

        const selectedYear = nextPeriods.some((period) => period.year === selYear)
          ? selYear
          : nextPeriods[0].year;
        setSelYear(selectedYear);
        setSelMonth((current) => {
          if (nextPeriods.some((period) => period.month === current && period.year === selectedYear)) return current;
          return nextPeriods.find((period) => period.year === selectedYear)?.month ?? nextPeriods[0].month;
        });
      } catch {
        if (cancelled) return;
        setAvailablePeriods([]);
        setSelMonth('');
        toast({ title: 'Erro ao carregar períodos do cliente', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoadingPeriods(false);
      }
    };

    void loadPeriods();
    return () => { cancelled = true; };
  }, [selClientId, notes, defaultMonth, defaultYear, selYear, toast]);

  const loadDraftIntoEditor = useCallback((draft: ClosingDraft) => {
    setActiveDraftId(draft.id);
    setSelClientId(draft.clientId);
    setSelMonth(draft.month);
    setSelYear(draft.year);
    setPreviewNotes(draft.notes);
    setDescontos(draft.discounts);
    setEditingItems({});
  }, []);

  const openDraft = useCallback((draft: ClosingDraft) => {
    loadDraftIntoEditor(draft);
    setDraftModalOpen(true);
  }, [loadDraftIntoEditor]);

  const closeTemplatePreview = useCallback(() => {
    setTemplatePreviewOpen(false);
    setTemplatePreviewLoading(false);
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
  }, []);

  const openDraftPreview = useCallback((draft: ClosingDraft) => {
    loadDraftIntoEditor(draft);
    setReturnToDraftAfterPreview(false);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(true);
  }, [loadDraftIntoEditor]);

  const openActiveDraftPreview = useCallback(() => {
    setReturnToDraftAfterPreview(true);
    setDraftModalOpen(false);
    setTemplatePreviewOpen(true);
  }, []);

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
    if (!selMonth || !selYear) { toast({ title: 'Selecione um período válido', variant: 'destructive' }); return; }

    const mesNum = parseInt(selMonth);
    const anoNum = parseInt(selYear);
    const inicio = new Date(anoNum, mesNum - 1, 1);
    const fim = new Date(anoNum, mesNum, 0, 23, 59, 59);

    setLoadingPreview(true);
    try {
      const notasFiltradas = IS_REAL_AUTH
        ? (await getNotasServico({ p_fk_clientes: selClientId, p_limite: 500, p_offset: 0 })).dados.filter((note) => {
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
          }))
        : notes.filter((n) => {
            if (n.status !== 'FINALIZADO') return false;
            if (n.clientId !== selClientId) return false;
            const dt = new Date(n.finalizedAt ?? n.updatedAt);
            return dt >= inicio && dt <= fim;
          }).map((note) => ({
            id: note.id,
            number: note.number,
            vehicleModel: note.vehicleModel,
            plate: note.plate ?? '',
            totalAmount: note.totalAmount,
            updatedAt: note.updatedAt,
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
          placa: nota.plate ?? '',
          total: nota.totalAmount,
          updatedAt: nota.updatedAt,
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
  }, [selClientId, selMonth, selYear, notes, toast, clients, openDraft]);

  /* ── Computed totals ── */
  const totals = useMemo(() => {
    return previewNotes.map((n) => {
      const disc = descontos[n.id] ?? 0;
      return { id: n.id, totalBruto: n.total, totalComDesconto: n.total * (1 - disc / 100) };
    });
  }, [previewNotes, descontos]);

  const grandTotal = useMemo(() => totals.reduce((a, b) => a + b.totalComDesconto, 0), [totals]);
  const grandTotalOriginal = useMemo(() => totals.reduce((a, n) => a + n.totalBruto, 0), [totals]);
  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
    [drafts, activeDraftId],
  );
  const modalPreviewDados = useMemo(
    () => activeDraft ? buildDadosFromDraft({
      ...activeDraft,
      notes: previewNotes,
      discounts: descontos,
    }) : null,
    [activeDraft, previewNotes, descontos],
  );

  useEffect(() => {
    if (!draftModalOpen || !activeDraftId) return;
    setDrafts((current) => current.map((draft) => (
      draft.id === activeDraftId
        ? {
            ...draft,
            notes: previewNotes,
            discounts: descontos,
            updatedAt: new Date().toISOString(),
          }
        : draft
    )));
  }, [draftModalOpen, activeDraftId, previewNotes, descontos]);

  useEffect(() => {
    if (!selYear || availablePeriods.length === 0) return;
    const monthsForYear = availablePeriods.filter((period) => period.year === selYear);
    if (monthsForYear.length === 0) return;
    if (monthsForYear.some((period) => period.month === selMonth)) return;
    setSelMonth(monthsForYear[0].month);
  }, [availablePeriods, selYear, selMonth]);

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
      />,
    ).toBlob();
  }, [templateSettings?.corFechamento]);

  /* ── Gerar fechamento ── */
  const generateDraft = useCallback(async (draft: ClosingDraft) => {
    setGenerating(true);
    try {
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
      await updateFechamento(idFechamento, {
        p_dados_json: {
          ...dados,
          gerado_em: geradoEm,
          notas: notasDados,
        },
      });

      // 3. Upload PDF
      const pdfUrl = await uploadFechamentoPDF(idFechamento, pdfBlob);
      if (!pdfUrl) {
        throw new Error('O fechamento foi montado, mas o PDF não conseguiu ser salvo no storage.');
      }
      await updateFechamento(idFechamento, { p_pdf_url: pdfUrl });

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
  }, [toast, renderClosingPdfBlob, loadFechamentos, removeDraft, closeDraftModal]);

  const handleGerar = useCallback(async () => {
    if (!activeDraft) return;
    const draftSnapshot: ClosingDraft = {
      ...activeDraft,
      notes: previewNotes,
      discounts: descontos,
      updatedAt: new Date().toISOString(),
    };
    await generateDraft(draftSnapshot);
  }, [activeDraft, previewNotes, descontos, generateDraft]);

  /* ── Download PDF ── */
  const handleDownload = useCallback(async (fechamento: FechamentoListItem) => {
    if (fechamento.pdf_url) {
      try {
        const url = await getFechamentoPDFSignedUrl(fechamento.pdf_url);
        window.open(url, '_blank', 'noopener,noreferrer');
        await registrarAcaoFechamento({ p_id_fechamentos: fechamento.id_fechamentos, p_tipo: 'baixado' }).catch(() => {});
      } catch {
        toast({ title: 'Erro ao abrir PDF', description: 'Não foi possível gerar link seguro.', variant: 'destructive' });
      }
      return;
    }
    if (!fechamento.dados_json) { toast({ title: 'PDF não disponível', variant: 'destructive' }); return; }
    try {
      const blob = await renderClosingPdfBlob(fechamento.dados_json, fechamento.created_at);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fechamento-${fechamento.periodo?.replace(/\s/g, '-').toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      await registrarAcaoFechamento({ p_id_fechamentos: fechamento.id_fechamentos, p_tipo: 'baixado' });
    } catch {
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' });
    }
  }, [toast, renderClosingPdfBlob]);

  const handlePrintPreview = useCallback(async () => {
    if (!modalPreviewDados) {
      toast({ title: 'Nenhum fechamento selecionado', variant: 'destructive' });
      return;
    }

    try {
      setTemplatePreviewLoading(true);
      const blob = await renderClosingPdfBlob(modalPreviewDados, modalPreviewDados.gerado_em);
      const url = URL.createObjectURL(blob);
      openPdfPrintDialog(url, `Fechamento ${modalPreviewDados.periodo}`);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast({ title: 'Erro ao abrir impressão', variant: 'destructive' });
    } finally {
      setTemplatePreviewLoading(false);
    }
  }, [modalPreviewDados, renderClosingPdfBlob, toast]);

  const years = useMemo(() => {
    const y = Number(defaultYear);
    if (availablePeriods.length > 0) {
      return [...new Set(availablePeriods.map((period) => period.year))];
    }
    return [y - 1, y, y + 1].map(String);
  }, [availablePeriods, defaultYear]);

  const availableMonthsForYear = useMemo(
    () => availablePeriods.filter((period) => period.year === selYear),
    [availablePeriods, selYear],
  );

  const activeClients = useMemo(() => clients.filter((c) => c.isActive).sort((a, b) => a.name.localeCompare(b.name)), [clients]);
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
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Novo rascunho de fechamento</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_160px_110px_auto] lg:items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="mb-1.5 block text-xs text-muted-foreground">Cliente</label>
              <Select value={selClientId} onValueChange={setSelClientId}>
                <SelectTrigger aria-label="Selecionar cliente do fechamento"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {activeClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Mês</label>
              <Select value={selMonth} onValueChange={setSelMonth} disabled={!selClientId || loadingPeriods || availableMonthsForYear.length === 0}>
                <SelectTrigger className="w-full" aria-label="Selecionar mês do fechamento"><SelectValue placeholder={loadingPeriods ? 'Carregando...' : 'Sem notas'} /></SelectTrigger>
                <SelectContent>
                  {availableMonthsForYear.map((period) => (
                    <SelectItem key={period.key} value={period.month}>
                      {MONTHS[Number(period.month) - 1]} ({period.noteCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Ano</label>
              <Select value={selYear} onValueChange={setSelYear} disabled={!selClientId || loadingPeriods || years.length === 0}>
                <SelectTrigger className="w-full" aria-label="Selecionar ano do fechamento"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleBuildPreview} disabled={loadingPreview || loadingPeriods || !selClientId || !selMonth || availablePeriods.length === 0} className="w-full lg:min-w-[180px]">
              {loadingPreview || loadingPeriods ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
              Gerar rascunho
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {selClientId
              ? loadingPeriods
                ? 'Buscando no banco os meses com O.S. finalizadas para este cliente...'
                : availablePeriods.length > 0
                  ? `Mostrando apenas períodos com notas finalizadas para ${clients.find((client) => client.id === selClientId)?.name ?? 'o cliente selecionado'}.`
                  : 'Este cliente ainda não possui O.S. finalizadas para gerar fechamento.'
              : 'Selecione um cliente para carregar no banco apenas os meses disponíveis para fechamento.'}
          </p>
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
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0', palette.avatar)}>
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
                      <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                        <Button size="sm" variant="outline" onClick={() => handleDownload(f)} className="flex-1 sm:flex-none">
                          <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Copiar link do fechamento ${f.periodo}`} onClick={async () => {
                          if (f.pdf_url) {
                            try {
                              const url = await getFechamentoPDFSignedUrl(f.pdf_url);
                              await navigator.clipboard.writeText(url);
                              toast({ title: 'Link copiado!' });
                            } catch {
                              toast({ title: 'Erro ao gerar link', variant: 'destructive' });
                            }
                          } else {
                            toast({ title: 'PDF ainda não disponível', variant: 'destructive' });
                          }
                        }} className="shrink-0">
                          <Share2 className="w-3.5 h-3.5" />
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
                  return (
                    <Card key={nota.id} className="overflow-hidden border-border/70">
                      <div className="bg-muted/40 border-b border-border/50 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{nota.os}</p>
                            <Badge variant="outline" className="text-[10px]">Editável</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{nota.veiculo}{nota.placa ? ` · ${nota.placa}` : ''}</p>
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
                      <CardContent className="p-0">
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
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Resumo do rascunho</p>
                      <p className="mt-2 text-sm text-muted-foreground">{previewNotes.length} O.S. · {activeDraft?.periodLabel ?? '—'}</p>
                      <p className="mt-1 text-3xl font-bold text-primary">R$ {toMoney(grandTotal)}</p>
                      {grandTotalOriginal !== grandTotal && <p className="mt-1 text-xs text-muted-foreground">Bruto: R$ {toMoney(grandTotalOriginal)}</p>}
                    </div>
                    <div className="rounded-2xl border bg-background p-4 shadow-sm space-y-2 text-sm text-muted-foreground">
                      <p>1. Este popup serve para edição e revisão das O.S.</p>
                      <p>2. O botão visualizar mostra o template final em outro popup.</p>
                      <p>3. Só o botão gerar fechamento grava no banco.</p>
                    </div>
                    <Button
                      onClick={handleGerar}
                      disabled={generating || !activeDraft}
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
        <DialogContent className="h-[94dvh] max-h-[94dvh] w-[calc(100vw-1rem)] max-w-[min(1200px,calc(100vw-1rem))] gap-0 overflow-hidden p-0 [&>button]:right-3 [&>button]:top-3">
          <DialogTitle className="sr-only">Visualização do template do fechamento</DialogTitle>
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b px-4 py-3 pr-12 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Visualização</p>
                  <h3 className="mt-1 text-lg font-semibold">Template final do fechamento</h3>
                  <p className="text-sm text-muted-foreground">
                    Esta é a aparência de impressão e do PDF que ficará armazenado.
                  </p>
                </div>
                <Button variant="outline" onClick={() => void handlePrintPreview()} disabled={templatePreviewLoading || !modalPreviewDados}>
                  <Printer className="mr-2 h-4 w-4" /> Imprimir
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-muted/40">
              {modalPreviewDados ? (
                <div className="h-full overflow-y-auto overscroll-contain scrollbar-thin">
                  <ClosingHtmlPreview dados={modalPreviewDados} accentColor={templateSettings?.corFechamento} />
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
    </div>
  );
}
