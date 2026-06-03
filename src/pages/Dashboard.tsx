import { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, NoteStatus, FINAL_STATUSES, PAYABLE_STATUS_LABELS, PAYABLE_STATUS_COLORS, RECURRENCE_TYPE_LABELS } from '@/types';
import {
  FileText, DollarSign, TrendingUp, AlertCircle,
  CheckCircle2, Timer, Users, Receipt,
  ArrowUpRight, ArrowDownRight, Minus, AlertTriangle,
  Wrench, Package, Info, Wallet, Landmark, PiggyBank, Layers3,
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
  LineChart, Line, CartesianGrid, Cell,
  AreaChart, Area,
} from 'recharts';
import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import {
  format, subMonths, startOfMonth, endOfMonth,
  differenceInDays, parseISO, subDays, startOfDay, endOfDay, eachDayOfInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatPayableRecurrenceLabel, isPayableOverdue } from '@/services/domain/payables';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set<NoteStatus>([
  'ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'PRONTO', 'ENTREGUE',
]);

const REVENUE_RECOGNIZED_STATUSES = new Set<NoteStatus>(['ENTREGUE', 'FINALIZADO']);
const PAID_PAYABLE_STATUSES = new Set(['PAGO', 'PARCIAL']);
const PROFIT_START_DATE = startOfDay(new Date(2026, 5, 1));

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
  PRONTO: 'hsl(var(--success))',
  ENTREGUE: 'hsl(var(--secondary))',
  FINALIZADO: '#6b7280',
  CANCELADO: 'hsl(var(--destructive))',
  DESCARTADO: '#a1a1aa',
  SEM_CONSERTO: '#fda4af',
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

function getRevenueDate(note: { finalizedAt?: string; updatedAt: string; createdAt: string }) {
  return note.finalizedAt ?? note.updatedAt ?? note.createdAt;
}

// ── Component ────────────────────────────────────────────────────────────────

// Active statuses joined for URL param
const ACTIVE_STATUSES_PARAM = 'ABERTO,EM_ANALISE,ORCAMENTO,APROVADO,EM_EXECUCAO,AGUARDANDO_COMPRA,PRONTO,ENTREGUE';

