import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Cable,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  Filter,
  Globe2,
  LineChart,
  Loader2,
  Megaphone,
  MousePointerClick,
  PlugZap,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getMarketingResumo, type MarketingResumo } from '@/api/supabase/marketing';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemUsersQuery } from '@/hooks/useSystemUsersQuery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';
import { cn } from '@/lib/utils';

const periodOptions = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

const providerLabels: Record<string, string> = {
  ga4: 'Google Analytics 4',
  clarity: 'Microsoft Clarity',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  internal: 'Eventos próprios',
};

const statusLabels: Record<string, { label: string; className: string }> = {
  connected: { label: 'Conectado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  syncing: { label: 'Sincronizando', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  needs_attention: { label: 'Atenção', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  disabled: { label: 'Desativado', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  not_connected: { label: 'Pendente', className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function getDelta(current: number, previous: number) {
  if (!previous && !current) return { label: 'sem histórico', positive: true, muted: true };
  if (!previous) return { label: 'novo período', positive: true, muted: false };
  const delta = ((current - previous) / previous) * 100;
  return {
    label: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
    positive: delta >= 0,
    muted: false,
  };
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  delta,
  tone = 'default',
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Eye;
  delta?: ReturnType<typeof getDelta>;
  tone?: 'default' | 'teal' | 'green' | 'amber' | 'blue';
}) {
  const toneClass = {
    default: 'bg-slate-950 text-white',
    teal: 'bg-cyan-600 text-white',
    green: 'bg-emerald-600 text-white',
    amber: 'bg-amber-500 text-white',
    blue: 'bg-blue-600 text-white',
  }[tone];

  return (
    <Card className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
            <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          </div>
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', toneClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {delta ? (
          <div className={cn(
            'mt-5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
            delta.muted
              ? 'border-slate-200 bg-slate-50 text-slate-500'
              : delta.positive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700',
          )}>
            {delta.muted ? <Clock3 className="h-3.5 w-3.5" /> : delta.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta.label} vs período anterior
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[168px] rounded-lg" />
      ))}
    </div>
  );
}

