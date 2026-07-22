import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useOperationalData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { STATUS_LABELS, STATUS_COLORS, NoteStatus, NOTE_STATUS_ORDER, BILLABLE_STATUSES, IntakeNote } from '@/types';
import { getNoteStatusIcon } from '@/lib/noteStatusIcon';
import {
  PlusCircle, Search, Share2, Download, Eye, FileText, ClipboardList,
  SlidersHorizontal, Check, MoreHorizontal, Pencil, FileSpreadsheet,
  CalendarDays, CarFront, Gauge, Banknote, Clock3,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import NoteDetailModal from '@/components/notes/NoteDetailModal';
import NoteFormModal from '@/components/notes/NoteFormModal';
import { noteMatchesNumericQuery } from '@/lib/noteNumbers';
import { cn } from '@/lib/utils';
import { buildWhatsAppUrl, openExternalUrl } from '@/lib/browserShare';
import { format, startOfMonth, subDays } from 'date-fns';
import { downloadCsv, toCsv, type CsvRow } from '@/lib/csv';
import {
  getNotaPDFSignedUrl,
  getNotasServico,
  getStatusNotas,
  getNotaServicoDetalhes,
  buildStatusIdMap,
  supabaseToIntakeNote,
  updateNotaPdfUrl,
  uploadNotaPDF,
  type NotaServicoDetalhes,
} from '@/api/supabase/notas';
import { generateNotaPdfBlob } from '@/lib/notaPdf';
import { useDocumentCustomization, useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import { createPdfPreviewWindow, openPdfInBrowser } from '@/lib/printPdf';
import {
  calculateIntakeNotesSummary,
  compareIntakeNotes,
  DEFAULT_INTAKE_NOTE_SORT_DIRECTION,
  DEFAULT_INTAKE_NOTE_SORT_FIELD,
  getCurrentIntakeMonthInput,
  getIntakeMonthRange,
  getIntakeNoteSortLabel,
  INTAKE_NOTE_MONTHS,
  isIntakeNoteInValueRange,
  normalizeIntakeNoteValueRange,
  type IntakeNoteSortDirection,
  type IntakeNoteSortField,
} from '@/services/domain/intakeNotesList';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
const OSPreviewModal = lazy(() => import('@/components/OSPreviewModal'));
const NOTES_PAGE_SIZE = 50;
type NoteDatePreset = 'all' | 'today' | '7d' | '30d' | 'thisMonth' | 'month' | 'custom';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function initStatusFilters(searchParams: URLSearchParams): Set<string> {
  const raw = searchParams.get('status');
  if (!raw) return new Set();
  return new Set(raw.split(',').filter(Boolean));
}

function parseDateFilterInput(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export default function IntakeNotes() {
  const { notes, clients, getServicesForNote, getProductsForNote } = useOperationalData();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: templateSettings } = useDocumentTemplateSettings();
  const { data: documentSettings } = useDocumentCustomization('entry_note');
  const [urlParams] = useSearchParams();
  const currentMonthInput = useMemo(() => getCurrentIntakeMonthInput(), []);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [statusFilters, setStatusFilters] = useState<Set<string>>(() => initStatusFilters(urlParams));
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<NoteDatePreset>('all');
  const [monthFilter, setMonthFilter] = useState(currentMonthInput);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'PAGO' | 'PENDENTE'>('all');
  const [minValueFilter, setMinValueFilter] = useState('');
  const [maxValueFilter, setMaxValueFilter] = useState('');
  const [customStartDate, setCustomStartDate] = useState(() => format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [sortField, setSortField] = useState<IntakeNoteSortField>(DEFAULT_INTAKE_NOTE_SORT_FIELD);
  const [sortDirection, setSortDirection] = useState<IntakeNoteSortDirection>(DEFAULT_INTAKE_NOTE_SORT_DIRECTION);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [draftStatusFilters, setDraftStatusFilters] = useState<Set<string>>(() => new Set(statusFilters));
  const [draftClientFilter, setDraftClientFilter] = useState(clientFilter);
  const [draftDatePreset, setDraftDatePreset] = useState<NoteDatePreset>(datePreset);
  const [draftMonthFilter, setDraftMonthFilter] = useState(monthFilter);
  const [draftPaymentFilter, setDraftPaymentFilter] = useState<'all' | 'PAGO' | 'PENDENTE'>(paymentFilter);
  const [draftMinValueFilter, setDraftMinValueFilter] = useState(minValueFilter);
  const [draftMaxValueFilter, setDraftMaxValueFilter] = useState(maxValueFilter);
  const [draftCustomStartDate, setDraftCustomStartDate] = useState(customStartDate);
  const [draftCustomEndDate, setDraftCustomEndDate] = useState(customEndDate);
  const [draftSortField, setDraftSortField] = useState<IntakeNoteSortField>(sortField);
  const [draftSortDirection, setDraftSortDirection] = useState<IntakeNoteSortDirection>(sortDirection);
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);
  const [detailNoteId, setDetailNoteId] = useState<string | null>(null);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<IntakeNote | null>(null);
  const [resolvingPdfNoteId, setResolvingPdfNoteId] = useState<string | null>(null);
  const [previewDetalhes, setPreviewDetalhes] = useState<NotaServicoDetalhes | null>(null);
  const [previewDetalhesLoading, setPreviewDetalhesLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const statusMapQuery = useQuery({
    queryKey: ['notas-servico', 'status-id-map'],
    queryFn: async () => buildStatusIdMap(await getStatusNotas({ p_tipo_nota: 'Serviço' })),
    enabled: IS_REAL_AUTH,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const toggleStatusFilter = (key: string) => {
    setStatusFilters(prev => {
      if (IS_REAL_AUTH) {
        return prev.has(key) ? new Set() : new Set([key]);
      }
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const syncDraftFilters = () => {
    setDraftStatusFilters(statusFilters.size === 1 ? new Set(statusFilters) : new Set());
    setDraftClientFilter(clientFilter);
    setDraftDatePreset(datePreset);
    setDraftMonthFilter(monthFilter);
    setDraftPaymentFilter(paymentFilter);
    setDraftMinValueFilter(minValueFilter);
    setDraftMaxValueFilter(maxValueFilter);
    setDraftCustomStartDate(customStartDate);
    setDraftCustomEndDate(customEndDate);
    setDraftSortField(sortField);
    setDraftSortDirection(sortDirection);
  };

  const handleFilterDialogOpenChange = (open: boolean) => {
    if (open) syncDraftFilters();
    setFilterDialogOpen(open);
  };

  const setDraftStatusFilter = (key: string) => {
    setDraftStatusFilters(key === 'all' ? new Set() : new Set([key]));
  };

  const resetDraftFilters = () => {
    setDraftStatusFilters(new Set());
    setDraftClientFilter('all');
    setDraftDatePreset('all');
    setDraftMonthFilter(currentMonthInput);
    setDraftPaymentFilter('all');
    setDraftMinValueFilter('');
    setDraftMaxValueFilter('');
    setDraftCustomStartDate(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
    setDraftCustomEndDate(format(new Date(), 'yyyy-MM-dd'));
    setDraftSortField(DEFAULT_INTAKE_NOTE_SORT_FIELD);
    setDraftSortDirection(DEFAULT_INTAKE_NOTE_SORT_DIRECTION);
  };

  const applyDraftFilters = () => {
    setStatusFilters(new Set(draftStatusFilters));
    setClientFilter(draftClientFilter);
    setDatePreset(draftDatePreset);
    setMonthFilter(draftMonthFilter);
    setPaymentFilter(draftPaymentFilter);
    setMinValueFilter(draftMinValueFilter);
    setMaxValueFilter(draftMaxValueFilter);
    setCustomStartDate(draftCustomStartDate);
    setCustomEndDate(draftCustomEndDate);
    setSortField(draftSortField);
    setSortDirection(draftSortDirection);
    setCurrentPage(1);
    setFilterDialogOpen(false);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilters, clientFilter, datePreset, monthFilter, paymentFilter, minValueFilter, maxValueFilter, customStartDate, customEndDate, sortField, sortDirection]);

  const allStatuses: Array<{ key: NoteStatus; label: string }> = NOTE_STATUS_ORDER.map(s => ({
    key: s,
    label: STATUS_LABELS[s],
  }));
  const dateRange = useMemo(() => {
    const today = new Date();
    const build = (start: Date, end: Date, label: string) => ({
      start,
      end,
      startInput: format(start, 'yyyy-MM-dd'),
      endInput: format(end, 'yyyy-MM-dd'),
      label,
    });

    if (datePreset === 'today') {
      return build(today, today, 'Hoje');
    }

    if (datePreset === '7d') {
      return build(subDays(today, 6), today, 'Últimos 7 dias');
    }

    if (datePreset === '30d') {
      return build(subDays(today, 29), today, 'Últimos 30 dias');
    }

    if (datePreset === 'thisMonth') {
      return build(startOfMonth(today), today, `Este mês até ${format(today, 'dd/MM')}`);
    }

    if (datePreset === 'month') {
      const monthRange = getIntakeMonthRange(monthFilter) ?? getIntakeMonthRange(currentMonthInput);
      if (monthRange) {
        return {
          ...monthRange,
        };
      }
    }

    if (datePreset === 'custom') {
      const parsedStart = parseDateFilterInput(customStartDate) ?? subDays(today, 29);
      const parsedEnd = parseDateFilterInput(customEndDate) ?? today;
      const start = parsedStart.getTime() <= parsedEnd.getTime() ? parsedStart : parsedEnd;
      const end = parsedStart.getTime() <= parsedEnd.getTime() ? parsedEnd : parsedStart;
      return build(start, end, `${format(start, 'dd/MM/yyyy')} até ${format(end, 'dd/MM/yyyy')}`);
    }

    return {
      start: null,
      end: null,
      startInput: undefined,
      endInput: undefined,
      label: 'Todo o período',
    };
  }, [currentMonthInput, customEndDate, customStartDate, datePreset, monthFilter]);
  const valueRange = useMemo(
    () => normalizeIntakeNoteValueRange(minValueFilter, maxValueFilter),
    [minValueFilter, maxValueFilter],
  );
  const hasValueFilter = valueRange.min !== undefined || valueRange.max !== undefined;

  const datePresetOptions: Array<{ value: NoteDatePreset; label: string }> = [
    { value: 'all', label: 'Todo período' },
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: '7 dias' },
    { value: '30d', label: '30 dias' },
    { value: 'thisMonth', label: 'Este mês' },
    { value: 'month', label: 'Escolher mês' },
    { value: 'custom', label: 'Personalizado' },
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
  const availableFilterYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>(
      Array.from({ length: 7 }, (_, index) => currentYear - index),
    );
    notes.forEach((note) => {
      const year = new Date(note.createdAt).getFullYear();
      if (Number.isFinite(year)) years.add(year);
    });
    return [...years].sort((a, b) => b - a);
  }, [notes]);
  const draftMonthParts = /^(\d{4})-(\d{2})$/.exec(draftMonthFilter);
  const draftMonthYear = draftMonthParts?.[1] ?? currentMonthInput.slice(0, 4);
  const draftMonthValue = draftMonthParts?.[2] ?? currentMonthInput.slice(5, 7);
  const draftStatusValue = draftStatusFilters.size === 1
    ? ([...draftStatusFilters][0] as NoteStatus)
    : 'all';
  const updateDraftMonthFilter = (year: string, month: string) => {
    setDraftMonthFilter(`${year}-${month}`);
  };

  const selectedStatus = statusFilters.size === 1
    ? ([...statusFilters][0] as NoteStatus)
    : null;
  const selectedStatusId = selectedStatus ? statusMapQuery.data?.get(selectedStatus) : undefined;
  const statusFiltersAppliedLocally = !IS_REAL_AUTH || statusFilters.size <= 1;
  const effectiveStatusFilters = useMemo(
    () => statusFiltersAppliedLocally ? statusFilters : new Set<string>(),
    [statusFilters, statusFiltersAppliedLocally],
  );
  const isServerPaginationActive = IS_REAL_AUTH
    && paymentFilter === 'all'
    && !hasValueFilter
    && statusFilters.size <= 1
    && (!selectedStatus || selectedStatusId !== undefined);

  const serverNotesQuery = useQuery({
    queryKey: [
      'notas-servico',
      'page',
      currentPage,
      debouncedSearch,
      clientFilter,
      selectedStatus,
      selectedStatusId,
      dateRange.startInput,
      dateRange.endInput,
      sortField,
      sortDirection,
    ],
    queryFn: async () => {
      const { dados, total } = await getNotasServico({
        p_limite: NOTES_PAGE_SIZE,
        p_offset: (currentPage - 1) * NOTES_PAGE_SIZE,
        p_busca: debouncedSearch || undefined,
        p_fk_clientes: clientFilter !== 'all' ? clientFilter : undefined,
        p_fk_status: selectedStatusId,
        p_data_inicio: dateRange.startInput,
        p_data_fim: dateRange.endInput,
        p_ordem_campo: sortField,
        p_ordem_direcao: sortDirection,
      });

      return {
        notes: dados.map(supabaseToIntakeNote),
        total,
      };
    },
    enabled: isServerPaginationActive,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  const sourceNotes = useMemo(
    () => isServerPaginationActive ? (serverNotesQuery.data?.notes ?? []) : notes,
    [isServerPaginationActive, notes, serverNotesQuery.data?.notes],
  );
  const serverTotal = IS_REAL_AUTH
    ? (serverNotesQuery.data?.total ?? 0)
    : notes.length;

  const filterNotes = useCallback((items: IntakeNote[]) => {
    return items.filter(n => {
      if (effectiveStatusFilters.size > 0 && !effectiveStatusFilters.has(n.status)) return false;
      if (clientFilter !== 'all' && n.clientId !== clientFilter) return false;
      if (paymentFilter !== 'all') {
        if (!BILLABLE_STATUSES.has(n.status) || n.paymentStatus !== paymentFilter) return false;
      }
      if (!isIntakeNoteInValueRange(n, valueRange)) return false;

      if (dateRange.start && dateRange.end) {
        const noteDate = new Date(n.createdAt);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        if (noteDate.getTime() < start.getTime() || noteDate.getTime() > end.getTime()) return false;
      }

      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const client = clients.find(c => c.id === n.clientId);
        return noteMatchesNumericQuery(n.number, q) || client?.name.toLowerCase().includes(q) || false;
      }
      return true;
    });
  }, [clients, clientFilter, dateRange, debouncedSearch, effectiveStatusFilters, paymentFilter, valueRange]);

  const filtered = useMemo(() => {
    return filterNotes(sourceNotes)
      .sort((a, b) => compareIntakeNotes(a, b, sortField, sortDirection));
  }, [filterNotes, sourceNotes, sortField, sortDirection]);

  const summaryFiltered = useMemo(() => {
    const summarySource = IS_REAL_AUTH ? notes : sourceNotes;
    return filterNotes(summarySource);
  }, [filterNotes, sourceNotes, notes]);

  const paginatedNotes = useMemo(() => {
    if (isServerPaginationActive) return filtered;
    const start = (currentPage - 1) * NOTES_PAGE_SIZE;
    return filtered.slice(start, start + NOTES_PAGE_SIZE);
  }, [currentPage, filtered, isServerPaginationActive]);

  const totalForPagination = isServerPaginationActive
    ? serverTotal
    : filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalForPagination / NOTES_PAGE_SIZE));
  const activeFilterCount =
    statusFilters.size +
    (clientFilter !== 'all' ? 1 : 0) +
    (datePreset !== 'all' ? 1 : 0) +
    (paymentFilter !== 'all' ? 1 : 0) +
    (hasValueFilter ? 1 : 0) +
    (sortField !== DEFAULT_INTAKE_NOTE_SORT_FIELD || sortDirection !== DEFAULT_INTAKE_NOTE_SORT_DIRECTION ? 1 : 0);
  const clearAllFilters = () => {
    setStatusFilters(new Set());
    setClientFilter('all');
    setDatePreset('all');
    setMonthFilter(currentMonthInput);
    setPaymentFilter('all');
    setMinValueFilter('');
    setMaxValueFilter('');
    setSortField(DEFAULT_INTAKE_NOTE_SORT_FIELD);
    setSortDirection(DEFAULT_INTAKE_NOTE_SORT_DIRECTION);
    setCurrentPage(1);
  };
  const isLoadingNotesPage = IS_REAL_AUTH && serverNotesQuery.isFetching;
  const hasUnsupportedMultiStatusFilter = IS_REAL_AUTH && statusFilters.size > 1;
  const notesSummary = useMemo(
    () => calculateIntakeNotesSummary(summaryFiltered),
    [summaryFiltered],
  );
  const summaryCards = [
    {
      label: 'O.S. filtradas',
      value: notesSummary.totalCount.toLocaleString('pt-BR'),
      sub: `${paginatedNotes.length} nesta página`,
      icon: ClipboardList,
      tone: 'text-primary bg-primary/10',
    },
    {
      label: 'Em andamento',
      value: notesSummary.activeCount.toLocaleString('pt-BR'),
      sub: 'O.S. ainda acionáveis',
      icon: Clock3,
      tone: notesSummary.activeCount > 0 ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Faturáveis',
      value: notesSummary.billableCount.toLocaleString('pt-BR'),
      sub: 'O.S. faturáveis',
      icon: Check,
      tone: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Faturamento do filtro',
      value: formatCurrency(notesSummary.billableAmount),
      sub: `${formatCurrency(notesSummary.totalAmount)} em O.S. filtradas`,
      icon: Banknote,
      tone: 'text-sky-700 bg-sky-50',
    },
  ];
  const valueFilterLabel = useMemo(() => {
    if (!hasValueFilter) return null;
    if (valueRange.min !== undefined && valueRange.max !== undefined) {
      return `${formatCurrency(valueRange.min)} até ${formatCurrency(valueRange.max)}`;
    }
    if (valueRange.min !== undefined) return `A partir de ${formatCurrency(valueRange.min)}`;
    return `Até ${formatCurrency(valueRange.max ?? 0)}`;
  }, [hasValueFilter, valueRange]);

  const refreshNotesPage = () => {
    queryClient.invalidateQueries({ queryKey: ['notas-servico', 'page'] });
    queryClient.invalidateQueries({ queryKey: ['operational', 'notes'] });
  };

  const handleNoteCreated = () => {
    setCurrentPage(1);
    refreshNotesPage();
  };

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleDownloadNotePDF = async (note: IntakeNote) => {
    const previewWindow = createPdfPreviewWindow(`O.S. ${note.number}`);
    setResolvingPdfNoteId(note.id);
    try {
      if (note.pdfUrl) {
        const url = await getNotaPDFSignedUrl(note.pdfUrl);
        if (!url) {
          throw new Error('Não foi possível preparar o link seguro do PDF salvo.');
        }

        openPdfInBrowser(url, {
          title: `O.S. ${note.number}`,
          previewWindow,
        });
        return;
      }

      const detalhes = await getNotaServicoDetalhes(note.id);
      if (!detalhes) {
        throw new Error('Não foi possível carregar os dados atuais da O.S.');
      }

      const blob = await generateNotaPdfBlob(detalhes, templateSettings ? {
        accentColor: templateSettings.corDocumento,
        templateMode: templateSettings.osModelo,
        documentSettings,
      } : undefined);
      const path = await uploadNotaPDF(blob, note.number);
      await updateNotaPdfUrl(note.id, path, documentSettings);

      const url = URL.createObjectURL(blob);
      openPdfInBrowser(url, {
        title: `O.S. ${note.number}`,
        previewWindow,
        revokeObjectUrlAfterMs: 30_000,
      });

      toast({
        title: 'PDF gerado',
        description: 'A O.S. foi gerada, salva no Supabase e aberta em nova aba.',
      });
    } catch (error) {
      previewWindow?.close();
      toast({
        title: 'Não foi possível abrir a nota',
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
      const columns = [
        'O.S.',
        'Cliente',
        'Documento',
        'Tipo',
        'Status',
        'Data',
        'Veículo',
        'Motor',
        'Placa',
        'KM',
        'Observação interna',
        'Valor Total',
      ];
      const rows: CsvRow[] = filtered.map((note) => {
        const client = clients.find((item) => item.id === note.clientId);

        return {
          'O.S.': note.number,
          Cliente: client?.name ?? 'Cliente não encontrado',
          Documento: client?.docNumber ?? '',
          Tipo: note.type,
          Status: STATUS_LABELS[note.status as NoteStatus],
          Data: format(new Date(note.createdAt), 'dd/MM/yyyy'),
          Veículo: note.vehicleModel,
          Motor: note.engineType ?? '',
          Placa: note.plate ?? '',
          KM: note.km ?? '',
          'Observação interna': note.observations ?? '',
          'Valor Total': note.totalAmount,
        };
      });

      downloadCsv(
        `notas-entrada-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.csv`,
        toCsv(rows, columns),
      );

      toast({
        title: 'Exportação concluída',
        description: `${filtered.length} nota(s) exportada(s) em CSV.`,
      });
    } catch (error) {
      toast({
        title: 'Exportação CSV indisponível',
        description: 'Não foi possível gerar o arquivo de exportação agora.',
        variant: 'destructive',
      });
    }
  };

  const previewNote = previewNoteId
    ? sourceNotes.find(n => n.id === previewNoteId) ?? notes.find(n => n.id === previewNoteId) ?? null
    : null;
  const previewClient = previewNote ? clients.find(c => c.id === previewNote.clientId) : undefined;
  const previewServices = previewNote ? getServicesForNote(previewNote.id) : [];
  const previewProducts = previewNote ? getProductsForNote(previewNote.id) : [];
  const detailNote = detailNoteId
    ? sourceNotes.find(n => n.id === detailNoteId) ?? notes.find(n => n.id === detailNoteId) ?? null
    : null;
  const detailClient = detailNote ? clients.find(c => c.id === detailNote.clientId) ?? null : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 sm:space-y-5">
        {/* Header */}
        <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4 lg:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-sm sm:h-12 sm:w-12 sm:rounded-2xl">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">Controle de O.S.</p>
                <h1 className="mt-1 text-xl font-display font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
                  Notas de Entrada
                </h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-relaxed text-muted-foreground sm:block">
                  Acompanhe entrada, status, veículo, valor e documentos de cada ordem de serviço.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 gap-2 rounded-xl border-border/70 bg-background px-3 font-semibold shadow-sm sm:h-11 sm:px-4">
                    <Download className="h-4 w-4" /> Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void exportFilteredNotes()}>
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> CSV (.csv)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                className="h-10 gap-2 rounded-xl px-3 font-semibold shadow-sm sm:h-11 sm:px-4"
                onClick={() => setNewNoteOpen(true)}
              >
                <PlusCircle className="h-4 w-4" /> Nova O.S.
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <div key={item.label} className="rounded-xl border border-border/60 bg-muted/20 p-2.5 sm:rounded-2xl sm:p-3">
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{item.label}</p>
                    <p className="mt-1 truncate text-base font-bold tracking-tight text-foreground sm:text-xl">{item.value}</p>
                  </div>
                  <div className={cn('hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:flex md:h-9 md:w-9', item.tone)}>
                    <item.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">{item.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Search + Filters */}
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Filtros da lista</p>
                <p className="text-xs text-muted-foreground">Refine por cliente, período ou status sem sair da página.</p>
              </div>
              <Badge variant="outline" className="w-fit rounded-full bg-background text-[11px]">
                Página {currentPage} de {totalPages} · {NOTES_PAGE_SIZE} por página
              </Badge>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar O.S. ou cliente"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-10 rounded-xl border-border/70 bg-background pl-9 text-sm shadow-sm transition-colors focus:bg-background sm:h-11 sm:pl-10"
                />
              </div>

              <Button
                variant="outline"
                className={cn(
                  'h-10 w-10 shrink-0 gap-2 rounded-xl border-border/70 bg-background px-0 shadow-sm sm:h-11 sm:w-auto sm:px-4',
                  activeFilterCount > 0 && 'border-primary/40 text-primary',
                )}
                aria-label="Abrir filtros"
                onClick={() => handleFilterDialogOpenChange(true)}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Filtros</span>
                {activeFilterCount > 0 && (
                  <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              <Dialog open={filterDialogOpen} onOpenChange={handleFilterDialogOpenChange}>
                <DialogContent className="max-w-xl gap-0 overflow-visible p-0">
                  <DialogHeader className="border-b border-border/70 px-4 py-3 text-left sm:px-5">
                    <DialogTitle className="text-base sm:text-lg">Filtros da lista</DialogTitle>
                    <DialogDescription>
                      Ajuste a visualização e confirme para atualizar as O.S.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3 px-4 py-3 sm:px-5">
                    <section className="rounded-2xl border border-border/70 bg-muted/20 p-2.5">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Ordenar por</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {([
                          ['date', 'Data'],
                          ['os', 'Número da O.S.'],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setDraftSortField(value)}
                            className={cn(
                              'rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition-colors sm:text-sm',
                              draftSortField === value
                                ? 'border-primary/50 bg-primary/10 text-primary'
                                : 'border-border/70 bg-background text-foreground hover:bg-muted/60',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {([
                          ['desc', draftSortField === 'os' ? 'Maior primeiro' : 'Mais recente'],
                          ['asc', draftSortField === 'os' ? 'Menor primeiro' : 'Mais antiga'],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setDraftSortDirection(value)}
                            className={cn(
                              'rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition-colors sm:text-sm',
                              draftSortDirection === value
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-border/70 bg-background text-foreground hover:bg-muted/60',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </section>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Cliente</p>
                        <Select value={draftClientFilter} onValueChange={setDraftClientFilter}>
                          <SelectTrigger className="h-9 rounded-xl">
                            <SelectValue placeholder="Cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os clientes</SelectItem>
                            {activeClients.map((client) => (
                              <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Pagamento</p>
                        <Select value={draftPaymentFilter} onValueChange={(v) => setDraftPaymentFilter(v as 'all' | 'PAGO' | 'PENDENTE')}>
                          <SelectTrigger className="h-9 rounded-xl">
                            <SelectValue placeholder="Pagamento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="PENDENTE">A receber</SelectItem>
                            <SelectItem value="PAGO">Pago</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Período</p>
                        <Select value={draftDatePreset} onValueChange={(value) => setDraftDatePreset(value as NoteDatePreset)}>
                          <SelectTrigger className="h-9 rounded-xl">
                            <SelectValue placeholder="Período" />
                          </SelectTrigger>
                          <SelectContent>
                            {datePresetOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Status</p>
                        <Select value={draftStatusValue} onValueChange={setDraftStatusFilter}>
                          <SelectTrigger className="h-9 rounded-xl">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os status</SelectItem>
                            {allStatuses.map((status) => (
                              <SelectItem key={status.key} value={status.key}>
                                {status.label} ({statusCounts[status.key] || 0})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Valor mínimo</p>
                        <Input
                          inputMode="decimal"
                          value={draftMinValueFilter}
                          onChange={(event) => setDraftMinValueFilter(event.target.value)}
                          placeholder="R$ 0,00"
                          className="h-9 rounded-xl text-sm"
                        />
                      </div>
                      <span className="pb-2 text-xs text-muted-foreground">até</span>
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Valor máximo</p>
                        <Input
                          inputMode="decimal"
                          value={draftMaxValueFilter}
                          onChange={(event) => setDraftMaxValueFilter(event.target.value)}
                          placeholder="R$ 0,00"
                          className="h-9 rounded-xl text-sm"
                        />
                      </div>
                    </div>

                    {draftDatePreset === 'month' && (
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={draftMonthValue}
                          onValueChange={(value) => updateDraftMonthFilter(draftMonthYear, value)}
                        >
                          <SelectTrigger className="h-9 rounded-xl">
                            <SelectValue placeholder="Mês" />
                          </SelectTrigger>
                          <SelectContent>
                            {INTAKE_NOTE_MONTHS.map((month) => (
                              <SelectItem key={month.value} value={month.value}>
                                {month.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={draftMonthYear}
                          onValueChange={(value) => updateDraftMonthFilter(value, draftMonthValue)}
                        >
                            <SelectTrigger className="h-9 rounded-xl">
                              <SelectValue placeholder="Ano" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableFilterYears.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                      </div>
                    )}

                    {draftDatePreset === 'custom' && (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                        <Input type="date" value={draftCustomStartDate} onChange={(e) => setDraftCustomStartDate(e.target.value)} className="h-9 rounded-xl text-sm" />
                        <span className="text-xs text-muted-foreground">até</span>
                        <Input type="date" value={draftCustomEndDate} onChange={(e) => setDraftCustomEndDate(e.target.value)} className="h-9 rounded-xl text-sm" />
                      </div>
                    )}
                  </div>

                  <DialogFooter className="border-t border-border/70 bg-background px-4 py-2.5 sm:px-5">
                    <Button variant="ghost" onClick={resetDraftFilters}>
                      Limpar
                    </Button>
                    <Button variant="outline" onClick={() => setFilterDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={applyDraftFilters}>
                      Confirmar filtros
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Active filter badges */}
            <div className="flex items-center gap-2 flex-wrap min-h-5">
              {IS_REAL_AUTH && isLoadingNotesPage && (
                <span className="text-xs text-muted-foreground">Atualizando lista...</span>
              )}
              {hasUnsupportedMultiStatusFilter && (
                <span className="text-xs text-amber-700">
                  Múltiplos status vindos da URL serão aplicados corretamente na RPC v2; selecione um status para filtrar agora.
                </span>
              )}
              {activeFilterCount === 0 ? (
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
                    <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer" onClick={() => setClientFilter('all')}>
                      {clients.find((client) => client.id === clientFilter)?.name ?? 'Cliente'}
                    </Badge>
                  )}
                  {datePreset !== 'all' && (
                    <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer" onClick={() => setDatePreset('all')}>
                      {dateRange.label}
                    </Badge>
                  )}
                  {paymentFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer" onClick={() => setPaymentFilter('all')}>
                      {paymentFilter === 'PAGO' ? 'Pago' : 'A receber'}
                    </Badge>
                  )}
                  {valueFilterLabel && (
                    <Badge
                      variant="secondary"
                      className="gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer"
                      onClick={() => {
                        setMinValueFilter('');
                        setMaxValueFilter('');
                      }}
                    >
                      Valor: {valueFilterLabel}
                    </Badge>
                  )}
                  {(sortField !== DEFAULT_INTAKE_NOTE_SORT_FIELD || sortDirection !== DEFAULT_INTAKE_NOTE_SORT_DIRECTION) && (
                    <Badge
                      variant="secondary"
                      className="gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer"
                      onClick={() => {
                        setSortField(DEFAULT_INTAKE_NOTE_SORT_FIELD);
                        setSortDirection(DEFAULT_INTAKE_NOTE_SORT_DIRECTION);
                      }}
                    >
                      {getIntakeNoteSortLabel(sortField, sortDirection)}
                    </Badge>
                  )}
                  <button
                    onClick={clearAllFilters}
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
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border/70 bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-sm font-semibold text-foreground">Ordens de serviço</p>
              <p className="text-xs text-muted-foreground">
                Clique em uma linha para abrir os detalhes completos.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full bg-background text-xs">
              {IS_REAL_AUTH
                ? `${filtered.length} nesta página · ${totalForPagination} no banco`
                : `${paginatedNotes.length} de ${filtered.length} O.S.`}
            </Badge>
          </div>
          <div className="space-y-2 p-2 sm:p-3 xl:hidden">
            {paginatedNotes.map(n => {
              const client = clients.find(c => c.id === n.clientId);
              const StatusIcon = getNoteStatusIcon(n.status as NoteStatus);

              return (
                <article
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailNoteId(n.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setDetailNoteId(n.id);
                    }
                  }}
                  className="rounded-xl border border-border/70 bg-card p-2.5 shadow-sm transition-colors active:bg-muted/50 sm:rounded-2xl sm:p-4"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="truncate text-base font-bold leading-none text-primary sm:text-lg">{n.number}</span>
                        <span
                          className={cn(
                            'inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                            n.type === 'COMPRA'
                              ? 'border-amber-200/60 bg-amber-50 text-amber-600'
                              : 'border-blue-200/60 bg-blue-50 text-blue-600',
                          )}
                        >
                          {n.type === 'COMPRA' ? 'COMPRA' : 'SERVIÇO'}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {format(new Date(n.createdAt), 'dd/MM/yyyy')}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-semibold text-foreground sm:text-[15px]">
                        {client?.name ?? 'Cliente não encontrado'}
                      </p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground sm:gap-x-3">
                        {n.vehicleModel ? (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <CarFront className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{n.vehicleModel}</span>
                          </span>
                        ) : null}
                        {n.plate ? <span className="font-medium">{n.plate}</span> : null}
                        {n.km ? (
                          <span className="inline-flex items-center gap-1">
                            <Gauge className="h-3.5 w-3.5" />
                            {n.km.toLocaleString('pt-BR')} km
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 rounded-lg hover:bg-muted sm:h-10 sm:w-10 sm:rounded-xl"
                          aria-label={`Mais ações para ${n.number}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenuItem onClick={() => setDetailNoteId(n.id)}>
                          <Eye className="mr-2 h-4 w-4" /> Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingNote(n)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar nota
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleOpenPreview(n)}>
                          <FileText className="mr-2 h-4 w-4" /> Preview do documento
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={resolvingPdfNoteId === n.id}
                          onClick={() => void handleDownloadNotePDF(n)}
                        >
                          <Download className="mr-2 h-4 w-4" /> Baixar nota
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
                          <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 sm:mt-3 sm:pt-3">
                    <Badge className={cn(STATUS_COLORS[n.status as NoteStatus], 'gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-none sm:px-3 sm:py-1.5 sm:text-[12px]')}>
                      <StatusIcon className="h-3.5 w-3.5 shrink-0" />
                      {STATUS_LABELS[n.status as NoteStatus]}
                    </Badge>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Total</p>
                      <p className="font-bold tabular-nums text-foreground">{formatCurrency(n.totalAmount)}</p>
                    </div>
                  </div>

                  <div className="mt-3 hidden grid-cols-2 gap-2 border-t border-border/50 pt-3 text-xs sm:grid">
                    <div className="min-w-0 rounded-lg bg-muted/25 px-2.5 py-2">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Motor</p>
                      <p className="mt-0.5 truncate font-medium text-foreground">{n.engineType || '—'}</p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-muted/25 px-2.5 py-2">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Entrada</p>
                      <p className="mt-0.5 truncate font-medium text-foreground">{format(new Date(n.createdAt), 'dd/MM/yyyy')}</p>
                    </div>
                  </div>
                </article>
              );
            })}

            {paginatedNotes.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
                  <FileText className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="font-medium text-muted-foreground">Nenhuma O.S. encontrada</p>
                <Button variant="outline" size="sm" onClick={() => setNewNoteOpen(true)}>
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Criar nova O.S.
                </Button>
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/70 bg-card hover:bg-card">
                  <TableHead className="h-12 pl-5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">O.S.</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Cliente e veículo</TableHead>
                  <TableHead className="hidden h-12 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:table-cell">Entrada</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Status</TableHead>
                  <TableHead className="hidden h-12 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">
                    Valor Total
                  </TableHead>
                  <TableHead className="h-12 w-[76px] pr-5 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedNotes.map(n => {
                  const client = clients.find(c => c.id === n.clientId);
                  return (
                    <TableRow
                      key={n.id}
                      className="group cursor-pointer border-b border-border/60 bg-card transition-colors duration-150 last:border-b-0 hover:bg-primary/[0.035]"
                      onClick={() => setDetailNoteId(n.id)}
                    >
                      <TableCell className="py-4 pl-5 align-middle">
                        <div className="flex min-w-[132px] items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="block text-base font-bold leading-none text-primary">
                              {n.number}
                            </span>
                          <span
                            className={cn(
                                'mt-2 inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                              n.type === 'COMPRA'
                                ? 'bg-amber-50 text-amber-600 border-amber-200/60'
                                : 'bg-blue-50 text-blue-600 border-blue-200/60',
                            )}
                          >
                            {n.type === 'COMPRA' ? 'COMPRA' : 'SERVIÇO'}
                          </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[360px] py-4 align-middle">
                        <p className="truncate text-base font-bold text-foreground">{client?.name}</p>
                        {n.vehicleModel && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <CarFront className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{n.vehicleModel}</span>
                            </span>
                            {n.plate ? (
                              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                                {n.plate}
                              </span>
                            ) : null}
                            {n.km ? (
                              <span className="hidden items-center gap-1 lg:inline-flex">
                                <Gauge className="h-3.5 w-3.5" />
                                {n.km.toLocaleString('pt-BR')} km
                              </span>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden py-4 align-middle text-sm text-muted-foreground sm:table-cell">
                        <span className="inline-flex items-center gap-2 tabular-nums">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {new Date(n.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 align-middle">
                        <div className="flex flex-col items-start gap-1.5">
                          {(() => {
                            const StatusIcon = getNoteStatusIcon(n.status as NoteStatus);
                            return (
                              <Badge
                                className={cn(
                                  STATUS_COLORS[n.status as NoteStatus],
                                  'gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold shadow-none',
                                )}
                              >
                                <StatusIcon className="h-3.5 w-3.5 shrink-0" />
                                {STATUS_LABELS[n.status as NoteStatus]}
                              </Badge>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="hidden py-4 text-right align-middle md:table-cell">
                        <div className="inline-flex items-center justify-end gap-2 rounded-xl bg-muted/35 px-3 py-2">
                          <Banknote className="h-4 w-4 text-muted-foreground" />
                          <span className="font-bold tabular-nums text-foreground">
                            {formatCurrency(n.totalAmount)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className="py-4 pr-5 text-right align-middle"
                        onClick={e => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-xl hover:bg-muted"
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
                {paginatedNotes.length === 0 && (
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

        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {IS_REAL_AUTH
              ? `Busca e paginação consultam o banco. Exibindo até ${NOTES_PAGE_SIZE} O.S. por página.`
              : `Exibindo página ${currentPage} de ${totalPages} no ambiente local.`}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || isLoadingNotesPage}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Anterior
            </Button>
            <span className="min-w-20 text-center text-xs font-semibold tabular-nums text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || isLoadingNotesPage}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>

        {/* Note detail modal (opens on row click) */}
        <NoteDetailModal
          noteId={detailNoteId}
          onClose={() => setDetailNoteId(null)}
          noteOverride={detailNote}
          clientOverride={detailClient}
        />

        {/* New note form modal */}
        <NoteFormModal
          open={newNoteOpen}
          onClose={() => setNewNoteOpen(false)}
          onSuccess={handleNoteCreated}
        />

        {/* Edit note form modal */}
        <NoteFormModal
          open={!!editingNote}
          onClose={() => setEditingNote(null)}
          editingNote={editingNote ?? undefined}
          onSuccess={refreshNotesPage}
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
              documentSettings={documentSettings}
            />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}
