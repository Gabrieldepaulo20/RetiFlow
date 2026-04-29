import { lazy, Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { STATUS_LABELS, STATUS_COLORS, NoteStatus, NOTE_STATUS_ORDER, IntakeNote } from '@/types';
import { PlusCircle, Search, Share2, Download, Eye, FileText, ClipboardList, SlidersHorizontal, Check, MoreHorizontal, Pencil, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import NoteDetailModal from '@/components/notes/NoteDetailModal';
import NoteFormModal from '@/components/notes/NoteFormModal';
import { noteMatchesNumericQuery } from '@/lib/noteNumbers';
import { cn } from '@/lib/utils';
import { buildWhatsAppUrl, openExternalUrl } from '@/lib/browserShare';
import { format } from 'date-fns';
import {
  getNotaPDFSignedUrl,
  getNotaServicoDetalhes,
  updateNotaPdfUrl,
  uploadNotaPDF,
  type NotaServicoDetalhes,
} from '@/api/supabase/notas';
import { generateNotaPdfBlob } from '@/lib/notaPdf';
import { useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
const OSPreviewModal = lazy(() => import('@/components/OSPreviewModal'));

function initStatusFilters(searchParams: URLSearchParams): Set<string> {
  const raw = searchParams.get('status');
  if (!raw) return new Set();
  return new Set(raw.split(',').filter(Boolean));
}

export default function IntakeNotes() {
  const { notes, clients, getServicesForNote, getProductsForNote } = useData();
  const { toast } = useToast();
  const { data: templateSettings } = useDocumentTemplateSettings();
  const [urlParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [statusFilters, setStatusFilters] = useState<Set<string>>(() => initStatusFilters(urlParams));
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);
  const [detailNoteId, setDetailNoteId] = useState<string | null>(null);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<IntakeNote | null>(null);
  const [resolvingPdfNoteId, setResolvingPdfNoteId] = useState<string | null>(null);
  const [previewDetalhes, setPreviewDetalhes] = useState<NotaServicoDetalhes | null>(null);
  const [previewDetalhesLoading, setPreviewDetalhesLoading] = useState(false);

  const toggleStatusFilter = (key: string) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const allStatuses: Array<{ key: NoteStatus; label: string }> = NOTE_STATUS_ORDER.map(s => ({
    key: s,
    label: STATUS_LABELS[s],
  }));
  const monthOptions = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notes.forEach(n => { counts[n.status] = (counts[n.status] || 0) + 1; });
    return counts;
  }, [notes]);

  const activeClients = useMemo(
    () => clients.filter((client) => client.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const availableYears = useMemo(() => {
    return Array.from(
      new Set(notes.map((note) => new Date(note.createdAt).getFullYear().toString())),
    ).sort((a, b) => Number(b) - Number(a));
  }, [notes]);

  const filtered = useMemo(() => {
    return notes.filter(n => {
      if (statusFilters.size > 0 && !statusFilters.has(n.status)) return false;
      if (clientFilter !== 'all' && n.clientId !== clientFilter) return false;

      const noteDate = new Date(n.createdAt);
      const noteMonth = `${noteDate.getMonth() + 1}`.padStart(2, '0');
      const noteYear = noteDate.getFullYear().toString();

      if (monthFilter !== 'all' && noteMonth !== monthFilter) return false;
      if (yearFilter !== 'all' && noteYear !== yearFilter) return false;

      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const client = clients.find(c => c.id === n.clientId);
        return noteMatchesNumericQuery(n.number, q) || client?.name.toLowerCase().includes(q) || false;
      }
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notes, debouncedSearch, statusFilters, clientFilter, monthFilter, yearFilter, clients]);

  const handleDownloadNotePDF = async (note: IntakeNote) => {
    setResolvingPdfNoteId(note.id);
    try {
      if (note.pdfUrl) {
        const url = await getNotaPDFSignedUrl(note.pdfUrl);
        if (!url) {
          throw new Error('Não foi possível preparar o link seguro do PDF salvo.');
        }

        const link = document.createElement('a');
        link.href = url;
        link.download = `OS-${note.number}.pdf`;
        link.target = '_blank';
        link.click();
        return;
      }

      const detalhes = await getNotaServicoDetalhes(note.id);
      if (!detalhes) {
        throw new Error('Não foi possível carregar os dados atuais da O.S.');
      }

      const blob = await generateNotaPdfBlob(detalhes, templateSettings ? {
        accentColor: templateSettings.corDocumento,
        templateMode: templateSettings.osModelo,
      } : undefined);
      const path = await uploadNotaPDF(blob, note.number);
      await updateNotaPdfUrl(note.id, path);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `OS-${note.number}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast({
        title: 'PDF gerado',
        description: 'A O.S. foi gerada, salva no Supabase e baixada.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível baixar a nota',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setResolvingPdfNoteId(null);
    }
  };

  const handleOpenPreview = async (note: IntakeNote) => {
    setPreviewNoteId(note.id);
    setPreviewDetalhes(null);

    if (!IS_REAL_AUTH) return;

    setPreviewDetalhesLoading(true);
    try {
      const detalhes = await getNotaServicoDetalhes(note.id);
      if (detalhes) {
        setPreviewDetalhes(detalhes);
        return;
      }

      toast({
        title: 'Prévia com dados locais',
        description: 'Não foi possível carregar os serviços completos do banco agora.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível carregar a prévia completa',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setPreviewDetalhesLoading(false);
    }
  };

  const exportFilteredNotes = async () => {
    if (filtered.length === 0) {
      toast({
        title: 'Nada para exportar',
        description: 'Ajuste os filtros para exportar alguma nota.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const rows = filtered.map((note) => {
        const client = clients.find((item) => item.id === note.clientId);

        return {
          'O.S.': note.number,
          Cliente: client?.name ?? 'Cliente não encontrado',
          Documento: client?.docNumber ?? '',
          Tipo: note.type,
          Status: STATUS_LABELS[note.status as NoteStatus],
          Data: format(new Date(note.createdAt), 'dd/MM/yyyy'),
          Veiculo: note.vehicleModel,
          Motor: note.engineType ?? '',
          Placa: note.plate ?? '',
          KM: note.km ?? '',
          'Observação interna': note.observations ?? '',
          'Valor Total': note.totalAmount,
        };
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Notas');
      XLSX.writeFile(workbook, `notas-entrada-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.xlsx`);

      toast({
        title: 'Exportação concluída',
        description: `${filtered.length} nota(s) exportada(s) em XLSX.`,
      });
    } catch (error) {
      toast({
        title: 'Exportação XLSX indisponível',
        description: 'Ainda falta habilitar a biblioteca de Excel neste ambiente.',
        variant: 'destructive',
      });
    }
  };

  const previewNote = previewNoteId ? notes.find(n => n.id === previewNoteId) : null;
  const previewClient = previewNote ? clients.find(c => c.id === previewNote.clientId) : undefined;
  const previewServices = previewNote ? getServicesForNote(previewNote.id) : [];
  const previewProducts = previewNote ? getProductsForNote(previewNote.id) : [];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">Notas de Entrada</h1>
              <p className="text-muted-foreground text-sm">{filtered.length} de {notes.length} ordens de serviço</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shadow-sm font-semibold gap-2">
                  <Download className="w-4 h-4" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportFilteredNotes()}>
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Excel (.xlsx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              className="shadow-sm font-semibold gap-2"
              onClick={() => setNewNoteOpen(true)}
            >
              <PlusCircle className="w-4 h-4" /> Nova O.S.
            </Button>
          </div>
        </div>

        {/* Search + Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,0.9fr)_repeat(4,minmax(0,0.72fr))] xl:items-center">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por O.S. ou cliente..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-10 bg-muted/40 border-border/50 focus:bg-background transition-colors"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:contents">
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os clientes</SelectItem>
                    {activeClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os meses</SelectItem>
                    {monthOptions.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os anos</SelectItem>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'h-10 w-full justify-between bg-background min-w-0',
                        statusFilters.size > 0 && 'border-primary/40 text-primary',
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <SlidersHorizontal className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          {statusFilters.size === 0
                            ? 'Filtrar por status'
                            : statusFilters.size === 1
                              ? allStatuses.find(s => statusFilters.has(s.key))?.label
                              : `${statusFilters.size} status`}
                        </span>
                      </span>
                      {statusFilters.size > 0 && (
                        <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none tabular-nums">
                          {statusFilters.size}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[260px] p-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                        <div>
                          <p className="text-xs font-semibold text-foreground">Status</p>
                          <p className="text-[11px] text-muted-foreground">Selecione um ou mais</p>
                        </div>
                        {statusFilters.size > 0 && (
                          <button
                            onClick={() => setStatusFilters(new Set())}
                            className="text-[11px] text-primary hover:underline font-medium"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                      {allStatuses.map(status => {
                        const active = statusFilters.has(status.key);
                        return (
                          <button
                            key={status.key}
                            onClick={() => toggleStatusFilter(status.key)}
                            className={cn(
                              'w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors',
                              active ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-muted text-foreground',
                            )}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              {active && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />}
                              {!active && <span className="w-3.5 h-3.5 shrink-0" />}
                              <span className="truncate">{status.label}</span>
                            </span>
                            <span className={cn(
                              'text-xs tabular-nums',
                              active ? 'text-emerald-600 font-semibold' : 'text-muted-foreground',
                            )}>
                              {statusCounts[status.key] || 0}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Active filter badges */}
            <div className="flex items-center gap-2 flex-wrap min-h-5">
              {statusFilters.size === 0 && clientFilter === 'all' && monthFilter === 'all' && yearFilter === 'all' ? (
                <span className="text-xs text-muted-foreground">Sem filtros ativos</span>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">Filtros:</span>
                  {[...statusFilters].map(s => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="gap-1.5 px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border-emerald-200/60 cursor-pointer hover:bg-emerald-100"
                      onClick={() => toggleStatusFilter(s)}
                    >
                      {STATUS_LABELS[s as NoteStatus]}
                    </Badge>
                  ))}
                  {clientFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 rounded-full text-xs">
                      {clients.find((client) => client.id === clientFilter)?.name ?? 'Cliente'}
                    </Badge>
                  )}
                  {monthFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 rounded-full text-xs">
                      {monthOptions.find((month) => month.value === monthFilter)?.label ?? `Mês ${monthFilter}`}
                    </Badge>
                  )}
                  {yearFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 rounded-full text-xs">
                      Ano {yearFilter}
                    </Badge>
                  )}
                  <button
                    onClick={() => {
                      setStatusFilters(new Set());
                      setClientFilter('all');
                      setMonthFilter('all');
                      setYearFilter('all');
                    }}
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    Limpar tudo
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-semibold text-[13px]">O.S.</TableHead>
                  <TableHead className="font-semibold text-[13px]">Cliente</TableHead>
                  <TableHead className="font-semibold text-[13px] hidden sm:table-cell">Data</TableHead>
                  <TableHead className="font-semibold text-[13px]">Status</TableHead>
                  <TableHead className="font-semibold text-[13px] text-right hidden md:table-cell">
                    Valor Total
                  </TableHead>
                  <TableHead className="font-semibold text-[13px] text-right w-[76px]">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(n => {
                  const client = clients.find(c => c.id === n.clientId);
                  return (
                    <TableRow
                      key={n.id}
                      className="group transition-colors duration-100 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setDetailNoteId(n.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {/* Styled as link, but opens modal (row click handles it) */}
                          <span className="font-bold text-primary text-[15px]">
                            {n.number}
                          </span>
                          <span
                            className={cn(
                              'text-[9px] font-semibold px-1.5 py-0.5 rounded border',
                              n.type === 'COMPRA'
                                ? 'bg-amber-50 text-amber-600 border-amber-200/60'
                                : 'bg-blue-50 text-blue-600 border-blue-200/60',
                            )}
                          >
                            {n.type === 'COMPRA' ? 'COMPRA' : 'SERVIÇO'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <p className="font-medium truncate">{client?.name}</p>
                        {n.vehicleModel && (
                          <p className="text-xs text-muted-foreground truncate">
                            {n.vehicleModel}
                            {n.plate ? ` · ${n.plate}` : ''}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground tabular-nums">
                        {new Date(n.createdAt).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            STATUS_COLORS[n.status as NoteStatus],
                            'text-[11px] font-medium shadow-none',
                          )}
                        >
                          {STATUS_LABELS[n.status as NoteStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold hidden md:table-cell tabular-nums">
                        R$ {n.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={e => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-8 h-8 rounded-lg hover:bg-muted"
                              aria-label={`Mais ações para ${n.number}`}
                              title="Mais ações"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setDetailNoteId(n.id)}>
                              <Eye className="w-4 h-4 mr-2" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingNote(n)}>
                              <Pencil className="w-4 h-4 mr-2" /> Editar nota
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleOpenPreview(n)}>
                              <FileText className="w-4 h-4 mr-2" /> Preview do documento
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={resolvingPdfNoteId === n.id}
                              onClick={() => void handleDownloadNotePDF(n)}
                            >
                              <Download className="w-4 h-4 mr-2" /> Baixar nota
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                const url = buildWhatsAppUrl(
                                  client?.phone,
                                  [
                                    `Olá, ${client?.name ?? 'cliente'}!`,
                                    `Segue atualização da O.S. ${n.number}.`,
                                    n.pdfUrl ? 'O PDF da O.S. está disponível no sistema.' : null,
                                  ].filter(Boolean).join('\n'),
                                );

                                if (!url) {
                                  toast({
                                    title: 'Telefone não informado',
                                    description: 'Cadastre um telefone/WhatsApp no cliente antes de compartilhar.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }

                                openExternalUrl(url);
                              }}
                            >
                              <Share2 className="w-4 h-4 mr-2" /> Compartilhar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-muted-foreground font-medium">
                          Nenhuma O.S. encontrada
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setNewNoteOpen(true)}
                        >
                          <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> Criar nova O.S.
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Note detail modal (opens on row click) */}
        <NoteDetailModal
          noteId={detailNoteId}
          onClose={() => setDetailNoteId(null)}
        />

        {/* New note form modal */}
        <NoteFormModal
          open={newNoteOpen}
          onClose={() => setNewNoteOpen(false)}
        />

        {/* Edit note form modal */}
        <NoteFormModal
          open={!!editingNote}
          onClose={() => setEditingNote(null)}
          editingNote={editingNote ?? undefined}
        />

        {/* Document preview modal (opens on Eye button) */}
        {previewNote && (
          <Suspense fallback={null}>
            <OSPreviewModal
              open={!!previewNoteId}
              onClose={() => {
                setPreviewNoteId(null);
                setPreviewDetalhes(null);
                setPreviewDetalhesLoading(false);
              }}
              note={previewNote}
              client={previewClient}
              services={previewServices}
              products={previewProducts}
              dados={previewDetalhes}
              loadingDados={previewDetalhesLoading}
            />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}
