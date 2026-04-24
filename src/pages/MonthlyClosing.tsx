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
import { pdf } from '@react-pdf/renderer';
import { ClosingPDFTemplate } from '@/components/closing/ClosingPDFTemplate';
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

const toMoney = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const recalcItemSubtotal = (item: PreviewNote['itens'][number]) => {
  const bruto = Math.max(0, item.quantidade) * Math.max(0, item.preco_unitario);
  return bruto * (1 - clampPercent(item.desconto_porcentagem) / 100);
};

const recalcNoteTotal = (items: PreviewNote['itens']) =>
  items.reduce((sum, item) => sum + recalcItemSubtotal(item), 0);

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
  const [mode, setMode] = useState<'list' | 'preview'>('list');
  const [fechamentos, setFechamentos] = useState<FechamentoListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

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
  const [showPDFPreview, setShowPDFPreview] = useState(false);
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

  /* ── Build preview ── */
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
    setMode('preview');
    setLoadingPreview(false);
  }, [selClientId, selMonth, selYear, notes, toast]);

  /* ── Computed totals ── */
  const totals = useMemo(() => {
    return previewNotes.map((n) => {
      const disc = descontos[n.id] ?? 0;
      return { id: n.id, totalBruto: n.total, totalComDesconto: n.total * (1 - disc / 100) };
    });
  }, [previewNotes, descontos]);

  const grandTotal = useMemo(() => totals.reduce((a, b) => a + b.totalComDesconto, 0), [totals]);
  const grandTotalOriginal = useMemo(() => totals.reduce((a, n) => a + n.totalBruto, 0), [totals]);

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
  const handleGerar = useCallback(async () => {
    const client = clients.find((c) => c.id === selClientId);
    if (!client) return;

    setGenerating(true);
    try {
      const geradoEm = new Date().toISOString();
      const mesNum = parseInt(selMonth);
      const periodo = `${MONTHS[mesNum - 1]} ${selYear}`;

      const notasDados: FechamentoNota[] = previewNotes.map((n) => {
        const disc = descontos[n.id] ?? 0;
        const totalOriginalNota = recalcNoteTotal(n.itens);
        return {
          id: n.id,
          os: n.os,
          veiculo: n.veiculo,
          placa: n.placa,
          itens: n.itens,
          total_original: totalOriginalNota,
          desconto_nota: disc,
          total_com_desconto: totalOriginalNota * (1 - disc / 100),
        };
      });

      const dados: FechamentoDadosJson = {
        gerado_em: geradoEm,
        periodo,
        cliente: { id: client.id, nome: client.name },
        notas: notasDados,
        total_original: grandTotalOriginal,
        total_com_desconto: grandTotal,
      };

      // 1. Insert fechamento header
      const idFechamento = await insertFechamento({
        p_fk_clientes: client.id,
        p_mes: MONTHS[mesNum - 1],
        p_ano: parseInt(selYear),
        p_periodo: periodo,
        p_label: `Fechamento ${periodo} — ${client.name}`,
        p_valor_total: grandTotal,
      });

      // 2. Save snapshot
      await updateFechamento(idFechamento, { p_dados_json: dados });

      // 3. Generate PDF
      let pdfUrl: string | null = null;
      try {
        const blob = await pdf(<ClosingPDFTemplate dados={dados} geradoEm={geradoEm} />).toBlob();
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
          p_mensagem: `PDF gerado. Total: R$ ${grandTotal.toFixed(2)}`,
        });
      } catch { /* non-blocking */ }

      toast({ title: 'Fechamento gerado com sucesso!' });
      setPreviewDados(dados);
      await loadFechamentos();
      setMode('list');
    } catch (err) {
      toast({ title: 'Erro ao gerar fechamento', description: String(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [clients, selClientId, selMonth, selYear, previewNotes, descontos, grandTotal, grandTotalOriginal, toast, loadFechamentos]);

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

  /* ──────────────────── LIST VIEW ──────────────────── */
  if (mode === 'list') {
    return (
      <div className="space-y-5 overflow-x-hidden">
        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Fechamento Mensal</h1>
            <p className="text-muted-foreground text-sm">Gere e gerencie fechamentos por cliente e período</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadFechamentos} disabled={loadingList}>
              <RefreshCcw className={cn('w-4 h-4 mr-2', loadingList && 'animate-spin')} />
              Atualizar
            </Button>
            <Button onClick={() => setMode('preview')}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Fechamento
            </Button>
          </div>
        </div>

        <Alert>
          <CalendarDays className="h-4 w-4" />
          <AlertDescription>O fechamento normalmente é realizado até o dia 10 do mês seguinte.</AlertDescription>
        </Alert>

        {/* Filters for new closing */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Novo fechamento rápido</p>
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
              <Button onClick={handleBuildPreview} disabled={loadingPreview || !selClientId}>
                {loadingPreview ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                Visualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Fechamentos list */}
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

                        {/* Divergence alerts */}
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

                      {/* Actions */}
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
    );
  }

  /* ──────────────────── PREVIEW / GENERATE VIEW ──────────────────── */
  const client = clients.find((c) => c.id === selClientId);
  const periodo = `${MONTHS[parseInt(selMonth) - 1]} ${selYear}`;

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-5 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setMode('list')} className="shrink-0" disabled={generating}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-display font-bold">Prévia do Fechamento</h1>
          <p className="text-sm text-muted-foreground">{client?.name ?? '—'} · {periodo}</p>
        </div>
      </div>

      {/* Generation spinner overlay */}
      {generating && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <DualSpinner />
          <p className="text-sm font-medium text-muted-foreground">Gerando fechamento e PDF...</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] min-w-0 items-start">
        <div className="min-w-0 space-y-4">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2 min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Prévia local do fechamento
                  </div>
                  <h2 className="text-2xl font-display font-bold leading-tight">
                    Revise, ajuste os serviços e gere quando estiver tudo certo
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-2xl">
                    A visualização abaixo ainda está só no front-end. Você pode editar valores, descontos e itens do fechamento antes de realmente gerar o registro.
                  </p>
                </div>

                <div className="rounded-2xl border bg-background/90 p-4 shadow-sm min-w-[260px]">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Resumo</p>
                  <p className="mt-2 text-sm text-muted-foreground">{previewNotes.length} O.S. · {periodo}</p>
                  <p className="mt-1 text-3xl font-bold text-primary">R$ {toMoney(grandTotal)}</p>
                  {grandTotalOriginal !== grandTotal && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Bruto: R$ {toMoney(grandTotalOriginal)} · Ajustes: −R$ {toMoney(grandTotalOriginal - grandTotal)}
                    </p>
                  )}
                  <Button
                    onClick={handleGerar}
                    disabled={generating || previewNotes.length === 0}
                    className="mt-4 h-12 w-full text-sm font-semibold"
                    size="lg"
                  >
                    {generating ? (
                      <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUpFromLine className="mr-2 h-4 w-4" />
                    )}
                    Gerar Fechamento
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b bg-muted/30 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">Ordens de serviço incluídas</p>
                  <p className="text-xs text-muted-foreground">
                    Todas ficam listadas em sequência. Você pode rolar e editar serviço por serviço antes de gerar.
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">{previewNotes.length} O.S.</Badge>
              </div>
            </div>

            <CardContent className="p-0">
              <div className="max-h-[68vh] overflow-y-auto">
                <div className="space-y-4 p-4 sm:p-5">
                  {previewNotes.map((nota) => {
                    const disc = descontos[nota.id] ?? 0;
                    const totalBrutoNota = nota.total;
                    const totalComDesc = totalBrutoNota * (1 - disc / 100);
                    const editing = editingItems[nota.id] ?? true;

                    return (
                      <Card key={nota.id} className="overflow-hidden border-border/70">
                        <div className="bg-muted/40 border-b border-border/50 px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{nota.os}</p>
                              <Badge variant="outline" className="text-[10px]">Rascunho editável</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {nota.veiculo}{nota.placa ? ` · ${nota.placa}` : ''} · Atualizada em {new Date(nota.updatedAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => setEditingItems((prev) => ({ ...prev, [nota.id]: !editing }))}
                            >
                              {editing ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <PencilLine className="mr-1.5 h-3.5 w-3.5" />}
                              {editing ? 'Recolher edição' : 'Editar itens'}
                            </Button>
                            <div className="text-right">
                              <p className="text-[11px] text-muted-foreground">Total da O.S.</p>
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
                                {nota.itens.map((item, i) => (
                                  <tr key={item.id} className="border-b border-border/20 align-top hover:bg-muted/20">
                                    <td className="px-4 py-2">
                                      {editing ? (
                                        <Input
                                          value={item.descricao}
                                          onChange={(e) => updatePreviewItem(nota.id, item.id, 'descricao', e.target.value)}
                                          className="h-8 text-xs"
                                        />
                                      ) : (
                                        <span>{item.descricao}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {editing ? (
                                        <Input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={item.quantidade}
                                          onChange={(e) => updatePreviewItem(nota.id, item.id, 'quantidade', e.target.value)}
                                          className="h-8 text-xs text-center"
                                        />
                                      ) : (
                                        <p className="text-center">{item.quantidade}</p>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {editing ? (
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={item.preco_unitario}
                                          onChange={(e) => updatePreviewItem(nota.id, item.id, 'preco_unitario', e.target.value)}
                                          className="h-8 text-xs text-right"
                                        />
                                      ) : (
                                        <p className="text-right">R$ {toMoney(item.preco_unitario)}</p>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {editing ? (
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.01"
                                          value={item.desconto_porcentagem}
                                          onChange={(e) => updatePreviewItem(nota.id, item.id, 'desconto_porcentagem', e.target.value)}
                                          className="h-8 text-xs text-right"
                                        />
                                      ) : (
                                        <p className="text-right">{item.desconto_porcentagem > 0 ? `${item.desconto_porcentagem}%` : '—'}</p>
                                      )}
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
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={descontos[nota.id] ?? ''}
                                onChange={(e) => setDescontos((prev) => ({ ...prev, [nota.id]: parseFloat(e.target.value) || 0 }))}
                                placeholder="0"
                                className="w-20 h-8 text-xs text-center"
                              />
                              <span>%</span>
                            </div>
                            <div className="text-right text-xs">
                              {disc > 0 && (
                                <p className="text-muted-foreground">
                                  Base editada: R$ {toMoney(totalBrutoNota)} · −{disc}%
                                </p>
                              )}
                              <p className="font-bold">R$ {toMoney(totalComDesc)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-4 space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Ação final</p>
              <h3 className="mt-2 text-lg font-semibold">Gerar fechamento definitivo</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Quando clicar em gerar, o sistema usa exatamente os valores mostrados nesta prévia, inclusive os ajustes feitos nos serviços.
              </p>
              <Button
                onClick={handleGerar}
                disabled={generating || previewNotes.length === 0}
                className="mt-5 h-14 w-full text-base font-semibold"
                size="lg"
              >
                {generating ? (
                  <RefreshCcw className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <ArrowUpFromLine className="mr-2 h-5 w-5" />
                )}
                Gerar
              </Button>
              <Button variant="outline" onClick={() => setMode('list')} disabled={generating} className="mt-2 w-full">
                Voltar sem gerar
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Resumo rápido</p>
                <p className="mt-1 text-sm font-medium">{client?.name ?? '—'}</p>
                <p className="text-sm text-muted-foreground">{periodo}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">{previewNotes.length} O.S. selecionadas</p>
                <p className="mt-1 text-2xl font-bold text-primary">R$ {toMoney(grandTotal)}</p>
                {grandTotalOriginal !== grandTotal && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Antes dos ajustes: R$ {toMoney(grandTotalOriginal)}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>1. Visualizar só monta a prévia.</p>
                <p>2. Editar itens aqui não altera o banco ainda.</p>
                <p>3. Gerar usa o rascunho atual para montar o fechamento.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
