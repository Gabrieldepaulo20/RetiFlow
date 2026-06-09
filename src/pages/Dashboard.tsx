import { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, NoteStatus, FINAL_STATUSES } from '@/types';
import {
  FileText, DollarSign, TrendingUp, AlertCircle,
  CheckCircle2, Timer, Users, Receipt,
  ArrowUpRight, ArrowDownRight, Minus,
  Info, Landmark, PiggyBank,
  CalendarDays, Filter,
  type LucideIcon,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  CartesianGrid, Cell,
  AreaChart, Area,
} from 'recharts';
import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import {
  format, subMonths, startOfMonth, endOfMonth,
  differenceInDays, subDays, startOfDay, endOfDay, eachDayOfInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  DASHBOARD_ACCOUNTING_START_LABEL,
  DASHBOARD_REVENUE_STATUSES,
  clampDashboardAccountingRange,
  getDashboardRevenueDate,
  getFinalizedRevenueNotesInRange,
  getPaidPayablesInRange,
  getPayablePaidAmount,
  isDashboardAccountingDate,
} from '@/services/domain/dashboardFinance';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set<NoteStatus>([
  'ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'AGUARDANDO_COMPRA', 'PRONTA',
]);

const REVENUE_RECOGNIZED_STATUSES = DASHBOARD_REVENUE_STATUSES;

type DashboardRangePreset = '30d' | '90d' | 'month' | `year-${number}` | 'custom';

const RANGE_OPTIONS: Array<{ value: DashboardRangePreset; label: string }> = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'month', label: 'Este mês' },
];

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

function pct(a: number, b: number) {
  if (b === 0) return null;
  return ((a - b) / b) * 100;
}

