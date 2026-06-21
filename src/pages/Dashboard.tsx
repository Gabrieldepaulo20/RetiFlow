import { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, NoteStatus, FINAL_STATUSES } from '@/types';
import {
  FileText, TrendingUp,
  CheckCircle2,
  Info, Landmark, PiggyBank, Calculator,
  CalendarDays, Filter,
  Receipt,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  CartesianGrid, Cell,
  AreaChart, Area,
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DASHBOARD_ACCOUNTING_START_LABEL,
  DASHBOARD_ACCOUNTING_START_TIME,
  clampDashboardAccountingRange,
  getDashboardRevenueDate,
  getFinalizedRevenueNotesInRange,
  getPaidPayablesInRange,
  getPayablePaidAmount,
  getReceivedNotesInRange,
  getReceivableNotes,
  isDashboardRevenueEligibleNote,
  toComparableTime,
} from '@/services/domain/dashboardFinance';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';

// ── Helpers ──────────────────────────────────────────────────────────────────

type DashboardRangePreset = 'month' | `year-${number}` | 'custom';

const BAR_COLORS: Partial<Record<NoteStatus, string>> = {
  ABERTO: 'hsl(var(--info))',
  EM_ANALISE: 'hsl(var(--warning))',
  ORCAMENTO: '#f97316',
  APROVADO: 'hsl(var(--primary))',
  EM_EXECUCAO: 'hsl(var(--accent))',
  AGUARDANDO_COMPRA: '#eab308',
  PRONTA: 'hsl(var(--success))',
  ENTREGUE: 'hsl(var(--secondary))',
  RECUSADO: '#fb7185',
  SEM_CONSERTO: '#a1a1aa',
};

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtBRLFull(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDateInput(value: string, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function InlineInfo({ label }: { label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label="Ver explicação da métrica"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-5 sm:w-5"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[min(18rem,calc(100vw-2rem))] text-xs leading-relaxed"
        onClick={(event) => event.stopPropagation()}
      >
        {label}
      </PopoverContent>
    </Popover>
  );
}

const financialMetricButtonClass = 'min-h-[64px] rounded-lg border border-border/70 bg-background p-1.5 text-left transition sm:min-h-[74px] sm:rounded-xl sm:p-2.5 lg:min-h-[82px] lg:p-3';
const financialMetricLabelClass = 'flex items-start gap-0.5 text-[9px] font-medium leading-tight text-muted-foreground sm:gap-1 sm:text-[11px]';
const financialMetricValueClass = 'mt-1 truncate text-[13px] font-display font-bold leading-none sm:text-lg lg:text-xl';
const financialMetricIconClass = 'hidden h-6 w-6 shrink-0 items-center justify-center rounded-lg sm:flex lg:h-7 lg:w-7';

// ── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { notes, payables } = useData();
  const navigate = useNavigate();
  const [rangePreset, setRangePreset] = useState<DashboardRangePreset>('month');
  const [customStartDate, setCustomStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const now = useMemo(() => new Date(), []);
  const availableFinancialYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear()]);
    notes.forEach((note) => {
      const createdYear = new Date(note.createdAt).getFullYear();
      if (Number.isFinite(createdYear)) years.add(createdYear);
      if (isDashboardRevenueEligibleNote(note)) {
        const revenueYear = new Date(getDashboardRevenueDate(note)).getFullYear();
        if (Number.isFinite(revenueYear)) years.add(revenueYear);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [notes, now]);
  const selectedYearFilterValue = rangePreset.startsWith('year-') ? rangePreset : 'none';

  const selectedPeriod = useMemo(() => {
    const todayEnd = endOfDay(now);

    if (rangePreset === 'month') {
      return {
        start: startOfMonth(now),
        end: todayEnd,
        label: format(now, "MMMM 'de' yyyy", { locale: ptBR }),
      };
    }

    if (rangePreset.startsWith('year-')) {
      const selectedYear = Number(rangePreset.replace('year-', ''));
      const safeYear = Number.isFinite(selectedYear) ? selectedYear : now.getFullYear();
      const isCurrentYear = safeYear === now.getFullYear();
      return {
        start: startOfDay(new Date(safeYear, 0, 1)),
        end: isCurrentYear ? todayEnd : endOfDay(new Date(safeYear, 11, 31)),
        label: String(safeYear),
      };
    }

    if (rangePreset === 'custom') {
      const fallbackStart = startOfMonth(now);
      const fallbackEnd = todayEnd;
      const parsedStart = startOfDay(parseDateInput(customStartDate, fallbackStart));
      const parsedEnd = endOfDay(parseDateInput(customEndDate, fallbackEnd));
      const start = parsedStart.getTime() <= parsedEnd.getTime() ? parsedStart : parsedEnd;
      const end = parsedStart.getTime() <= parsedEnd.getTime() ? parsedEnd : parsedStart;
      return {
        start,
        end,
        label: `${format(start, 'dd/MM/yyyy')} até ${format(end, 'dd/MM/yyyy')}`,
      };
    }

    return {
      start: startOfMonth(now),
      end: todayEnd,
      label: format(now, "MMMM 'de' yyyy", { locale: ptBR }),
    };
  }, [customEndDate, customStartDate, now, rangePreset]);

  const selectedPeriodStart = selectedPeriod.start.getTime();
  const selectedPeriodEnd = selectedPeriod.end.getTime();
  const selectedRange = useMemo(
    () => ({ startTime: selectedPeriodStart, endTime: selectedPeriodEnd }),
    [selectedPeriodEnd, selectedPeriodStart],
  );
  const selectedAccountingRange = useMemo(
    () => clampDashboardAccountingRange(selectedRange),
    [selectedRange],
  );
  const isInSelectedCalendarPeriod = useCallback((value?: string | null) => {
    const time = toComparableTime(value);
    return Number.isFinite(time) && time >= selectedRange.startTime && time <= selectedRange.endTime;
  }, [selectedRange.endTime, selectedRange.startTime]);
  const isInSelectedAccountingPeriod = useCallback((value?: string | null) => {
    const time = toComparableTime(value);
    return Number.isFinite(time) && time >= selectedAccountingRange.startTime && time <= selectedAccountingRange.endTime;
  }, [selectedAccountingRange.endTime, selectedAccountingRange.startTime]);

  // ── Core metrics ────────────────────────────────────────────────────────
  const revenueRecognizedNotes = useMemo(
    () => notes.filter(isDashboardRevenueEligibleNote),
    [notes],
  );

  const totalRevenue = useMemo(
    () => revenueRecognizedNotes.reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes],
  );

  // ── Status distribution ──────────────────────────────────────────────────
  const statusData = useMemo(() => {
    const counts = new Map<NoteStatus, number>();
    // EXCLUIDA é soft-delete: não entra na distribuição de status.
    for (const n of notes) {
      if (n.status === 'EXCLUIDA') continue;
      counts.set(n.status, (counts.get(n.status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status],
        count,
        color: BAR_COLORS[status] ?? '#94a3b8',
        status,
      }))
      .sort((a, b) => {
        const aF = FINAL_STATUSES.has(a.status as NoteStatus);
        const bF = FINAL_STATUSES.has(b.status as NoteStatus);
        if (aF !== bF) return aF ? 1 : -1;
        return b.count - a.count;
      });
  }, [notes]);

  // ── Monthly revenue chart — last 6 months ───────────────────────────────
  const monthlyData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i);
      const start = startOfMonth(d).getTime();
      const end = endOfMonth(d).getTime();
      const valor = revenueRecognizedNotes
        .filter(n => {
          const t = toComparableTime(getDashboardRevenueDate(n));
          return t >= start && t <= end;
        })
        .reduce((sum, n) => sum + n.totalAmount, 0);
      const count = revenueRecognizedNotes
        .filter(n => {
          const t = toComparableTime(getDashboardRevenueDate(n));
          return t >= start && t <= end;
        }).length;
      return { month: format(d, 'MMM', { locale: ptBR }), valor, count };
    });
  }, [revenueRecognizedNotes, now]);

  const activePayables = useMemo(
    () => payables.filter((payable) => payable.deletedAt == null),
    [payables],
  );

  const periodNotes = useMemo(
    () => notes.filter((note) => note.status !== 'EXCLUIDA' && isInSelectedCalendarPeriod(note.createdAt)),
    [isInSelectedCalendarPeriod, notes],
  );

  const periodPotentialAmount = useMemo(
    () => periodNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [periodNotes],
  );

  const periodAverageTicket = periodNotes.length > 0 ? periodPotentialAmount / periodNotes.length : 0;

  const periodDeliveredNotes = useMemo(
    () => getFinalizedRevenueNotesInRange(revenueRecognizedNotes, selectedRange),
    [revenueRecognizedNotes, selectedRange],
  );

  const periodDeliveredAmount = useMemo(
    () => periodDeliveredNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [periodDeliveredNotes],
  );

  const periodPayables = useMemo(
    () => activePayables.filter((payable) => (
      payable.status !== 'CANCELADO'
      && isInSelectedAccountingPeriod(payable.competencyDate ?? payable.dueDate ?? payable.createdAt)
    )),
    [activePayables, isInSelectedAccountingPeriod],
  );

  const periodPayablesTotal = useMemo(
    () => periodPayables.reduce((sum, payable) => sum + payable.finalAmount, 0),
    [periodPayables],
  );

  const periodPayablesRemaining = useMemo(
    () => periodPayables.reduce((sum, payable) => {
      if (payable.status === 'PAGO' || payable.status === 'CANCELADO') return sum;
      const paid = payable.paidAmount ?? 0;
      return sum + Math.max(0, payable.finalAmount - paid);
    }, 0),
    [periodPayables],
  );

  const periodPayablesPaidPart = Math.max(0, periodPayablesTotal - periodPayablesRemaining);

  const periodPaidPayables = useMemo(
    () => getPaidPayablesInRange(activePayables, selectedAccountingRange),
    [activePayables, selectedAccountingRange],
  );

  const periodPaidExpenses = useMemo(
    () => periodPaidPayables.reduce((sum, payable) => sum + getPayablePaidAmount(payable), 0),
    [periodPaidPayables],
  );

  const periodProfit = periodDeliveredAmount - periodPaidExpenses;
  const periodProfitMargin = periodDeliveredAmount > 0 ? (periodProfit / periodDeliveredAmount) * 100 : null;

  // ── Caixa (regime de caixa: dinheiro que entrou/saiu de fato) ────────────
  const periodReceivedNotes = useMemo(
    () => getReceivedNotesInRange(notes, selectedAccountingRange),
    [notes, selectedAccountingRange],
  );
  const periodReceived = useMemo(
    () => periodReceivedNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [periodReceivedNotes],
  );
  const cashBalance = periodReceived - periodPaidExpenses;
  // Posição em aberto (snapshot, não escopado ao período):
  const openReceivableAmount = useMemo(
    () => getReceivableNotes(notes).reduce((sum, note) => sum + note.totalAmount, 0),
    [notes],
  );
  const openPayableAmount = useMemo(
    () => activePayables
      .filter((payable) => payable.status !== 'PAGO' && payable.status !== 'CANCELADO')
      .reduce((sum, payable) => sum + Math.max(0, payable.finalAmount - (payable.paidAmount ?? 0)), 0),
    [activePayables],
  );

  const periodFinancialData = useMemo(() => {
    if (selectedRange.startTime > selectedRange.endTime) {
      return [];
    }

    const periodStart = selectedPeriod.start;
    const periodEnd = selectedPeriod.end;
    const days = Math.max(0, differenceInDays(periodEnd, periodStart));
    const groupByMonth = days > 70;
    const rows = new Map<string, { label: string; entrada: number; saida: number; lucro: number }>();
    const getKey = (date: Date) => groupByMonth ? format(date, 'yyyy-MM') : format(date, 'yyyy-MM-dd');
    const getLabel = (date: Date) => groupByMonth ? format(date, 'MM/yy') : format(date, 'dd/MM');
    const ensure = (date: Date) => {
      const key = getKey(date);
      if (!rows.has(key)) rows.set(key, { label: getLabel(date), entrada: 0, saida: 0, lucro: 0 });
      return rows.get(key)!;
    };

    if (groupByMonth) {
      let cursor = startOfMonth(periodStart);
      while (cursor.getTime() <= periodEnd.getTime()) {
        ensure(cursor);
        cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
      }
    } else {
      eachDayOfInterval({ start: periodStart, end: periodEnd }).forEach(ensure);
    }

    periodDeliveredNotes.forEach((note) => {
      const row = ensure(new Date(toComparableTime(getDashboardRevenueDate(note))));
      row.entrada += note.totalAmount;
    });
    periodPaidPayables.forEach((payable) => {
      const row = ensure(new Date(toComparableTime(payable.paidAt)));
      row.saida += getPayablePaidAmount(payable);
    });

    return Array.from(rows.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => ({ ...row, lucro: row.entrada - row.saida }));
  }, [periodDeliveredNotes, periodPaidPayables, selectedPeriod.end, selectedPeriod.start, selectedRange.endTime, selectedRange.startTime]);

  const hasPeriodFinancialData = periodFinancialData.some((item) => item.entrada > 0 || item.saida > 0);

  // ── Resultado anual ──────────────────────────────────────────────────────
  const currentYear = now.getFullYear();
  const startYear = new Date(currentYear, 0, 1).getTime();
  const endYear = new Date(currentYear, 11, 31, 23, 59, 59).getTime();

  const yearlyRevenue = useMemo(
    () => revenueRecognizedNotes
      .filter(n => { const t = toComparableTime(getDashboardRevenueDate(n)); return t >= startYear && t <= endYear; })
      .reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes, startYear, endYear],
  );

  const yearlyCreatedNotes = useMemo(
    () => notes.filter((note) => {
      if (note.status === 'EXCLUIDA') return false;
      const createdTime = new Date(note.createdAt).getTime();
      return Number.isFinite(createdTime) && createdTime >= startYear && createdTime <= endYear;
    }),
    [notes, startYear, endYear],
  );

  const yearlyPotentialRevenue = useMemo(
    () => yearlyCreatedNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [yearlyCreatedNotes],
  );

  const yearlyAverageTicket = yearlyCreatedNotes.length > 0 ? yearlyPotentialRevenue / yearlyCreatedNotes.length : 0;

  const yearlyExpenses = useMemo(
    () => getPaidPayablesInRange(activePayables, clampDashboardAccountingRange({ startTime: startYear, endTime: endYear }))
      .reduce((s, p) => s + getPayablePaidAmount(p), 0),
    [activePayables, startYear, endYear],
  );

  const yearlyResult = yearlyRevenue - yearlyExpenses;
  // Saídas só têm base completa a partir do corte contábil; se o corte cai dentro do
  // ano, "Saídas no ano" e o resultado são parciais — a UI precisa avisar (não somar
  // receita do ano cheio contra despesa parcial sem deixar isso explícito).
  const yearlyExpensesPartial = startYear < DASHBOARD_ACCOUNTING_START_TIME && endYear >= DASHBOARD_ACCOUNTING_START_TIME;

  const hasStatusData = statusData.length > 0;
  const hasRevenueHistory = monthlyData.some((item) => item.valor > 0);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(now, "MMMM 'de' yyyy", { locale: ptBR })} · {notes.length} O.S.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border/70 bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Filter className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold leading-tight">Resultado financeiro</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Período: {selectedPeriod.label} · faturamento por entrega da O.S.
                  </p>
                </div>
                <Badge className={cn(
                  'ml-0 lg:ml-2',
                  periodProfit >= 0
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                    : 'bg-red-50 text-red-700 hover:bg-red-50',
                )}>
                  {periodProfit >= 0 ? 'Lucro positivo' : 'Lucro negativo'}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-background p-1">
                <button
                  type="button"
                  onClick={() => setRangePreset('month')}
                  className={cn(
                    'h-8 rounded-lg px-3 text-xs font-medium transition',
                    rangePreset === 'month'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  Este mês
                </button>

                <Select
                  value={selectedYearFilterValue}
                  onValueChange={(value) => {
                    if (value !== 'none') setRangePreset(value as DashboardRangePreset);
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      'h-8 w-[86px] rounded-lg border-0 px-3 text-xs font-medium shadow-none focus:ring-0',
                      rangePreset.startsWith('year-')
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="none" disabled>Ano</SelectItem>
                    {availableFinancialYears.map((year) => (
                      <SelectItem key={year} value={`year-${year}`}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  onClick={() => setRangePreset('custom')}
                  className={cn(
                    'h-8 rounded-lg px-3 text-xs font-medium transition',
                    rangePreset === 'custom'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  Personalizado
                </button>
              </div>

              {rangePreset === 'custom' ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background px-2.5 py-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <label className="sr-only" htmlFor="dashboard-start-date">Data inicial</label>
                  <input
                    id="dashboard-start-date"
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <label className="sr-only" htmlFor="dashboard-end-date">Data final</label>
                  <input
                    id="dashboard-end-date"
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1.5 sm:gap-2 sm:p-2.5 md:grid-cols-4 xl:grid-cols-7 xl:p-3">
            <button
              type="button"
              onClick={() => navigate('/notas-entrada')}
              className={cn(financialMetricButtonClass, 'hover:border-primary/30 hover:bg-primary/5')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={financialMetricLabelClass}>
                    Entradas previstas
                    <InlineInfo label="Valor potencial das O.S. lançadas no período, sem contar O.S. excluídas. É uma previsão: só vira faturamento quando a O.S. fica em um status faturável." />
                  </p>
                  <p className={financialMetricValueClass}>R$ {fmtBRL(periodPotentialAmount)}</p>
                </div>
                <div className={cn(financialMetricIconClass, 'bg-sky-50 text-sky-700')}>
                  <FileText className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 hidden text-[11px] leading-snug text-muted-foreground">
                {periodNotes.length} O.S. lançada{periodNotes.length !== 1 ? 's' : ''} no período
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/notas-entrada?status=ENTREGUE')}
              className={cn(financialMetricButtonClass, 'hover:border-emerald-300 hover:bg-emerald-50/60')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={financialMetricLabelClass}>
                    Faturamento real
                    <InlineInfo label="Receita por competência: soma das O.S. faturáveis pela data de entrega/finalização (fato gerador). O.S. legadas, anteriores a 01/06/2026, usam o prazo, porque foram finalizadas em lote na migração. O pagamento posterior não muda o mês." />
                  </p>
                  <p className={cn(financialMetricValueClass, 'text-emerald-700')}>R$ {fmtBRL(periodDeliveredAmount)}</p>
                </div>
                <div className={cn(financialMetricIconClass, 'bg-emerald-50 text-emerald-700')}>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 hidden text-[11px] leading-snug text-muted-foreground">
                {periodDeliveredNotes.length} O.S. faturável{periodDeliveredNotes.length !== 1 ? 'eis' : ''} no período · total geral R$ {fmtBRL(totalRevenue)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/notas-entrada')}
              className={cn(financialMetricButtonClass, 'hover:border-violet-200 hover:bg-violet-50/50')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={financialMetricLabelClass}>
                    Ticket médio
                    <InlineInfo label="Média das O.S. lançadas no período selecionado, considerando todas as notas do sistema exceto excluídas." />
                  </p>
                  <p className={cn(financialMetricValueClass, 'text-violet-700')}>R$ {fmtBRL(periodAverageTicket)}</p>
                </div>
                <div className={cn(financialMetricIconClass, 'bg-violet-50 text-violet-700')}>
                  <Calculator className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 hidden text-[11px] leading-snug text-muted-foreground">
                Base: {periodNotes.length} O.S. lançada{periodNotes.length !== 1 ? 's' : ''}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/contas-a-pagar')}
              className={cn(financialMetricButtonClass, 'hover:border-orange-200 hover:bg-orange-50/50')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={financialMetricLabelClass}>
                    Contas lançadas
                    <InlineInfo label="Total das contas cadastradas no Contas a Pagar para o período, usando competência financeira ou vencimento." />
                  </p>
                  <p className={cn(financialMetricValueClass, 'text-orange-700')}>R$ {fmtBRL(periodPayablesTotal)}</p>
                </div>
                <div className={cn(financialMetricIconClass, 'bg-orange-50 text-orange-700')}>
                  <Receipt className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 hidden text-[11px] leading-snug text-muted-foreground">
                {periodPayables.length} conta{periodPayables.length !== 1 ? 's' : ''} · pago R$ {fmtBRL(periodPayablesPaidPart)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/contas-a-pagar')}
              className={cn(financialMetricButtonClass, 'hover:border-red-200 hover:bg-red-50/50')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={financialMetricLabelClass}>
                    Contas pagas
                    <InlineInfo label={`Saída de caixa: soma das contas marcadas como pagas ou parciais, usando a data real do pagamento dentro do período e nunca antes de ${DASHBOARD_ACCOUNTING_START_LABEL}.`} />
                  </p>
                  <p className={cn(financialMetricValueClass, 'text-red-600')}>R$ {fmtBRL(periodPaidExpenses)}</p>
                </div>
                <div className={cn(financialMetricIconClass, 'bg-red-50 text-red-600')}>
                  <Landmark className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 hidden text-[11px] leading-snug text-muted-foreground">
                {periodPaidPayables.length} pagamento{periodPaidPayables.length !== 1 ? 's' : ''} no período · desde {DASHBOARD_ACCOUNTING_START_LABEL}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/contas-a-pagar?status=pendente')}
              className={cn(financialMetricButtonClass, 'hover:border-amber-200 hover:bg-amber-50/50')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={financialMetricLabelClass}>
                    Falta pagar
                    <InlineInfo label="Saldo ainda aberto das contas lançadas no período. Contas parciais entram somente com o valor restante." />
                  </p>
                  <p className={cn(financialMetricValueClass, 'text-amber-700')}>R$ {fmtBRL(periodPayablesRemaining)}</p>
                </div>
                <div className={cn(financialMetricIconClass, 'bg-amber-50 text-amber-700')}>
                  <Landmark className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 hidden text-[11px] leading-snug text-muted-foreground">
                Dentro das contas lançadas no período
              </p>
            </button>

            <div className={cn(
              financialMetricButtonClass,
              periodProfit >= 0
                ? 'border-primary/25 bg-primary/5'
                : 'border-red-200 bg-red-50/60',
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={financialMetricLabelClass}>
                    Lucro do período
                    <InlineInfo label={`Cálculo: faturamento real (por entrega da O.S.) menos contas pagas no mesmo período. Contas pagas usam a data real de pagamento e a base a partir de ${DASHBOARD_ACCOUNTING_START_LABEL}.`} />
                  </p>
                  <p className={cn(financialMetricValueClass, periodProfit >= 0 ? 'text-primary' : 'text-red-700')}>
                    R$ {fmtBRLFull(periodProfit)}
                  </p>
                </div>
                <div className={cn(financialMetricIconClass, periodProfit >= 0 ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-700')}>
                  <PiggyBank className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 hidden text-[11px] leading-snug text-muted-foreground">
                Faturamento real - contas pagas{periodProfitMargin !== null ? ` · margem ${periodProfitMargin.toFixed(1)}%` : ''}
              </p>
            </div>
          </div>

          <div className="border-t border-border/70 px-2 pb-4 sm:px-4">
            {hasPeriodFinancialData ? (
              <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-background via-muted/20 to-primary/5 p-2 shadow-inner sm:p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={periodFinancialData} margin={{ top: 18, right: 8, left: -12, bottom: 4 }} barGap={6} barCategoryGap="30%">
                    <defs>
                      <linearGradient id="entradaFinanceira" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      </linearGradient>
                      <linearGradient id="saidaFinanceira" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.92} />
                        <stop offset="100%" stopColor="#fb7185" stopOpacity={0.42} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} width={36} />
                    <RechartsTooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
                      formatter={(value: number, name: string) => [
                        `R$ ${value.toLocaleString('pt-BR')}`,
                        name === 'entrada' ? 'Faturamento' : name === 'saida' ? 'Contas pagas' : 'Lucro',
                      ]}
                      contentStyle={{
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 16,
                        boxShadow: '0 14px 34px rgba(15, 23, 42, 0.12)',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="entrada" name="entrada" fill="url(#entradaFinanceira)" radius={[10, 10, 4, 4]} barSize={18} />
                    <Bar dataKey="saida" name="saida" fill="url(#saidaFinanceira)" radius={[10, 10, 4, 4]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <SectionEmptyState
                title="Sem movimentação no período"
                description="Escolha outro intervalo para ver faturamento por entrega da O.S., contas pagas e lucro."
                className="min-h-[220px] border-0 bg-transparent px-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Caixa do período (regime de caixa) ── */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600">
              <Landmark className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="flex items-center gap-1 text-sm font-semibold leading-tight">
                Caixa do período
                <InlineInfo label={`Dinheiro de fato (regime de caixa): Recebido = O.S. faturáveis pagas, pela data de pagamento; Pago = contas pagas no período. Diferente do faturamento (competência). Base de caixa a partir de ${DASHBOARD_ACCOUNTING_START_LABEL}.`} />
              </h2>
              <p className="text-[11px] text-muted-foreground">{selectedPeriod.label} · entrou × saiu</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-50/60 p-2.5 sm:p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/70">Recebido</p>
              <p className="mt-1 text-base font-display font-bold tabular-nums text-emerald-700 sm:text-xl">R$ {fmtBRLFull(periodReceived)}</p>
            </div>
            <div className="rounded-xl bg-red-50/60 p-2.5 sm:p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-red-700/70">Pago</p>
              <p className="mt-1 text-base font-display font-bold tabular-nums text-red-700 sm:text-xl">R$ {fmtBRLFull(periodPaidExpenses)}</p>
            </div>
            <div className={cn('rounded-xl p-2.5 sm:p-3', cashBalance >= 0 ? 'bg-primary/5' : 'bg-red-50/60')}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Saldo</p>
              <p className={cn('mt-1 text-base font-display font-bold tabular-nums sm:text-xl', cashBalance >= 0 ? 'text-primary' : 'text-red-700')}>R$ {fmtBRLFull(cashBalance)}</p>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                A receber <span className="text-[10px] opacity-60">(em aberto)</span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground/80">R$ {fmtBRL(openReceivableAmount)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5 text-red-500" />
                A pagar <span className="text-[10px] opacity-60">(em aberto)</span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground/80">R$ {fmtBRL(openPayableAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts row 1: status bar + area chart */}
      <ErrorBoundary
        fallback={(
          <SectionErrorState
            title="Falha ao carregar os gráficos operacionais"
            description="Essa parte do dashboard pode ser recarregada depois sem afetar o restante da página."
          />
        )}
      >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-2">
            {hasStatusData ? (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={statusData} barCategoryGap="28%">
                  <XAxis dataKey="name" tick={{ fontSize: 9.5 }} interval={0} angle={-18} textAnchor="end" height={46} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip
                    formatter={(v: number) => [`${v} nota${v !== 1 ? 's' : ''}`, 'Quantidade']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SectionEmptyState
                title="Sem notas para distribuir"
                description="Assim que as ordens de serviço começarem a circular, este gráfico passa a mostrar a fila por status."
                className="min-h-[210px] border-0 bg-transparent px-2"
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Faturamento — 6 meses</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-2">
            {hasRevenueHistory ? (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <RechartsTooltip
                    formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, 'Faturamento']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="valor"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    fill="url(#colorValor)"
                    dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <SectionEmptyState
                title="Sem histórico de faturamento"
                description="O gráfico mensal começa a preencher depois das primeiras O.S. faturáveis."
                className="min-h-[210px] border-0 bg-transparent px-2"
              />
            )}
          </CardContent>
        </Card>
      </div>

      </ErrorBoundary>

      {/* Resultado Anual */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <PiggyBank className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resultado de {currentYear}</p>
                <p className={`text-xl font-display font-bold tracking-tight sm:text-2xl ${yearlyResult >= 0 ? 'text-success' : 'text-destructive'}`}>
                  R$ {fmtBRLFull(Math.abs(yearlyResult))}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">{yearlyResult >= 0 ? 'de resultado positivo' : 'de resultado negativo'}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm sm:gap-5">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">O.S. criadas no ano</p>
                <p className="mt-1 font-semibold text-sky-700">R$ {fmtBRL(yearlyPotentialRevenue)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{yearlyCreatedNotes.length} O.S.</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Faturamento real</p>
                <p className="mt-1 font-semibold text-success">R$ {fmtBRL(yearlyRevenue)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Saídas no ano</p>
                <p className="mt-1 font-semibold text-destructive">R$ {fmtBRL(yearlyExpenses)}</p>
                {yearlyExpensesPartial && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">desde {DASHBOARD_ACCOUNTING_START_LABEL}</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Ticket médio</p>
                <p className="mt-1 font-semibold">R$ {fmtBRL(yearlyAverageTicket)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
