import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STATUS_LABELS, NoteStatus } from '@/types';
import { Users, UserCheck, UserX, Activity, TrendingUp, FileText, BarChart3 } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';

const COLORS = [
  'hsl(192, 70%, 38%)', 'hsl(165, 55%, 40%)', 'hsl(38, 92%, 50%)',
  'hsl(280, 55%, 55%)', 'hsl(0, 72%, 51%)', 'hsl(210, 80%, 55%)',
  'hsl(150, 55%, 35%)', 'hsl(350, 60%, 42%)',
];

export default function AdminDashboard() {
  const { clients, notes, activities } = useData();
  const prefersReducedMotion = useReducedMotion();

  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.isActive).length;
  const inactiveClients = clients.filter(c => !c.isActive).length;
  const totalNotes = notes.length;
  const openNotes = notes.filter(n => !['FINALIZADO', 'CANCELADO', 'DESCARTADO', 'SEM_CONSERTO', 'AGUARDANDO_COMPRA'].includes(n.status)).length;
  const revenue = notes.filter(n => n.status === 'FINALIZADO').reduce((s, n) => s + n.totalAmount, 0);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    notes.forEach(n => { counts[n.status] = (counts[n.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[status as NoteStatus] || status,
      value: count,
    }));
  }, [notes]);

  const kpis = [
    { label: 'Total de Clientes', value: totalClients, icon: Users, color: 'text-primary', bg: 'bg-primary/10', detail: 'Registros carregados do banco' },
    { label: 'Clientes Ativos', value: activeClients, icon: UserCheck, color: 'text-success', bg: 'bg-success/10', detail: totalClients > 0 ? `${Math.round((activeClients / totalClients) * 100)}% da base` : 'Sem clientes cadastrados' },
    { label: 'Clientes Inativos', value: inactiveClients, icon: UserX, color: 'text-destructive', bg: 'bg-destructive/10', detail: `${inactiveClients} registro${inactiveClients === 1 ? '' : 's'}` },
    { label: 'Atividades Recentes', value: activities.length, icon: Activity, color: 'text-info', bg: 'bg-info/10', detail: 'Eventos carregados do banco' },
    { label: 'O.S. em Aberto', value: openNotes, icon: FileText, color: 'text-warning', bg: 'bg-warning/10', detail: `de ${totalNotes} O.S. carregadas` },
    { label: 'Faturamento Finalizado', value: `R$ ${(revenue / 1000).toFixed(0)}k`, icon: TrendingUp, color: 'text-accent', bg: 'bg-accent/10', detail: 'Soma das O.S. finalizadas' },
  ];

  const revealProps = (delay: number) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReducedMotion ? { duration: 0 } : { delay: delay * 0.07 },
  });

  const hasStatusData = statusData.length > 0;
  const hasActivities = activities.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Painel Administrativo</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da plataforma e análise de uso</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} {...revealProps(i)}>
            <Card className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground font-medium">{kpi.label}</p>
                    <p className="text-3xl font-display font-bold text-foreground">{kpi.value}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{kpi.detail}</span>
                    </div>
                  </div>
                  <div className={`w-11 h-11 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts row 1 */}
      <ErrorBoundary
        fallback={(
          <SectionErrorState
            title="Falha ao carregar os gráficos administrativos"
            description="A página continua acessível, mas os painéis visuais podem ser recarregados depois."
          />
        )}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                Módulos Mais Utilizados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SectionEmptyState
                title="Métrica ainda não instrumentada"
                description="Este gráfico foi removido da v1 para não exibir dados de amostra como se fossem métricas reais."
                className="min-h-[280px] border-0 bg-transparent"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Distribuição de O.S. por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasStatusData ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={3}>
                        {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {statusData.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground">{s.name} ({s.value})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <SectionEmptyState
                  title="Sem O.S. para analisar"
                  description="Quando as ordens começarem a circular, a distribuição por status aparece aqui."
                  className="min-h-[280px] border-0 bg-transparent"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </ErrorBoundary>

      {/* Charts row 2 */}
      <ErrorBoundary
        fallback={(
          <SectionErrorState
            title="Falha ao renderizar as tendências"
            description="Os gráficos de tendência podem ser reabertos depois sem impacto nos dados operacionais."
          />
        )}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Atividade Semanal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SectionEmptyState
                title="Série semanal indisponível"
                description="O histórico existe, mas ainda falta uma agregação real por dia para alimentar este gráfico."
                className="min-h-[220px] border-0 bg-transparent"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                Crescimento Mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SectionEmptyState
                title="Crescimento real ainda não calculado"
                description="Sem dados inventados: a v1 mostra apenas indicadores que vêm do banco ou estados vazios honestos."
                className="min-h-[220px] border-0 bg-transparent"
              />
            </CardContent>
          </Card>
        </div>
      </ErrorBoundary>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimas Atividades do Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          {hasActivities ? (
            <div className="space-y-3">
              {activities.slice(0, 10).map((act, i) => (
                <motion.div
                  key={act.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { delay: i * 0.04 }}
                  className="flex items-start gap-3 text-sm p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground">{act.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(act.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <SectionEmptyState
              title="Sem movimentações registradas"
              description="Conforme o sistema for sendo usado, o histórico recente aparece aqui para acompanhamento."
              className="min-h-[180px]"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