function EmptyIntegrationRail({ resumo }: { resumo: MarketingResumo }) {
  const knownProviders = ['ga4', 'meta_ads', 'google_ads', 'clarity'];
  const activeByProvider = new Map(resumo.integrations.map((integration) => [integration.provider, integration]));

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {knownProviders.map((provider) => {
        const integration = activeByProvider.get(provider);
        const status = statusLabels[integration?.status ?? 'not_connected'];
        return (
          <div key={provider} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Cable className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{providerLabels[provider]}</p>
                  <p className="truncate text-xs text-muted-foreground">{integration?.accountName ?? 'Aguardando conexão segura'}</p>
                </div>
              </div>
              <Badge variant="outline" className={cn('shrink-0', status.className)}>{status.label}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SiteTab({ resumo }: { resumo: MarketingResumo }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const hasData = current.visits > 0 || current.whatsappClicks > 0 || current.formSubmits > 0 || current.leads > 0;
  const bestSource = resumo.site.sources.find((source) => source.visits > 0 || source.leads > 0);
  const bestPage = resumo.site.pages.find((page) => page.views > 0 || page.conversions > 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Visitantes"
          value={formatNumber(current.visits)}
          detail={`Últimos ${resumo.periodDays} dias`}
          icon={Eye}
          delta={getDelta(current.visits, previous.visits)}
          tone="teal"
        />
        <MetricCard
          title="Cliques no WhatsApp"
          value={formatNumber(current.whatsappClicks)}
          detail="Eventos próprios capturados"
          icon={MousePointerClick}
          delta={getDelta(current.whatsappClicks, previous.whatsappClicks)}
          tone="green"
        />
        <MetricCard
          title="Leads"
          value={formatNumber(current.leads)}
          detail="Formulários e eventos de lead"
          icon={Users}
          delta={getDelta(current.leads, previous.leads)}
          tone="blue"
        />
        <MetricCard
          title="Conversão"
          value={`${Number(current.conversionRate ?? 0).toFixed(1)}%`}
          detail="Leads sobre visitas"
          icon={Target}
          tone="amber"
        />
      </div>

      {!hasData ? (
        <SectionEmptyState
          icon={PlugZap}
          title="Nenhum evento real capturado ainda"
          description="Assim que o site enviar page views, cliques de WhatsApp ou formulários, os cards e gráficos passam a mostrar resultados reais deste tenant."
          className="min-h-[220px]"
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Evolução do site</h2>
                <p className="text-sm text-muted-foreground">Visitas, ações e leads por dia.</p>
              </div>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                Dados próprios
              </Badge>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={resumo.site.daily}>
                  <defs>
                    <linearGradient id="visitsGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={34} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="visits" name="Visitas" stroke="hsl(var(--primary))" fill="url(#visitsGradient)" strokeWidth={2} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--accent))" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-foreground">Insights do período</h2>
              <p className="text-sm text-muted-foreground">Leitura automática baseada nos dados disponíveis.</p>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/25 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed text-foreground">
                    {bestPage
                      ? `A página ${bestPage.path} concentrou ${formatNumber(bestPage.views)} visitas no período.`
                      : 'Ainda não há páginas suficientes para destacar uma oportunidade real.'}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/25 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed text-foreground">
                    {bestSource
                      ? `A principal origem registrada foi ${bestSource.source}, com ${formatNumber(bestSource.visits)} visitas e ${formatNumber(bestSource.leads)} leads.`
                      : 'As origens aparecem quando o site envia UTM, referrer ou eventos próprios.'}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/25 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed text-foreground">
                    {current.visits > 0
                      ? `O funil atual está em ${formatNumber(current.visits)} visitas -> ${formatNumber(current.whatsappClicks + current.formSubmits)} ações -> ${formatNumber(current.leads)} leads.`
                      : 'O funil será calculado quando os primeiros eventos reais forem capturados.'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-5">
            <h2 className="text-base font-semibold text-foreground">Páginas mais acessadas</h2>
            <div className="mt-4 space-y-3">
              {resumo.site.pages.length > 0 ? resumo.site.pages.map((page) => (
                <div key={page.path} className="flex items-center justify-between gap-4 rounded-lg border bg-background p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{page.path}</p>
                    <p className="truncate text-xs text-muted-foreground">{page.title ?? 'Sem título informado'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatNumber(page.views)}</p>
                      <p className="text-xs text-muted-foreground">visitas</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )) : (
                <SectionEmptyState title="Sem páginas capturadas" description="As páginas aparecerão depois que o site enviar eventos de visualização." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-5">
            <h2 className="text-base font-semibold text-foreground">Origem do tráfego</h2>
            <div className="mt-4 h-[280px]">
              {resumo.site.sources.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resumo.site.sources} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="source" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={90} />
                    <RechartsTooltip />
                    <Bar dataKey="visits" name="Visitas" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <SectionEmptyState title="Sem origem registrada" description="UTMs e referrers serão agrupados aqui sem misturar dados entre tenants." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CampaignsTab({ resumo }: { resumo: MarketingResumo }) {
  const financialAvailable = resumo.campaigns.financialAvailable;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Investimento" value={financialAvailable ? formatCurrency(resumo.campaigns.current.spend) : 'Pendente'} detail="Meta/Google Ads ainda não conectados" icon={CircleDollarSign} tone="default" />
        <MetricCard title="Cliques pagos" value={formatNumber(resumo.campaigns.current.clicks)} detail="Disponível após integração" icon={MousePointerClick} tone="teal" />
        <MetricCard title="Leads de campanha" value={formatNumber(resumo.campaigns.current.leads)} detail="Atribuição por UTM/evento" icon={Target} tone="blue" />
        <MetricCard title="CPL" value={financialAvailable ? formatCurrency(resumo.campaigns.current.cpl) : 'Pendente'} detail="Custo por lead real" icon={TrendingUp} tone="amber" />
      </div>

      <SectionEmptyState
        icon={Megaphone}
        title="Campanhas aguardando integração segura"
        description="A base já separa tenant, permissões e estados de campanha. Os dados financeiros entram quando Meta Ads ou Google Ads forem conectados pelo backend, sem tokens no navegador."
        className="min-h-[240px]"
      />
    </div>
  );
}

export default function MarketingGrowth() {
  const { isAdmin } = useAuth();
  const { data: systemUsers = [], isLoading: isLoadingUsers } = useSystemUsersQuery({ enabled: isAdmin });
  const [periodDays, setPeriodDays] = useState('30');
  const [selectedUserId, setSelectedUserId] = useState('');
  const selectedPeriod = Number(periodDays);
  const selectableUsers = useMemo(() => {
    return systemUsers.filter((user) => (
      user.isActive
      && user.role !== 'ADMIN'
      && user.moduleAccess?.marketing === true
    ));
  }, [systemUsers]);
  const selectedUser = useMemo(
    () => selectableUsers.find((user) => user.id === selectedUserId) ?? null,
    [selectableUsers, selectedUserId],
  );

  useEffect(() => {
    if (!isAdmin) {
      setSelectedUserId('');
      return;
    }
    if (selectedUserId && selectableUsers.some((user) => user.id === selectedUserId)) return;
    setSelectedUserId(selectableUsers[0]?.id ?? '');
  }, [isAdmin, selectableUsers, selectedUserId]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['marketing-growth', selectedPeriod, isAdmin ? selectedUserId : 'self'],
    queryFn: () => getMarketingResumo(selectedPeriod, isAdmin ? selectedUserId : null),
    enabled: !isAdmin || Boolean(selectedUserId),
    staleTime: 1000 * 60 * 3,
    retry: false,
  });

  const health = useMemo(() => {
    if (error) return { label: 'Falha no carregamento', className: 'border-rose-200 bg-rose-50 text-rose-700' };
    if (!data) return { label: 'Carregando', className: 'border-slate-200 bg-slate-50 text-slate-600' };
    if (data.integrations.some((integration) => integration.status === 'connected')) {
      return { label: 'Integração ativa', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    }
    if (data.config.hasSiteKey) {
      return { label: 'Eventos prontos', className: 'border-blue-200 bg-blue-50 text-blue-700' };
    }
    return { label: 'Configuração pendente', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  }, [data, error]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-6">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <LineChart className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-display font-bold text-foreground">Crescimento</h1>
                  <Badge variant="outline" className={cn('shrink-0', health.className)}>{health.label}</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  Resultados de site, leads e campanhas com dados reais do tenant atual. Integrações externas entram apenas por backend seguro.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isAdmin ? (
                <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers || selectableUsers.length === 0}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Selecionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" disabled className="justify-start sm:justify-center">
                <BarChart3 className="mr-2 h-4 w-4" />
                Exportar relatório
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <SectionErrorState
            title="Não foi possível carregar Crescimento"
            description={error instanceof Error ? error.message : 'Tente novamente em instantes.'}
            className="min-h-[260px]"
          />
        ) : null}

        {isAdmin && !isLoadingUsers && selectableUsers.length === 0 ? (
          <SectionEmptyState
            icon={Users}
            title="Nenhum cliente com Crescimento habilitado"
            description="Habilite o módulo Crescimento em pelo menos um cliente operacional para acompanhar sites, campanhas e leads."
            className="min-h-[260px]"
          />
        ) : null}

        {isLoading ? <LoadingGrid /> : null}

        {data && !error ? (
          <>
            {isAdmin && selectedUser ? (
              <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                Visualizando <span className="font-semibold text-foreground">{selectedUser.name}</span>
                {selectedUser.email ? <span> · {selectedUser.email}</span> : null}
              </div>
            ) : null}

            <EmptyIntegrationRail resumo={data} />

            <Tabs defaultValue="site" className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="grid w-full grid-cols-2 sm:w-[360px]">
                  <TabsTrigger value="site" className="gap-2">
                    <Globe2 className="h-4 w-4" />
                    Site
                  </TabsTrigger>
                  <TabsTrigger value="campanhas" className="gap-2">
                    <Megaphone className="h-4 w-4" />
                    Campanhas
                  </TabsTrigger>
                </TabsList>
                {isFetching ? (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Atualizando dados
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Sem dados mockados em produção
                  </span>
                )}
              </div>

              <TabsContent value="site">
                <SiteTab resumo={data} />
              </TabsContent>

              <TabsContent value="campanhas">
                <CampaignsTab resumo={data} />
              </TabsContent>
            </Tabs>

            {!data.config.hasSiteKey ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Captura própria ainda não configurada</p>
                    <p className="mt-1 text-sm leading-relaxed">
                      Para ativar eventos do site, configure uma chave pública por tenant e salve somente o hash no banco. Nenhum token de GA4, Meta ou Google Ads deve ir para o frontend.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