function parseDateInput(value: string, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function InlineInfo({ label }: { label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/45 transition-colors hover:text-muted-foreground"
    >
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

// Active statuses joined for URL param
const ACTIVE_STATUSES_PARAM = 'ABERTO,EM_ANALISE,ORCAMENTO,APROVADO,EM_EXECUCAO,AGUARDANDO_COMPRA,PRONTO,ENTREGUE';

export default function Dashboard() {
  const { notes, clients, payables } = useData();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [rangePreset, setRangePreset] = useState<DashboardRangePreset>('30d');
  const [customStartDate, setCustomStartDate] = useState(() => format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const now = useMemo(() => new Date(), []);
  const startCurrent = startOfMonth(now).getTime();
  const endCurrent = endOfMonth(now).getTime();
  const startPrev = startOfMonth(subMonths(now, 1)).getTime();
  const endPrev = endOfMonth(subMonths(now, 1)).getTime();
  const availableFinancialYears = useMemo(() => {
    const years = new Set<number>();
    notes.forEach((note) => {
      const createdYear = new Date(note.createdAt).getFullYear();
      if (Number.isFinite(createdYear)) years.add(createdYear);
      if (REVENUE_RECOGNIZED_STATUSES.has(note.status)) {
        const revenueYear = new Date(getDashboardRevenueDate(note)).getFullYear();
        if (Number.isFinite(revenueYear)) years.add(revenueYear);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [notes]);

  const periodRangeOptions = useMemo(
    () => [
      ...RANGE_OPTIONS,
      ...availableFinancialYears.map((year) => ({
        value: `year-${year}` as DashboardRangePreset,
        label: String(year),
      })),
      { value: 'custom' as DashboardRangePreset, label: 'Personalizado' },
    ],
    [availableFinancialYears],
  );

  const selectedPeriod = useMemo(() => {
    const todayEnd = endOfDay(now);

    if (rangePreset === '90d') {
      return {
        start: startOfDay(subDays(now, 89)),
        end: todayEnd,
        label: 'últimos 90 dias',
      };
    }

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
      const fallbackStart = startOfDay(subDays(now, 29));
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
      start: startOfDay(subDays(now, 29)),
      end: todayEnd,
      label: 'últimos 30 dias',
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
  const selectedAccountingStartDate = useMemo(
    () => new Date(selectedAccountingRange.startTime),
    [selectedAccountingRange.startTime],
  );
  const isInSelectedPeriod = useCallback((value?: string | null) => {
    if (!value) return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= selectedAccountingRange.startTime && time <= selectedAccountingRange.endTime;
  }, [selectedAccountingRange.endTime, selectedAccountingRange.startTime]);

  // ── Core metrics ────────────────────────────────────────────────────────
  const openCount = useMemo(
    () => notes.filter(n => ACTIVE_STATUSES.has(n.status)).length,
    [notes],
  );

  const revenueRecognizedNotes = useMemo(
    () => notes.filter(n => (
      REVENUE_RECOGNIZED_STATUSES.has(n.status)
      && isDashboardAccountingDate(getDashboardRevenueDate(n))
    )),
    [notes],
  );

  const totalRevenue = useMemo(
    () => revenueRecognizedNotes.reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes],
  );

  const avgDaysMetric = useMemo(() => {
    const finalized = revenueRecognizedNotes
      .map((note) => {
        const createdAt = new Date(note.createdAt);
        const finalizedAt = new Date(getDashboardRevenueDate(note));
        if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(finalizedAt.getTime())) {
          return null;
        }
        const days = differenceInDays(finalizedAt, createdAt);
        return { days, normalizedDays: Math.max(0, days) };
      })
      .filter((item): item is { days: number; normalizedDays: number } => item !== null);

    if (!finalized.length) return { value: null as string | null, adjustedCount: 0 };

    const adjustedCount = finalized.filter((item) => item.days < 0).length;
    const total = finalized.reduce((sum, item) => sum + item.normalizedDays, 0);
    return { value: (total / finalized.length).toFixed(1), adjustedCount };
  }, [revenueRecognizedNotes]);
  const avgDays = avgDaysMetric.value;

  const overdueNotes = useMemo(() => {
    const threshold = Date.now() - 7 * 86_400_000;
    return notes.filter(
      n => ACTIVE_STATUSES.has(n.status) && new Date(n.updatedAt).getTime() < threshold,
    );
  }, [notes]);

  // ── Monthly revenue ──────────────────────────────────────────────────────
  const currentMonthRevenue = useMemo(
    () => revenueRecognizedNotes
      .filter(n => {
        const t = new Date(getDashboardRevenueDate(n)).getTime();
        return t >= startCurrent && t <= endCurrent;
      })
      .reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes, startCurrent, endCurrent],
  );

  const prevMonthRevenue = useMemo(
    () => revenueRecognizedNotes
      .filter(n => {
        const t = new Date(getDashboardRevenueDate(n)).getTime();
        return t >= startPrev && t <= endPrev;
      })
      .reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes, startPrev, endPrev],
  );

  const monthGrowth = pct(currentMonthRevenue, prevMonthRevenue);

  // ── Ticket médio ────────────────────────────────────────────────────────
  const ticketMedio = revenueRecognizedNotes.length > 0
    ? totalRevenue / revenueRecognizedNotes.length
    : 0;

  // ── Clientes ativos ─────────────────────────────────────────────────────
  const activeClientsCount = useMemo(
    () => clients.filter(c => c.isActive).length,
    [clients],
  );

  const inactiveClientsCount = clients.length - activeClientsCount;

  // ── Taxa de conclusão ────────────────────────────────────────────────────
  const closedNotes = useMemo(
    () => notes.filter(n => FINAL_STATUSES.has(n.status)),
    [notes],
  );

  const successBaseCount = closedNotes.filter(n => !REVENUE_RECOGNIZED_STATUSES.has(n.status)).length + revenueRecognizedNotes.length;
  const successRate = successBaseCount > 0
    ? Math.round((revenueRecognizedNotes.length / successBaseCount) * 100)
    : 0;

  // ── Status distribution ──────────────────────────────────────────────────
  const statusData = useMemo(() => {
    const counts = new Map<NoteStatus, number>();
    for (const n of notes) counts.set(n.status, (counts.get(n.status) ?? 0) + 1);
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
          const t = new Date(getDashboardRevenueDate(n)).getTime();
          return t >= start && t <= end;
        })
        .reduce((sum, n) => sum + n.totalAmount, 0);
      const count = revenueRecognizedNotes
        .filter(n => {
          const t = new Date(getDashboardRevenueDate(n)).getTime();
          return t >= start && t <= end;
        }).length;
      return { month: format(d, 'MMM', { locale: ptBR }), valor, count };
    });
  }, [revenueRecognizedNotes, now]);

  // ── KPI rows ─────────────────────────────────────────────────────────────
  type KpiCard = {
    label: string;
    value: string | number;
    sub: string;
    icon: LucideIcon;
    iconClass: string;
    subClass: string;
    tooltip: string;
    href: string;
    trend?: number | null;
  };

  const kpisRow1: KpiCard[] = [
    {
      label: 'Em andamento',
      value: openCount,
      sub: overdueNotes.length > 0 ? `${overdueNotes.length} paradas +7 dias` : 'Todas em dia',
      icon: FileText,
      iconClass: 'text-primary bg-primary/10',
      subClass: overdueNotes.length > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground',
      tooltip: 'Total de O.S. em estágios ativos: Aberto, Em análise, Orçamento, Aprovado, Em execução, Aguardando compra, Pronto e Entregue.',
      href: `/notas-entrada?status=${ACTIVE_STATUSES_PARAM}`,
    },
    {
      label: 'Finalizadas',
      value: revenueRecognizedNotes.length,
      sub: `Taxa de sucesso: ${successRate}%`,
      icon: CheckCircle2,
      iconClass: 'text-emerald-600 bg-emerald-50',
      subClass: 'text-muted-foreground',
      tooltip: `O.S. finalizadas com data de finalização a partir de ${DASHBOARD_ACCOUNTING_START_LABEL}. Essa é a etapa que representa serviço concluído e pagamento reconhecido no Dashboard.`,
      href: '/notas-entrada?status=FINALIZADO',
    },
    {
      label: 'Valor finalizado',
      value: `R$ ${fmtBRL(totalRevenue)}`,
      sub: 'Somente O.S. finalizadas',
      icon: DollarSign,
      iconClass: 'text-primary bg-primary/10',
      subClass: 'text-muted-foreground',
      tooltip: `Soma do valor total das O.S. com status Finalizado e data de finalização a partir de ${DASHBOARD_ACCOUNTING_START_LABEL}.`,
      href: '/notas-entrada?status=FINALIZADO',
    },
    {
      label: 'Tempo médio',
      value: avgDays ? `${avgDays} dias` : '—',
      sub: avgDaysMetric.adjustedCount > 0
        ? `${avgDaysMetric.adjustedCount} data${avgDaysMetric.adjustedCount !== 1 ? 's' : ''} corrigida${avgDaysMetric.adjustedCount !== 1 ? 's' : ''}`
        : 'Da abertura à finalização',
      icon: avgDays && parseFloat(avgDays) > 10 ? AlertCircle : Timer,
      iconClass: avgDays && parseFloat(avgDays) > 10
        ? 'text-amber-600 bg-amber-50'
        : 'text-sky-600 bg-sky-50',
      subClass: 'text-muted-foreground',
      tooltip: `Média de dias entre a abertura e a finalização das O.S. finalizadas a partir de ${DASHBOARD_ACCOUNTING_START_LABEL}. Datas finalizadas antes da abertura são tratadas como 0 dia para nunca exibir tempo negativo.`,
      href: '/notas-entrada?status=FINALIZADO',
    },
  ];

  const kpisRow2: KpiCard[] = [
    {
      label: 'Faturamento do mês',
      value: `R$ ${fmtBRL(currentMonthRevenue)}`,
      sub: monthGrowth !== null
        ? `${monthGrowth >= 0 ? '+' : ''}${monthGrowth.toFixed(1)}% vs mês anterior`
        : 'Sem comparação',
      icon: TrendingUp,
      iconClass: 'text-violet-600 bg-violet-50',
      subClass: monthGrowth === null ? 'text-muted-foreground' : monthGrowth >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium',
      trend: monthGrowth,
      tooltip: `Receita gerada pelas O.S. finalizadas no mês atual, considerando somente movimentos desde ${DASHBOARD_ACCOUNTING_START_LABEL}. Comparação percentual em relação ao mês anterior quando houver base válida.`,
      href: '/notas-entrada?status=FINALIZADO',
    },
    {
      label: 'Ticket médio',
      value: ticketMedio > 0 ? `R$ ${fmtBRL(ticketMedio)}` : '—',
      sub: `Base: ${revenueRecognizedNotes.length} O.S. finalizadas`,
      icon: Receipt,
      iconClass: 'text-orange-600 bg-orange-50',
      subClass: 'text-muted-foreground',
      trend: null,
      tooltip: `Valor médio por O.S. finalizada desde ${DASHBOARD_ACCOUNTING_START_LABEL}. Cálculo: valor finalizado dividido pelo número de O.S. finalizadas nesse marco contábil.`,
      href: '/notas-entrada?status=FINALIZADO',
    },
    {
      label: 'Clientes cadastrados',
      value: clients.length,
      sub: `${activeClientsCount} ativos${inactiveClientsCount > 0 ? ` · ${inactiveClientsCount} inativos` : ''}`,
      icon: Users,
      iconClass: 'text-teal-600 bg-teal-50',
      subClass: 'text-muted-foreground',
      trend: null,
      tooltip: 'Clientes cadastrados na operação visível para o login atual. Em modo Mega Master/suporte, este número não representa empresas SaaS administradas, e sim clientes da operação selecionada.',
      href: '/clientes',
    },
  ];


  const activePayables = useMemo(
    () => payables.filter((payable) => payable.deletedAt == null),
    [payables],
  );

  const periodNotes = useMemo(
    () => notes.filter((note) => isInSelectedPeriod(note.createdAt)),
    [isInSelectedPeriod, notes],
  );

  const periodDeliveredNotes = useMemo(
    () => getFinalizedRevenueNotesInRange(revenueRecognizedNotes, selectedAccountingRange),
    [revenueRecognizedNotes, selectedAccountingRange],
  );

  const periodDeliveredAmount = useMemo(
    () => periodDeliveredNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [periodDeliveredNotes],
  );

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

  const periodFinancialData = useMemo(() => {
    if (selectedAccountingRange.startTime > selectedAccountingRange.endTime) {
      return [];
    }

    const periodStart = selectedAccountingStartDate;
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
      const row = ensure(new Date(getDashboardRevenueDate(note)));
      row.entrada += note.totalAmount;
    });
    periodPaidPayables.forEach((payable) => {
      const row = ensure(new Date(payable.paidAt!));
      row.saida += getPayablePaidAmount(payable);
    });

    return Array.from(rows.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => ({ ...row, lucro: row.entrada - row.saida }));
  }, [periodDeliveredNotes, periodPaidPayables, selectedAccountingRange.endTime, selectedAccountingRange.startTime, selectedAccountingStartDate, selectedPeriod.end]);

  const hasPeriodFinancialData = periodFinancialData.some((item) => item.entrada > 0 || item.saida > 0);

  // ── Resultado anual ──────────────────────────────────────────────────────
  const currentYear = now.getFullYear();
  const startYear = new Date(currentYear, 0, 1).getTime();
  const endYear = new Date(currentYear, 11, 31, 23, 59, 59).getTime();

  const yearlyRevenue = useMemo(
    () => revenueRecognizedNotes
      .filter(n => { const t = new Date(getDashboardRevenueDate(n)).getTime(); return t >= startYear && t <= endYear; })
      .reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes, startYear, endYear],
  );

  const yearlyExpenses = useMemo(
    () => getPaidPayablesInRange(activePayables, clampDashboardAccountingRange({ startTime: startYear, endTime: endYear }))
      .reduce((s, p) => s + getPayablePaidAmount(p), 0),
    [activePayables, startYear, endYear],
  );

  const yearlyResult = yearlyRevenue - yearlyExpenses;

  const revealProps = (delay: number) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReducedMotion
      ? { duration: 0 }
      : { delay, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
  });

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
          <div className="flex flex-col gap-4 border-b border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Filter className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold leading-tight">Resultado financeiro</h2>
                  <p className="text-xs text-muted-foreground">
                    Período: {selectedPeriod.label} · base contábil desde {DASHBOARD_ACCOUNTING_START_LABEL}
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
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/70 bg-background p-1">
                {periodRangeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRangePreset(option.value)}
                    className={cn(
                      'h-8 rounded-lg px-3 text-xs font-medium transition',
                      rangePreset === option.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
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

          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => navigate('/notas-entrada')}
              className="rounded-2xl border border-border/70 bg-background p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    O.S. lançadas
                    <InlineInfo label={`Quantidade de O.S. criadas no período selecionado, considerando apenas datas a partir de ${DASHBOARD_ACCOUNTING_START_LABEL}. Não entra no faturamento até a O.S. ser finalizada.`} />
                  </p>
                  <p className="mt-2 text-2xl font-display font-bold leading-none">{periodNotes.length}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                  <FileText className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Volume do período · base desde {DASHBOARD_ACCOUNTING_START_LABEL}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/notas-entrada?status=FINALIZADO')}
              className="rounded-2xl border border-border/70 bg-background p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    Valor finalizado
                    <InlineInfo label={`Soma das O.S. com status Finalizado e data de finalização a partir de ${DASHBOARD_ACCOUNTING_START_LABEL}. O.S. antigas não entram para não distorcer o histórico.`} />
                  </p>
                  <p className="mt-2 text-2xl font-display font-bold leading-none text-emerald-700">R$ {fmtBRL(periodDeliveredAmount)}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {periodDeliveredNotes.length} O.S. finalizada{periodDeliveredNotes.length !== 1 ? 's' : ''} · desde {DASHBOARD_ACCOUNTING_START_LABEL}: R$ {fmtBRL(totalRevenue)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/contas-a-pagar')}
              className="rounded-2xl border border-border/70 bg-background p-4 text-left transition hover:border-red-200 hover:bg-red-50/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    Contas pagas
                    <InlineInfo label={`Soma das contas marcadas como pagas ou parciais, usando a data de pagamento dentro do período e nunca antes de ${DASHBOARD_ACCOUNTING_START_LABEL}.`} />
                  </p>
                  <p className="mt-2 text-2xl font-display font-bold leading-none text-red-600">R$ {fmtBRL(periodPaidExpenses)}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <Landmark className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {periodPaidPayables.length} pagamento{periodPaidPayables.length !== 1 ? 's' : ''} no período · desde {DASHBOARD_ACCOUNTING_START_LABEL}
              </p>
            </button>

            <div className={cn(
              'rounded-2xl border p-4',
              periodProfit >= 0
                ? 'border-primary/25 bg-primary/5'
                : 'border-red-200 bg-red-50/60',
            )}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    Lucro contabilizado
                    <InlineInfo label={`Cálculo: valor finalizado menos contas pagas no mesmo período. Ambos começam somente em ${DASHBOARD_ACCOUNTING_START_LABEL}.`} />
                  </p>
                  <p className={cn('mt-2 text-2xl font-display font-bold leading-none', periodProfit >= 0 ? 'text-primary' : 'text-red-700')}>
                    R$ {fmtBRLFull(periodProfit)}
                  </p>
                </div>
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', periodProfit >= 0 ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-700')}>
                  <PiggyBank className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                O.S. finalizadas menos contas pagas desde {DASHBOARD_ACCOUNTING_START_LABEL}{periodProfitMargin !== null ? ` · margem ${periodProfitMargin.toFixed(1)}%` : ''}
              </p>
            </div>
          </div>

          <div className="border-t border-border/70 px-2 pb-4">
            {hasPeriodFinancialData ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={periodFinancialData} margin={{ top: 18, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      `R$ ${value.toLocaleString('pt-BR')}`,
                      name === 'entrada' ? 'O.S. finalizadas' : name === 'saida' ? 'Contas pagas' : 'Lucro',
                    ]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="entrada" name="entrada" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saida" name="saida" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SectionEmptyState
                title="Sem movimentação no período"
                description={`Escolha outro intervalo a partir de ${DASHBOARD_ACCOUNTING_START_LABEL} para ver O.S. finalizadas, contas pagas e lucro.`}
                className="min-h-[220px] border-0 bg-transparent px-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI rows */}
      <TooltipProvider delayDuration={400}>
        {[kpisRow1, kpisRow2].map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {row.map((kpi, i) => (
              <motion.div
                key={kpi.label}
                {...revealProps((rowIdx * 0.24) + i * 0.06)}
              >
                <Card
                  className="overflow-hidden cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-px hover:border-border/70 group"
                  onClick={() => navigate(kpi.href)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-medium text-muted-foreground truncate">{kpi.label}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
                            >
                              <Info className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">
                            {kpi.tooltip}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${kpi.iconClass}`}>
                        <kpi.icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold font-display leading-none mb-1 group-hover:text-primary transition-colors">{kpi.value}</div>
                    <div className="flex items-center gap-1">
                      {'trend' in kpi && kpi.trend !== null && kpi.trend !== undefined && (
                        kpi.trend > 0
                          ? <ArrowUpRight className="w-3 h-3 text-emerald-600 shrink-0" />
                          : kpi.trend < 0
                            ? <ArrowDownRight className="w-3 h-3 text-red-500 shrink-0" />
                            : <Minus className="w-3 h-3 text-muted-foreground shrink-0" />
                      )}
                      <p className={`text-xs leading-tight ${kpi.subClass}`}>{kpi.sub}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ))}
      </TooltipProvider>

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
                description="O gráfico mensal começa a preencher depois das primeiras O.S. finalizadas."
                className="min-h-[210px] border-0 bg-transparent px-2"
              />
            )}
          </CardContent>
        </Card>
      </div>

      </ErrorBoundary>

      {/* Resultado Anual */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <PiggyBank className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resultado de {currentYear}</p>
                <p className={`text-2xl font-display font-bold tracking-tight ${yearlyResult >= 0 ? 'text-success' : 'text-destructive'}`}>
                  R$ {fmtBRLFull(Math.abs(yearlyResult))}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">{yearlyResult >= 0 ? 'de resultado positivo' : 'de resultado negativo'}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Entradas no ano</p>
                <p className="mt-1 font-semibold text-success">R$ {fmtBRL(yearlyRevenue)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Saídas no ano</p>
                <p className="mt-1 font-semibold text-destructive">R$ {fmtBRL(yearlyExpenses)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Margem estimada</p>
                <p className="mt-1 font-semibold">{yearlyRevenue > 0 ? `${((yearlyResult / yearlyRevenue) * 100).toFixed(1)}%` : '—'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
