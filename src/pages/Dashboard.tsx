import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_COLORS, NoteStatus, FINAL_STATUSES } from '@/types';
import {
  FileText, DollarSign, Clock, TrendingUp, AlertCircle,
  CheckCircle2, Timer, Users, Receipt, ShoppingCart,
  ArrowUpRight, ArrowDownRight, Minus, AlertTriangle,
  Wrench, Package, Info,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell, PieChart, Pie, Legend,
  AreaChart, Area,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  format, subMonths, startOfMonth, endOfMonth,
  startOfDay, differenceInDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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
  const { notes, clients, invoices, services, products, activities } = useData();
  const navigate = useNavigate();

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

  // ── NFs emitidas este mês ────────────────────────────────────────────────
  const invoicesThisMonth = useMemo(
    () => invoices.filter(inv => {
      const t = new Date(inv.issueDate).getTime();
      return t >= startCurrent && t <= endCurrent && inv.status !== 'CANCELADA';
    }),
    [invoices, startCurrent, endCurrent],
  );

  const invoicesThisMonthTotal = invoicesThisMonth.reduce((s, i) => s + i.amount, 0);

  // ── Total NFs (all time) ─────────────────────────────────────────────────
  const totalInvoices = useMemo(
    () => invoices.filter(i => i.status !== 'CANCELADA').length,
    [invoices],
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
  const topServices = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const s of services) {
      const key = s.name.trim();
      const prev = map.get(key) ?? { count: 0, revenue: 0 };
      map.set(key, { count: prev.count + s.quantity, revenue: prev.revenue + s.subtotal });
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [services]);

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
      label: 'NFs este mês',
      value: invoicesThisMonth.length,
      sub: invoicesThisMonth.length > 0
        ? `R$ ${fmtBRL(invoicesThisMonthTotal)} emitido`
        : `${totalInvoices} no total`,
      icon: ShoppingCart,
      iconClass: 'text-indigo-600 bg-indigo-50',
      subClass: 'text-muted-foreground',
      trend: null,
      tooltip: 'Notas fiscais emitidas no mês atual com status Registrada ou Enviada (excluindo canceladas).',
      href: '/nota-fiscal',
    },
  ];

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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (rowIdx * 0.24) + i * 0.06, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
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
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-2">
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
          </CardContent>
        </Card>
      </div>

      {/* Analysis row: top clients + top services + type donut */}
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
            {topServices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dados ainda</p>
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

            {/* NFs emitidas */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  NFs este mês
                </span>
                <span className="text-[12px] font-bold tabular-nums">{invoicesThisMonth.length}</span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {invoicesThisMonth.length > 0
                  ? `R$ ${fmtBRLFull(invoicesThisMonthTotal)} emitido`
                  : 'Nenhuma NF emitida no mês'}
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
    </div>
  );
}
