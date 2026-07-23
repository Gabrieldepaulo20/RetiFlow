import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileWarning,
  Filter,
  Gauge,
  LockKeyhole,
  MailCheck,
  MessageCircle,
  MousePointerClick,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  getMarketingResumo,
  getMarketingResumoQueryKey,
  linkMarketingLeadToClient,
  type MarketingClientOption,
  type MarketingEventItem,
  type MarketingIntegrationSummary,
  type MarketingLeadItem,
  type MarketingProvider,
  type MarketingResumo,
  type MarketingSearchTotals,
} from '@/api/supabase/marketing';
import {
  MARKETING_RESUMO_CACHE_TTL_MS,
  readCachedMarketingResumo,
} from '@/api/supabase/marketingCache';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemUsersQuery } from '@/hooks/useSystemUsersQuery';
import { isSuperAdmin } from '@/services/auth/superAdmin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';
import { cn } from '@/lib/utils';

const REFRESH_INTERVAL_MS = 10 * 60_000;
const RETIFICA_PREMIUM_EMAIL = 'retificapremium5@gmail.com';
const periodOptions = [7, 10, 15, 20, 30, 40, 60, 90];

const eventLabels: Record<string, string> = {
  page_view: 'Página acessada',
  whatsapp_click: 'Clique no WhatsApp',
  phone_click: 'Clique no telefone',
  form_view: 'Formulário visualizado',
  form_start: 'Formulário iniciado',
  form_abandon: 'Formulário abandonado',
  form_submit_attempt: 'Tentativa de envio',
  form_validation_error: 'Erro de preenchimento',
  form_submit_error: 'Falha no envio',
  form_submit: 'Formulário enviado',
  generate_lead: 'Contato gerado',
};

const providerLabels: Record<string, string> = {
  internal: 'Eventos do site',
  ga4: 'Google Analytics',
  search_console: 'Search Console',
  google_ads: 'Google Ads',
  clarity: 'Microsoft Clarity',
  meta_ads: 'Meta Ads',
};

const statusStyle: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  connected: {
    label: 'Conectado',
    className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  syncing: {
    label: 'Sincronizando',
    className: 'border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-300',
    icon: RefreshCw,
  },
  needs_attention: {
    label: 'Requer atenção',
    className: 'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300',
    icon: AlertTriangle,
  },
  disabled: {
    label: 'Desativado',
    className: 'border-slate-300 bg-slate-100 text-slate-600',
    icon: AlertTriangle,
  },
  not_connected: {
    label: 'Pendente',
    className: 'border-slate-300 bg-slate-100 text-slate-600',
    icon: Clock3,
  },
};

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR').format(Number(value ?? 0));
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

