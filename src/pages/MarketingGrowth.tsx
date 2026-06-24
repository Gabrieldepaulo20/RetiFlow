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
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  getMarketingResumo,
  getMarketingResumoQueryKey,
  type MarketingProvider,
  type MarketingResumo,
} from '@/api/supabase/marketing';
import {
  MARKETING_RESUMO_CACHE_TTL_MS,
  readCachedMarketingResumo,
} from '@/api/supabase/marketingCache';
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
  ga4: 'Google Analytics',
  clarity: 'Microsoft Clarity',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  internal: 'Eventos do site',
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

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function parseChartDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatShortChartDate(value: string, periodDays: number) {
  const date = parseChartDate(value);
  if (!date) return value;
  const options: Intl.DateTimeFormatOptions = periodDays > 45
    ? { month: '2-digit', year: '2-digit' }
    : { day: '2-digit', month: '2-digit' };
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function formatFullChartDate(value: string) {
  const date = parseChartDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('pt-BR').format(date);
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
      <CardContent className="p-3 sm:p-5">
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-xs sm:tracking-[0.12em]">{title}</p>
            <p className="mt-2 truncate text-xl font-bold leading-tight text-foreground sm:mt-3 sm:text-3xl">{value}</p>
            <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground sm:text-sm">{detail}</p>
          </div>
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11', toneClass)}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
        {delta ? (
          <div className={cn(
            'mt-3 inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:mt-5 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs',
            delta.muted
              ? 'border-slate-200 bg-slate-50 text-slate-500'
              : delta.positive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700',
          )}>
            {delta.muted ? <Clock3 className="h-3.5 w-3.5" /> : delta.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            <span className="truncate">{delta.label} <span className="hidden sm:inline">vs período anterior</span><span className="sm:hidden">vs ant.</span></span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[118px] rounded-lg sm:h-[168px]" />
      ))}
    </div>
  );
}

