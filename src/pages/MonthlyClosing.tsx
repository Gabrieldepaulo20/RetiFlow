import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoadingSpinner } from '@/components/ui/loading-screen';
import { useMonthlyClosingSourceQuery } from '@/hooks/useOperationalQueries';
import { useClosingRecords } from '@/hooks/useClosingRecords';
import { cn } from '@/lib/utils';
import { ClosingPeriodFilters, getClosingDateRange, calcServiceTotal, getNoteDiscount } from '@/services/domain/monthlyClosing';
import { addDays, format, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import {
  FileText, Share2, Mail, AlertTriangle, Printer, CalendarDays,
  Eye, Building2, CalendarIcon,
  Percent, DollarSign, ArrowLeft, ChevronLeft, ChevronRight, RefreshCcw, MoreHorizontal,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CARD_PALETTE = [
  { border: 'border-l-blue-400',    avatar: 'bg-blue-100 text-blue-700',    total: 'text-blue-700',    totalBg: 'bg-blue-50/70' },
  { border: 'border-l-violet-400',  avatar: 'bg-violet-100 text-violet-700', total: 'text-violet-700',  totalBg: 'bg-violet-50/70' },
  { border: 'border-l-emerald-400', avatar: 'bg-emerald-100 text-emerald-700', total: 'text-emerald-700', totalBg: 'bg-emerald-50/70' },
  { border: 'border-l-orange-400',  avatar: 'bg-orange-100 text-orange-700', total: 'text-orange-700',  totalBg: 'bg-orange-50/70' },
  { border: 'border-l-teal-400',    avatar: 'bg-teal-100 text-teal-700',    total: 'text-teal-700',    totalBg: 'bg-teal-50/70' },
  { border: 'border-l-rose-400',    avatar: 'bg-rose-100 text-rose-700',    total: 'text-rose-700',    totalBg: 'bg-rose-50/70' },
  { border: 'border-l-amber-400',   avatar: 'bg-amber-100 text-amber-700',  total: 'text-amber-700',   totalBg: 'bg-amber-50/70' },
  { border: 'border-l-sky-400',     avatar: 'bg-sky-100 text-sky-700',      total: 'text-sky-700',     totalBg: 'bg-sky-50/70' },
] as const;

export default function MonthlyClosing() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Period filter state (UI only) ──────────────────────────────────────
  const [periodType, setPeriodType] = useState<'mensal' | 'quinzenal' | 'semanal' | 'personalizado'>('mensal');
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [quinzena, setQuinzena] = useState<'1' | '2'>('1');
  const [weekDate, setWeekDate] = useState<Date>(new Date());
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState('all');

  // ── Closing records (state + persistence + domain operations) ──────────
  const {
    closings,
    editingClosing,
    previewClosing,
    page,
    PAGE_SIZE,
    setPreviewClosing,
    openClosingEditor,
    closeEditor,
    updateDraftService,
    saveClosingEdits,
    recordClosingAction,
    handleGenerate,
    setPage,
  } = useClosingRecords();

  const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekDate, { weekStartsOn: 1 });

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const filters = useMemo<ClosingPeriodFilters>(() => ({
    periodType: periodType as ClosingPeriodFilters['periodType'],
    month,
    year,
    quinzena,
    weekDate,
    customRange: customRange ?? {},
    clientFilter,
  }), [clientFilter, customRange, month, periodType, quinzena, weekDate, year]);

  const dateRange = useMemo(() => getClosingDateRange(filters), [filters]);
  const { data: closingSource, isLoading } = useMonthlyClosingSourceQuery(filters);
  const availabilityFilters = useMemo<ClosingPeriodFilters>(() => ({
    ...filters,
    clientFilter: 'all',
  }), [filters]);
  const { data: availabilitySource } = useMonthlyClosingSourceQuery(availabilityFilters);
  const finalized = useMemo(() => closingSource?.notes ?? [], [closingSource]);
  const customers = useMemo(() => closingSource?.customers ?? [], [closingSource]);
  const services = useMemo(() => closingSource?.services ?? [], [closingSource]);
  const availabilityNotes = useMemo(() => availabilitySource?.notes ?? [], [availabilitySource]);

  const groupedByClient = useMemo(() => {
    const map = new Map<string, typeof finalized>();
    finalized.forEach(n => {
      const arr = map.get(n.clientId) || [];
      arr.push(n);
      map.set(n.clientId, arr);
    });
    return map;
  }, [finalized]);

  const finalizedCountByClient = useMemo(() => {
    const map = new Map<string, number>();

    availabilityNotes.forEach((note) => {
      map.set(note.clientId, (map.get(note.clientId) ?? 0) + 1);
    });

    return map;
  }, [availabilityNotes]);

  const onGenerate = () => {
    handleGenerate({ filters, customers, notes: finalized, services, groupedByClient });
  };

  const today = new Date().getDate();

  const getPeriodDescription = () => {
    const fmtDate = (d: Date) => format(d, "dd 'de' MMMM", { locale: ptBR });
    return `${fmtDate(dateRange.start)} — ${fmtDate(dateRange.end)}`;
  };

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Fechamento</h1>
            <p className="text-sm text-muted-foreground">Gere fechamentos por período e cliente</p>
          </div>
        </div>

        {today <= 10 && (
          <Alert className="border-warning/50 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">Lembrete: o fechamento normalmente é realizado até o dia 10.</AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              {/* Period type selector */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Período</p>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {([
                    { key: 'mensal', label: 'Mensal' },
                    { key: 'quinzenal', label: 'Quinzenal' },
                    { key: 'semanal', label: 'Semanal' },
                    { key: 'personalizado', label: 'Personalizado' },
                  ] as const).map(({ key, label }, i) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPeriodType(key)}
                      className={cn(
                        'px-3.5 h-9 text-sm font-medium transition-colors whitespace-nowrap',
                        periodType === key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted',
                        i > 0 && 'border-l border-border',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mensal: month + year */}
              {periodType === 'mensal' && (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Mês</p>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {months.map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Ano</p>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {yearOptions.map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Quinzenal: quinzena + month + year */}
              {periodType === 'quinzenal' && (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Quinzena</p>
                    <div className="flex rounded-lg border border-border overflow-hidden">
                      {(['1', '2'] as const).map((q, i) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQuinzena(q)}
                          className={cn(
                            'px-4 h-9 text-sm font-medium transition-colors',
                            quinzena === q
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-muted-foreground hover:bg-muted',
                            i > 0 && 'border-l border-border',
                          )}
                        >
                          {q === '1' ? '1ª' : '2ª'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Mês</p>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {months.map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Ano</p>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {yearOptions.map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Semanal: week navigation */}
              {periodType === 'semanal' && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Semana</p>
                  <div className="flex items-center rounded-lg border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setWeekDate(d => subDays(d, 7))}
                      className="px-2.5 h-9 hover:bg-muted transition-colors text-muted-foreground border-r border-border"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3.5 text-sm font-medium text-foreground tabular-nums min-w-[186px] text-center">
                      {format(weekStart, 'dd/MM', { locale: ptBR })} — {format(weekEnd, 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setWeekDate(d => addDays(d, 7))}
                      className="px-2.5 h-9 hover:bg-muted transition-colors text-muted-foreground border-l border-border"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Personalizado: De / Até date pickers */}
              {periodType === 'personalizado' && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Intervalo</p>
                  <Popover open={customOpen} onOpenChange={setCustomOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-muted"
                      >
                        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>
                          {customRange?.from && customRange?.to
                            ? `${format(customRange.from, 'dd/MM/yyyy')} — ${format(customRange.to, 'dd/MM/yyyy')}`
                            : 'Selecionar datas'}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3 pointer-events-auto" align="start">
                      <div className="flex gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground px-1">De</p>
                          <Calendar
                            mode="single"
                            selected={customRange?.from}
                            onSelect={(date) => {
                              if (!date) return;
                              setCustomRange(prev => ({ from: date, to: prev?.to ?? date }));
                            }}
                            locale={ptBR}
                          />
                        </div>
                        <div className="border-l" />
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground px-1">Até</p>
                          <Calendar
                            mode="single"
                            selected={customRange?.to}
                            onSelect={(date) => {
                              if (!date) return;
                              setCustomRange(prev => ({ from: prev?.from ?? date, to: date }));
                              setCustomOpen(false);
                            }}
                            locale={ptBR}
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Client filter */}
              <div className="min-w-[220px]">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Cliente</p>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os clientes</SelectItem>
                    {customers.filter(c => c.isActive && (finalizedCountByClient.get(c.id) ?? 0) > 0).map(c => {
                      const noteCount = finalizedCountByClient.get(c.id) ?? 0;
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span className="truncate">{c.name}</span>
                            <span className="ml-1 shrink-0 rounded-full bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">
                              {noteCount}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Generate button */}
              <Button onClick={onGenerate} className="h-9 ml-auto">
                <CalendarDays className="w-4 h-4 mr-2" /> Gerar Fechamento
              </Button>
            </div>

            {/* Summary bar */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                {isLoading ? (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <LoadingSpinner size="sm" className="h-5 w-5 shrink-0" />
                    Carregando notas finalizadas...
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {finalized.length} nota(s) finalizada(s)
                  </span>
                )}
                <p className="text-xs text-muted-foreground/70 mt-0.5">{getPeriodDescription()}</p>
              </div>
              <span className="text-sm font-bold text-primary">
                R$ {finalized.reduce((s, n) => s + n.totalAmount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Closings List */}
        {closings.length > 0 && (() => {
          const totalPages = Math.ceil(closings.length / PAGE_SIZE);
          const pagedClosings = closings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

          return (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Fechamentos Gerados
                </h2>
                <span className="text-xs text-muted-foreground">
                  {closings.length} fechamento{closings.length !== 1 ? 's' : ''}
                </span>
              </div>

              {pagedClosings.map((closing, closingIdx) => {
                const globalIdx = (page - 1) * PAGE_SIZE + closingIdx;
                const totalDiscount = closing.notes.reduce((sum, n) => sum + getNoteDiscount(n), 0);
                const palette = CARD_PALETTE[globalIdx % CARD_PALETTE.length];
                const clientInitials = closing.clientName
                  .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');

                return (
                  <Card key={closing.id} className={`overflow-hidden border-border/50 border-l-4 ${palette.border}`}>
                    {/* ── Header ── */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-muted/10">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-full ${palette.avatar} flex items-center justify-center shrink-0 text-[11px] font-bold leading-none`}>
                          {clientInitials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold truncate">{closing.clientName}</p>
                            <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded-md shrink-0">
                              {closing.period}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-px">
                            <span className="text-[10px] text-muted-foreground/50">
                              {closing.notes.length} nota{closing.notes.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[10px] text-muted-foreground/30">·</span>
                            <span className="text-[10px] text-muted-foreground/50">v{closing.version}</span>
                            {closing.editCount > 0 && (
                              <>
                                <span className="text-[10px] text-muted-foreground/30">·</span>
                                <span className="text-[10px] text-muted-foreground/50">
                                  {closing.editCount} edição{closing.editCount !== 1 ? 'ões' : ''}
                                </span>
                              </>
                            )}
                            <span className="text-[10px] text-muted-foreground/30">·</span>
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                              {new Date(closing.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className={`text-right px-3 py-1.5 rounded-lg ${palette.totalBg}`}>
                          <p className={`text-[15px] font-bold tabular-nums leading-tight ${palette.total}`}>
                            R$ {closing.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          {totalDiscount > 0 && (
                            <p className="text-[10px] text-destructive/80 font-medium tabular-nums">
                              −R$ {totalDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} desc.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs gap-1.5"
                            onClick={() => openClosingEditor(closing)}
                          >
                            <Eye className="w-3.5 h-3.5" /> Abrir
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                recordClosingAction(closing.id, 'previewed', 'Fechamento visualizado em tela.');
                                setPreviewClosing(closing);
                              }}>
                                <FileText className="w-4 h-4 mr-2" /> Visualizar PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                recordClosingAction(closing.id, 'downloaded', 'PDF baixado.', (c) => ({ ...c, downloadCount: c.downloadCount + 1 }));
                                toast({ title: 'PDF gerado (mock)' });
                              }}>
                                <FileText className="w-4 h-4 mr-2" /> Baixar PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                recordClosingAction(closing.id, 'printed', 'Enviado para impressão.');
                                toast({ title: 'Imprimindo... (mock)' });
                              }}>
                                <Printer className="w-4 h-4 mr-2" /> Imprimir
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                recordClosingAction(closing.id, 'shared', 'Enviado por WhatsApp.');
                                toast({ title: 'Enviado via WhatsApp (mock)' });
                              }}>
                                <Share2 className="w-4 h-4 mr-2" /> WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                recordClosingAction(closing.id, 'emailed', 'Enviado por e-mail.');
                                toast({ title: 'E-mail enviado (mock)' });
                              }}>
                                <Mail className="w-4 h-4 mr-2" /> Enviar por E-mail
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>

                    {/* ── Note pills (compact, no services) ── */}
                    <div className="border-t border-border/20 px-4 py-2.5 flex flex-wrap gap-1.5 bg-background/60">
                      {closing.notes.map(n => {
                        const noteDiscount = getNoteDiscount(n);
                        return (
                          <div
                            key={n.id}
                            className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5"
                          >
                            <span className="font-mono text-[11px] font-bold text-primary leading-none">{n.number}</span>
                            {noteDiscount > 0 && (
                              <span className="text-[9px] text-destructive/70 font-medium leading-none">
                                −{noteDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/50 leading-none">·</span>
                            <span className="text-[11px] font-semibold tabular-nums text-foreground/70 leading-none">
                              R$ {n.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1 px-0.5">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, closings.length)} de {closings.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {(() => {
                      const pages: (number | '…')[] = [];
                      if (totalPages <= 7) {
                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                      } else {
                        pages.push(1);
                        if (page > 3) pages.push('…');
                        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                        if (page < totalPages - 2) pages.push('…');
                        pages.push(totalPages);
                      }
                      return pages.map((p, i) =>
                        p === '…' ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === page ? 'default' : 'outline'}
                            size="icon"
                            className="h-8 w-8 text-xs"
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </Button>
                        )
                      );
                    })()}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {closings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <CalendarDays className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum fechamento gerado</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Selecione o período e cliente, depois clique em "Gerar Fechamento"
            </p>
          </div>
        )}

        <Dialog open={!!editingClosing} onOpenChange={(open) => !open && closeEditor()}>
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden p-0">
            {editingClosing && (
              <>
                <DialogHeader className="border-b border-border/50 px-6 py-5">
                  <DialogTitle className="flex items-center gap-2">
                    <RefreshCcw className="h-5 w-5 text-primary" />
                    Fechamento — {editingClosing.clientName}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Ajustes aqui afetam apenas o fechamento. As notas originais continuam separadas.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">Versão {editingClosing.version}</Badge>
                    <Badge variant="outline">Notas incluídas: {editingClosing.notes.length}</Badge>
                    <Badge variant="outline">Modificado {editingClosing.editCount}x</Badge>
                    <Badge variant="outline">Regerado {editingClosing.regenerationCount}x</Badge>
                  </div>
                </DialogHeader>

                <div className="max-h-[calc(88vh-150px)] overflow-y-auto px-6 py-5">
                  <Tabs defaultValue="notas" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="notas">Notas incluídas</TabsTrigger>
                      <TabsTrigger value="historico">Histórico</TabsTrigger>
                    </TabsList>

                    <TabsContent value="notas" className="space-y-4">
                      {editingClosing.notes.map((note) => (
                        <Card key={note.id} className="border border-border/60 shadow-sm">
                          <CardContent className="space-y-4 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-mono text-sm font-bold text-primary">{note.number}</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  <Badge variant="outline">
                                    Desconto desta nota: R$ {getNoteDiscount(note).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </Badge>
                                  <Badge variant="outline">
                                    Total no fechamento: R$ {note.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </Badge>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  closeEditor();
                                  navigate(`/notas-entrada/${note.id}`);
                                }}
                              >
                                <ArrowLeft className="mr-1.5 h-4 w-4" /> Abrir O.S.
                              </Button>
                            </div>

                            <div className="space-y-3">
                              {note.services.length > 0 ? note.services.map((service, serviceIndex) => (
                                <div
                                  key={`${note.id}-${serviceIndex}`}
                                  className="grid gap-3 rounded-xl border border-border/60 bg-muted/10 p-4 lg:grid-cols-[minmax(0,1.2fr)_72px_110px_110px_140px]"
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{service.name}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Desconto referente à nota {note.number}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Qtd.</p>
                                    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-semibold">
                                      {service.quantity}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Valor</p>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={service.price}
                                      onChange={(event) =>
                                        updateDraftService(note.id, serviceIndex, (current) => ({
                                          ...current,
                                          price: parseFloat(event.target.value) || 0,
                                        }))
                                      }
                                      className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Desconto</p>
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 shrink-0"
                                        onClick={() =>
                                          updateDraftService(note.id, serviceIndex, (current) => ({
                                            ...current,
                                            discountType: current.discountType === 'percent' ? 'value' : 'percent',
                                            discount: 0,
                                          }))
                                        }
                                      >
                                        {service.discountType === 'percent' ? <Percent className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
                                      </Button>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={service.discount}
                                        onChange={(event) =>
                                          updateDraftService(note.id, serviceIndex, (current) => ({
                                            ...current,
                                            discount: parseFloat(event.target.value) || 0,
                                          }))
                                        }
                                        className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Subtotal</p>
                                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-bold text-primary">
                                      R$ {calcServiceTotal(service).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                </div>
                              )) : (
                                <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                                  Nenhum serviço encontrado nesta nota.
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </TabsContent>

                    <TabsContent value="historico">
                      <div className="space-y-3">
                        {editingClosing.logs.map((log) => (
                          <div key={log.id} className="rounded-xl border border-border/60 bg-card px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{log.message}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                                </p>
                              </div>
                              <Badge variant="outline" className="capitalize">
                                {log.type}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-muted/15 px-6 py-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Total atualizado: R$ {editingClosing.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Desconto total aplicado: R$ {editingClosing.notes.reduce((sum, note) => sum + getNoteDiscount(note), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={closeEditor}>
                      Cancelar
                    </Button>
                    <Button onClick={saveClosingEdits} type="button">
                      <RefreshCcw className="mr-1.5 h-4 w-4" /> Salvar e regerar
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={!!previewClosing} onOpenChange={() => setPreviewClosing(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            {previewClosing && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    {previewClosing.label} — {previewClosing.clientName}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="border rounded-lg p-6 space-y-4 bg-card">
                    <div className="text-center border-b pb-4">
                      <h2 className="text-xl font-display font-bold">Retífica Premium</h2>
                      <p className="text-xs text-muted-foreground">CNPJ: 12.345.678/0001-99</p>
                      <p className="text-sm font-medium mt-2">{previewClosing.label}</p>
                    </div>
                    <div>
                      <p className="text-sm"><strong>Cliente:</strong> {previewClosing.clientName}</p>
                      <p className="text-sm"><strong>Período:</strong> {previewClosing.period}</p>
                      <p className="text-sm"><strong>Emissão:</strong> {new Date(previewClosing.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>O.S.</TableHead>
                          <TableHead>Serviço</TableHead>
                          <TableHead className="text-right">Desconto</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewClosing.notes.flatMap(n =>
                          n.services.length > 0
                            ? n.services.map((s, i) => {
                              const svcTotal = calcServiceTotal(s);
                              const gross = s.price * s.quantity;
                              const discAmt = gross - svcTotal;
                              return (
                                <TableRow key={`${n.id}-${i}`}>
                                  {i === 0 && <TableCell rowSpan={n.services.length} className="font-mono font-bold text-primary">{n.number}</TableCell>}
                                  <TableCell>{s.name} ×{s.quantity}</TableCell>
                                  <TableCell className="text-right text-destructive text-xs">
                                    {discAmt > 0 ? `-R$ ${discAmt.toFixed(2)}` : '—'}
                                  </TableCell>
                                  <TableCell className="text-right">R$ {svcTotal.toFixed(2)}</TableCell>
                                </TableRow>
                              );
                            })
                            : [
                              <TableRow key={n.id}>
                                <TableCell className="font-mono font-bold text-primary">{n.number}</TableCell>
                                <TableCell className="text-muted-foreground">Serviços diversos</TableCell>
                                <TableCell className="text-right">—</TableCell>
                                <TableCell className="text-right">R$ {n.total.toFixed(2)}</TableCell>
                              </TableRow>
                            ]
                        )}
                      </TableBody>
                    </Table>
                    <div className="text-right border-t pt-3">
                      <span className="text-sm text-muted-foreground mr-3">Total:</span>
                      <span className="text-2xl font-bold text-primary">R$ {previewClosing.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => toast({ title: 'PDF gerado (mock)' })}><FileText className="w-4 h-4 mr-1.5" /> Baixar PDF</Button>
                    <Button variant="outline" onClick={() => toast({ title: 'Imprimindo... (mock)' })}><Printer className="w-4 h-4 mr-1.5" /> Imprimir</Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