function formatPercent(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function formatDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(seconds ?? 0)));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}min ${remainder.toString().padStart(2, '0')}s`;
}

function parseChartDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatShortDate(value: string, periodDays = 30) {
  const date = parseChartDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('pt-BR', periodDays > 60
    ? { month: 'short', year: '2-digit' }
    : { day: '2-digit', month: '2-digit' }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Ainda sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getDelta(current: number, previous: number) {
  if (!previous && !current) return { label: 'sem histórico', positive: true, muted: true };
  if (!previous) return { label: 'novo no período', positive: true, muted: false };
  const value = ((current - previous) / previous) * 100;
  return {
    label: `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`,
    positive: value >= 0,
    muted: false,
  };
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  current,
  previous,
  accent = 'navy',
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Eye;
  current?: number;
  previous?: number;
  accent?: 'navy' | 'gold' | 'teal' | 'violet' | 'rose';
}) {
  const delta = current === undefined || previous === undefined ? null : getDelta(current, previous);
  const accents = {
    navy: 'bg-slate-950 text-white',
    gold: 'bg-amber-400 text-slate-950',
    teal: 'bg-teal-600 text-white',
    violet: 'bg-violet-600 text-white',
    rose: 'bg-rose-600 text-white',
  };

  return (
    <Card className="group overflow-hidden rounded-2xl border-border/70 bg-card shadow-[0_10px_35px_-28px_rgba(15,23,42,0.6)] transition-transform duration-200 hover:-translate-y-0.5">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">{label}</p>
            <p className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
          </div>
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', accents[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {delta ? (
          <div className={cn(
            'mt-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            delta.muted
              ? 'border-slate-200 bg-slate-50 text-slate-500'
              : delta.positive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700',
          )}>
            {delta.muted
              ? <Clock3 className="h-3.5 w-3.5" />
              : delta.positive
                ? <ArrowUpRight className="h-3.5 w-3.5" />
                : <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta.label} <span className="hidden sm:inline">vs. período anterior</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PanelHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color?: string }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-2 font-semibold text-foreground">{label ? formatShortDate(String(label)) : ''}</p>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-foreground">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationStrip({ integrations }: { integrations: MarketingIntegrationSummary[] }) {
  const order: MarketingProvider[] = ['internal', 'ga4', 'search_console', 'google_ads'];
  const displayed: MarketingIntegrationSummary[] = order.map((provider) => (
    integrations.find((item) => item.provider === provider) ?? {
      provider,
      status: 'not_connected' as const,
      lastSyncAt: null,
    }
  ));

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {displayed.map((integration) => {
        const status = statusStyle[integration.status] ?? statusStyle.not_connected;
        const StatusIcon = status.icon;
        return (
          <div key={integration.provider} className="rounded-2xl border border-border/70 bg-card px-3.5 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{providerLabels[integration.provider] ?? integration.provider}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {integration.freshness ?? (integration.lastSyncAt ? formatDateTime(integration.lastSyncAt) : 'Sem sincronização')}
                </p>
              </div>
              <Badge variant="outline" className={cn('shrink-0 gap-1 text-[10px]', status.className)}>
                <StatusIcon className={cn('h-3 w-3', integration.status === 'syncing' && 'animate-spin')} />
                {status.label}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AcquisitionRail({ resumo }: { resumo: MarketingResumo }) {
  const funnel = resumo.executive?.funnel ?? {
    visits: resumo.site.current.visits,
    whatsappClicks: resumo.site.current.whatsappClicks,
    formStarts: resumo.site.current.formStarts ?? 0,
    formSubmits: resumo.site.current.formSubmits,
    identifiedClients: resumo.business?.current.identifiedClients ?? 0,
    approvedOrders: resumo.business?.current.approvedOrders ?? 0,
  };
  const steps = [
    { label: 'Pessoas no site', value: funnel.visits, icon: Users },
    { label: 'WhatsApp', value: funnel.whatsappClicks, icon: MessageCircle },
    { label: 'Formulários iniciados', value: funnel.formStarts, icon: FileWarning },
    { label: 'Contatos enviados', value: funnel.formSubmits, icon: MailCheck },
    { label: 'Clientes identificados', value: funnel.identifiedClients, icon: UserCheck },
    { label: 'O.S. aprovadas', value: funnel.approvedOrders, icon: FileCheck2 },
  ];

  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-slate-950 text-white shadow-[0_24px_70px_-35px_rgba(15,23,42,0.85)]">
      <CardContent className="p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Trilho da aquisição</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">Da visita até a O.S. aprovada</h2>
          </div>
          <p className="text-xs text-slate-400">Clique no WhatsApp mede intenção, não garante mensagem enviada.</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 md:grid-cols-3 xl:grid-cols-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const next = steps[index + 1];
            const conversion = next && step.value ? percentage(next.value, step.value) : null;
            return (
              <div key={step.label} className="relative bg-slate-950 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-amber-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">0{index + 1}</span>
                </div>
                <p className="mt-5 text-2xl font-bold">{formatNumber(step.value)}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{step.label}</p>
                {conversion !== null ? (
                  <p className="mt-3 text-[10px] font-semibold text-teal-300">{formatPercent(conversion)} avança</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ resumo }: { resumo: MarketingResumo }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const business = resumo.business?.current ?? resumo.executive?.business;
  const previousBusiness = resumo.business?.previous ?? resumo.executive?.previousBusiness;

  return (
    <div className="space-y-5">
      <AcquisitionRail resumo={resumo} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Pessoas no site"
          value={formatNumber(current.visits)}
          detail={`${formatNumber(current.sessions)} sessões no período`}
          icon={Users}
          current={current.visits}
          previous={previous.visits}
          accent="navy"
        />
        <Metric
          label="Cliques no WhatsApp"
          value={formatNumber(current.whatsappClicks)}
          detail="Cliques únicos e rastreados"
          icon={MessageCircle}
          current={current.whatsappClicks}
          previous={previous.whatsappClicks}
          accent="teal"
        />
        <Metric
          label="Clientes da internet"
          value={formatNumber(business?.identifiedClients)}
          detail="Vinculados por código, telefone ou e-mail"
          icon={UserCheck}
          current={business?.identifiedClients}
          previous={previousBusiness?.identifiedClients}
          accent="violet"
        />
        <Metric
          label="Comissão acumulada"
          value={formatCurrency(business?.commission)}
          detail={`${formatPercent((resumo.config.commissionRate ?? 0.2) * 100)} sobre serviços aprovados`}
          icon={BadgeDollarSign}
          current={business?.commission}
          previous={previousBusiness?.commission}
          accent="gold"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading
              eyebrow="Pulso diário"
              title="Crescimento do site"
              description="Pessoas, páginas vistas e ações importantes no período selecionado."
            />
            <div className="mt-5 h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={resumo.site.daily}>
                  <defs>
                    <linearGradient id="growthVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => formatShortDate(value, resumo.periodDays)}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="visits" name="Pessoas" stroke="#0f766e" strokeWidth={2.5} fill="url(#growthVisits)" />
                  <Line type="monotone" dataKey="pageViews" name="Páginas" stroke="#0f172a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actions" name="Ações" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="leads" name="Contatos" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-gradient-to-b from-amber-50 to-card shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Leitura rápida" title="O que merece atenção" />
            <div className="mt-5 space-y-3">
              {[
                {
                  icon: Gauge,
                  title: 'Engajamento',
                  value: formatPercent(current.engagementRate),
                  detail: `${formatDuration(current.averageSessionDuration)} de duração média`,
                },
                {
                  icon: Target,
                  title: 'Conversão em contato',
                  value: formatPercent(current.conversionRate),
                  detail: `${formatNumber(current.leads)} contatos registrados`,
                },
                {
                  icon: FileWarning,
                  title: 'Formulário',
                  value: formatPercent(resumo.forms?.current.completionRate),
                  detail: `${formatNumber(resumo.forms?.current.abandons)} abandonos identificados`,
                },
                {
                  icon: Wrench,
                  title: 'Serviços aprovados',
                  value: formatCurrency(business?.approvedServices),
                  detail: `${formatNumber(business?.approvedOrders)} O.S. com snapshot`,
                },
              ].map((insight) => {
                const Icon = insight.icon;
                return (
                  <div key={insight.title} className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-white/80 p-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-amber-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-slate-600">{insight.title}</p>
                        <p className="shrink-0 text-sm font-bold text-slate-950">{insight.value}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{insight.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SearchMetric({
  label,
  current,
  previous,
  kind,
}: {
  label: string;
  current: number;
  previous: number;
  kind: 'number' | 'percent' | 'position';
}) {
  const value = kind === 'number'
    ? formatNumber(current)
    : kind === 'percent'
      ? formatPercent(current)
      : current.toFixed(1);
  return (
    <Metric
      label={label}
      value={value}
      detail={kind === 'position' ? 'Quanto menor, melhor' : 'Busca orgânica do Google'}
      icon={kind === 'number' ? Search : kind === 'percent' ? MousePointerClick : Target}
      current={kind === 'position' ? undefined : current}
      previous={kind === 'position' ? undefined : previous}
      accent={kind === 'position' ? 'gold' : 'navy'}
    />
  );
}

function SeoTab({ resumo }: { resumo: MarketingResumo }) {
  const search = resumo.searchConsole;
  const baseline = resumo.snapshots?.find((snapshot) => (
    snapshot.snapshot_type === 'executive_summary'
    && (snapshot.metrics as { marker?: string }).marker === 'D0'
  ));

  if (!search) {
    return (
      <div className="space-y-4">
        <SectionEmptyState
          icon={Search}
          title="Search Console aguardando autorização"
          description="O painel já está preparado. Assim que a conta de serviço tiver acesso à propriedade, impressões, cliques, CTR, posição, consultas e páginas entram automaticamente."
          className="min-h-[240px]"
        />
        {baseline ? (
          <Card className="rounded-2xl border-amber-200 bg-amber-50">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Base congelada D0</p>
              <p className="mt-2 text-sm text-amber-900">
                O snapshot inicial de 23/07/2026 foi preservado para a comparação dos 90 dias. Ele não é apresentado como dado em tempo real.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SearchMetric label="Impressões orgânicas" current={search.current.impressions} previous={search.previous.impressions} kind="number" />
        <SearchMetric label="Cliques orgânicos" current={search.current.clicks} previous={search.previous.clicks} kind="number" />
        <SearchMetric label="CTR orgânico" current={search.current.ctr} previous={search.previous.ctr} kind="percent" />
        <SearchMetric label="Posição média" current={search.current.position} previous={search.previous.position} kind="position" />
      </div>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <PanelHeading
            eyebrow="Google orgânico"
            title="Impressões e cliques"
            description="O Search Console pode entregar dados com dois ou três dias de atraso; o horário de sincronização continua visível."
            action={<Badge variant="outline">{formatDateTime(search.syncedAt)}</Badge>}
          />
          <div className="mt-5 h-[310px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={search.daily}>
                <defs>
                  <linearGradient id="searchImpressions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value: string) => formatShortDate(value, resumo.periodDays)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis yAxisId="impressions" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                <YAxis yAxisId="clicks" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Area yAxisId="impressions" type="monotone" dataKey="impressions" name="Impressões" stroke="#0f172a" strokeWidth={2.5} fill="url(#searchImpressions)" />
                <Line yAxisId="clicks" type="monotone" dataKey="clicks" name="Cliques" stroke="#d97706" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <SearchTable title="Consultas que trouxeram visibilidade" rows={search.queries.map((item) => ({ label: item.query, ...item }))} />
        <SearchTable title="Páginas encontradas no Google" rows={search.pages.map((item) => ({ label: simplifyUrl(item.page), ...item }))} />
      </div>
    </div>
  );
}

function simplifyUrl(value: string) {
  try {
    const url = new URL(value);
    return url.pathname || '/';
  } catch {
    return value;
  }
}

function SearchTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<MarketingSearchTotals & { label: string }>;
}) {
  return (
    <Card className="rounded-2xl border-border/70 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="border-b text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="pb-3 font-semibold">Item</th>
                <th className="pb-3 text-right font-semibold">Impressões</th>
                <th className="pb-3 text-right font-semibold">Cliques</th>
                <th className="pb-3 text-right font-semibold">CTR</th>
                <th className="pb-3 text-right font-semibold">Posição</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(0, 12).map((row) => (
                <tr key={row.label}>
                  <td className="max-w-[240px] truncate py-3 pr-3 font-medium text-foreground" title={row.label}>{row.label}</td>
                  <td className="py-3 text-right text-muted-foreground">{formatNumber(row.impressions)}</td>
                  <td className="py-3 text-right font-semibold text-foreground">{formatNumber(row.clicks)}</td>
                  <td className="py-3 text-right text-muted-foreground">{formatPercent(row.ctr)}</td>
                  <td className="py-3 text-right text-muted-foreground">{row.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BehaviorTab({ resumo }: { resumo: MarketingResumo }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Taxa de engajamento" value={formatPercent(current.engagementRate)} detail="Pessoas que realmente interagiram" icon={Activity} current={current.engagementRate} previous={previous.engagementRate} accent="teal" />
        <Metric label="Tempo médio" value={formatDuration(current.averageSessionDuration)} detail="Duração média por sessão" icon={Clock3} current={current.averageSessionDuration} previous={previous.averageSessionDuration} accent="gold" />
        <Metric label="Sessões engajadas" value={formatNumber(current.engagedSessions)} detail={`de ${formatNumber(current.sessions)} sessões`} icon={Gauge} current={current.engagedSessions} previous={previous.engagedSessions} accent="navy" />
        <Metric label="Páginas vistas" value={formatNumber(current.pageViews)} detail={`${formatNumber(current.visits)} pessoas no site`} icon={Eye} current={current.pageViews} previous={previous.pageViews} accent="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Navegação" title="Páginas mais vistas" description="Onde as pessoas concentram atenção e onde acontecem conversões." />
            <div className="mt-5 space-y-2">
              {resumo.site.pages.slice(0, 10).map((page, index) => (
                <div key={page.path} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-background p-3">
                  <span className="text-center text-xs font-bold text-amber-600">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{page.path}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{page.title ?? 'Sem título informado'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{formatNumber(page.views)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatNumber(page.conversions)} ações</p>
                  </div>
                </div>
              ))}
              {resumo.site.pages.length === 0 ? (
                <SectionEmptyState title="Sem páginas disponíveis" description="As páginas aparecem após a sincronização do GA4." />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Aquisição" title="De onde as pessoas chegam" description="Sessões e contatos separados por origem e meio." />
            <div className="mt-5 h-[360px]">
              {resumo.site.sources.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resumo.site.sources.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="source" width={84} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <RechartsTooltip />
                    <Bar dataKey="visits" name="Sessões" fill="#0f172a" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="leads" name="Contatos" fill="#d97706" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <SectionEmptyState title="Sem origem registrada" description="UTMs e referências passam a compor este gráfico." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ContactsTab({ resumo, onLinked }: { resumo: MarketingResumo; onLinked: () => void }) {
  const forms = resumo.forms?.current;
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedClients, setSelectedClients] = useState<Record<string, string>>({});
  const [linkingLeadId, setLinkingLeadId] = useState<string | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<string | null>(null);
  const targetUserId = resumo.context?.targetUserId ?? '';
  const availableClients = resumo.leads?.availableClients ?? [];
  const filteredLeads = useMemo(() => {
    const query = leadSearch.trim().toLowerCase();
    const items = resumo.leads?.items ?? [];
    if (!query) return items;
    return items.filter((lead) => [
      lead.lead_code,
      lead.nome,
      lead.email,
      lead.telefone,
      lead.source,
      lead.campaign,
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [leadSearch, resumo.leads?.items]);

  const linkLead = async (lead: MarketingLeadItem) => {
    const clientId = selectedClients[lead.id_marketing_leads];
    if (!targetUserId || !clientId) return;
    setLinkingLeadId(lead.id_marketing_leads);
    setLinkFeedback(null);
    try {
      await linkMarketingLeadToClient({
        targetUserId,
        leadId: lead.id_marketing_leads,
        clientId,
        identificationMethod: 'codigo_confirmado',
      });
      setLinkFeedback(`Contato ${lead.lead_code ?? ''} vinculado com sucesso.`);
      onLinked();
    } catch (error) {
      setLinkFeedback(error instanceof Error ? error.message : 'Não foi possível vincular o contato.');
    } finally {
      setLinkingLeadId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="WhatsApp único" value={formatNumber(resumo.site.current.whatsappClicks)} detail="Intenções de conversa" icon={MessageCircle} current={resumo.site.current.whatsappClicks} previous={resumo.site.previous.whatsappClicks} accent="teal" />
        <Metric label="Cliques no telefone" value={formatNumber(resumo.site.current.phoneClicks)} detail="Intenções de ligação" icon={PhoneCall} current={resumo.site.current.phoneClicks} previous={resumo.site.previous.phoneClicks} accent="navy" />
        <Metric label="Formulários iniciados" value={formatNumber(forms?.starts)} detail={`${formatNumber(forms?.submits)} enviados com sucesso`} icon={FileWarning} current={forms?.starts} previous={resumo.forms?.previous.starts} accent="gold" />
        <Metric label="Taxa de conclusão" value={formatPercent(forms?.completionRate)} detail={`${formatNumber(forms?.abandons)} abandonos detectados`} icon={MailCheck} accent="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Diagnóstico" title="Onde o formulário perde pessoas" description="Nenhum conteúdo digitado é guardado antes do envio; apenas campo, tempo e erro." />
            <div className="mt-5">
              {resumo.forms?.abandonment.length ? (
                <div className="space-y-3">
                  {resumo.forms.abandonment.slice(0, 8).map((item) => (
                    <div key={item.field}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-foreground">{item.field}</span>
                        <span className="shrink-0 text-muted-foreground">{item.count} · {formatDuration(item.averageSeconds)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500"
                          style={{ width: `${Math.max(8, Math.min(100, percentage(item.count, forms?.starts ?? 1)))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <SectionEmptyState
                  icon={Sparkles}
                  title="Sem abandono registrado"
                  description="Isso pode significar fluxo saudável ou que os novos eventos ainda não chegaram ao Retiflow."
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading
              eyebrow="Caixa de entrada"
              title="Contatos identificados"
              description="Dados pessoais visíveis somente para o Mega Master."
              action={(
                <div className="relative w-full sm:w-[240px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Buscar contato ou código" className="pl-9" />
                </div>
              )}
            />
            <div className="mt-5 max-h-[430px] overflow-auto rounded-xl border">
              {linkFeedback ? (
                <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{linkFeedback}</div>
              ) : null}
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b bg-muted/95 text-[10px] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Data / código</th>
                    <th className="px-3 py-3 font-semibold">Contato</th>
                    <th className="px-3 py-3 font-semibold">Origem</th>
                    <th className="px-3 py-3 font-semibold">Canal</th>
                    <th className="px-3 py-3 font-semibold">Etapa</th>
                    <th className="px-3 py-3 font-semibold">Vincular cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLeads.map((lead) => (
                    <LeadRow
                      key={lead.id_marketing_leads}
                      lead={lead}
                      clients={availableClients}
                      selectedClientId={selectedClients[lead.id_marketing_leads] ?? ''}
                      onClientChange={(clientId) => setSelectedClients((current) => ({
                        ...current,
                        [lead.id_marketing_leads]: clientId,
                      }))}
                      onLink={() => void linkLead(lead)}
                      isLinking={linkingLeadId === lead.id_marketing_leads}
                    />
                  ))}
                </tbody>
              </table>
              {filteredLeads.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhum contato encontrado neste período.</div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeadRow({
  lead,
  clients,
  selectedClientId,
  onClientChange,
  onLink,
  isLinking,
}: {
  lead: MarketingLeadItem;
  clients: MarketingClientOption[];
  selectedClientId: string;
  onClientChange: (clientId: string) => void;
  onLink: () => void;
  isLinking: boolean;
}) {
  return (
    <tr className="bg-card hover:bg-muted/30">
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground">{formatDateTime(lead.occurred_at)}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{lead.lead_code ?? 'Sem código'}</p>
      </td>
      <td className="px-3 py-3">
        {lead.fk_clientes ? (
          <span className="text-[11px] text-muted-foreground">Origem confirmada</span>
        ) : (
          <div className="flex min-w-[330px] items-center gap-2">
            <Select value={selectedClientId} onValueChange={onClientChange}>
              <SelectTrigger className="h-8 min-w-[230px]">
                <SelectValue placeholder="Selecionar cliente cadastrado" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id_clientes} value={client.id_clientes}>
                    {client.nome}{client.documento ? ` · ${client.documento}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="h-8" disabled={!selectedClientId || isLinking} onClick={onLink}>
              {isLinking ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />}
              Vincular
            </Button>
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground">{lead.nome ?? 'Contato sem nome'}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{lead.telefone ?? lead.email ?? 'Sem telefone/e-mail'}</p>
      </td>
      <td className="px-3 py-3">
        <p className="font-medium text-foreground">{lead.source ?? 'direto'}</p>
        <p className="text-[11px] text-muted-foreground">{lead.campaign ?? lead.medium ?? 'sem campanha'}</p>
      </td>
      <td className="px-3 py-3 text-muted-foreground">{lead.channel ?? 'site'}</td>
      <td className="px-3 py-3">
        <Badge variant="outline" className={lead.fk_clientes
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'}>
          {lead.fk_clientes ? 'Cliente vinculado' : 'Aguardando vínculo'}
        </Badge>
      </td>
    </tr>
  );
}

function ResultsTab({ resumo }: { resumo: MarketingResumo }) {
  const business = resumo.business?.current;
  const previous = resumo.business?.previous;
  const commissions = resumo.business?.commissions ?? [];
  const ads = resumo.campaigns;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Clientes identificados" value={formatNumber(business?.identifiedClients)} detail="Com origem comprovada na internet" icon={UserCheck} current={business?.identifiedClients} previous={previous?.identifiedClients} accent="violet" />
        <Metric label="O.S. aprovadas" value={formatNumber(business?.approvedOrders)} detail="Snapshots financeiros congelados" icon={FileCheck2} current={business?.approvedOrders} previous={previous?.approvedOrders} accent="navy" />
        <Metric label="Serviços aprovados" value={formatCurrency(business?.approvedServices)} detail={`${formatCurrency(business?.excludedProducts)} em peças excluídas`} icon={Wrench} current={business?.approvedServices} previous={previous?.approvedServices} accent="teal" />
        <Metric label="Comissão gerada" value={formatCurrency(business?.commission)} detail="Mantida no snapshot original" icon={BadgeDollarSign} current={business?.commission} previous={previous?.commission} accent="gold" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Auditoria financeira" title="O.S. que geraram comissão" description="Base congelada na primeira aprovação: somente serviços, com peças e produtos excluídos." />
            <div className="mt-5 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b bg-muted/70 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Aprovação</th>
                    <th className="px-3 py-3 font-semibold">O.S.</th>
                    <th className="px-3 py-3 text-right font-semibold">Serviços</th>
                    <th className="px-3 py-3 text-right font-semibold">Peças fora</th>
                    <th className="px-3 py-3 text-right font-semibold">Taxa</th>
                    <th className="px-3 py-3 text-right font-semibold">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {commissions.map((item, index) => (
                    <tr key={String(item.id_marketing_commission_snapshots ?? index)}>
                      <td className="px-3 py-3 text-muted-foreground">{formatDateTime(String(item.approved_at ?? ''))}</td>
                      <td className="px-3 py-3 font-semibold text-foreground">{String(item.os_numero ?? 'Sem número')}</td>
                      <td className="px-3 py-3 text-right font-medium text-foreground">{formatCurrency(Number(item.services_snapshot ?? 0))}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{formatCurrency(Number(item.products_excluded_snapshot ?? 0))}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{formatPercent(Number(item.commission_rate_snapshot ?? 0) * 100)}</td>
                      <td className="px-3 py-3 text-right font-bold text-amber-700">{formatCurrency(Number(item.commission_amount_snapshot ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {commissions.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma O.S. atribuída chegou a “Aprovado” neste período.</div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-slate-950 text-white shadow-sm">
          <CardContent className="p-5 sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Mídia paga</p>
            <h3 className="mt-1 text-xl font-bold">Google Ads</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{ads.statusMessage ?? 'Aguardando integração segura.'}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {[
                ['Investimento', ads.financialAvailable ? formatCurrency(ads.current.spend) : 'Pendente'],
                ['Impressões', ads.financialAvailable ? formatNumber(ads.current.impressions) : 'Pendente'],
                ['Cliques', ads.financialAvailable ? formatNumber(ads.current.clicks) : 'Pendente'],
                ['Custo por contato', ads.financialAvailable ? formatCurrency(ads.current.cpl) : 'Pendente'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-2 text-base font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-amber-100">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Dados pagos não são misturados com impressões orgânicas do Search Console.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QualityTab({ resumo }: { resumo: MarketingResumo }) {
  const quality = resumo.quality;
  const [eventFilter, setEventFilter] = useState('todos');
  const filteredEvents = useMemo(() => {
    const events = resumo.site.recentEvents ?? [];
    return eventFilter === 'todos' ? events : events.filter((event) => event.event_type === eventFilter);
  }, [eventFilter, resumo.site.recentEvents]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Último evento" value={quality?.lastEventAt ? formatDateTime(quality.lastEventAt).split(' ')[0] : 'Pendente'} detail={quality?.lastEventAt ? formatDateTime(quality.lastEventAt) : 'Nenhum evento direto'} icon={Activity} accent="teal" />
        <Metric label="Falhas de alerta" value={formatNumber(quality?.alertFailures)} detail="Requerem revisão imediata" icon={AlertTriangle} accent={quality?.alertFailures ? 'rose' : 'navy'} />
        <Metric label="Cliques repetidos" value={formatNumber(quality?.duplicatedClicks)} detail="Não entram no total único" icon={MousePointerClick} accent="gold" />
        <Metric label="Contatos sem cliente" value={formatNumber(quality?.unlinkedLeads)} detail="Aguardando vínculo por código" icon={UserCheck} accent="violet" />
      </div>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <PanelHeading eyebrow="Saúde das fontes" title="Integrações e defasagem real" description="O painel consulta novamente a cada 10 minutos, mas respeita o momento em que cada fonte libera os dados." />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {resumo.integrations.map((integration) => (
              <IntegrationDetail key={integration.provider} integration={integration} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading
              eyebrow="Auditoria dos eventos"
              title="O que aconteceu no site"
              action={(
                <Select value={eventFilter} onValueChange={setEventFilter}>
                  <SelectTrigger className="w-full sm:w-[210px]">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as ações</SelectItem>
                    {Object.entries(eventLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
            <div className="mt-5 max-h-[480px] overflow-auto rounded-xl border">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b bg-muted/95 text-[10px] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Data</th>
                    <th className="px-3 py-3 font-semibold">Ação</th>
                    <th className="px-3 py-3 font-semibold">Código</th>
                    <th className="px-3 py-3 font-semibold">Página</th>
                    <th className="px-3 py-3 font-semibold">Origem</th>
                    <th className="px-3 py-3 font-semibold">Qualidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEvents.map((event, index) => <EventRow key={event.external_event_id ?? event.id_marketing_site_eventos ?? index} event={event} />)}
                </tbody>
              </table>
              {filteredEvents.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhum evento neste filtro.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Marcos do piloto" title="Snapshots congelados" description="D0, D30, D60 e D90 permitem comprovar a evolução sem reescrever o passado." />
            <div className="relative mt-6 space-y-5 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-border">
              {(resumo.snapshots ?? []).map((snapshot) => {
                const metrics = snapshot.metrics as { marker?: string };
                return (
                  <div key={`${snapshot.snapshot_type}-${snapshot.period_start}`} className="relative flex gap-4">
                    <span className="relative z-10 mt-1 h-[23px] w-[23px] shrink-0 rounded-full border-4 border-card bg-amber-400 shadow-sm" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{metrics.marker ?? snapshot.snapshot_type}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(snapshot.generated_at)}</p>
                      <Badge variant="outline" className="mt-2">Dados congelados</Badge>
                    </div>
                  </div>
                );
              })}
              {(resumo.snapshots ?? []).length === 0 ? (
                <p className="pl-10 text-sm text-muted-foreground">Nenhum snapshot congelado ainda.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function IntegrationDetail({ integration }: { integration: MarketingIntegrationSummary }) {
  const style = statusStyle[integration.status] ?? statusStyle.not_connected;
  const Icon = style.icon;
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-amber-300">
            <Icon className={cn('h-4 w-4', integration.status === 'syncing' && 'animate-spin')} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{providerLabels[integration.provider] ?? integration.provider}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{integration.accountName ?? 'Conta ainda não informada'}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn('shrink-0', style.className)}>{style.label}</Badge>
      </div>
      <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        <p>{integration.freshness ?? 'Sem informação de atualização'}</p>
        <p className="mt-1">Última leitura: {formatDateTime(integration.lastSyncAt)}</p>
        {integration.lastError ? <p className="mt-2 text-amber-700">{integration.lastError}</p> : null}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: MarketingEventItem }) {
  const quality = event.alert_status === 'failed'
    ? { label: 'Falha', className: 'border-rose-200 bg-rose-50 text-rose-700' }
    : Number(event.duplicate_count ?? 0) > 0
      ? { label: `${event.duplicate_count} repetido(s)`, className: 'border-amber-200 bg-amber-50 text-amber-700' }
      : { label: 'Válido', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  return (
    <tr className="bg-card hover:bg-muted/30">
      <td className="px-3 py-3 text-muted-foreground">{formatDateTime(event.occurred_at)}</td>
      <td className="px-3 py-3 font-semibold text-foreground">{eventLabels[event.event_type] ?? event.event_type}</td>
      <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{event.lead_code ?? '—'}</td>
      <td className="max-w-[180px] truncate px-3 py-3 text-foreground" title={event.page_path ?? undefined}>{event.page_path ?? '/'}</td>
      <td className="px-3 py-3">
        <p className="font-medium text-foreground">{event.source ?? 'direto'}</p>
        <p className="text-[10px] text-muted-foreground">{event.campaign ?? event.medium ?? 'sem campanha'}</p>
      </td>
      <td className="px-3 py-3"><Badge variant="outline" className={quality.className}>{quality.label}</Badge></td>
    </tr>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[230px] rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[155px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-[390px] rounded-2xl" />
    </div>
  );
}

function normalizeCustomPeriod(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(Math.trunc(parsed), 365));
}

export default function MarketingGrowth() {
  const { realUser, isAdmin } = useAuth();
  const hasPrivateAccess = isSuperAdmin(realUser);
  const { data: systemUsers = [], isLoading: isLoadingUsers } = useSystemUsersQuery({
    enabled: hasPrivateAccess && isAdmin,
  });
  const selectableUsers = useMemo(() => systemUsers.filter((user) => (
    user.isActive
    && user.role !== 'ADMIN'
    && user.moduleAccess?.marketing === true
  )), [systemUsers]);
  const [periodDays, setPeriodDays] = useState(30);
  const [customDays, setCustomDays] = useState('30');
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    if (!selectableUsers.length) {
      setSelectedUserId('');
      return;
    }
    if (selectedUserId && selectableUsers.some((user) => user.id === selectedUserId)) return;
    const retifica = selectableUsers.find((user) => user.email?.trim().toLowerCase() === RETIFICA_PREMIUM_EMAIL);
    setSelectedUserId(retifica?.id ?? selectableUsers[0]?.id ?? '');
  }, [selectableUsers, selectedUserId]);

  const queryEnabled = hasPrivateAccess && Boolean(selectedUserId);
  const queryKey = useMemo(
    () => getMarketingResumoQueryKey(periodDays, selectedUserId),
    [periodDays, selectedUserId],
  );
  const cachedResumo = useMemo(
    () => (queryEnabled ? readCachedMarketingResumo(periodDays, selectedUserId) : null),
    [periodDays, queryEnabled, selectedUserId],
  );
  const query = useQuery({
    queryKey,
    queryFn: () => getMarketingResumo(periodDays, selectedUserId),
    enabled: queryEnabled,
    staleTime: MARKETING_RESUMO_CACHE_TTL_MS,
    gcTime: 60 * 60_000,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    initialData: cachedResumo?.data,
    initialDataUpdatedAt: cachedResumo?.savedAt,
    placeholderData: (previous) => (
      previous?.periodDays === periodDays
      && previous.context?.targetUserId === selectedUserId
        ? previous
        : undefined
    ),
    retry: 1,
  });

  if (!hasPrivateAccess) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <SectionErrorState
          icon={LockKeyhole}
          title="Painel privado do desenvolvedor"
          description="Crescimento, contatos, atribuição e comissões são visíveis somente para a conta Mega Master autorizada."
          className="min-h-[300px] w-full max-w-xl"
        />
      </div>
    );
  }

  const applyCustomPeriod = () => {
    const normalized = normalizeCustomPeriod(customDays);
    setCustomDays(String(normalized));
    setPeriodDays(normalized);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.06),transparent_32%),hsl(var(--background))]">
      <div className="mx-auto w-full max-w-[1580px] space-y-4 p-3 sm:space-y-5 md:p-6">
        <header className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-[0_26px_80px_-45px_rgba(15,23,42,0.95)]">
          <div className="relative p-5 sm:p-7">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-amber-300/20 bg-amber-300/5" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="gap-1.5 border-amber-300/20 bg-amber-300/10 text-amber-200 hover:bg-amber-300/10">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Privado do Mega Master
                  </Badge>
                  <Badge className="gap-1.5 border-teal-300/20 bg-teal-300/10 text-teal-200 hover:bg-teal-300/10">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-300 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-300" />
                    </span>
                    Atualização automática · 10 min
                  </Badge>
                </div>
                <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">Sala de controle da aquisição</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Crescimento</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
                  Impressão, visita, contato, cliente, O.S. e comissão no mesmo painel — com orgânico e mídia paga sempre separados.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] xl:w-auto">
                <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers || !selectableUsers.length}>
                  <SelectTrigger className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-[280px]">
                    <Users className="mr-2 h-4 w-4 text-amber-300" />
                    <SelectValue placeholder="Selecionar empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => void query.refetch()}
                  disabled={!queryEnabled || query.isFetching}
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', query.isFetching && 'animate-spin')} />
                  Atualizar
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.035] px-5 py-4 sm:px-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {periodOptions.map((days) => (
                  <Button
                    key={days}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPeriodDays(days);
                      setCustomDays(String(days));
                    }}
                    className={cn(
                      'h-8 rounded-full px-3 text-xs text-slate-400 hover:bg-white/10 hover:text-white',
                      periodDays === days && 'bg-amber-300 text-slate-950 hover:bg-amber-300 hover:text-slate-950',
                    )}
                  >
                    {days} dias
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-slate-500 sm:inline">Outro período:</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={customDays}
                  onChange={(event) => setCustomDays(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyCustomPeriod();
                  }}
                  className="h-8 w-20 border-white/15 bg-white/5 text-center text-xs text-white"
                  aria-label="Quantidade personalizada de dias"
                />
                <Button type="button" size="sm" variant="secondary" className="h-8" onClick={applyCustomPeriod}>
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </header>

        {query.data ? <IntegrationStrip integrations={query.data.integrations} /> : null}

        {query.error ? (
          <SectionErrorState
            title="Não foi possível carregar o painel"
            description={query.error instanceof Error ? query.error.message : 'Tente novamente em instantes.'}
            className="min-h-[280px]"
          />
        ) : null}

        {!query.error && query.isLoading ? <LoadingDashboard /> : null}

        {!query.error && !query.isLoading && !selectableUsers.length ? (
          <SectionEmptyState
            icon={Users}
            title="Nenhuma empresa com Crescimento habilitado"
            description="Habilite o módulo para a empresa que será analisada. O acesso ao painel continuará exclusivo do Mega Master."
            className="min-h-[280px]"
          />
        ) : null}

        {query.data && !query.error ? (
          <Tabs defaultValue="visao" className="space-y-5">
            <div className="overflow-x-auto pb-1">
              <TabsList className="inline-grid h-11 min-w-[790px] grid-cols-6 rounded-xl bg-muted/80 p-1">
                <TabsTrigger value="visao">Visão geral</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="comportamento">Comportamento</TabsTrigger>
                <TabsTrigger value="contatos">Contatos</TabsTrigger>
                <TabsTrigger value="resultado">Resultado</TabsTrigger>
                <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="visao"><OverviewTab resumo={query.data} /></TabsContent>
            <TabsContent value="seo"><SeoTab resumo={query.data} /></TabsContent>
            <TabsContent value="comportamento"><BehaviorTab resumo={query.data} /></TabsContent>
            <TabsContent value="contatos"><ContactsTab resumo={query.data} onLinked={() => void query.refetch()} /></TabsContent>
            <TabsContent value="resultado"><ResultsTab resumo={query.data} /></TabsContent>
            <TabsContent value="qualidade"><QualityTab resumo={query.data} /></TabsContent>
          </Tabs>
        ) : null}

        <footer className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Dados de Crescimento protegidos no backend e visíveis apenas ao Mega Master.
          </span>
          <span className="inline-flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            Fonte mais recente: {formatDateTime(query.data?.quality?.generatedAt)}
          </span>
        </footer>
      </div>
    </div>
  );
}
