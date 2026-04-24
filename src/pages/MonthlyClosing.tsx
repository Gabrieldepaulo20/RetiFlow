import { useState, useMemo, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle, CalendarDays, Download, Building2,
  PlusCircle, RefreshCcw, Share2, FileText, ChevronLeft, Eye, EyeOff, Sparkles, ArrowUpFromLine, PencilLine,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import { ClosingPDFTemplate } from '@/components/closing/ClosingPDFTemplate';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getFechamentos,
  insertFechamento,
  updateFechamento,
  registrarAcaoFechamento,
  getNotaDetalhesParaFechamento,
  uploadFechamentoPDF,
  type FechamentoListItem,
  type FechamentoDadosJson,
  type FechamentoNota,
} from '@/api/supabase/fechamentos';
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

  const now = new Date();
  const [fechamentos, setFechamentos] = useState<FechamentoListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [drafts, setDrafts] = useState<ClosingDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);

  // Preview state
  const [selMonth, setSelMonth] = useState(String(now.getMonth() + 1));
  const [selYear, setSelYear] = useState(String(now.getFullYear()));
  const [selClientId, setSelClientId] = useState('');
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

  const openDraft = useCallback((draft: ClosingDraft) => {
    setActiveDraftId(draft.id);
    setSelClientId(draft.clientId);
    setSelMonth(draft.month);
    setSelYear(draft.year);
    setPreviewNotes(draft.notes);
    setDescontos(draft.discounts);
    setEditingItems({});
    setDraftModalOpen(true);
  }, []);

  const closeDraftModal = useCallback(() => {
    setDraftModalOpen(false);
    setTemplatePreviewOpen(false);
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

    const mesNum = parseInt(selMonth);
    const anoNum = parseInt(selYear);
    const inicio = new Date(anoNum, mesNum - 1, 1);
    const fim = new Date(anoNum, mesNum, 0, 23, 59, 59);

    const notasFiltradas = notes.filter((n) => {
      if (n.status !== 'FINALIZADO') return false;
      if (n.clientId !== selClientId) return false;
      const dt = new Date(n.finalizedAt ?? n.updatedAt);
      return dt >= inicio && dt <= fim;
    });

    if (notasFiltradas.length === 0) {
      toast({ title: 'Nenhuma nota finalizada neste período', variant: 'destructive' });
      return;
    }

    setLoadingPreview(true);
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
    setLoadingPreview(false);
    toast({ title: 'Rascunho gerado', description: 'Ele ficou salvo localmente e pode ser retomado depois.' });
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

      // 3. Generate PDF
      let pdfUrl: string | null = null;
      try {
        const blob = await pdf(<ClosingPDFTemplate dados={{ ...dados, gerado_em: geradoEm }} geradoEm={geradoEm} />).toBlob();
        pdfUrl = await uploadFechamentoPDF(idFechamento, blob);
        if (pdfUrl) {
          await updateFechamento(idFechamento, { p_pdf_url: pdfUrl });
        }
      } catch {
        // PDF generation failure is non-blocking
      }

      // 4. Audit action
      try {
        await registrarAcaoFechamento({
          p_id_fechamentos: idFechamento,
          p_tipo: 'pdf_gerado',
          p_mensagem: `PDF gerado. Total: R$ ${totals.totalComDesconto.toFixed(2)}`,
        });
      } catch { /* non-blocking */ }

      toast({ title: 'Fechamento gerado com sucesso!' });
      setPreviewDados({ ...dados, gerado_em: geradoEm });
      removeDraft(draft.id);
      await loadFechamentos();
      closeDraftModal();
    } catch (err) {
      toast({ title: 'Erro ao gerar fechamento', description: String(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [toast, loadFechamentos, removeDraft, closeDraftModal]);

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
      window.open(fechamento.pdf_url, '_blank');
      try { await registrarAcaoFechamento({ p_id_fechamentos: fechamento.id_fechamentos, p_tipo: 'baixado' }); } catch { /* */ }
      return;
    }
    if (!fechamento.dados_json) { toast({ title: 'PDF não disponível', variant: 'destructive' }); return; }
    try {
      const blob = await pdf(<ClosingPDFTemplate dados={fechamento.dados_json} geradoEm={fechamento.created_at} />).toBlob();
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
  }, [toast]);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1].map(String);
  }, []);

  const activeClients = useMemo(() => clients.filter((c) => c.isActive).sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  return (
    <div className="space-y-5 overflow-x-hidden">
      {generating && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
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

      <Alert>
        <CalendarDays className="h-4 w-4" />
        <AlertDescription>Fluxo sugerido: gerar rascunho, revisar em popup, visualizar o template final e só então gerar o fechamento definitivo.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Novo rascunho de fechamento</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs text-muted-foreground mb-1.5">Cliente</p>
              <Select value={selClientId} onValueChange={setSelClientId}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {activeClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Mês</p>
              <Select value={selMonth} onValueChange={setSelMonth}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Ano</p>
              <Select value={selYear} onValueChange={setSelYear}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleBuildPreview} disabled={loadingPreview || !selClientId} className="min-w-[180px]">
              {loadingPreview ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
              Gerar rascunho
            </Button>
          </div>
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
                    <div className="flex items-start gap-3">
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
                      <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                        <Button size="sm" variant="outline" onClick={() => openDraft(draft)}>
                          <PencilLine className="w-3.5 h-3.5 mr-1.5" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { openDraft(draft); setTemplatePreviewOpen(true); }}>
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                        </Button>
                        <Button size="sm" onClick={() => void generateDraft(draft)} disabled={generating}>
                          <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" /> Gerar fechamento
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeDraft(draft.id)}>
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
                    <div className="flex items-start gap-3">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0', palette.avatar)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{f.cliente?.nome ?? '—'}</p>
                          <Badge variant="secondary" className="text-xs">{f.periodo}</Badge>
                          <Badge variant="outline" className="text-xs">v{f.versao}</Badge>
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
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => handleDownload(f)}>
                          <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (f.pdf_url) navigator.clipboard.writeText(f.pdf_url).then(() => toast({ title: 'Link copiado!' }));
                          else toast({ title: 'PDF ainda não disponível', variant: 'destructive' });
                        }}>
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
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 gap-0 sm:max-w-6xl">
          <DialogTitle className="sr-only">Editar rascunho de fechamento</DialogTitle>
          <div className="flex flex-col max-h-[92vh]">
            <div className="border-b px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Rascunho de fechamento</p>
                  <h3 className="text-xl font-semibold mt-1">{activeDraft?.clientName ?? 'Cliente'}</h3>
                  <p className="text-sm text-muted-foreground">{activeDraft?.periodLabel ?? '—'}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setTemplatePreviewOpen(true)} disabled={!modalPreviewDados}>
                    <Eye className="w-4 h-4 mr-2" /> Visualizar
                  </Button>
                  <Button onClick={handleGerar} disabled={generating || !activeDraft}>
                    {generating ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4 mr-2" />}
                    Gerar fechamento
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px] min-h-0">
              <div className="min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
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
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[860px] text-xs">
                            <thead>
                              <tr className="border-b border-border/40 text-muted-foreground">
                                <th className="text-left px-4 py-2 font-medium">Descrição</th>
                                <th className="text-center px-3 py-2 font-medium w-[88px]">Qtd</th>
                                <th className="text-right px-3 py-2 font-medium w-[120px]">Unit.</th>
                                <th className="text-right px-3 py-2 font-medium w-[110px]">Desc. item</th>
                                <th className="text-right px-3 py-2 font-medium w-[120px]">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {nota.itens.map((item) => (
                                <tr key={item.id} className="border-b border-border/20 align-top hover:bg-muted/20">
                                  <td className="px-4 py-2">
                                    {editing ? <Input value={item.descricao} onChange={(e) => updatePreviewItem(nota.id, item.id, 'descricao', e.target.value)} className="h-8 text-xs" /> : <span>{item.descricao}</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {editing ? <Input type="number" min="0" step="1" value={item.quantidade} onChange={(e) => updatePreviewItem(nota.id, item.id, 'quantidade', e.target.value)} className="h-8 text-xs text-center" /> : <p className="text-center">{item.quantidade}</p>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {editing ? <Input type="number" min="0" step="0.01" value={item.preco_unitario} onChange={(e) => updatePreviewItem(nota.id, item.id, 'preco_unitario', e.target.value)} className="h-8 text-xs text-right" /> : <p className="text-right">R$ {toMoney(item.preco_unitario)}</p>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {editing ? <Input type="number" min="0" max="100" step="0.01" value={item.desconto_porcentagem} onChange={(e) => updatePreviewItem(nota.id, item.id, 'desconto_porcentagem', e.target.value)} className="h-8 text-xs text-right" /> : <p className="text-right">{item.desconto_porcentagem > 0 ? `${item.desconto_porcentagem}%` : '—'}</p>}
                                  </td>
                                  <td className="text-right px-3 py-2 font-medium">R$ {toMoney(item.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

              <div className="border-t lg:border-t-0 lg:border-l bg-muted/20 p-5 space-y-4">
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
                <Button onClick={handleGerar} disabled={generating || !activeDraft} className="h-12 w-full text-sm font-semibold" size="lg">
                  {generating ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="mr-2 h-4 w-4" />}
                  Gerar fechamento
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templatePreviewOpen} onOpenChange={setTemplatePreviewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] h-[92vh] p-0 gap-0 sm:max-w-6xl">
          <DialogTitle className="sr-only">Visualização do template do fechamento</DialogTitle>
          <div className="flex h-full flex-col">
            <div className="border-b px-5 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Visualização</p>
              <h3 className="text-xl font-semibold mt-1">Template final do fechamento</h3>
              <p className="text-sm text-muted-foreground">
                Esta é a aparência de impressão e do PDF que ficará armazenado.
              </p>
            </div>
            <div className="flex-1 bg-muted/40">
              {modalPreviewDados ? (
                <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
                  <ClosingPDFTemplate dados={modalPreviewDados} geradoEm={modalPreviewDados.gerado_em} />
                </PDFViewer>
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