export default function Dashboard() {
  const { notes, clients, services, payables, payableCategories } = useData();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const serviceMetricsLoading = false;
  const serviceMetricsError = false;
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
        const revenueYear = new Date(getRevenueDate(note)).getFullYear();
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
  const profitPeriodStart = Math.max(selectedPeriodStart, PROFIT_START_DATE.getTime());
  const profitEnabledForPeriod = selectedPeriodEnd >= PROFIT_START_DATE.getTime();
  const profitWindowLabel = profitEnabledForPeriod
    ? `${format(new Date(profitPeriodStart), 'dd/MM/yyyy')} até ${format(selectedPeriod.end, 'dd/MM/yyyy')}`
    : 'a partir de 01/06/2026';
  const isInSelectedPeriod = useCallback((value?: string | null) => {
    if (!value) return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= selectedPeriodStart && time <= selectedPeriodEnd;
  }, [selectedPeriodEnd, selectedPeriodStart]);
  const isInProfitPeriod = useCallback((value?: string | null) => {
    if (!value || !profitEnabledForPeriod) return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= profitPeriodStart && time <= selectedPeriodEnd;
  }, [profitEnabledForPeriod, profitPeriodStart, selectedPeriodEnd]);

  // ── Core metrics ────────────────────────────────────────────────────────
  const openCount = useMemo(
    () => notes.filter(n => ACTIVE_STATUSES.has(n.status)).length,
    [notes],
  );

  const revenueRecognizedNotes = useMemo(
    () => notes.filter(n => REVENUE_RECOGNIZED_STATUSES.has(n.status)),
    [notes],
  );

  const allNotesTotalAmount = useMemo(
    () => notes.reduce((sum, note) => sum + note.totalAmount, 0),
    [notes],
  );

  const totalRevenue = useMemo(
    () => revenueRecognizedNotes.reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes],
  );

  const avgDays = useMemo(() => {
    const fin = revenueRecognizedNotes.filter(n => getRevenueDate(n));
    if (!fin.length) return null;
    const total = fin.reduce((sum, n) => {
      return sum + differenceInDays(new Date(getRevenueDate(n)), new Date(n.createdAt));
    }, 0);
    return (total / fin.length).toFixed(1);
  }, [revenueRecognizedNotes]);

  const overdueNotes = useMemo(() => {
    const threshold = Date.now() - 7 * 86_400_000;
    return notes.filter(
      n => ACTIVE_STATUSES.has(n.status) && new Date(n.updatedAt).getTime() < threshold,
    );
  }, [notes]);

  const awaitingPurchase = useMemo(
    () => notes.filter(n => n.status === 'AGUARDANDO_COMPRA'),
    [notes],
  );

  // ── Monthly revenue ──────────────────────────────────────────────────────
  const currentMonthRevenue = useMemo(
    () => revenueRecognizedNotes
      .filter(n => {
        const t = new Date(getRevenueDate(n)).getTime();
        return t >= startCurrent && t <= endCurrent;
      })
      .reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes, startCurrent, endCurrent],
  );

  const prevMonthRevenue = useMemo(
    () => revenueRecognizedNotes
      .filter(n => {
        const t = new Date(getRevenueDate(n)).getTime();
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

  const successBaseCount = closedNotes.filter(n => n.status !== 'FINALIZADO').length + revenueRecognizedNotes.length;
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
          const t = new Date(getRevenueDate(n)).getTime();
          return t >= start && t <= end;
        })
        .reduce((sum, n) => sum + n.totalAmount, 0);
      const count = revenueRecognizedNotes
        .filter(n => {
          const t = new Date(getRevenueDate(n)).getTime();
          return t >= start && t <= end;
        }).length;
      return { month: format(d, 'MMM', { locale: ptBR }), valor, count };
    });
  }, [revenueRecognizedNotes, now]);

  // ── Top serviços ─────────────────────────────────────────────────────────
  const servicesForMetrics = services;

  const topServices = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const s of servicesForMetrics) {
      const key = s.name.trim();
      if (!key) continue;
      const prev = map.get(key) ?? { count: 0, revenue: 0 };
      map.set(key, { count: prev.count + s.quantity, revenue: prev.revenue + s.subtotal });
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [servicesForMetrics]);

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
      label: 'Entregues',
      value: revenueRecognizedNotes.length,
      sub: `Taxa de sucesso: ${successRate}%`,
      icon: CheckCircle2,
      iconClass: 'text-emerald-600 bg-emerald-50',
      subClass: 'text-muted-foreground',
      tooltip: 'O.S. entregues ou fechadas com sucesso. A taxa compara entregues/finalizadas contra canceladas, descartadas e sem conserto.',
      href: '/notas-entrada?status=ENTREGUE,FINALIZADO',
    },
    {
      label: 'Valor entregue',
      value: `R$ ${fmtBRL(totalRevenue)}`,
      sub: 'O.S. entregues/fechadas',
      icon: DollarSign,
      iconClass: 'text-primary bg-primary/10',
      subClass: 'text-muted-foreground',
      tooltip: 'Soma do valor total das O.S. com status Entregue ou Finalizado desde a abertura do sistema.',
      href: '/notas-entrada?status=ENTREGUE,FINALIZADO',
    },
    {
      label: 'Tempo médio',
      value: avgDays ? `${avgDays} dias` : '—',
      sub: 'Da abertura à entrega',
      icon: avgDays && parseFloat(avgDays) > 10 ? AlertCircle : Timer,
      iconClass: avgDays && parseFloat(avgDays) > 10
        ? 'text-amber-600 bg-amber-50'
        : 'text-sky-600 bg-sky-50',
      subClass: 'text-muted-foreground',
      tooltip: 'Média de dias entre a abertura e a entrega/fechamento da O.S.',
      href: '/notas-entrada?status=ENTREGUE,FINALIZADO',
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
      tooltip: 'Receita gerada pelas O.S. entregues ou fechadas no mês atual. Comparação percentual em relação ao mês anterior.',
      href: '/notas-entrada?status=ENTREGUE,FINALIZADO',
    },
    {
      label: 'Ticket médio',
      value: ticketMedio > 0 ? `R$ ${fmtBRL(ticketMedio)}` : '—',
      sub: `Base: ${revenueRecognizedNotes.length} O.S. entregues`,
      icon: Receipt,
      iconClass: 'text-orange-600 bg-orange-50',
      subClass: 'text-muted-foreground',
      trend: null,
      tooltip: 'Valor médio por O.S. entregue ou fechada. Calculado dividindo o valor entregue pelo número de O.S. entregues/fechadas.',
      href: '/notas-entrada?status=ENTREGUE,FINALIZADO',
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
    {
      label: 'Aguardando compra',
      value: awaitingPurchase.length,
      sub: awaitingPurchase.length > 0 ? 'O.S. bloqueadas por peças/serviços' : 'Nenhuma O.S. bloqueada',
      icon: Package,
      iconClass: 'text-indigo-600 bg-indigo-50',
      subClass: awaitingPurchase.length > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground',
      trend: null,
      tooltip: 'O.S. que dependem de compra para avançar. Este número vem dos status reais das ordens de serviço.',
      href: '/kanban',
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

  const periodAllNotesAmount = useMemo(
    () => periodNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [periodNotes],
  );

  const periodDeliveredNotes = useMemo(
    () => revenueRecognizedNotes.filter((note) => isInSelectedPeriod(getRevenueDate(note))),
    [isInSelectedPeriod, revenueRecognizedNotes],
  );

  const periodDeliveredAmount = useMemo(
    () => periodDeliveredNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [periodDeliveredNotes],
  );

  const periodProfitNotes = useMemo(
    () => notes.filter((note) => isInProfitPeriod(note.createdAt)),
    [isInProfitPeriod, notes],
  );

  const periodProfitNotesAmount = useMemo(
    () => periodProfitNotes.reduce((sum, note) => sum + note.totalAmount, 0),
    [periodProfitNotes],
  );

  const periodPaidPayables = useMemo(
    () => activePayables.filter((payable) => (
      PAID_PAYABLE_STATUSES.has(payable.status)
      && isInProfitPeriod(payable.paidAt ?? payable.updatedAt ?? payable.dueDate)
    )),
    [activePayables, isInProfitPeriod],
  );

  const periodPaidExpenses = useMemo(
    () => periodPaidPayables.reduce((sum, payable) => sum + (payable.paidAmount ?? payable.finalAmount), 0),
    [periodPaidPayables],
  );

  const periodProfit = periodProfitNotesAmount - periodPaidExpenses;
  const periodProfitMargin = periodProfitNotesAmount > 0 ? (periodProfit / periodProfitNotesAmount) * 100 : null;

  const periodFinancialData = useMemo(() => {
    const days = Math.max(0, differenceInDays(selectedPeriod.end, selectedPeriod.start));
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
      let cursor = startOfMonth(selectedPeriod.start);
      while (cursor.getTime() <= selectedPeriod.end.getTime()) {
        ensure(cursor);
        cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
      }
    } else {
      eachDayOfInterval({ start: selectedPeriod.start, end: selectedPeriod.end }).forEach(ensure);
    }

    periodNotes.forEach((note) => {
      const row = ensure(new Date(note.createdAt));
      row.entrada += note.totalAmount;
    });
    periodPaidPayables.forEach((payable) => {
      const row = ensure(new Date(payable.paidAt ?? payable.updatedAt ?? payable.dueDate));
      row.saida += payable.paidAmount ?? payable.finalAmount;
    });

    return Array.from(rows.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => ({ ...row, lucro: row.entrada - row.saida }));
  }, [periodNotes, periodPaidPayables, selectedPeriod.end, selectedPeriod.start]);

  const hasPeriodFinancialData = periodFinancialData.some((item) => item.entrada > 0 || item.saida > 0);

  const openFinancialPayables = useMemo(
    () => activePayables.filter((payable) => payable.status !== 'PAGO' && payable.status !== 'CANCELADO'),
    [activePayables],
  );

  const overdueFinancialPayables = useMemo(
    () => openFinancialPayables.filter((payable) => isPayableOverdue(payable)),
    [openFinancialPayables],
  );

  const todayStart = useMemo(() => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, [now]);

  const next7DaysEnd = useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() + 7);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }, [now]);

  const dueSoonPayables = useMemo(
    () => openFinancialPayables
      .filter((payable) => {
        const dueTime = new Date(payable.dueDate).getTime();
        return dueTime >= todayStart && dueTime <= next7DaysEnd;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [openFinancialPayables, next7DaysEnd, todayStart],
  );

  const urgentPayables = useMemo(
    () => openFinancialPayables.filter((payable) => payable.isUrgent),
    [openFinancialPayables],
  );

  const committedThisMonthPayables = useMemo(
    () => activePayables.filter((payable) => {
      const dueTime = new Date(payable.dueDate).getTime();
      return dueTime >= startCurrent && dueTime <= endCurrent && payable.status !== 'CANCELADO';
    }),
    [activePayables, startCurrent, endCurrent],
  );

  const currentMonthExpenseCommitment = useMemo(
    () => committedThisMonthPayables.reduce((sum, payable) => sum + payable.finalAmount, 0),
    [committedThisMonthPayables],
  );

  const paidThisMonthPayables = useMemo(
    () => activePayables.filter((payable) => {
      if (!payable.paidAt) return false;
      const paidTime = new Date(payable.paidAt).getTime();
      return paidTime >= startCurrent && paidTime <= endCurrent;
    }),
    [activePayables, startCurrent, endCurrent],
  );

  const currentMonthPaidExpenses = useMemo(
    () => paidThisMonthPayables.reduce((sum, payable) => sum + (payable.paidAmount ?? payable.finalAmount), 0),
    [paidThisMonthPayables],
  );

  const prevMonthPaidExpenses = useMemo(
    () => activePayables.filter((payable) => {
      if (!payable.paidAt) return false;
      const paidTime = new Date(payable.paidAt).getTime();
      return paidTime >= startPrev && paidTime <= endPrev;
    }).reduce((sum, payable) => sum + (payable.paidAmount ?? payable.finalAmount), 0),
    [activePayables, startPrev, endPrev],
  );

  const expenseGrowth = pct(currentMonthPaidExpenses, prevMonthPaidExpenses);

  const operationalBalanceThisMonth = currentMonthRevenue - currentMonthPaidExpenses;

  // ── Resultado anual ──────────────────────────────────────────────────────
  const currentYear = now.getFullYear();
  const startYear = new Date(currentYear, 0, 1).getTime();
  const endYear = new Date(currentYear, 11, 31, 23, 59, 59).getTime();

  const yearlyRevenue = useMemo(
    () => revenueRecognizedNotes
      .filter(n => { const t = new Date(getRevenueDate(n)).getTime(); return t >= startYear && t <= endYear; })
      .reduce((s, n) => s + n.totalAmount, 0),
    [revenueRecognizedNotes, startYear, endYear],
  );

  const yearlyExpenses = useMemo(
    () => activePayables
      .filter(p => p.paidAt)
      .filter(p => { const t = new Date(p.paidAt!).getTime(); return t >= startYear && t <= endYear; })
      .reduce((s, p) => s + (p.paidAmount ?? p.finalAmount), 0),
    [activePayables, startYear, endYear],
  );

  const yearlyResult = yearlyRevenue - yearlyExpenses;

  const activeInstallments = useMemo(
    () => openFinancialPayables.filter((payable) => (payable.totalInstallments ?? 0) > 1),
    [openFinancialPayables],
  );

  const nextDuePayables = useMemo(
    () => [...openFinancialPayables]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 4),
    [openFinancialPayables],
  );

  const expenseCategoryData = useMemo(() => {
    const categoryTotals = new Map<string, number>();
    committedThisMonthPayables.forEach((payable) => {
      categoryTotals.set(payable.categoryId, (categoryTotals.get(payable.categoryId) ?? 0) + payable.finalAmount);
    });
    return Array.from(categoryTotals.entries())
      .map(([categoryId, total]) => ({
        name: payableCategories.find((category) => category.id === categoryId)?.name ?? 'Categoria',
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [committedThisMonthPayables, payableCategories]);

  const financialMonthlyData = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const date = subMonths(now, 5 - index);
      const start = startOfMonth(date).getTime();
      const end = endOfMonth(date).getTime();
      const revenue = revenueRecognizedNotes
        .filter((note) => {
          const time = new Date(getRevenueDate(note)).getTime();
          return time >= start && time <= end;
        })
        .reduce((sum, note) => sum + note.totalAmount, 0);
      const expenses = activePayables
        .filter((payable) => payable.paidAt)
        .filter((payable) => {
          const time = new Date(payable.paidAt!).getTime();
          return time >= start && time <= end;
        })
        .reduce((sum, payable) => sum + (payable.paidAmount ?? payable.finalAmount), 0);
      return {
        month: format(date, 'MMM', { locale: ptBR }),
        revenue,
        expenses,
        balance: revenue - expenses,
      };
    });
  }, [activePayables, revenueRecognizedNotes, now]);

  const financeKpis = [
    {
      label: 'Comprometido no mês',
      value: `R$ ${fmtBRL(currentMonthExpenseCommitment)}`,
      sub: `${committedThisMonthPayables.length} conta${committedThisMonthPayables.length !== 1 ? 's' : ''} com vencimento neste mês`,
      icon: Wallet,
      iconClass: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'Despesas pagas no mês',
      value: `R$ ${fmtBRL(currentMonthPaidExpenses)}`,
      sub: expenseGrowth === null
        ? 'Sem comparação com mês anterior'
        : `${expenseGrowth >= 0 ? '+' : ''}${expenseGrowth.toFixed(1)}% vs mês anterior`,
      icon: Landmark,
      iconClass: expenseGrowth !== null && expenseGrowth > 0 ? 'text-red-600 bg-red-50' : 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Saldo operacional',
      value: `R$ ${fmtBRL(operationalBalanceThisMonth)}`,
      sub: operationalBalanceThisMonth >= 0 ? 'Faturamento do mês menos despesas pagas' : 'Atenção: despesas superaram o faturamento do mês',
      icon: PiggyBank,
      iconClass: operationalBalanceThisMonth >= 0 ? 'text-primary bg-primary/10' : 'text-destructive bg-destructive/10',
    },
    {
      label: 'Parcelas / recorrências',
      value: activeInstallments.length,
      sub: activeInstallments.length > 0 ? 'Contas seriadas em acompanhamento' : 'Sem parcelas ativas no momento',
      icon: Layers3,
      iconClass: 'text-sky-700 bg-sky-50',
    },
  ];

  const actionCards = [
    {
      label: 'O.S. pendentes',
      value: openCount,
      sub: overdueNotes.length > 0 ? `${overdueNotes.length} paradas há +7 dias` : 'Fila sem atraso crítico',
      icon: FileText,
      iconClass: overdueNotes.length > 0 ? 'text-amber-700 bg-amber-50' : 'text-primary bg-primary/10',
      href: `/notas-entrada?status=${ACTIVE_STATUSES_PARAM}`,
    },
    {
      label: 'Contas vencidas',
      value: overdueFinancialPayables.length,
      sub: `R$ ${fmtBRL(overdueFinancialPayables.reduce((sum, payable) => sum + payable.finalAmount, 0))}`,
      icon: AlertTriangle,
      iconClass: overdueFinancialPayables.length > 0 ? 'text-destructive bg-destructive/10' : 'text-emerald-700 bg-emerald-50',
      href: '/contas-a-pagar',
    },
    {
      label: 'Vencem em 7 dias',
      value: dueSoonPayables.length,
      sub: `R$ ${fmtBRL(dueSoonPayables.reduce((sum, payable) => sum + payable.finalAmount, 0))}`,
      icon: Wallet,
      iconClass: 'text-amber-700 bg-amber-50',
      href: '/contas-a-pagar',
    },
    {
      label: 'Aguardando compra',
      value: awaitingPurchase.length,
      sub: awaitingPurchase.length > 0 ? 'Bloqueando avanço da produção' : 'Nenhum bloqueio por compra',
      icon: Package,
      iconClass: awaitingPurchase.length > 0 ? 'text-indigo-700 bg-indigo-50' : 'text-emerald-700 bg-emerald-50',
      href: '/kanban',
    },
  ];

  const financialAlerts = [
    {
      label: 'Vencidas',
      count: overdueFinancialPayables.length,
      amount: overdueFinancialPayables.reduce((sum, payable) => sum + payable.finalAmount, 0),
      tone: overdueFinancialPayables.length > 0 ? 'text-destructive' : 'text-muted-foreground',
    },
    {
      label: 'Vencem em 7 dias',
      count: dueSoonPayables.length,
      amount: dueSoonPayables.reduce((sum, payable) => sum + payable.finalAmount, 0),
      tone: dueSoonPayables.length > 0 ? 'text-amber-700' : 'text-muted-foreground',
    },
    {
      label: 'Marcadas como urgentes',
      count: urgentPayables.length,
      amount: urgentPayables.reduce((sum, payable) => sum + payable.finalAmount, 0),
      tone: urgentPayables.length > 0 ? 'text-primary' : 'text-muted-foreground',
    },
  ];

  const activeNotesSorted = useMemo(
    () => [...notes]
      .filter((note) => ACTIVE_STATUSES.has(note.status))
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()),
    [notes],
  );

  const productionActionNotes = useMemo(() => {
    const priority = new Map<string, typeof notes[number]>();
    overdueNotes.forEach((note) => priority.set(note.id, note));
    awaitingPurchase.forEach((note) => priority.set(note.id, note));
    const prioritized = Array.from(priority.values())
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    return (prioritized.length > 0 ? prioritized : activeNotesSorted).slice(0, 6);
  }, [activeNotesSorted, awaitingPurchase, overdueNotes]);

  const revealProps = (delay: number) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReducedMotion
      ? { duration: 0 }
      : { delay, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
  });

  const hasStatusData = statusData.length > 0;
  const hasRevenueHistory = monthlyData.some((item) => item.valor > 0);
  const hasFinancialHistory = financialMonthlyData.some((item) => item.revenue > 0 || item.expenses > 0);

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
                  <p className="text-xs text-muted-foreground">Período: {selectedPeriod.label}</p>
                </div>
                <Badge className={cn(
                  'ml-0 lg:ml-2',
                  !profitEnabledForPeriod
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-100'
                    : periodProfit >= 0
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                      : 'bg-red-50 text-red-700 hover:bg-red-50',
                )}>
                  {!profitEnabledForPeriod ? 'Lucro inicia em jun/26' : periodProfit >= 0 ? 'Lucro positivo' : 'Lucro negativo'}
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
                  <p className="text-xs font-medium text-muted-foreground">Valor de todas O.S.</p>
                  <p className="mt-2 text-2xl font-display font-bold leading-none">R$ {fmtBRL(periodAllNotesAmount)}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                  <FileText className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {periodNotes.length} O.S. no período · total geral R$ {fmtBRL(allNotesTotalAmount)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/notas-entrada?status=ENTREGUE,FINALIZADO')}
              className="rounded-2xl border border-border/70 bg-background p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Valor entregue/fechado</p>
                  <p className="mt-2 text-2xl font-display font-bold leading-none text-emerald-700">R$ {fmtBRL(periodDeliveredAmount)}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {periodDeliveredNotes.length} O.S. entregues · geral R$ {fmtBRL(totalRevenue)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/contas-a-pagar')}
              className="rounded-2xl border border-border/70 bg-background p-4 text-left transition hover:border-red-200 hover:bg-red-50/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Contas pagas</p>
                  <p className="mt-2 text-2xl font-display font-bold leading-none text-red-600">R$ {fmtBRL(periodPaidExpenses)}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <Landmark className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {periodPaidPayables.length} pagamento{periodPaidPayables.length !== 1 ? 's' : ''} no lucro · {profitWindowLabel}
              </p>
            </button>

            <div className={cn(
              'rounded-2xl border p-4',
              !profitEnabledForPeriod
                ? 'border-slate-200 bg-slate-50'
                : periodProfit >= 0
                ? 'border-primary/25 bg-primary/5'
                : 'border-red-200 bg-red-50/60',
            )}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Lucro contabilizado</p>
                  <p className={cn('mt-2 text-2xl font-display font-bold leading-none', !profitEnabledForPeriod ? 'text-muted-foreground' : periodProfit >= 0 ? 'text-primary' : 'text-red-700')}>
                    {profitEnabledForPeriod ? `R$ ${fmtBRLFull(periodProfit)}` : '—'}
                  </p>
                </div>
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', !profitEnabledForPeriod ? 'bg-slate-100 text-slate-500' : periodProfit >= 0 ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-700')}>
                  <PiggyBank className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {profitEnabledForPeriod
                  ? `${periodProfitNotes.length} O.S. desde ${format(new Date(profitPeriodStart), 'dd/MM/yyyy')} menos contas pagas${periodProfitMargin !== null ? ` · margem ${periodProfitMargin.toFixed(1)}%` : ''}`
                  : 'Lucro passa a contar somente de 01/06/2026 em diante'}
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
                      name === 'entrada' ? 'O.S. lançadas' : name === 'saida' ? 'Contas pagas' : 'Lucro',
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
                description="Escolha outro intervalo para ver entradas, contas pagas e lucro."
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

      {/* Analysis row: action summary + top services + monthly cash */}
      <ErrorBoundary
        fallback={(
          <SectionErrorState
            title="Falha ao montar os painéis de análise"
            description="Os rankings e distribuições podem ser recarregados depois sem interromper a operação do dashboard."
          />
        )}
      >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Action summary */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Prioridades para agir</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 px-4 pb-4 pt-0 sm:grid-cols-2">
            {actionCards.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.href)}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 text-left transition hover:border-border hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-2xl font-bold leading-none">{item.value}</p>
                  </div>
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.iconClass)}>
                    <item.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-2 min-h-[2rem] text-xs leading-tight text-muted-foreground">{item.sub}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Top serviços */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Serviços mais realizados</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            {serviceMetricsLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Carregando serviços reais das O.S...</p>
            ) : serviceMetricsError ? (
              <SectionErrorState
                title="Não foi possível carregar o ranking"
                description="Os demais indicadores continuam disponíveis. Recarregue o dashboard para tentar novamente."
                className="border-0 bg-transparent py-5"
              />
            ) : topServices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem serviços registrados ainda</p>
            ) : (
              <div className="space-y-2.5">
                {topServices.map((svc, i) => {
                  const maxRevenue = topServices[0]?.revenue ?? 1;
                  const share = maxRevenue > 0 ? (svc.revenue / maxRevenue) * 100 : 0;
                  return (
                    <div key={svc.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground/50 tabular-nums w-4 shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-[13px] font-medium truncate">{svc.name}</span>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-[12px] font-bold tabular-nums">
                            R$ {fmtBRL(svc.revenue)}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            ×{svc.count}
                          </span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400/70 rounded-full transition-all"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly cash */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Caixa do mês</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-3">
            <div>
              <p className="text-xs text-muted-foreground">Entrou por O.S.</p>
              <p className="mt-1 text-lg font-semibold text-success">R$ {fmtBRL(currentMonthRevenue)}</p>
            </div>
            <div className="border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground">Saiu pago</p>
              <p className="mt-1 text-lg font-semibold text-destructive">R$ {fmtBRL(currentMonthPaidExpenses)}</p>
            </div>
            <div className="border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground">Saldo operacional</p>
              <p className={cn('mt-1 text-lg font-semibold', operationalBalanceThisMonth >= 0 ? 'text-primary' : 'text-destructive')}>
                R$ {fmtBRL(operationalBalanceThisMonth)}
              </p>
            </div>
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

      {/* Finance row: contas a pagar */}
      <ErrorBoundary
        fallback={(
          <SectionErrorState
            title="Falha ao carregar o resumo financeiro"
            description="Os indicadores de contas a pagar podem ser recarregados depois sem afetar o restante do app."
          />
        )}
      >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {financeKpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            {...revealProps(0.12 + i * 0.05)}
          >
            <Card
              className="overflow-hidden cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-px hover:border-border/70"
              onClick={() => navigate('/contas-a-pagar')}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-xs font-medium text-muted-foreground truncate">{kpi.label}</span>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${kpi.iconClass}`}>
                    <kpi.icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-display leading-none mb-1">{kpi.value}</div>
                <p className="text-xs text-muted-foreground leading-tight">{kpi.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Financeiro — Entradas x Saídas</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-2">
            {hasFinancialHistory ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={financialMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <RechartsTooltip
                    formatter={(v: number, name: string) => [
                      `R$ ${v.toLocaleString('pt-BR')}`,
                      name === 'revenue' ? 'Faturamento' : name === 'expenses' ? 'Despesas pagas' : 'Saldo',
                    ]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="revenue" name="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expenses" name="expenses" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="balance" name="balance" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <SectionEmptyState
                title="Sem histórico financeiro suficiente"
                description="Quando entradas e saídas começarem a ser registradas, este comparativo mensal aparece aqui."
                className="min-h-[220px] border-0 bg-transparent px-2"
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Próximos vencimentos e parcelas</CardTitle>
              <Layers3 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Em atraso</p>
                <p className="text-lg font-semibold text-destructive">{overdueFinancialPayables.length}</p>
              </div>
              <Badge variant="secondary">{`R$ ${fmtBRL(overdueFinancialPayables.reduce((sum, payable) => sum + payable.finalAmount, 0))}`}</Badge>
            </div>

            {nextDuePayables.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma conta em aberto no momento.</p>
            ) : (
              <div className="space-y-2.5">
                {nextDuePayables.map((payable) => {
                  const recurrenceLabel = formatPayableRecurrenceLabel(payable, RECURRENCE_TYPE_LABELS[payable.recurrence]);
                  return (
                    <button
                      key={payable.id}
                      type="button"
                      onClick={() => navigate('/contas-a-pagar')}
                      className="w-full rounded-2xl border border-border/60 px-3 py-3 text-left transition hover:border-border hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{payable.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground truncate">{payable.supplierName ?? 'Fornecedor não informado'}</p>
                        </div>
                        <Badge className={cn('shrink-0', PAYABLE_STATUS_COLORS[payable.status === 'PENDENTE' && isPayableOverdue(payable) ? 'VENCIDO' : payable.status])}>
                          {PAYABLE_STATUS_LABELS[payable.status === 'PENDENTE' && isPayableOverdue(payable) ? 'VENCIDO' : payable.status]}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(parseISO(payable.dueDate), 'dd/MM/yyyy')}</span>
                        <span>•</span>
                        <span>{`R$ ${fmtBRL(payable.finalAmount)}`}</span>
                        {recurrenceLabel ? (
                          <>
                            <span>•</span>
                            <span>{recurrenceLabel}</span>
                          </>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Despesas por categoria no mês</CardTitle>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            {expenseCategoryData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem despesas lançadas para o período atual.</p>
            ) : (
              <div className="space-y-2.5">
                {expenseCategoryData.map((item) => {
                  const maxTotal = expenseCategoryData[0]?.total ?? 1;
                  const share = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
                  return (
                    <div key={item.name}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[13px] font-medium truncate">{item.name}</span>
                        <span className="text-[12px] font-bold tabular-nums">{`R$ ${fmtBRL(item.total)}`}</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/70 rounded-full" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Alertas financeiros</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {financialAlerts.map((alert) => (
                <button
                  key={alert.label}
                  type="button"
                  onClick={() => navigate('/contas-a-pagar')}
                  className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-left transition hover:border-border hover:bg-muted/40"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{alert.label}</p>
                  <p className={cn('mt-2 text-2xl font-bold leading-none', alert.tone)}>{alert.count}</p>
                  <p className="mt-2 text-sm font-medium">R$ {fmtBRL(alert.amount)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: alerts + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Alertas de produção */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Alertas de Produção</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-3">
            {/* Paradas +7 dias */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Paradas há +7 dias
                </span>
                <span className={cn(
                  'text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-none',
                  overdueNotes.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground/50',
                )}>
                  {overdueNotes.length}
                </span>
              </div>
              {overdueNotes.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Nenhuma nota parada.</p>
              ) : (
                <div className="space-y-1.5">
                  {overdueNotes.slice(0, 3).map(n => {
                    const daysAgo = differenceInDays(now, new Date(n.updatedAt));
                    return (
                      <div key={n.id} className="flex items-center justify-between rounded-lg bg-amber-50/60 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <span className="text-[12px] font-bold text-amber-800">{n.number}</span>
                          <span className="text-[11px] text-amber-700 ml-1.5 truncate">{STATUS_LABELS[n.status]}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-amber-600 shrink-0 ml-2">{daysAgo}d</span>
                      </div>
                    );
                  })}
                  {overdueNotes.length > 3 && (
                    <p className="text-[11px] text-muted-foreground px-0.5">+{overdueNotes.length - 3} outras</p>
                  )}
                </div>
              )}
            </div>

            {/* Aguardando compra */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Aguardando compra
                </span>
                <span className={cn(
                  'text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-none',
                  awaitingPurchase.length > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-muted text-muted-foreground/50',
                )}>
                  {awaitingPurchase.length}
                </span>
              </div>
              {awaitingPurchase.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Nenhuma nota bloqueada.</p>
              ) : (
                <div className="space-y-1.5">
                  {awaitingPurchase.slice(0, 3).map(n => {
                    const client = clients.find(c => c.id === n.clientId);
                    return (
                      <div key={n.id} className="flex items-center justify-between rounded-lg bg-yellow-50/60 px-2.5 py-1.5">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <Package className="w-3 h-3 text-yellow-600 shrink-0" />
                          <span className="text-[12px] font-bold text-yellow-800">{n.number}</span>
                          <span className="text-[11px] text-yellow-700 truncate">{client?.name}</span>
                        </div>
                      </div>
                    );
                  })}
                  {awaitingPurchase.length > 3 && (
                    <p className="text-[11px] text-muted-foreground px-0.5">+{awaitingPurchase.length - 3} outras</p>
                  )}
                </div>
              )}
            </div>

            {/* Fonte dos dados */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Fonte dos indicadores
                </span>
                <span className="text-[12px] font-bold tabular-nums">Real</span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                O.S., clientes e financeiro vêm dos registros reais da operação.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Operational queue */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">O.S. que precisam de ação</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            {productionActionNotes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma O.S. pendente no momento.
              </div>
            ) : (
              <div className="space-y-2">
                {productionActionNotes.map((note) => {
                  const client = clients.find((item) => item.id === note.clientId);
                  const daysSinceUpdate = differenceInDays(now, new Date(note.updatedAt));
                  const isStale = overdueNotes.some((item) => item.id === note.id);
                  const isBlocked = note.status === 'AGUARDANDO_COMPRA';
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => navigate(`/notas-entrada?status=${note.status}`)}
                      className="w-full rounded-2xl border border-border/60 px-3 py-3 text-left transition hover:border-border hover:bg-muted/20"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{note.number}</span>
                            <Badge variant="secondary">{STATUS_LABELS[note.status]}</Badge>
                            {isStale ? <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">+7 dias</Badge> : null}
                            {isBlocked ? <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">Compra</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground truncate">{client?.name ?? 'Cliente não encontrado'}</p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>{daysSinceUpdate}d sem atualização</p>
                          <p className="mt-1 font-semibold text-foreground">R$ {fmtBRL(note.totalAmount)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {productionActionNotes.length === activeNotesSorted.length && activeNotesSorted.length > 6 ? (
                  <p className="px-1 text-xs text-muted-foreground">+{activeNotesSorted.length - 6} O.S. pendentes na fila</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </ErrorBoundary>
    </div>
  );
}
