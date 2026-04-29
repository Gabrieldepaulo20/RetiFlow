import { useMemo } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, NoteStatus, FINAL_STATUSES, PAYABLE_STATUS_LABELS, PAYABLE_STATUS_COLORS, RECURRENCE_TYPE_LABELS } from '@/types';
import {
  FileText, DollarSign, Clock, TrendingUp, AlertCircle,
  CheckCircle2, Timer, Users, Receipt,
  ArrowUpRight, ArrowDownRight, Minus, AlertTriangle,
  Wrench, Package, Info, Wallet, Landmark, PiggyBank, Layers3,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell, PieChart, Pie,
  AreaChart, Area,
} from 'recharts';
import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import {
  format, subMonths, startOfMonth, endOfMonth,
  differenceInDays, parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatPayableRecurrenceLabel, isPayableOverdue } from '@/services/domain/payables';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set<NoteStatus>([
  'ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'PRONTO', 'ENTREGUE',
]);

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

const TYPE_COLORS = ['hsl(var(--primary))', '#f97316'];

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

// ── Component ────────────────────────────────────────────────────────────────

// Active statuses joined for URL param
const ACTIVE_STATUSES_PARAM = 'ABERTO,EM_ANALISE,ORCAMENTO,APROVADO,EM_EXECUCAO,AGUARDANDO_COMPRA,PRONTO,ENTREGUE';