function EmptyIntegrationRail({ resumo }: { resumo: MarketingResumo }) {
  const knownProviders: MarketingProvider[] = ['ga4', 'meta_ads', 'google_ads', 'clarity'];
  const activeByProvider = new Map(resumo.integrations.map((integration) => [integration.provider, integration]));

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
      {knownProviders.map((provider) => {
        const integration = activeByProvider.get(provider);
        const status = statusLabels[integration?.status ?? 'not_connected'];
        return (
          <div key={provider} className="rounded-lg border bg-card p-2.5 shadow-sm sm:p-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-9 sm:w-9">
                  <Cable className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground sm:text-sm">{providerLabels[provider]}</p>
                  <p className="hidden truncate text-xs text-muted-foreground sm:block">{integration?.accountName ?? 'Aguardando conexão segura'}</p>
                </div>
              </div>
              <Badge variant="outline" className={cn('w-fit shrink-0 text-[10px] sm:text-xs', status.className)}>{status.label}</Badge>
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
  const actionEvents = current.actionEvents ?? (current.whatsappClicks + current.formSubmits);
  const previousActionEvents = previous.actionEvents ?? (previous.whatsappClicks + previous.formSubmits);
  const hasData = current.visits > 0 || Number(current.pageViews ?? 0) > 0 || actionEvents > 0 || current.leads > 0;
  const bestSource = resumo.site.sources.find((source) => source.visits > 0 || source.leads > 0);
  const bestPage = resumo.site.pages.find((page) => page.views > 0 || page.conversions > 0);
  const displayedPages = resumo.site.pages.slice(0, 4);
  const displayedSources = resumo.site.sources.slice(0, 5);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          title="Pessoas no site"
          value={formatNumber(current.visits)}
          detail={`Últimos ${resumo.periodDays} dias`}
          icon={Eye}
          delta={getDelta(current.visits, previous.visits)}
          tone="teal"
        />
        <MetricCard
          title="Páginas vistas"
          value={formatNumber(current.pageViews ?? 0)}
          detail="Total de páginas abertas"
          icon={BarChart3}
          delta={getDelta(current.pageViews ?? 0, previous.pageViews ?? 0)}
          tone="default"
        />
        <MetricCard
          title="Cliques no site"
          value={formatNumber(actionEvents)}
          detail="Botões, WhatsApp e formulários"
          icon={MousePointerClick}
          delta={getDelta(actionEvents, previousActionEvents)}
          tone="green"
        />
        <MetricCard
          title="Possíveis clientes"
          value={formatNumber(current.leads)}
          detail="Contatos enviados pelo site"
          icon={Users}
          delta={getDelta(current.leads, previous.leads)}
          tone="blue"
        />
      </div>

      {!hasData ? (
        <SectionEmptyState
          icon={PlugZap}
          title="Nenhum evento real capturado ainda"
          description="Assim que o site registrar visitas, cliques de WhatsApp ou formulários, os cards e gráficos passam a mostrar resultados reais deste cliente."
          className="min-h-[220px]"
        />
      ) : null}

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 sm:mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Evolução do site</h2>
                <p className="hidden text-sm text-muted-foreground sm:block">Visitas, cliques e possíveis clientes por dia.</p>
              </div>
              <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-primary">
                Dados do site
              </Badge>
            </div>
            <div className="h-[200px] rounded-lg bg-muted/20 pt-2 sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={resumo.site.daily}>
                  <defs>
                    <linearGradient id="visitsGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value: string) => formatShortChartDate(value, resumo.periodDays)}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                  <RechartsTooltip
                    labelFormatter={(value) => formatFullChartDate(String(value))}
                    formatter={(value, name) => [formatNumber(Number(value)), name]}
                  />
                  <Area type="monotone" dataKey="visits" name="Visitas" stroke="hsl(var(--primary))" fill="url(#visitsGradient)" strokeWidth={2} />
                  <Area type="monotone" dataKey="pageViews" name="Visualizações" stroke="#0f766e" fill="transparent" strokeWidth={2} />
                  <Area type="monotone" dataKey="leads" name="Possíveis clientes" stroke="hsl(var(--accent))" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-3 sm:p-5">
            <div className="mb-3 sm:mb-5">
              <h2 className="text-base font-semibold text-foreground">Insights do período</h2>
              <p className="hidden text-sm text-muted-foreground sm:block">Leitura automática baseada nos dados disponíveis.</p>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <div className="rounded-lg border bg-muted/25 p-3 sm:p-4">
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-foreground sm:text-sm">
                    {bestPage
                      ? `A página ${bestPage.path} concentrou ${formatNumber(bestPage.views)} visitas no período.`
                      : 'Ainda não há páginas suficientes para destacar uma oportunidade real.'}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/25 p-3 sm:p-4">
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-foreground sm:text-sm">
                    {bestSource
                      ? `A principal origem registrada foi ${bestSource.source}, com ${formatNumber(bestSource.visits)} visitas e ${formatNumber(bestSource.leads)} possíveis clientes.`
                      : 'As origens aparecem quando o site informa de onde a pessoa veio, como Google, Instagram ou campanha.'}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/25 p-3 sm:p-4">
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-foreground sm:text-sm">
                    {current.visits > 0
                      ? `O site trouxe ${formatNumber(current.visits)} pessoas, ${formatNumber(actionEvents)} cliques importantes e ${formatNumber(current.leads)} possíveis clientes. Taxa de contato: ${formatPercent(current.conversionRate ?? 0)}.`
                      : 'O funil será calculado quando os primeiros eventos reais forem capturados.'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-3 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Páginas mais acessadas</h2>
            <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
              {displayedPages.length > 0 ? displayedPages.map((page) => (
                <div key={page.path} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2.5 sm:gap-4 sm:p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{page.path}</p>
                    <p className="hidden truncate text-xs text-muted-foreground sm:block">{page.title ?? 'Sem título informado'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right sm:gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatNumber(page.views)}</p>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">visitas</p>
                    </div>
                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                  </div>
                </div>
              )) : (
                <SectionEmptyState title="Sem páginas capturadas" description="As páginas aparecerão depois que o site enviar eventos de visualização." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="p-3 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Origem do tráfego</h2>
            <div className="mt-3 h-[200px] sm:mt-4 sm:h-[260px]">
              {displayedSources.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayedSources} layout="vertical" margin={{ left: 4, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={72} />
                    <RechartsTooltip />
                    <Bar dataKey="visits" name="Visitas" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <SectionEmptyState title="Sem origem registrada" description="Quando o site informar de onde a pessoa veio, as visitas serão agrupadas aqui." />
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
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <MetricCard title="Investimento" value={financialAvailable ? formatCurrency(resumo.campaigns.current.spend) : 'Pendente'} detail="Meta/Google Ads ainda não conectados" icon={CircleDollarSign} tone="default" />
        <MetricCard title="Impressões" value={financialAvailable ? formatNumber(resumo.campaigns.current.impressions ?? 0) : 'Pendente'} detail="Search Console/Ads necessário" icon={Eye} tone="blue" />
        <MetricCard title="Cliques pagos" value={formatNumber(resumo.campaigns.current.clicks)} detail="Disponível após integração" icon={MousePointerClick} tone="teal" />
        <MetricCard title="Custo por contato" value={financialAvailable ? formatCurrency(resumo.campaigns.current.cpl) : 'Pendente'} detail="Quanto custou cada possível cliente" icon={TrendingUp} tone="amber" />
      </div>

      <SectionEmptyState
        icon={Megaphone}
        title="Campanhas aguardando integração segura"
        description="Os dados financeiros entram quando Meta Ads ou Google Ads forem conectados com segurança, sem credenciais no navegador."
        className="min-h-[180px] sm:min-h-[240px]"
      />
    </div>
  );
}

export default function MarketingGrowth() {
  const { isAdmin, isSupportImpersonating, operationalUser } = useAuth();
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
  const supportMarketingUserId = useMemo(() => {
    if (!isAdmin || !isSupportImpersonating) return '';
    if (!operationalUser || operationalUser.role === 'ADMIN') return '';
    return operationalUser.moduleAccess?.marketing === true ? operationalUser.id : '';
  }, [isAdmin, isSupportImpersonating, operationalUser]);
  const selectedUser = useMemo(
    () => selectableUsers.find((user) => user.id === selectedUserId) ?? null,
    [selectableUsers, selectedUserId],
  );
  const targetUserId = isAdmin ? selectedUserId : null;
  const queryEnabled = !isAdmin || Boolean(targetUserId);
  const queryKey = useMemo(
    () => getMarketingResumoQueryKey(selectedPeriod, targetUserId),
    [selectedPeriod, targetUserId],
  );
  const cachedResumo = useMemo(
    () => (queryEnabled ? readCachedMarketingResumo(selectedPeriod, targetUserId) : null),
    [queryEnabled, selectedPeriod, targetUserId],
  );

  useEffect(() => {
    if (!isAdmin) {
      setSelectedUserId('');
      return;
    }
    if (supportMarketingUserId && selectableUsers.some((user) => user.id === supportMarketingUserId)) {
      if (selectedUserId !== supportMarketingUserId) {
        setSelectedUserId(supportMarketingUserId);
      }
      return;
    }
    if (selectedUserId && selectableUsers.some((user) => user.id === selectedUserId)) return;
    setSelectedUserId(selectableUsers[0]?.id ?? '');
  }, [isAdmin, selectableUsers, selectedUserId, supportMarketingUserId]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    queryFn: () => getMarketingResumo(selectedPeriod, targetUserId),
    enabled: queryEnabled,
    staleTime: MARKETING_RESUMO_CACHE_TTL_MS,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialData: cachedResumo?.data,
    initialDataUpdatedAt: cachedResumo?.savedAt,
    placeholderData: (previous) => {
      if (!previous) return undefined;
      if (previous.periodDays !== selectedPeriod) return undefined;
      if (!isAdmin) return previous;
      return previous.context?.targetUserId === targetUserId ? previous : undefined;
    },
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
      <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:space-y-6 md:p-6">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 p-3 sm:gap-5 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:h-14 sm:w-14">
                <LineChart className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-display font-bold text-foreground sm:text-2xl">Crescimento</h1>
                  <Badge variant="outline" className={cn('shrink-0', health.className)}>{health.label}</Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              {isAdmin ? (
                <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers || selectableUsers.length === 0}>
                  <SelectTrigger className="w-full min-w-0 sm:w-[260px]">
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
                <SelectTrigger className={cn('w-full min-w-0 sm:w-[150px]', !isAdmin && 'col-span-2 sm:col-span-1')}>
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" disabled className="hidden justify-start sm:inline-flex sm:justify-center">
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
            description="Habilite o módulo Crescimento em pelo menos um cliente operacional para acompanhar site, campanhas e possíveis clientes."
            className="min-h-[260px]"
          />
        ) : null}

        {isLoading ? <LoadingGrid /> : null}

        {data && !error ? (
          <>
            {isAdmin && selectedUser ? (
              <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                Visualizando <span className="font-semibold text-foreground">{selectedUser.name}</span>
                {selectedUser.email ? <span className="hidden sm:inline"> · {selectedUser.email}</span> : null}
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
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Atualizando dados
                  </span>
                ) : (
                  <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:inline-flex">
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
          </>
        ) : null}
      </div>
    </div>
  );
}