export default function Dashboard() {
  const { notes, clients, services, activities, payables, payableCategories } = useData();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const serviceMetricsLoading = false;
  const serviceMetricsError = false;

  const now = useMemo(() => new Date(), []);
  const startCurrent = startOfMonth(now).getTime();
  const endCurrent = endOfMonth(now).getTime();
  const startPrev = startOfMonth(subMonths(now, 1)).getTime();
  const endPrev = endOfMonth(subMonths(now, 1)).getTime();

  // ── Core metrics ────────────────────────────────────────────────────────
  const openCount = useMemo(
    () => notes.filter(n => ACTIVE_STATUSES.has(n.status)).length,
    [notes],
  );

  const finalizedNotes = useMemo(
    () => notes.filter(n => n.status === 'FINALIZADO'),
    [notes],
  );

  const totalRevenue = useMemo(
    () => finalizedNotes.reduce((s, n) => s + n.totalAmount, 0),
    [finalizedNotes],
  );

  const avgDays = useMemo(() => {
    const fin = finalizedNotes.filter(n => n.finalizedAt);
    if (!fin.length) return null;
    const total = fin.reduce((sum, n) => {
      return sum + differenceInDays(new Date(n.finalizedAt!), new Date(n.createdAt));
    }, 0);
    return (total / fin.length).toFixed(1);
  }, [finalizedNotes]);

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
    () => finalizedNotes
      .filter(n => n.finalizedAt)
      .filter(n => {
        const t = new Date(n.finalizedAt!).getTime();
        return t >= startCurrent && t <= endCurrent;
      })
      .reduce((s, n) => s + n.totalAmount, 0),
    [finalizedNotes, startCurrent, endCurrent],
  );

  const prevMonthRevenue = useMemo(
    () => finalizedNotes
      .filter(n => n.finalizedAt)
      .filter(n => {
        const t = new Date(n.finalizedAt!).getTime();
        return t >= startPrev && t <= endPrev;
      })
      .reduce((s, n) => s + n.totalAmount, 0),
    [finalizedNotes, startPrev, endPrev],
  );

  const monthGrowth = pct(currentMonthRevenue, prevMonthRevenue);

  // ── Ticket médio ────────────────────────────────────────────────────────
  const ticketMedio = finalizedNotes.length > 0
    ? totalRevenue / finalizedNotes.length
    : 0;

  // ── Clientes ativos ─────────────────────────────────────────────────────
  const activeClientsCount = useMemo(
    () => clients.filter(c => c.isActive).length,
    [clients],
  );

  // ── Taxa de conclusão ────────────────────────────────────────────────────
  const closedNotes = useMemo(
    () => notes.filter(n => FINAL_STATUSES.has(n.status)),
    [notes],
  );

  const successRate = closedNotes.length > 0
    ? Math.round((finalizedNotes.length / closedNotes.length) * 100)
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

  // ── Notas por tipo ───────────────────────────────────────────────────────
  const byType = useMemo(() => {
    const s = notes.filter(n => n.type === 'SERVICO').length;
    const c = notes.filter(n => n.type === 'COMPRA').length;
    return [
      { name: 'Serviço', value: s },
      { name: 'Compra', value: c },
    ];
  }, [notes]);

  // ── Monthly revenue chart — last 6 months ───────────────────────────────
  const monthlyData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i);
      const start = startOfMonth(d).getTime();
      const end = endOfMonth(d).getTime();
      const valor = finalizedNotes
        .filter(n => n.finalizedAt)
        .filter(n => {
          const t = new Date(n.finalizedAt!).getTime();
          return t >= start && t <= end;
        })
        .reduce((sum, n) => sum + n.totalAmount, 0);
      const count = finalizedNotes
        .filter(n => n.finalizedAt)
        .filter(n => {
          const t = new Date(n.finalizedAt!).getTime();
          return t >= start && t <= end;
        }).length;
      return { month: format(d, 'MMM', { locale: ptBR }), valor, count };
    });
  }, [finalizedNotes, now]);

  // ── Top 5 clientes por faturamento ──────────────────────────────────────
  const topClients = useMemo(() => {
    const map = new Map<string, { revenue: number; count: number }>();
    for (const n of finalizedNotes) {
      const prev = map.get(n.clientId) ?? { revenue: 0, count: 0 };
      map.set(n.clientId, { revenue: prev.revenue + n.totalAmount, count: prev.count + 1 });
    }
    return Array.from(map.entries())
      .map(([clientId, data]) => ({
        client: clients.find(c => c.id === clientId),
        ...data,
      }))
      .filter(x => x.client)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [finalizedNotes, clients]);

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
  const kpisRow1 = [
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
      value: finalizedNotes.length,
      sub: `Taxa de sucesso: ${successRate}%`,
      icon: CheckCircle2,
      iconClass: 'text-emerald-600 bg-emerald-50',
      subClass: 'text-muted-foreground',
      tooltip: 'O.S. concluídas com sucesso. A taxa de sucesso é calculada sobre todos os estágios finais (Finalizado, Cancelado, Descartado, Sem conserto).',
      href: '/notas-entrada?status=FINALIZADO',
    },
    {
      label: 'Faturamento total',
      value: `R$ ${fmtBRL(totalRevenue)}`,
      sub: 'Notas finalizadas',
      icon: DollarSign,
      iconClass: 'text-primary bg-primary/10',
      subClass: 'text-muted-foreground',
      tooltip: 'Soma do valor total de todas as O.S. com status Finalizado desde a abertura do sistema.',
      href: '/notas-entrada?status=FINALIZADO',
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
      tooltip: 'Média de dias entre a abertura e a finalização de uma O.S. Calculado apenas sobre notas finalizadas.',
      href: '/notas-entrada?status=FINALIZADO',
    },
  ];

  const kpisRow2 = [
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
      tooltip: 'Receita gerada pelas O.S. finalizadas no mês atual. Comparação percentual em relação ao mês anterior.',
      href: '/notas-entrada?status=FINALIZADO',
    },
    {
      label: 'Ticket médio',
      value: ticketMedio > 0 ? `R$ ${fmtBRL(ticketMedio)}` : '—',
      sub: `Base: ${finalizedNotes.length} O.S. finalizadas`,
      icon: Receipt,
      iconClass: 'text-orange-600 bg-orange-50',
      subClass: 'text-muted-foreground',
      trend: null,
      tooltip: 'Valor médio por O.S. finalizada. Calculado dividindo o faturamento total pelo número de O.S. finalizadas.',
      href: '/notas-entrada?status=FINALIZADO',
    },
    {
      label: 'Clientes ativos',
      value: activeClientsCount,
      sub: `${clients.length} cadastrados no total`,
      icon: Users,
      iconClass: 'text-teal-600 bg-teal-50',
      subClass: 'text-muted-foreground',
      trend: null,
      tooltip: 'Clientes marcados como ativos no cadastro. O total inclui clientes ativos e inativos.',
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

  const openFinancialPayables = useMemo(
    () => activePayables.filter((payable) => payable.status !== 'PAGO' && payable.status !== 'CANCELADO'),
    [activePayables],
  );

  const overdueFinancialPayables = useMemo(
    () => openFinancialPayables.filter((payable) => isPayableOverdue(payable)),
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
    () => finalizedNotes
      .filter(n => n.finalizedAt)
      .filter(n => { const t = new Date(n.finalizedAt!).getTime(); return t >= startYear && t <= endYear; })
      .reduce((s, n) => s + n.totalAmount, 0),
    [finalizedNotes, startYear, endYear],
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
      const revenue = finalizedNotes
        .filter((note) => note.finalizedAt)
        .filter((note) => {
          const time = new Date(note.finalizedAt!).getTime();
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
  }, [activePayables, finalizedNotes, now]);

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

  const revealProps = (delay: number) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReducedMotion
      ? { duration: 0 }
      : { delay, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
  });

  const hasStatusData = statusData.length > 0;
  const hasRevenueHistory = monthlyData.some((item) => item.valor > 0);
  const hasTypeDistribution = byType.some((item) => item.value > 0);
  const hasFinancialHistory = financialMonthlyData.some((item) => item.revenue > 0 || item.expenses > 0);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(now, "MMMM 'de' yyyy", { locale: ptBR })} · {notes.length} notas no sistema
          </p>
        </div>
      </div>

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

      {/* Analysis row: top clients + top services + type donut */}
      <ErrorBoundary
        fallback={(
          <SectionErrorState
            title="Falha ao montar os painéis de análise"
            description="Os rankings e distribuições podem ser recarregados depois sem interromper a operação do dashboard."
          />
        )}
      >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Top 5 clientes */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Top 5 Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            {topClients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dados ainda</p>
            ) : (
              <div className="space-y-2.5">
                {topClients.map((item, i) => {
                  const share = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                  return (
                    <div key={item.client!.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground/50 tabular-nums w-4 shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-[13px] font-medium truncate">{item.client!.name}</span>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-[12px] font-bold tabular-nums">
                            R$ {fmtBRL(item.revenue)}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            ({item.count} O.S.)
                          </span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all"
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

        {/* Notas por tipo (donut) */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Por Tipo</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-2 pb-2 flex flex-col items-center justify-center">
            {hasTypeDistribution ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={byType}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {byType.map((_, idx) => (
                        <Cell key={idx} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(v: number) => [`${v} notas`, '']}
                      contentStyle={{ fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 w-full px-2">
                  {byType.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: TYPE_COLORS[idx % TYPE_COLORS.length] }}
                        />
                        {item.name}
                      </span>
                      <span className="font-semibold tabular-nums">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <SectionEmptyState
                title="Sem tipos para comparar"
                description="Quando houver notas cadastradas, esta visão separa serviço e compra automaticamente."
                className="min-h-[180px] border-0 bg-transparent px-2"
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
              <CardTitle className="text-sm font-semibold">Leitura executiva do Contas a Pagar</CardTitle>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Resumo para a cliente</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Aqui ela consegue ver não só quanto faturou, mas também quanto saiu do caixa, quanto ainda vence no mês e quais parcelas continuam comprometendo o resultado.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Lógica de parcelas</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  O sistema já suporta contas recorrentes e parceladas com identificação de parcela atual e total de parcelas, o que permite acompanhar despesas maiores como máquinas, reformas e investimentos do barracão.
                </p>
              </div>
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
                O.S., clientes, financeiro e logs vêm dos wrappers Supabase. Nota Fiscal não entra nos indicadores da v1.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Últimas Movimentações</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            {activities.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma atividade registrada ainda.
              </div>
            ) : (
              <div className="space-y-0 divide-y divide-border/50">
                {activities.slice(0, 10).map((act) => (
                  <div key={act.id} className="flex items-start gap-3 py-2.5">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug">{act.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(act.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </ErrorBoundary>
    </div>
  );
}
