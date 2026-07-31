import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
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
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileWarning,
  Filter,
  Gauge,
  ListChecks,
  MailCheck,
  MapPin,
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
  type MarketingResumo,
  type MarketingSearchTotals,
} from '@/api/supabase/marketing';
import {
  MARKETING_RESUMO_CACHE_TTL_MS,
  MARKETING_RESUMO_REFRESH_INTERVAL_MS,
  readCachedMarketingResumo,
} from '@/api/supabase/marketingCache';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemUsersQuery } from '@/hooks/useSystemUsersQuery';
import { hasFullMarketingAccess, isSuperAdmin } from '@/services/auth/superAdmin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionEmptyState, SectionErrorState } from '@/components/ui/section-state';
import { cn } from '@/lib/utils';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { useFinancialPrivacy } from '@/contexts/FinancialPrivacyContext';

const RETIFICA_PREMIUM_EMAIL = 'retificapremium5@gmail.com';
const periodOptions = [7, 10, 15, 20, 30, 40, 60, 90];

const googleAdsHelp = {
  spend: 'Total cobrado pelo Google Ads no período selecionado. Pode existir atraso de processamento na fonte oficial.',
  impressions: 'Quantidade de vezes que os anúncios foram exibidos. A mesma pessoa pode gerar mais de uma impressão.',
  clicks: 'Total de cliques registrados pelo Google Ads. Inclui links do site, WhatsApp, botão de ligar e outros recursos do anúncio; não significa somente visitas ao site.',
  siteClicks: 'Cliques que apontaram para uma página do site, somando URL principal e sitelinks. Uma pessoa pode clicar mais de uma vez, e nem todo clique termina em uma sessão rastreada.',
  adWhatsappClicks: 'Cliques no botão de mensagem do próprio anúncio que abriram o WhatsApp. Esse número é separado de quem entrou no site e só depois clicou no WhatsApp.',
  adWhatsappAsset: 'Recurso de mensagem configurado no Google Ads. O status indica se o recurso está habilitado e apto a aparecer; zero cliques logo após a ativação é esperado.',
  adCalls: 'Cliques no botão de ligação exibido pelo próprio anúncio. O clique pode apenas abrir o discador; chamadas efetivamente registradas aparecem separadamente.',
  reportedCalls: 'Chamadas que o encaminhamento de chamadas do Google conseguiu registrar. Esse número pode ser menor que os toques em Ligar porque abrir o discador não garante que a pessoa completou a chamada.',
  qualifiedCalls: 'Leitura analítica do Retiflow: chamadas atendidas com pelo menos 30 segundos. Esse limite não altera sozinho a configuração de conversão do Google Ads.',
  confirmedCallClients: 'Clientes cadastrados cuja equipe confirmou que o contato começou por uma ligação do Google Ads.',
  trackedPaidSessions: 'Sessões que chegaram ao site com identificação de mídia paga, como gclid ou google/cpc. Pode ser menor que os cliques por repetição, bloqueios de medição ou saída antes do carregamento.',
  paidWhatsappClicks: 'Cliques no WhatsApp feitos dentro do site por sessões identificadas como vindas dos anúncios. Eventos técnicos de pré-lançamento não entram.',
  paidPhoneClicks: 'Cliques no telefone feitos dentro do site por sessões identificadas como vindas dos anúncios. Não inclui o botão de ligar exibido diretamente no anúncio.',
  paidFormSubmits: 'Formulários enviados no site por sessões identificadas como vindas dos anúncios.',
  ctr: 'Taxa de cliques: cliques divididos por impressões. Ajuda a avaliar se anúncio e palavra-chave despertam interesse.',
  averageCpc: 'Custo médio por clique: investimento dividido pela quantidade de cliques.',
  conversions: 'Ações principais configuradas no Google Ads, como formulário, WhatsApp, ligação ou cliente cadastrado.',
  conversionRate: 'Percentual de cliques que gerou uma conversão principal.',
  cpa: 'Custo por aquisição/conversão: investimento dividido pelas conversões principais.',
  conversionValue: 'Soma dos valores configurados nas ações de conversão. Não representa faturamento real se a ação usar um valor simbólico.',
  valuePerConversion: 'Valor médio configurado por conversão. Só representa receita quando a ação recebe um valor financeiro real.',
  roas: 'Valor das conversões dividido pelo investimento. Só deve orientar retorno financeiro quando os valores das conversões representarem receita real.',
  searchImpressionShare: 'Percentual das impressões recebidas entre todas as impressões em que os anúncios estavam qualificados para aparecer na Pesquisa.',
  searchBudgetLostImpressionShare: 'Percentual de oportunidades de impressão perdido porque o orçamento foi insuficiente.',
  searchRankLostImpressionShare: 'Percentual de oportunidades perdido por classificação do anúncio, influenciada por lance, qualidade e relevância.',
  searchTopImpressionShare: 'Percentual das impressões exibidas acima dos resultados orgânicos da Pesquisa.',
  searchAbsoluteTopImpressionShare: 'Percentual das impressões exibidas na primeira posição absoluta da página de resultados.',
  invalidClicks: 'Cliques que o Google classificou como inválidos e filtrou, como atividade automatizada ou repetição indevida.',
  dailyBudget: 'Limite médio diário definido para a campanha. O gasto de um dia pode variar, respeitando a cobrança média do período.',
  optimizationScore: 'Estimativa do Google, de 0% a 100%, sobre o quanto a campanha segue as recomendações automáticas da plataforma.',
  qualityScore: 'Nota de 1 a 10 para relevância da palavra-chave, do anúncio e da página de destino. Não é uma métrica financeira.',
  adRelevance: 'Compara a relevância do anúncio para esta palavra-chave com outros anunciantes: abaixo, na média ou acima da média.',
  landingPageQuality: 'Compara a experiência da página de destino para esta palavra-chave com outros anunciantes.',
  expectedCtr: 'Compara a probabilidade estimada de clique desta palavra-chave com outros anunciantes.',
  network: 'Rede em que o anúncio apareceu. Pesquisa Google e Parceiros de Pesquisa devem ser avaliados separadamente porque podem ter qualidade e custo diferentes.',
  adGroup: 'Conjunto de palavras-chave e anúncios com o mesmo tema. Grupos enxutos facilitam relevância, leitura de custo e otimização.',
  matchType: 'Regra que define o quanto a pesquisa da pessoa precisa se aproximar da palavra-chave configurada.',
  searchTerm: 'Texto que a pessoa realmente digitou no Google antes de o anúncio ser acionado.',
  landingPage: 'Primeira página do site aberta depois do clique no anúncio.',
  allConversions: 'Inclui conversões principais e secundárias. Pode ser maior que a coluna Conversões.',
  conversionStatus: 'Situação da ação no Google Ads. ENABLED significa que ela está habilitada para receber dados.',
  paidVisitor: 'Pessoa identificada quando possível; caso contrário, uma sessão anônima preservada até existir contato ou cadastro.',
  paidVisitorEvents: 'Quantidade de páginas e eventos rastreados nessa visita. Ações mostram interações de maior intenção.',
  paidVisitorStatus: 'Mostra se a sessão apenas visitou, demonstrou interesse ou já foi vinculada a um cliente cadastrado.',
  offlineTotal: 'Clientes cadastrados que foram atribuídos a um clique de anúncio e entraram no fluxo de envio ao Google.',
  offlineUploaded: 'Conversões de cliente já aceitas pelo serviço de envio do Google.',
  offlinePending: 'Conversões aguardando processamento ou sendo processadas neste momento.',
  offlineRetry: 'Conversões temporariamente rejeitadas que serão enviadas novamente de forma automática.',
} as const;

const siteMetricHelp = {
  visitors: 'Pessoas ativas identificadas pelo Google Analytics no período. Uma mesma pessoa pode iniciar mais de uma sessão.',
  whatsapp: 'Cliques únicos rastreados no botão do WhatsApp. Repetições da mesma sessão são deduplicadas; o clique indica intenção, mas não confirma que a mensagem foi enviada.',
  averageTime: 'Tempo médio de atividade por sessão informado pelo Google Analytics.',
  pagesPerVisit: 'Quantidade de páginas vistas dividida pelo total de sessões do período.',
} as const;

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
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0))}%`;
}

function formatDecimal(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0));
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

function formatWhatsappPhone(value: string | null | undefined, countryCode?: string | null) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 'Número não informado';
  if (countryCode?.toUpperCase() === 'BR' && digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function formatWhatsappPointLabel(eventLabel: string, pagePath: string) {
  const knownLabels: Record<string, string> = {
    floating: 'Botão flutuante',
    contact_hero_whatsapp: 'Topo da página Contato',
    b2b_hero_whatsapp: 'Topo da página B2B',
    whatsapp_footer_click: 'Rodapé do site',
  };
  if (knownLabels[eventLabel]) return knownLabels[eventLabel];
  if (eventLabel === 'nao_informado') return `WhatsApp em ${pagePath}`;
  return eventLabel
    .replace(/^whatsapp_/, '')
    .replace(/_whatsapp$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatGoogleAdsCallDateTime(value: string | null | undefined) {
  if (!value) return 'Horário não informado';
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} às ${hour}:${minute}`;
}

function formatGoogleAdsCallEndTime(value: string | null | undefined) {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
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
    label: `${value >= 0 ? '+' : ''}${formatDecimal(value)}%`,
    positive: value >= 0,
    muted: false,
  };
}

function HelpTip({
  label,
  description,
  className,
}: {
  label: string;
  description: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Entender ${label}`}
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className,
          )}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[300px] p-3 text-left leading-relaxed">
        <p className="font-semibold text-popover-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function Metric({
  label,
  value,
  detail,
  help,
  icon: Icon,
  current,
  previous,
  accent = 'navy',
  financial = false,
  financialDetail = false,
}: {
  label: string;
  value: string;
  detail: string;
  help?: string;
  icon: typeof Eye;
  current?: number;
  previous?: number;
  accent?: 'navy' | 'gold' | 'teal' | 'violet' | 'rose';
  financial?: boolean;
  financialDetail?: boolean;
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
    <Card className="group h-full min-w-0 overflow-hidden rounded-2xl border-border/70 bg-card shadow-[0_8px_28px_-24px_rgba(15,23,42,0.55)] transition-transform duration-200 hover:-translate-y-0.5">
      <CardContent className="min-w-0 p-3 sm:p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1">
            <p className="min-w-0 text-[10px] font-bold uppercase leading-4 tracking-[0.1em] text-muted-foreground">{label}</p>
            {help ? <HelpTip label={label} description={help} /> : null}
          </div>
          <div className={cn('growth-metric-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm', accents[accent])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-2 break-words text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
          {financial ? <FinancialValue>{value}</FinancialValue> : value}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {financialDetail ? <FinancialValue>{detail}</FinancialValue> : detail}
        </p>
        {delta ? (
          <div className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
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
            {delta.label} <span className="hidden 2xl:inline">vs. período anterior</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClickBreakdownItem({
  label,
  value,
  detail,
  help,
  icon: Icon,
  tone,
  footer,
}: {
  label: string;
  value: number;
  detail: string;
  help: string;
  icon: typeof Eye;
  tone: 'slate' | 'teal' | 'emerald' | 'amber' | 'violet';
  footer?: ReactNode;
}) {
  const tones = {
    slate: 'border-slate-200 bg-gradient-to-b from-white to-slate-50 text-slate-950',
    teal: 'border-teal-200 bg-gradient-to-b from-white to-teal-50 text-teal-950',
    emerald: 'border-emerald-200 bg-gradient-to-b from-white to-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-gradient-to-b from-white to-amber-50 text-amber-950',
    violet: 'border-violet-200 bg-gradient-to-b from-white to-violet-50 text-violet-950',
  };

  return (
    <div className={cn('min-w-0 rounded-2xl border p-3 shadow-[0_8px_24px_-22px_rgba(15,23,42,0.5)]', tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-start gap-1">
            <p className="text-[10px] font-bold uppercase leading-4 tracking-[0.1em] opacity-70">{label}</p>
            <HelpTip label={label} description={help} className="text-current opacity-60 hover:text-current" />
          </div>
          <p className="mt-1.5 text-2xl font-black leading-none tracking-tight">{formatNumber(value)}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-current/10 bg-white/80 shadow-sm">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-4 opacity-75">{detail}</p>
      {footer ? <div className="mt-2 border-t border-current/10 pt-2 text-[10px] leading-4">{footer}</div> : null}
    </div>
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        {description ? <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function AdsTableHead({
  label,
  help,
  align = 'left',
}: {
  label: string;
  help?: string;
  align?: 'left' | 'right';
}) {
  return (
    <th className={cn('px-3 py-3 font-semibold', align === 'right' && 'text-right')}>
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {label}
        {help ? <HelpTip label={label} description={help} /> : null}
      </span>
    </th>
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

function WhatsappOriginBreakdown({ resumo }: { resumo: MarketingResumo }) {
  const adClicks = (resumo.campaigns.clickTypes ?? [])
    .filter((item) => item.type === 'CLICK_TO_MESSAGE_THIRD_PARTY_CLICK')
    .reduce((total, item) => total + item.clicks, 0);
  const siteClicks = resumo.site.whatsapp?.uniqueClicks ?? resumo.site.current.whatsappClicks;
  const businessProfile = resumo.businessProfile;
  const businessProfileAvailable = businessProfile?.status === 'available'
    && businessProfile.current.whatsappClicks !== null;
  const businessProfileValue = businessProfileAvailable
    ? formatNumber(businessProfile.current.whatsappClicks ?? 0)
    : '—';
  const businessProfileDetail = businessProfileAvailable
    ? 'Cliques no chat do Perfil da Empresa'
    : businessProfile?.status === 'error'
      ? 'A API oficial não respondeu nesta atualização'
      : 'Aguardando o vínculo liberar a métrica na API';

  const items = [
    {
      label: 'WhatsApp do anúncio',
      value: formatNumber(adClicks),
      detail: 'Botão exibido diretamente no Google Ads',
      icon: Target,
      tone: 'border-amber-200 bg-amber-50 text-amber-950',
      iconTone: 'bg-amber-500 text-white',
    },
    {
      label: 'WhatsApp do site',
      value: formatNumber(siteClicks),
      detail: 'Botões clicados depois de entrar no site',
      icon: ExternalLink,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      iconTone: 'bg-emerald-600 text-white',
    },
    {
      label: 'Google Meu Negócio',
      value: businessProfileValue,
      detail: businessProfileDetail,
      icon: Building2,
      tone: 'border-blue-200 bg-blue-50 text-blue-950',
      iconTone: 'bg-blue-600 text-white',
    },
  ];

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-3.5 sm:p-4">
        <PanelHeading
          eyebrow="Origem do contato"
          title="De onde veio o clique no WhatsApp?"
          description="As três origens ficam separadas. O clique mede intenção de contato; não confirma sozinho que a mensagem foi enviada."
        />
        <div className="mt-3 grid gap-2.5 md:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={cn('rounded-xl border p-3', item.tone)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em]">{item.label}</p>
                    <p className="mt-1.5 text-2xl font-black leading-none">{item.value}</p>
                  </div>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', item.iconTone)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-4 opacity-80">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function BasicOverviewTab({ resumo }: { resumo: MarketingResumo }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const search = resumo.searchConsole;
  const pagesPerSession = current.sessions ? (current.pageViews ?? 0) / current.sessions : 0;
  const previousPagesPerSession = previous.sessions ? (previous.pageViews ?? 0) / previous.sessions : 0;
  const whatsappShare = percentage(current.whatsappClicks, current.visits);
  const showInternalDailyActions = resumo.quality?.actionMetricsSource !== 'ga4';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Visitantes no site"
          value={formatNumber(current.visits)}
          detail={`${formatNumber(current.sessions)} visitas no período`}
          help={siteMetricHelp.visitors}
          icon={Users}
          current={current.visits}
          previous={previous.visits}
          accent="navy"
        />
        <Metric
          label="Clicaram no WhatsApp"
          value={formatNumber(current.whatsappClicks)}
          detail={`${formatPercent(whatsappShare)} em relação aos visitantes`}
          help={siteMetricHelp.whatsapp}
          icon={MessageCircle}
          current={current.whatsappClicks}
          previous={previous.whatsappClicks}
          accent="teal"
        />
        <Metric
          label="Tempo médio no site"
          value={formatDuration(current.averageSessionDuration)}
          detail="Duração média de cada visita"
          help={siteMetricHelp.averageTime}
          icon={Clock3}
          current={current.averageSessionDuration}
          previous={previous.averageSessionDuration}
          accent="gold"
        />
        <Metric
          label="Páginas por visita"
          value={pagesPerSession.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          detail={`${formatNumber(current.pageViews)} páginas vistas`}
          help={siteMetricHelp.pagesPerVisit}
          icon={Eye}
          current={pagesPerSession}
          previous={previousPagesPerSession}
          accent="violet"
        />
      </div>

      <WhatsappOriginBreakdown resumo={resumo} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading
              eyebrow="Evolução diária"
              title="Movimento do site"
              description={showInternalDailyActions
                ? 'Compare pessoas, páginas vistas e ações internas ao longo do período.'
                : 'Pessoas e páginas vêm do GA4; ações ficam nos cards até o histórico interno cobrir os dois períodos.'}
            />
            <div
              className="mt-5 h-[290px]"
              role="img"
              aria-label={showInternalDailyActions
                ? 'Evolução diária de pessoas, páginas e ações internas'
                : 'Evolução diária de pessoas e páginas'}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={resumo.site.daily}>
                  <defs>
                    <linearGradient id="basicGrowthVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value: string) => formatShortDate(value, resumo.periodDays)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="visits" name="Pessoas" stroke="#0f766e" strokeWidth={2.5} fill="url(#basicGrowthVisits)" />
                  <Line type="monotone" dataKey="pageViews" name="Páginas" stroke="#0f172a" strokeWidth={2} dot={false} />
                  {showInternalDailyActions ? (
                    <Line type="monotone" dataKey="actions" name="Ações internas" stroke="#d97706" strokeWidth={2.5} dot={false} />
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-amber-200 bg-gradient-to-b from-amber-50 to-card shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Leitura rápida" title="Sinais do período" />
            <div className="mt-5 space-y-3">
              {[
                {
                  icon: Activity,
                  title: 'Engajamento',
                  value: formatPercent(current.engagementRate),
                  detail: 'Sessões com interação real',
                },
                {
                  icon: Clock3,
                  title: 'Tempo médio no site',
                  value: formatDuration(current.averageSessionDuration),
                  detail: 'Duração média de cada sessão',
                },
                {
                  icon: MousePointerClick,
                  title: 'Cliques orgânicos',
                  value: search ? formatNumber(search.current.clicks) : 'Aguardando',
                  detail: 'Visitas vindas da busca do Google',
                },
                {
                  icon: MailCheck,
                  title: 'Formulários enviados',
                  value: formatNumber(current.formSubmits),
                  detail: `${formatNumber(resumo.forms?.current.starts)} formulários iniciados`,
                },
              ].map((insight) => {
                const Icon = insight.icon;
                return (
                  <div key={insight.title} className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-white/80 p-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-amber-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
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

      <BehaviorTab resumo={resumo} showSummary={false} />
    </div>
  );
}

export function OverviewTab({ resumo }: { resumo: MarketingResumo }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const business = resumo.business?.current ?? resumo.executive?.business;
  const pagesPerSession = current.sessions ? (current.pageViews ?? 0) / current.sessions : 0;
  const previousPagesPerSession = previous.sessions ? (previous.pageViews ?? 0) / previous.sessions : 0;
  const whatsappShare = percentage(current.whatsappClicks, current.visits);
  const showInternalDailyActions = resumo.quality?.actionMetricsSource !== 'ga4';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Visitantes no site"
          value={formatNumber(current.visits)}
          detail={`${formatNumber(current.sessions)} visitas no período`}
          help={siteMetricHelp.visitors}
          icon={Users}
          current={current.visits}
          previous={previous.visits}
          accent="navy"
        />
        <Metric
          label="Clicaram no WhatsApp"
          value={formatNumber(current.whatsappClicks)}
          detail={`${formatPercent(whatsappShare)} em relação aos visitantes`}
          help={siteMetricHelp.whatsapp}
          icon={MessageCircle}
          current={current.whatsappClicks}
          previous={previous.whatsappClicks}
          accent="teal"
        />
        <Metric
          label="Tempo médio no site"
          value={formatDuration(current.averageSessionDuration)}
          detail="Duração média de cada visita"
          help={siteMetricHelp.averageTime}
          icon={Clock3}
          current={current.averageSessionDuration}
          previous={previous.averageSessionDuration}
          accent="gold"
        />
        <Metric
          label="Páginas por visita"
          value={pagesPerSession.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          detail={`${formatNumber(current.pageViews)} páginas vistas`}
          help={siteMetricHelp.pagesPerVisit}
          icon={Eye}
          current={pagesPerSession}
          previous={previousPagesPerSession}
          accent="violet"
        />
      </div>

      <WhatsappOriginBreakdown resumo={resumo} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading
              eyebrow="Evolução diária"
              title="Crescimento do site"
              description={showInternalDailyActions
                ? 'Pessoas, páginas vistas e ações internas no período selecionado.'
                : 'Pessoas e páginas do GA4; ações ficam nos cards até o histórico interno cobrir os dois períodos.'}
            />
            <div className="mt-5 h-[290px]" role="img" aria-label="Evolução diária de pessoas, páginas, ações e contatos">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={resumo.site.daily}>
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
                  <Legend />
                  <Area type="monotone" dataKey="visits" name="Pessoas" stroke="#0f766e" strokeWidth={2.5} fill="url(#growthVisits)" />
                  <Line type="monotone" dataKey="pageViews" name="Páginas" stroke="#0f172a" strokeWidth={2} dot={false} />
                  {showInternalDailyActions ? (
                    <Line type="monotone" dataKey="actions" name="Ações internas" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  ) : null}
                  <Line type="monotone" dataKey="leads" name="Contatos" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </ComposedChart>
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
                        <p className="shrink-0 text-sm font-bold text-slate-950">
                          {insight.title === 'Serviços aprovados'
                            ? <FinancialValue>{insight.value}</FinancialValue>
                            : insight.value}
                        </p>
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

      <BehaviorTab resumo={resumo} showSummary={false} />
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
      : formatDecimal(current);
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

function AiTrafficPanel({ resumo }: { resumo: MarketingResumo }) {
  const ai = resumo.site.aiTraffic;
  const actions = (ai?.whatsappClicks ?? 0) + (ai?.phoneClicks ?? 0) + (ai?.formSubmits ?? 0);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <PanelHeading
            eyebrow="Descoberta por inteligência artificial"
            title="Visitas confirmadas vindas de IAs"
            description="Reconhece links e referências de ChatGPT, Perplexity, Gemini, Copilot, Claude, Meta AI, Grok e You.com. Só conta quando a pessoa realmente chega ao site."
            action={(
              <Badge variant="outline" className="border-violet-200 bg-white/80 text-violet-800">
                Rastreamento ativo
              </Badge>
            )}
          />

          <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-5">
            <Metric
              label="Sessões por IA"
              value={formatNumber(ai?.sessions)}
              detail="Entradas confirmadas no site"
              help="Sessões cuja origem ou referência identifica uma plataforma de IA. Não inclui apenas uma menção sem clique."
              icon={Sparkles}
              accent="violet"
            />
            <Metric
              label="Engajadas"
              value={formatNumber(ai?.engagedSessions)}
              detail={formatPercent(ai?.engagementRate)}
              help="Sessões por IA que atenderam aos critérios de engajamento do Google Analytics."
              icon={Activity}
              accent="teal"
            />
            <Metric
              label="Tempo médio"
              value={formatDuration(ai?.averageSessionDuration)}
              detail={`${formatDecimal(ai?.pagesPerSession)} páginas por sessão`}
              help="Duração média e páginas vistas nas sessões confirmadas vindas de IAs."
              icon={Clock3}
              accent="gold"
            />
            <Metric
              label="Ações de contato"
              value={formatNumber(actions)}
              detail={`${formatNumber(ai?.whatsappClicks)} WhatsApp · ${formatNumber(ai?.phoneClicks)} telefone`}
              help="Cliques em WhatsApp e telefone mais formulários enviados após uma visita atribuída a IA."
              icon={MessageCircle}
              accent="navy"
            />
            <Metric
              label="Contatos registrados"
              value={formatNumber(ai?.leads)}
              detail={`${formatNumber(ai?.formSubmits)} formulários enviados`}
              help="Contatos gravados no funil interno e associados a uma origem de IA."
              icon={UserCheck}
              accent="teal"
            />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
            <div className="overflow-auto rounded-xl border border-violet-100 bg-white/85">
              {ai?.engines.length ? (
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="border-b bg-violet-50/80 text-[10px] uppercase tracking-[0.12em] text-violet-900">
                    <tr>
                      <th className="px-3 py-3 font-semibold">IA identificada</th>
                      <th className="px-3 py-3 text-right font-semibold">Sessões</th>
                      <th className="px-3 py-3 text-right font-semibold">Páginas</th>
                      <th className="px-3 py-3 text-right font-semibold">Engajamento</th>
                      <th className="px-3 py-3 text-right font-semibold">Ações</th>
                      <th className="px-3 py-3 text-right font-semibold">Contatos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ai.engines.map((item) => (
                      <tr key={`${item.source}-${item.medium}`}>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-foreground">{item.aiEngine}</p>
                          <p className="text-[11px] text-muted-foreground">{item.source} / {item.medium}</p>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">{formatNumber(item.visits)}</td>
                        <td className="px-3 py-3 text-right">{formatNumber(item.pageViews)}</td>
                        <td className="px-3 py-3 text-right">{formatPercent(item.engagementRate)}</td>
                        <td className="px-3 py-3 text-right">
                          {formatNumber((item.whatsappClicks ?? 0) + (item.phoneClicks ?? 0) + (item.formSubmits ?? 0))}
                        </td>
                        <td className="px-3 py-3 text-right">{formatNumber(item.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex min-h-36 items-center justify-center p-6 text-center">
                  <div>
                    <Sparkles className="mx-auto h-6 w-6 text-violet-600" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">Ainda não houve visita confirmada por IA</p>
                    <p className="mt-1 text-xs text-slate-600">O painel está preparado e exibirá a plataforma assim que alguém clicar numa recomendação.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
              <p className="font-bold">O que não deve ser confundido</p>
              <p className="mt-2">
                Uma IA pode citar a Retífica Premium sem gerar clique. Essa menção não chega ao site e não pode ser contada pelo Analytics.
              </p>
              <p className="mt-2">
                Quando o relatório de IA do Search Console for liberado para a propriedade, ele complementará este bloco com impressões do Google AI; até lá, mostramos somente dados comprováveis.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SeoTab({ resumo }: { resumo: MarketingResumo }) {
  const search = resumo.searchConsole;
  const baseline = resumo.snapshots?.find((snapshot) => (
    snapshot.snapshot_type === 'executive_summary'
    && (snapshot.metrics as { marker?: string }).marker === 'D0'
  ));

  if (!search) {
    return (
      <div className="space-y-4">
        <AiTrafficPanel resumo={resumo} />
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
      <AiTrafficPanel resumo={resumo} />
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
          <div className="mt-5 h-[310px]" role="img" aria-label="Evolução de impressões e cliques orgânicos">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={search.daily}>
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
                <Legend />
                <Area yAxisId="impressions" type="monotone" dataKey="impressions" name="Impressões" stroke="#0f172a" strokeWidth={2.5} fill="url(#searchImpressions)" />
                <Line yAxisId="clicks" type="monotone" dataKey="clicks" name="Cliques" stroke="#d97706" strokeWidth={2.5} dot={false} />
              </ComposedChart>
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
    <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <div className="mt-4 w-full max-w-full overflow-x-auto" role="region" aria-label={title} tabIndex={0}>
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
                  <td className="py-3 text-right text-muted-foreground">{formatDecimal(row.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BehaviorTab({ resumo, showSummary = true }: { resumo: MarketingResumo; showSummary?: boolean }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const bounceRate = Math.max(0, 100 - (current.engagementRate ?? 0));
  const recurringUsers = Math.max(0, current.visits - (current.newUsers ?? 0));
  const devices = resumo.site.devices ?? [];
  const largestDeviceAudience = Math.max(1, ...devices.map((item) => item.users));
  const deviceLabels: Record<string, string> = {
    desktop: 'Computador',
    mobile: 'Celular',
    tablet: 'Tablet',
  };

  return (
    <div className="space-y-5">
      {showSummary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          <Metric label="Taxa de engajamento" value={formatPercent(current.engagementRate)} detail="Pessoas que realmente interagiram" icon={Activity} current={current.engagementRate} previous={previous.engagementRate} accent="teal" />
          <Metric label="Taxa de rejeição" value={formatPercent(bounceRate)} detail="Complemento da taxa de engajamento do GA4" icon={ArrowDownRight} accent="rose" />
          <Metric label="Novos usuários" value={formatNumber(current.newUsers)} detail={`${formatNumber(recurringUsers)} recorrentes estimados`} icon={Users} current={current.newUsers} previous={previous.newUsers} accent="navy" />
          <Metric label="Tempo médio" value={formatDuration(current.averageSessionDuration)} detail="Duração média por sessão" icon={Clock3} current={current.averageSessionDuration} previous={previous.averageSessionDuration} accent="gold" />
          <Metric label="Sessões engajadas" value={formatNumber(current.engagedSessions)} detail={`de ${formatNumber(current.sessions)} sessões`} icon={Gauge} current={current.engagedSessions} previous={previous.engagedSessions} accent="navy" />
          <Metric label="Páginas vistas" value={formatNumber(current.pageViews)} detail={`${formatNumber(current.visits)} pessoas no site`} icon={Eye} current={current.pageViews} previous={previous.pageViews} accent="violet" />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Navegação" title="Páginas mais vistas" description="Onde as pessoas concentram atenção e onde acontecem conversões." />
            <div className="mt-5 space-y-2">
              {resumo.site.pages.slice(0, 10).map((page, index) => (
                <div key={page.path} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-background p-3">
                  <span className="text-center text-xs font-bold text-amber-700">{String(index + 1).padStart(2, '0')}</span>
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

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <PanelHeading
            eyebrow="Dispositivos"
            title="Onde a experiência precisa funcionar melhor"
            description="Usuários ativos e sessões reportados pelo GA4, separados por categoria de dispositivo."
          />
          {devices.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {devices.map((item) => (
                <div key={item.device} className="rounded-xl border bg-background p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{deviceLabels[item.device] ?? item.device}</p>
                    <p className="text-lg font-bold text-foreground">{formatNumber(item.users)}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{formatNumber(item.sessions)} sessões</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-teal-600"
                      style={{ width: `${(item.users / largestDeviceAudience) * 100}%` }}
                      role="progressbar"
                      aria-label={`${deviceLabels[item.device] ?? item.device}: ${formatNumber(item.users)} usuários`}
                      aria-valuemin={0}
                      aria-valuemax={largestDeviceAudience}
                      aria-valuenow={item.users}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <SectionEmptyState title="Dispositivos ainda não disponíveis" description="O detalhamento aparecerá após a próxima sincronização do GA4." />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BasicContactsTab({ resumo }: { resumo: MarketingResumo }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const forms = resumo.forms?.current;
  const channels = [
    {
      label: 'WhatsApp',
      description: 'Cliques únicos no botão do site',
      value: current.whatsappClicks,
      icon: MessageCircle,
      color: 'bg-emerald-500',
    },
    {
      label: 'Telefone',
      description: 'Cliques para iniciar uma ligação',
      value: current.phoneClicks ?? 0,
      icon: PhoneCall,
      color: 'bg-sky-500',
    },
    {
      label: 'Formulário',
      description: 'Formulários enviados com sucesso',
      value: current.formSubmits,
      icon: MailCheck,
      color: 'bg-amber-500',
    },
  ];
  const largestChannel = Math.max(1, ...channels.map((channel) => channel.value));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Cliques no WhatsApp" value={formatNumber(current.whatsappClicks)} detail="Intenções de conversa" icon={MessageCircle} current={current.whatsappClicks} previous={previous.whatsappClicks} accent="teal" />
        <Metric label="Cliques no telefone" value={formatNumber(current.phoneClicks)} detail="Intenções de ligação" icon={PhoneCall} current={current.phoneClicks} previous={previous.phoneClicks} accent="navy" />
        <Metric label="Formulários iniciados" value={formatNumber(forms?.starts)} detail="Pessoas que começaram a preencher" icon={FileWarning} current={forms?.starts} previous={resumo.forms?.previous.starts} accent="violet" />
        <Metric label="Formulários enviados" value={formatNumber(forms?.submits)} detail="Envios concluídos no site" icon={MailCheck} current={forms?.submits} previous={resumo.forms?.previous.submits} accent="gold" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading
              eyebrow="Canais"
              title="Como as pessoas tentam falar"
              description="Ações agregadas do site. Um clique indica intenção de contato, não confirma atendimento."
            />
            <div className="mt-6 space-y-5">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <div key={channel.label}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-amber-300">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{channel.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{channel.description}</p>
                        </div>
                      </div>
                      <p className="text-xl font-bold text-foreground">{formatNumber(channel.value)}</p>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-[width] duration-500', channel.color)}
                        style={{ width: `${Math.max(channel.value ? 8 : 0, (channel.value / largestChannel) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading
              eyebrow="Formulário"
              title="Do início ao envio"
              description="Resumo da eficiência do formulário, sem mostrar nomes, telefones ou campos preenchidos."
            />
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { label: 'Iniciados', value: forms?.starts ?? 0 },
                { label: 'Enviados', value: forms?.submits ?? 0 },
                { label: 'Abandonos', value: forms?.abandons ?? 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-muted/30 p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{formatNumber(item.value)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Taxa de conclusão</p>
                  <p className="mt-2 text-3xl font-bold">{formatPercent(forms?.completionRate)}</p>
                </div>
                <p className="max-w-[220px] text-right text-xs leading-relaxed text-slate-400">
                  Percentual de pessoas que começaram e conseguiram enviar o formulário.
                </p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-300"
                  style={{ width: `${Math.min(100, Math.max(0, forms?.completionRate ?? 0))}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ContactsTab({
  resumo,
  onLinked,
  canManageAttribution,
}: {
  resumo: MarketingResumo;
  onLinked: () => void;
  canManageAttribution: boolean;
}) {
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
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

        <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
          <CardContent className="min-w-0 p-4 sm:p-6">
            <PanelHeading
              eyebrow="Caixa de entrada"
              title="Contatos identificados"
              description="Dados pessoais visíveis somente para administradores autorizados."
              action={(
                <div className="relative w-full sm:w-[240px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Buscar contato ou código" className="pl-9" />
                </div>
              )}
            />
            <div
              className="mt-5 w-full max-w-full overflow-auto rounded-xl border"
              role="region"
              aria-label="Contatos identificados"
              tabIndex={0}
            >
              {linkFeedback ? (
                <div aria-live="polite" className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{linkFeedback}</div>
              ) : null}
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b bg-muted/95 text-[10px] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Data / código</th>
                    <th className="px-3 py-3 font-semibold">Contato</th>
                    <th className="px-3 py-3 font-semibold">Origem</th>
                    <th className="px-3 py-3 font-semibold">Canal</th>
                    <th className="px-3 py-3 font-semibold">Etapa</th>
                    <th className="px-3 py-3 font-semibold">{canManageAttribution ? 'Vincular cliente' : 'Vínculo'}</th>
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
                      canManageAttribution={canManageAttribution}
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
  canManageAttribution,
}: {
  lead: MarketingLeadItem;
  clients: MarketingClientOption[];
  selectedClientId: string;
  onClientChange: (clientId: string) => void;
  onLink: () => void;
  isLinking: boolean;
  canManageAttribution: boolean;
}) {
  return (
    <tr className="bg-card hover:bg-muted/30">
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground">{formatDateTime(lead.occurred_at)}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{lead.lead_code ?? 'Sem código'}</p>
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
      <td className="px-3 py-3">
        {lead.fk_clientes ? (
          <span className="text-[11px] text-muted-foreground">Origem confirmada</span>
        ) : !canManageAttribution ? (
          <span className="text-[11px] text-muted-foreground">Aguardando vínculo</span>
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
              {isLinking ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 motion-safe:animate-spin" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />}
              Vincular
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function ResultsTab({ resumo }: { resumo: MarketingResumo }) {
  const business = resumo.business?.current;
  const previous = resumo.business?.previous;
  const commissions = resumo.business?.commissions ?? [];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Esta aba mostra somente o resultado comercial atribuído.</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/75">
          Investimento, cliques, CTR, CPC e demais indicadores de mídia paga ficam exclusivamente na aba Google Ads.
        </p>
      </div>

      <section aria-label="Classificação dos clientes atribuídos" className="space-y-3">
        <PanelHeading
          eyebrow="Qualidade comercial"
          title="Quem realmente virou cliente?"
          description="A equipe confirma a origem no cadastro; quando houver telefone, e-mail ou código do site, o Retiflow continua fazendo o vínculo automático."
        />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric label="Clientes novos" value={formatNumber(business?.newClients)} detail="Primeiro atendimento confirmado" help="Clientes marcados como novos no cadastro ou cujo primeiro contato digital aconteceu antes da criação no Retiflow." icon={UserCheck} current={business?.newClients} previous={previous?.newClients} accent="teal" />
          <Metric label="Já eram clientes" value={formatNumber(business?.existingClients)} detail="Retorno de cliente conhecido" help="Pessoas que já eram clientes antes deste novo contato de marketing." icon={Users} current={business?.existingClients} previous={previous?.existingClients} accent="navy" />
          <Metric label="Sem classificação" value={formatNumber(business?.unknownClients)} detail="A equipe ainda não confirmou" help="Clientes atribuídos cuja situação como novo ou antigo ainda não pôde ser comprovada." icon={CircleHelp} current={business?.unknownClients} previous={previous?.unknownClients} accent="violet" />
          <Metric label="Clientes via ligação" value={formatNumber(business?.confirmedCalls)} detail="Ligação do anúncio confirmada" help={googleAdsHelp.confirmedCallClients} icon={PhoneCall} current={business?.confirmedCalls} previous={previous?.confirmedCalls} accent="gold" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Clientes identificados"
          value={formatNumber(business?.identifiedClients)}
          detail="Com origem comprovada na internet"
          help="Clientes cadastrados no Retiflow que foram vinculados a uma origem digital por telefone, e-mail ou código do contato."
          icon={UserCheck}
          current={business?.identifiedClients}
          previous={previous?.identifiedClients}
          accent="violet"
        />
        <Metric
          label="O.S. aprovadas"
          value={formatNumber(business?.approvedOrders)}
          detail="Snapshots financeiros congelados"
          help="Ordens de serviço de clientes atribuídos que chegaram pela primeira vez ao status Aprovado no período."
          icon={FileCheck2}
          current={business?.approvedOrders}
          previous={previous?.approvedOrders}
          accent="navy"
        />
        <Metric
          label="Serviços aprovados"
          value={formatCurrency(business?.approvedServices)}
          detail={`${formatCurrency(business?.excludedProducts)} em peças excluídas`}
          help="Valor dos serviços das O.S. atribuídas e aprovadas. Peças e produtos ficam fora da base de comissão."
          icon={Wrench}
          current={business?.approvedServices}
          previous={previous?.approvedServices}
          accent="teal"
          financial
          financialDetail
        />
        <Metric
          label="Comissão gerada"
          value={formatCurrency(business?.commission)}
          detail="Mantida no snapshot original"
          help="Comissão congelada na primeira aprovação da O.S., calculada somente sobre serviços e sem misturar custo do Google Ads."
          icon={BadgeDollarSign}
          current={business?.commission}
          previous={previous?.commission}
          accent="gold"
          financial
        />
      </div>

      <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
        <CardContent className="min-w-0 p-4 sm:p-6">
          <PanelHeading eyebrow="Auditoria financeira" title="O.S. que geraram comissão" description="Base congelada na primeira aprovação: somente serviços, com peças e produtos excluídos." />
          <div className="mt-5 w-full max-w-full overflow-x-auto rounded-xl border" role="region" aria-label="Ordens de serviço que geraram comissão" tabIndex={0}>
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
                    <td className="px-3 py-3 text-right font-medium text-foreground"><FinancialValue>{formatCurrency(Number(item.services_snapshot ?? 0))}</FinancialValue></td>
                    <td className="px-3 py-3 text-right text-muted-foreground"><FinancialValue>{formatCurrency(Number(item.products_excluded_snapshot ?? 0))}</FinancialValue></td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{formatPercent(Number(item.commission_rate_snapshot ?? 0) * 100)}</td>
                    <td className="px-3 py-3 text-right font-bold text-amber-700"><FinancialValue>{formatCurrency(Number(item.commission_amount_snapshot ?? 0))}</FinancialValue></td>
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
    </div>
  );
}

const googleAdsDeviceLabels: Record<string, string> = {
  MOBILE: 'Celular',
  DESKTOP: 'Computador',
  TABLET: 'Tablet',
  CONNECTED_TV: 'TV conectada',
  OTHER: 'Outro',
  UNKNOWN: 'Não informado',
};

const googleAdsNetworkLabels: Record<string, string> = {
  SEARCH: 'Pesquisa Google',
  SEARCH_PARTNERS: 'Parceiros de Pesquisa',
  CONTENT: 'Rede de Display',
  YOUTUBE_SEARCH: 'Pesquisa do YouTube',
  YOUTUBE_WATCH: 'Vídeos do YouTube',
  MIXED: 'Rede mista',
  UNKNOWN: 'Não informado',
};

const googleAdsQualityBucketLabels: Record<string, string> = {
  BELOW_AVERAGE: 'Abaixo',
  AVERAGE: 'Na média',
  ABOVE_AVERAGE: 'Acima',
  UNKNOWN: '—',
  UNSPECIFIED: '—',
};

const googleAdsDayLabels: Record<string, string> = {
  MONDAY: 'Segunda',
  TUESDAY: 'Terça',
  WEDNESDAY: 'Quarta',
  THURSDAY: 'Quinta',
  FRIDAY: 'Sexta',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

const googleAdsCallStatus: Record<string, { label: string; className: string }> = {
  RECEIVED: {
    label: 'Atendida',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  MISSED: {
    label: 'Não atendida',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  UNKNOWN: {
    label: 'Não informado',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
};

function GoogleAdsCallDetails({
  calls,
  adCallClicks,
  confirmedCallClients,
}: {
  calls: NonNullable<MarketingResumo['campaigns']['calls']>;
  adCallClicks: number;
  confirmedCallClients: number;
}) {
  const items = calls.items ?? [];
  if (!items.length) return null;
  const qualifiedCalls = items.filter(
    (call) => call.status === 'RECEIVED' && call.durationSeconds >= 30,
  ).length;
  const summary = [
    { label: 'Toques em Ligar', value: adCallClicks, help: googleAdsHelp.adCalls },
    { label: 'Registradas', value: calls.reported, help: googleAdsHelp.reportedCalls },
    { label: 'Atendidas', value: calls.received, help: 'Chamadas registradas pelo Google com status de recebida.' },
    { label: 'Com 30s ou mais', value: qualifiedCalls, help: googleAdsHelp.qualifiedCalls },
    { label: 'Viraram clientes', value: confirmedCallClients, help: googleAdsHelp.confirmedCallClients },
  ];

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-3.5 sm:p-4">
        <PanelHeading
          eyebrow="Chamadas reais"
          title="Detalhes de cada ligação"
          description="Horário, duração e atendimento informados pelo encaminhamento de chamadas do Google."
        />

        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-5">
          {summary.map((item) => (
            <div key={item.label} className="min-w-0 bg-white px-3 py-2.5">
              <div className="flex items-start gap-1">
                <p className="text-[9px] font-bold uppercase leading-4 tracking-[0.08em] text-slate-500">{item.label}</p>
                <HelpTip label={item.label} description={item.help} />
              </div>
              <p className="mt-0.5 text-lg font-black leading-none text-slate-950">{formatNumber(item.value)}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-950">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-bold">Identificação:</span>{' '}
            a API entrega país e DDD, mas não nome nem telefone completo. Confira o horário no telefone ou PABX da retífica.
          </p>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map((call) => {
            const status = googleAdsCallStatus[call.status] ?? googleAdsCallStatus.UNKNOWN;
            const endedAt = formatGoogleAdsCallEndTime(call.endedAt);
            const country = call.countryCode
              ? call.countryCode === '55'
                ? 'Brasil (+55)'
                : `País (+${call.countryCode})`
              : 'País indisponível';
            const location = `${country} · ${call.areaCode ? `DDD ${call.areaCode}` : 'DDD indisponível'}`;
            const callOrigin = call.type === 'HIGH_END_MOBILE_SEARCH'
              ? 'Toque em “Ligar” no anúncio'
              : call.type === 'MANUALLY_DIALED'
                ? 'Número do anúncio discado manualmente'
                : call.displayLocation === 'LANDING_PAGE'
                  ? 'Telefone exibido no site'
                  : 'Origem não informada';

            return (
              <article key={call.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Início da chamada</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-950">{formatGoogleAdsCallDateTime(call.startedAt)}</p>
                  </div>
                  <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[9px]', status.className)}>
                    {status.label}
                  </Badge>
                </div>

                <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5">
                  <div>
                    <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">Duração</dt>
                    <dd className="mt-0.5 text-sm font-black text-slate-950">{formatDuration(call.durationSeconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">Término</dt>
                    <dd className="mt-0.5 text-sm font-black text-slate-950">{endedAt ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">Local</dt>
                    <dd className="mt-0.5 truncate text-[11px] font-semibold text-slate-800" title={location}>{location}</dd>
                  </div>
                </dl>

                <p className="mt-2 truncate text-[10px] text-slate-600" title={callOrigin}>
                  <span className="font-semibold text-slate-800">Origem:</span> {callOrigin}
                </p>
              </article>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function GoogleAdsTab({ resumo }: { resumo: MarketingResumo }) {
  const { financialValuesHidden } = useFinancialPrivacy();
  const ads = resumo.campaigns;
  const current = ads.current;
  const offline = ads.offlineConversions;
  const devices = ads.devices ?? [];
  const networks = ads.networks ?? [];
  const adGroups = ads.adGroups ?? [];
  const keywords = ads.keywords ?? [];
  const searchTerms = ads.searchTerms ?? [];
  const landingPages = ads.landingPages ?? [];
  const schedule = ads.schedule ?? [];
  const clickTypes = ads.clickTypes ?? [];
  const messageAssets = ads.messageAssets ?? [];
  const whatsappAsset = messageAssets.find((asset) =>
    asset.provider === 'WHATSAPP' && asset.status === 'ENABLED'
  ) ?? messageAssets[0];
  const paidActions = ads.paidActions;
  const siteWhatsapp = resumo.site.whatsapp;
  const calls = ads.calls;
  const conversionActions = ads.conversionActions ?? [];
  const paidVisitors = ads.paidVisitors ?? [];
  const clicksByType = (types: string[]) => clickTypes
    .filter((item) => types.includes(item.type))
    .reduce((total, item) => total + item.clicks, 0);
  const mainUrlClicks = clicksByType(['URL_CLICKS']);
  const sitelinkClicks = clicksByType(['SITELINKS']);
  const siteClicks = mainUrlClicks + sitelinkClicks;
  const adWhatsappClicks = clicksByType(['CLICK_TO_MESSAGE_THIRD_PARTY_CLICK']);
  const messageLandingClicks = clicksByType(['CLICK_TO_MESSAGE_LANDING_PAGE_CLICK']);
  const adCallClicks = clicksByType(['CALLS']);
  const classifiedClicks = siteClicks
    + adWhatsappClicks
    + messageLandingClicks
    + adCallClicks;
  const otherClicks = Math.max(0, current.clicks - classifiedClicks);
  const confirmedCallClients = resumo.business?.current.confirmedCalls ?? 0;

  if (!ads.financialAvailable) {
    return (
      <SectionEmptyState
        icon={Target}
        title="Google Ads ainda sem dados disponíveis"
        description={ads.statusMessage ?? 'A integração oficial está aguardando uma conta válida.'}
        className="min-h-[320px]"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950">
              <Target className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-300">Escopo da aba</p>
              <h2 className="mt-0.5 text-base font-bold">Somente desempenho dos anúncios</h2>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-slate-400">
                Aqui entram investimento, alcance, eficiência e conversões do Google Ads. O.S., serviços e comissão ficam somente em Resultado.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-emerald-300/30 bg-emerald-300/10 text-emerald-200">
            Dados oficiais · até 10 min de cache
          </Badge>
        </div>
      </div>

      <section aria-label="Alcance e custo dos anúncios" className="space-y-3">
        <PanelHeading
          eyebrow="Alcance e custo"
          title="Quanto investimos e quantas interações tivemos?"
          description="O total de cliques reúne site, WhatsApp, ligação e outras interações registradas pelo Google. A divisão principal aparece logo abaixo."
        />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <Metric label="Investimento" value={formatCurrency(current.spend)} detail="Custo oficial no período" help={googleAdsHelp.spend} icon={BadgeDollarSign} current={current.spend} previous={ads.previous?.spend} accent="navy" financial />
          <Metric label="Impressões" value={formatNumber(current.impressions)} detail="Exibições dos anúncios" help={googleAdsHelp.impressions} icon={Eye} current={current.impressions} previous={ads.previous?.impressions} accent="violet" />
          <Metric label="Cliques totais" value={formatNumber(current.clicks)} detail="Site + WhatsApp + ligar + outros" help={googleAdsHelp.clicks} icon={MousePointerClick} current={current.clicks} previous={ads.previous?.clicks} accent="teal" />
          <Metric label="CTR" value={formatPercent(current.ctr)} detail="Cliques ÷ impressões" help={googleAdsHelp.ctr} icon={Target} accent="violet" />
          <Metric label="CPC médio" value={formatCurrency(current.averageCpc)} detail="Custo médio por clique" help={googleAdsHelp.averageCpc} icon={Gauge} accent="gold" financial />
        </div>
      </section>

      <section aria-label="Divisão dos cliques dos anúncios" className="space-y-2.5">
        <PanelHeading
          eyebrow="Destino dos cliques"
          title="Para onde foram os cliques?"
          description="Os cliques do anúncio e os cliques feitos dentro do site ficam separados para não misturar etapas diferentes."
        />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {clickTypes.length ? (
            <>
              <ClickBreakdownItem
                label="Links do site"
                value={siteClicks}
                detail={`${formatNumber(mainUrlClicks)} na URL principal + ${formatNumber(sitelinkClicks)} em sitelinks`}
                help={googleAdsHelp.siteClicks}
                icon={ExternalLink}
                tone="slate"
              />
              <ClickBreakdownItem
                label="WhatsApp do anúncio"
                value={adWhatsappClicks}
                detail={formatWhatsappPhone(whatsappAsset?.phoneNumber, whatsappAsset?.countryCode)}
                help={googleAdsHelp.adWhatsappClicks}
                icon={MessageCircle}
                tone="emerald"
                footer={(
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Badge className={cn(
                      'h-5 border px-1.5 text-[9px]',
                      whatsappAsset?.primaryStatus === 'ELIGIBLE'
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-100'
                        : 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100',
                    )}>
                      {whatsappAsset?.primaryStatus === 'ELIGIBLE' ? 'Apto a aparecer' : 'Aguardando elegibilidade'}
                    </Badge>
                    {messageLandingClicks > 0 ? <span>{formatNumber(messageLandingClicks)} na página intermediária</span> : null}
                  </div>
                )}
              />
              <ClickBreakdownItem
                label="Ligar no anúncio"
                value={adCallClicks}
                detail={calls?.reported
                  ? `${formatNumber(calls.received)} ${calls.received === 1 ? 'atendida' : 'atendidas'} · ${formatDuration(calls.averageDurationSeconds)} em média`
                  : 'Abriram o discador pelo próprio anúncio'}
                help={googleAdsHelp.adCalls}
                icon={PhoneCall}
                tone="amber"
              />
            </>
          ) : (
            <div className="col-span-2 flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center lg:col-span-3">
              <div>
                <MousePointerClick className="mx-auto h-5 w-5 text-slate-500" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-800">Detalhamento aguardando sincronização</p>
                <p className="mt-1 text-[11px] text-slate-500">O total continua correto; a divisão chegará na próxima atualização do Google Ads.</p>
              </div>
            </div>
          )}
          <ClickBreakdownItem
            label="WhatsApp dentro do site"
            value={siteWhatsapp?.uniqueClicks ?? resumo.site.current.whatsappClicks}
            detail={`${formatNumber(siteWhatsapp?.paidClicks ?? paidActions?.whatsappClicks)} vieram dos anúncios · ${formatNumber(siteWhatsapp?.repeatedClicks)} repetições removidas`}
            help="Cliques únicos nos botões do site. Este total é separado do botão de WhatsApp exibido diretamente no anúncio."
            icon={ExternalLink}
            tone="teal"
            footer={<span>Depois de a pessoa entrar no site</span>}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: 'Outros cliques', value: otherClicks, help: googleAdsHelp.clicks },
            { label: 'Sessões pagas', value: paidActions?.trackedSessions, help: googleAdsHelp.trackedPaidSessions },
            { label: 'Telefone no site', value: paidActions?.phoneClicks, help: googleAdsHelp.paidPhoneClicks },
            { label: 'Formulários', value: paidActions?.formSubmits, help: googleAdsHelp.paidFormSubmits },
          ].map((item) => (
            <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-1">
                <span className="text-[9px] font-bold uppercase leading-3 tracking-[0.05em] text-slate-500">{item.label}</span>
                <HelpTip label={item.label} description={item.help} />
              </div>
              <span className="shrink-0 text-sm font-black text-slate-950">
                {item.value === undefined ? '—' : formatNumber(item.value)}
              </span>
            </div>
          ))}
          {clickTypes.length ? (
            <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-xl bg-slate-950 px-2.5 py-2 text-white sm:col-span-1">
              <span className="text-[9px] font-semibold uppercase leading-3 tracking-[0.06em] text-slate-400">Soma explicada</span>
              <span
                className="shrink-0 text-xs font-bold"
                aria-label={`${formatNumber(classifiedClicks + otherClicks)} de ${formatNumber(current.clicks)} cliques explicados`}
              >
                {formatNumber(classifiedClicks + otherClicks)} / {formatNumber(current.clicks)}
              </span>
            </div>
          ) : null}
        </div>

        {siteWhatsapp?.points.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Onde clicaram no WhatsApp do site</p>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {siteWhatsapp.points.slice(0, 4).map((point) => (
                <div key={`${point.eventLabel}:${point.pagePath}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px]">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[10px] font-semibold leading-3 text-slate-800">{formatWhatsappPointLabel(point.eventLabel, point.pagePath)}</p>
                    <p className="truncate text-[9px] text-slate-500">{point.pagePath}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-black text-slate-950">{formatNumber(point.uniqueClicks)}</p>
                    {point.paidClicks ? <p className="text-[8px] font-semibold text-emerald-700">{formatNumber(point.paidClicks)} de anúncio</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {calls ? (
          <GoogleAdsCallDetails
            calls={calls}
            adCallClicks={adCallClicks}
            confirmedCallClients={confirmedCallClients}
          />
        ) : null}
      </section>

      <section aria-label="Conversão e eficiência dos anúncios" className="space-y-3">
        <PanelHeading
          eyebrow="Conversão e eficiência"
          title="Os cliques estão virando resultado?"
          description="Conversão aqui é uma ação configurada no Google Ads; não é comissão nem faturamento da O.S. As primárias orientam a campanha e o total também inclui ações secundárias."
        />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6 [&_.growth-metric-icon]:hidden 2xl:[&_.growth-metric-icon]:flex">
          <Metric label="Conversões primárias" value={formatDecimal(current.conversions)} detail="Ações usadas na otimização" help={googleAdsHelp.conversions} icon={Target} current={current.conversions} previous={ads.previous?.conversions} accent="violet" />
          <Metric label="Todas as conversões" value={formatDecimal(current.allConversions)} detail="Primárias + secundárias" help={googleAdsHelp.allConversions} icon={ListChecks} current={current.allConversions} previous={ads.previous?.allConversions} accent="navy" />
          <Metric label="Taxa de conversão" value={formatPercent(current.conversionRate)} detail="Conversões ÷ cliques" help={googleAdsHelp.conversionRate} icon={ArrowUpRight} accent="teal" />
          <Metric label="CPA" value={formatCurrency(current.cpl)} detail="Custo por conversão principal" help={googleAdsHelp.cpa} icon={BadgeDollarSign} accent="rose" financial />
          <Metric label="Valor das conversões" value={formatCurrency(current.conversionValue)} detail={`${formatCurrency(current.valuePerConversion)} por conversão`} help={`${googleAdsHelp.conversionValue} ${googleAdsHelp.valuePerConversion}`} icon={Sparkles} accent="teal" financial financialDetail />
          <Metric label="ROAS configurado" value={`${formatDecimal(current.roas)}x`} detail="Valor configurado ÷ investimento" help={googleAdsHelp.roas} icon={ArrowUpRight} accent="gold" />
        </div>
      </section>

      <section aria-label="Cobertura e qualidade dos anúncios" className="space-y-3">
        <PanelHeading
          eyebrow="Cobertura e qualidade"
          title="Onde estamos perdendo oportunidades?"
          description="Esses indicadores ajudam a decidir se o gargalo está no orçamento, na posição ou na qualidade do tráfego."
        />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6 [&_.growth-metric-icon]:hidden 2xl:[&_.growth-metric-icon]:flex">
          <Metric label="Parcela de impressões" value={formatPercent(current.searchImpressionShare)} detail="Cobertura possível na Pesquisa" help={googleAdsHelp.searchImpressionShare} icon={Gauge} accent="navy" />
          <Metric label="Perdida por orçamento" value={formatPercent(current.searchBudgetLostImpressionShare)} detail="Limitação de verba" help={googleAdsHelp.searchBudgetLostImpressionShare} icon={AlertTriangle} accent="rose" />
          <Metric label="Perdida por classificação" value={formatPercent(current.searchRankLostImpressionShare)} detail="Lance, qualidade e relevância" help={googleAdsHelp.searchRankLostImpressionShare} icon={Search} accent="violet" />
          <Metric label="Topo da página" value={formatPercent(current.searchTopImpressionShare)} detail="Acima dos resultados orgânicos" help={googleAdsHelp.searchTopImpressionShare} icon={ArrowUpRight} accent="teal" />
          <Metric label="Primeira posição" value={formatPercent(current.searchAbsoluteTopImpressionShare)} detail="Topo absoluto da pesquisa" help={googleAdsHelp.searchAbsoluteTopImpressionShare} icon={Target} accent="gold" />
          <Metric label="Cliques inválidos" value={formatNumber(current.invalidClicks)} detail={`${formatPercent(current.invalidClickRate)} dos cliques filtrados`} help={googleAdsHelp.invalidClicks} icon={ShieldCheck} accent="navy" />
        </div>
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <PanelHeading
              eyebrow="Rede de veiculação"
              title="Pesquisa Google x parceiros"
              description="Separa custo e resultado por rede para revelar tráfego barato que não gera conversão."
            />
            {networks.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {networks.map((item) => (
                  <div key={item.network} className="rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {googleAdsNetworkLabels[item.network] ?? item.network}
                      </p>
                      <HelpTip label="Rede" description={googleAdsHelp.network} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Cliques</dt>
                        <dd className="mt-1 font-bold">{formatNumber(item.clicks)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">CTR</dt>
                        <dd className="mt-1 font-bold">{formatPercent(item.ctr)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Custo</dt>
                        <dd className="mt-1 font-bold"><FinancialValue>{formatCurrency(item.spend)}</FinancialValue></dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Conversões</dt>
                        <dd className="mt-1 font-bold">{formatDecimal(item.conversions)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">A divisão por rede aparecerá na próxima sincronização da API.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
          <CardContent className="min-w-0 p-4 sm:p-6">
            <PanelHeading
              eyebrow="Evolução diária"
              title="Investimento, cliques e conversões"
              description="Dados oficiais do Google Ads, com cache de até 10 minutos."
            />
            <div className="mt-5 h-[300px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={ads.daily}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value) => formatShortDate(String(value), resumo.periodDays)} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(value) => financialValuesHidden ? '•••' : String(value)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    labelFormatter={(value) => formatShortDate(String(value), resumo.periodDays)}
                    formatter={(value: number, name: string) => [
                      name === 'Investimento'
                        ? (financialValuesHidden ? 'R$ ••••••' : formatCurrency(value))
                        : formatDecimal(value),
                      name,
                    ]}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="spend" name="Investimento" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="clicks" name="Cliques" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="conversions" name="Conversões" stroke="#d97706" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-slate-950 text-white shadow-sm">
          <CardContent className="p-5 sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Conversão de cliente</p>
            <h3 className="mt-1 text-xl font-bold">Retiflow → Google Ads</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Cada cliente atribuído a um clique do anúncio entra numa fila privada e idempotente.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[
                { label: 'Total', value: offline?.total ?? 0, help: googleAdsHelp.offlineTotal },
                { label: 'Enviadas', value: offline?.uploaded ?? 0, help: googleAdsHelp.offlineUploaded },
                { label: 'Na fila', value: (offline?.pending ?? 0) + (offline?.processing ?? 0), help: googleAdsHelp.offlinePending },
                { label: 'Nova tentativa', value: offline?.retry ?? 0, help: googleAdsHelp.offlineRetry },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start gap-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
                    <HelpTip label={item.label} description={item.help} className="text-slate-500 hover:bg-white/10 hover:text-white focus-visible:ring-amber-300 focus-visible:ring-offset-slate-950" />
                  </div>
                  <p className="mt-2 text-xl font-bold text-white">{formatNumber(Number(item.value))}</p>
                </div>
              ))}
            </div>
            <div className={cn(
              'mt-3 rounded-xl border p-3 text-xs leading-relaxed',
              offline?.failed
                ? 'border-rose-300/30 bg-rose-300/10 text-rose-100'
                : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
            )}>
              {offline?.failed
                ? `${formatNumber(offline.failed)} envio(s) requerem revisão.`
                : 'Nenhuma conversão com falha definitiva.'}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              Telefone/e-mail fazem o vínculo automático. Conversas só pelo WhatsApp usam o código RP informado no cadastro.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
        <CardContent className="min-w-0 p-4 sm:p-6">
          <PanelHeading
            eyebrow="Jornada paga"
            title="Pessoas que entraram por anúncio"
            description="Sessões com GCLID/GBRAID/WBRAID ou origem Google CPC, sem expor o identificador bruto do clique."
          />
          <div className="mt-5 w-full max-w-full overflow-auto rounded-xl border" role="region" aria-label="Visitantes vindos de anúncios" tabIndex={0}>
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b bg-muted/70 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <AdsTableHead label="Última visita" />
                  <AdsTableHead label="Pessoa / sessão" help={googleAdsHelp.paidVisitor} />
                  <AdsTableHead label="Campanha" />
                  <AdsTableHead label="Entrada" help={googleAdsHelp.landingPage} />
                  <AdsTableHead label="Eventos" help={googleAdsHelp.paidVisitorEvents} align="right" />
                  <AdsTableHead label="Situação" help={googleAdsHelp.paidVisitorStatus} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {paidVisitors.map((visitor) => (
                  <tr key={`${visitor.visitorId}-${visitor.firstSeenAt}`}>
                    <td className="px-3 py-3 text-muted-foreground">{formatDateTime(visitor.lastSeenAt)}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-foreground">{visitor.leadName ?? `Sessão • ${visitor.visitorId}`}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{visitor.leadContact ?? visitor.leadCode ?? visitor.clickIdType?.toUpperCase() ?? 'Google CPC'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{visitor.campaign ?? 'Campanha não informada'}</p>
                      <p className="text-[11px] text-muted-foreground">{visitor.source} / {visitor.medium}</p>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-3 text-muted-foreground" title={visitor.landingPage}>{visitor.landingPage}</td>
                    <td className="px-3 py-3 text-right">
                      <p className="font-semibold text-foreground">{formatNumber(visitor.eventCount)}</p>
                      <p className="text-[11px] text-muted-foreground">{formatNumber(visitor.actionCount)} ações</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={visitor.convertedClient
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : visitor.actionCount
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'}>
                        {visitor.convertedClient ? 'Cliente cadastrado' : visitor.actionCount ? 'Demonstrou interesse' : 'Somente visitou'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paidVisitors.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma visita paga registrada no período. A conta está pronta para começar a receber os acessos dos anúncios.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="campanhas" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/80 p-1 sm:grid-cols-4 2xl:grid-cols-7">
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="dispositivos">Dispositivos</TabsTrigger>
          <TabsTrigger value="palavras">Palavras-chave</TabsTrigger>
          <TabsTrigger value="pesquisas">Pesquisas</TabsTrigger>
          <TabsTrigger value="paginas">Páginas</TabsTrigger>
          <TabsTrigger value="horarios">Horários</TabsTrigger>
          <TabsTrigger value="conversoes">Conversões</TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="space-y-4">
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <PanelHeading eyebrow="Estrutura" title="Desempenho por campanha" />
              <div className="mt-5 overflow-auto rounded-xl border">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="border-b bg-muted/70 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <AdsTableHead label="Campanha" />
                      <AdsTableHead label="Status" />
                      <AdsTableHead label="Orçamento/dia" help={googleAdsHelp.dailyBudget} align="right" />
                      <AdsTableHead label="Otimização" help={googleAdsHelp.optimizationScore} align="right" />
                      <AdsTableHead label="Custo" help={googleAdsHelp.spend} align="right" />
                      <AdsTableHead label="Cliques" help={googleAdsHelp.clicks} align="right" />
                      <AdsTableHead label="CTR" help={googleAdsHelp.ctr} align="right" />
                      <AdsTableHead label="Conversões" help={googleAdsHelp.conversions} align="right" />
                      <AdsTableHead label="CPA" help={googleAdsHelp.cpa} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ads.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3"><p className="font-semibold">{item.name}</p><p className="text-[11px] text-muted-foreground">{item.channelType}</p></td>
                        <td className="px-3 py-3">{item.status}</td>
                        <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.dailyBudget)}</FinancialValue></td>
                        <td className="px-3 py-3 text-right">{formatPercent(item.optimizationScore)}</td>
                        <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.spend)}</FinancialValue></td>
                        <td className="px-3 py-3 text-right">{formatNumber(item.clicks)}</td>
                        <td className="px-3 py-3 text-right">{formatPercent(item.ctr)}</td>
                        <td className="px-3 py-3 text-right">{formatDecimal(item.conversions)}</td>
                        <td className="px-3 py-3 text-right font-semibold"><FinancialValue>{formatCurrency(item.cpl)}</FinancialValue></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ads.items.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma campanha veiculou neste período.</div> : null}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <PanelHeading
                eyebrow="Estrutura"
                title="Desempenho por grupo de anúncios"
                description="Mostra qual tema concentra custo, cliques e conversões sem criar mais uma aba."
              />
              <div className="mt-5 overflow-auto rounded-xl border">
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead className="border-b bg-muted/70 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <AdsTableHead label="Grupo" help={googleAdsHelp.adGroup} />
                      <AdsTableHead label="Campanha" />
                      <AdsTableHead label="Status" />
                      <AdsTableHead label="Impressões" help={googleAdsHelp.impressions} align="right" />
                      <AdsTableHead label="Cliques" help={googleAdsHelp.clicks} align="right" />
                      <AdsTableHead label="CTR" help={googleAdsHelp.ctr} align="right" />
                      <AdsTableHead label="Custo" help={googleAdsHelp.spend} align="right" />
                      <AdsTableHead label="Conversões" help={googleAdsHelp.conversions} align="right" />
                      <AdsTableHead label="CPA" help={googleAdsHelp.cpa} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {adGroups.map((item) => (
                      <tr key={`${item.campaignId}-${item.id}`}>
                        <td className="px-3 py-3 font-semibold">{item.name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{item.campaign}</td>
                        <td className="px-3 py-3">{item.status}</td>
                        <td className="px-3 py-3 text-right">{formatNumber(item.impressions)}</td>
                        <td className="px-3 py-3 text-right">{formatNumber(item.clicks)}</td>
                        <td className="px-3 py-3 text-right">{formatPercent(item.ctr)}</td>
                        <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.spend)}</FinancialValue></td>
                        <td className="px-3 py-3 text-right">{formatDecimal(item.conversions)}</td>
                        <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.cpl)}</FinancialValue></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {adGroups.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">A divisão por grupo aparecerá na próxima sincronização da API.</div> : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispositivos">
          <Card className="rounded-2xl border-border/70 shadow-sm"><CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Segmentação" title="Resultados por dispositivo" />
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {devices.map((item) => (
                <div key={item.device} className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{googleAdsDeviceLabels[item.device] ?? item.device}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: 'Cliques', value: formatNumber(item.clicks), help: googleAdsHelp.clicks },
                      { label: 'Investimento', value: formatCurrency(item.spend), help: googleAdsHelp.spend, financial: true },
                      { label: 'Conversões', value: formatDecimal(item.conversions), help: googleAdsHelp.conversions },
                      { label: 'CPA', value: formatCurrency(item.cpl), help: googleAdsHelp.cpa, financial: true },
                    ].map((metric) => (
                      <div key={metric.label}>
                        <dt className="flex items-center gap-1 text-muted-foreground">
                          {metric.label}
                          <HelpTip label={metric.label} description={metric.help} />
                        </dt>
                        <dd className="mt-1 font-bold text-foreground">
                          {metric.financial ? <FinancialValue>{metric.value}</FinancialValue> : metric.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {devices.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados por dispositivo.</p> : null}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="palavras">
          <Card className="rounded-2xl border-border/70 shadow-sm"><CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Intenção comprada" title="Palavras-chave" description="Use o índice de qualidade, CTR e CPA para ajustar lances e anúncios." />
            <div className="mt-5 overflow-auto rounded-xl border">
              <table className="w-full min-w-[1220px] text-left text-xs"><thead className="border-b bg-muted/70"><tr>
                <AdsTableHead label="Palavra-chave" />
                <AdsTableHead label="Grupo" />
                <AdsTableHead label="Correspondência" help={googleAdsHelp.matchType} />
                <AdsTableHead label="Qualidade" help={googleAdsHelp.qualityScore} align="right" />
                <AdsTableHead label="Anúncio" help={googleAdsHelp.adRelevance} />
                <AdsTableHead label="Página" help={googleAdsHelp.landingPageQuality} />
                <AdsTableHead label="CTR esperado" help={googleAdsHelp.expectedCtr} />
                <AdsTableHead label="Impressões" help={googleAdsHelp.impressions} align="right" />
                <AdsTableHead label="Cliques" help={googleAdsHelp.clicks} align="right" />
                <AdsTableHead label="CTR" help={googleAdsHelp.ctr} align="right" />
                <AdsTableHead label="Custo" help={googleAdsHelp.spend} align="right" />
                <AdsTableHead label="Conversões" help={googleAdsHelp.conversions} align="right" />
                <AdsTableHead label="CPA" help={googleAdsHelp.cpa} align="right" />
              </tr></thead><tbody className="divide-y">
                {keywords.map((item) => <tr key={`${item.campaignId}-${item.adGroupId}-${item.criterionId}`}>
                  <td className="px-3 py-3"><p className="font-semibold">{item.keyword}</p><p className="text-[11px] text-muted-foreground">{item.campaign}</p></td>
                  <td className="px-3 py-3">{item.adGroup}</td><td className="px-3 py-3">{item.matchType}</td>
                  <td className="px-3 py-3 text-right">{item.qualityScore || '—'}</td>
                  <td className="px-3 py-3">{googleAdsQualityBucketLabels[item.creativeQualityScore ?? 'UNKNOWN'] ?? item.creativeQualityScore ?? '—'}</td>
                  <td className="px-3 py-3">{googleAdsQualityBucketLabels[item.landingPageQualityScore ?? 'UNKNOWN'] ?? item.landingPageQualityScore ?? '—'}</td>
                  <td className="px-3 py-3">{googleAdsQualityBucketLabels[item.expectedCtrScore ?? 'UNKNOWN'] ?? item.expectedCtrScore ?? '—'}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(item.impressions)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(item.clicks)}</td><td className="px-3 py-3 text-right">{formatPercent(item.ctr)}</td><td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.spend)}</FinancialValue></td>
                  <td className="px-3 py-3 text-right">{formatDecimal(item.conversions)}</td><td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.cpl)}</FinancialValue></td>
                </tr>)}
              </tbody></table>
              {keywords.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Sem palavras-chave no período.</div> : null}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pesquisas">
          <Card className="rounded-2xl border-border/70 shadow-sm"><CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Demanda real" title="Termos pesquisados" description="Mostra o que a pessoa digitou antes de clicar; essencial para negativas e novas palavras." />
            <div className="mt-5 overflow-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-xs">
              <thead className="border-b bg-muted/70"><tr>
                <AdsTableHead label="Pesquisa" help={googleAdsHelp.searchTerm} />
                <AdsTableHead label="Palavra acionada" help="Palavra-chave configurada que fez o anúncio participar dessa pesquisa." />
                <AdsTableHead label="Campanha / grupo" />
                <AdsTableHead label="Impressões" help={googleAdsHelp.impressions} align="right" />
                <AdsTableHead label="Cliques" help={googleAdsHelp.clicks} align="right" />
                <AdsTableHead label="CTR" help={googleAdsHelp.ctr} align="right" />
                <AdsTableHead label="Custo" help={googleAdsHelp.spend} align="right" />
                <AdsTableHead label="Conversões" help={googleAdsHelp.conversions} align="right" />
                <AdsTableHead label="CPA" help={googleAdsHelp.cpa} align="right" />
              </tr></thead>
              <tbody className="divide-y">{searchTerms.map((item, index) => <tr key={`${item.searchTerm}-${index}`}>
                <td className="px-3 py-3 font-semibold">{item.searchTerm}</td><td className="px-3 py-3">{item.keyword || '—'}</td>
                <td className="px-3 py-3"><p>{item.campaign}</p><p className="text-[11px] text-muted-foreground">{item.adGroup}</p></td>
                <td className="px-3 py-3 text-right">{formatNumber(item.impressions)}</td><td className="px-3 py-3 text-right">{formatNumber(item.clicks)}</td><td className="px-3 py-3 text-right">{formatPercent(item.ctr)}</td>
                <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.spend)}</FinancialValue></td><td className="px-3 py-3 text-right">{formatDecimal(item.conversions)}</td><td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.cpl)}</FinancialValue></td>
              </tr>)}</tbody>
            </table>{searchTerms.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Sem termos pesquisados no período.</div> : null}</div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="paginas">
          <Card className="rounded-2xl border-border/70 shadow-sm"><CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Experiência pós-clique" title="Páginas de destino" />
            <div className="mt-5 overflow-auto rounded-xl border"><table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b bg-muted/70"><tr>
                <AdsTableHead label="URL" help={googleAdsHelp.landingPage} />
                <AdsTableHead label="Cliques" help={googleAdsHelp.clicks} align="right" />
                <AdsTableHead label="Custo" help={googleAdsHelp.spend} align="right" />
                <AdsTableHead label="Conversões" help={googleAdsHelp.conversions} align="right" />
                <AdsTableHead label="Taxa" help={googleAdsHelp.conversionRate} align="right" />
                <AdsTableHead label="CPA" help={googleAdsHelp.cpa} align="right" />
              </tr></thead>
              <tbody className="divide-y">{landingPages.map((item) => <tr key={item.url}>
                <td className="max-w-[430px] truncate px-3 py-3 font-medium" title={item.url}>{item.url}</td><td className="px-3 py-3 text-right">{formatNumber(item.clicks)}</td>
                <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.spend)}</FinancialValue></td><td className="px-3 py-3 text-right">{formatDecimal(item.conversions)}</td>
                <td className="px-3 py-3 text-right">{formatPercent(item.conversionRate)}</td><td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.cpl)}</FinancialValue></td>
              </tr>)}</tbody>
            </table>{landingPages.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Sem páginas de destino no período.</div> : null}</div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="horarios">
          <Card className="rounded-2xl border-border/70 shadow-sm"><CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Agenda" title="Desempenho por dia e hora" description="Ajuda a concentrar o orçamento nos horários que trazem conversões." />
            <div className="mt-5 overflow-auto rounded-xl border"><table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b bg-muted/70"><tr>
                <AdsTableHead label="Dia" />
                <AdsTableHead label="Hora" />
                <AdsTableHead label="Impressões" help={googleAdsHelp.impressions} align="right" />
                <AdsTableHead label="Cliques" help={googleAdsHelp.clicks} align="right" />
                <AdsTableHead label="Custo" help={googleAdsHelp.spend} align="right" />
                <AdsTableHead label="Conversões" help={googleAdsHelp.conversions} align="right" />
                <AdsTableHead label="CPA" help={googleAdsHelp.cpa} align="right" />
              </tr></thead>
              <tbody className="divide-y">{schedule.map((item, index) => <tr key={`${item.dayOfWeek}-${item.hour}-${index}`}>
                <td className="px-3 py-3 font-semibold">{googleAdsDayLabels[item.dayOfWeek] ?? item.dayOfWeek}</td><td className="px-3 py-3">{String(item.hour).padStart(2, '0')}:00</td>
                <td className="px-3 py-3 text-right">{formatNumber(item.impressions)}</td><td className="px-3 py-3 text-right">{formatNumber(item.clicks)}</td>
                <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.spend)}</FinancialValue></td><td className="px-3 py-3 text-right">{formatDecimal(item.conversions)}</td><td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.cpl)}</FinancialValue></td>
              </tr>)}</tbody>
            </table>{schedule.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Sem distribuição por horário no período.</div> : null}</div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="conversoes">
          <Card className="rounded-2xl border-border/70 shadow-sm"><CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Mensuração" title="Ações de conversão do Google Ads" description="Compare contatos do site, ligações, WhatsApp e cliente cadastrado no Retiflow. O CPA confiável permanece no resumo, pois o custo não é rateado com segurança entre as ações." />
            <div className="mt-5 overflow-auto rounded-xl border"><table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b bg-muted/70"><tr>
                <AdsTableHead label="Ação" help="Nome da ação de conversão configurada dentro do Google Ads." />
                <AdsTableHead label="Categoria" help="Tipo de objetivo informado ao Google, como contato, ligação ou lead qualificado." />
                <AdsTableHead label="Status" help={googleAdsHelp.conversionStatus} />
                <AdsTableHead label="Conversões" help={googleAdsHelp.conversions} align="right" />
                <AdsTableHead label="Todas" help={googleAdsHelp.allConversions} align="right" />
                <AdsTableHead label="Valor" help={googleAdsHelp.conversionValue} align="right" />
              </tr></thead>
              <tbody className="divide-y">{conversionActions.map((item) => <tr key={item.id}>
                <td className="px-3 py-3 font-semibold">{item.name}</td><td className="px-3 py-3">{item.category}</td><td className="px-3 py-3">{item.status}</td>
                <td className="px-3 py-3 text-right">{formatDecimal(item.conversions)}</td><td className="px-3 py-3 text-right">{formatDecimal(item.allConversions)}</td>
                <td className="px-3 py-3 text-right"><FinancialValue>{formatCurrency(item.conversionValue)}</FinancialValue></td>
              </tr>)}</tbody>
            </table>{conversionActions.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma ação de conversão registrou dados no período.</div> : null}</div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
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
          <PanelHeading
            eyebrow="Saúde das fontes"
            title="Integrações e defasagem real"
            description="Eventos internos são consultados a cada 5 minutos; GA4 e Search Console mantêm caches e atrasos próprios para proteger quotas e evitar falsa precisão."
          />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {resumo.integrations.map((integration) => (
              <IntegrationDetail key={integration.provider} integration={integration} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
          <CardContent className="min-w-0 p-4 sm:p-6">
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
            <div className="mt-5 w-full max-w-full overflow-auto rounded-xl border" role="region" aria-label="Auditoria dos eventos do site" tabIndex={0}>
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
            <Icon className={cn('h-4 w-4', integration.status === 'syncing' && 'motion-safe:animate-spin')} />
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
    <div className="space-y-3">
      <Skeleton className="h-[160px] rounded-[26px]" />
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[122px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-[320px] rounded-2xl" />
    </div>
  );
}

function normalizeCustomPeriod(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(Math.trunc(parsed), 365));
}

export default function MarketingGrowth() {
  const { realUser, operationalUser, isSupportImpersonating, isAdmin } = useAuth();
  const hasPrivateAccess = hasFullMarketingAccess(realUser);
  const isCurrentUserMegaMaster = isSuperAdmin(realUser);
  const { data: systemUsers = [], isLoading: isLoadingUsers } = useSystemUsersQuery({
    enabled: hasPrivateAccess && isAdmin && isCurrentUserMegaMaster,
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
    if (!hasPrivateAccess || !isCurrentUserMegaMaster) {
      setSelectedUserId('');
      return;
    }
    if (!selectableUsers.length) {
      setSelectedUserId('');
      return;
    }
    if (
      isSupportImpersonating
      && operationalUser?.moduleAccess?.marketing === true
      && selectableUsers.some((user) => user.id === operationalUser.id)
    ) {
      setSelectedUserId(operationalUser.id);
      return;
    }
    if (selectedUserId && selectableUsers.some((user) => user.id === selectedUserId)) return;
    const retifica = selectableUsers.find((user) => user.email?.trim().toLowerCase() === RETIFICA_PREMIUM_EMAIL);
    setSelectedUserId(retifica?.id ?? selectableUsers[0]?.id ?? '');
  }, [hasPrivateAccess, isCurrentUserMegaMaster, isSupportImpersonating, operationalUser, selectableUsers, selectedUserId]);

  const targetUserId = hasPrivateAccess && isCurrentUserMegaMaster ? selectedUserId : null;
  const queryEnabled = !hasPrivateAccess || !isCurrentUserMegaMaster || Boolean(selectedUserId);
  const requesterUserId = realUser?.id ?? '';
  const queryKey = useMemo(
    () => getMarketingResumoQueryKey(periodDays, targetUserId, requesterUserId),
    [periodDays, requesterUserId, targetUserId],
  );
  const cachedResumo = useMemo(
    () => (queryEnabled && requesterUserId
      ? readCachedMarketingResumo(periodDays, targetUserId, requesterUserId)
      : null),
    [periodDays, queryEnabled, requesterUserId, targetUserId],
  );
  const query = useQuery({
    queryKey,
    queryFn: () => getMarketingResumo(periodDays, targetUserId, requesterUserId),
    enabled: queryEnabled && Boolean(requesterUserId),
    staleTime: MARKETING_RESUMO_CACHE_TTL_MS,
    gcTime: 60 * 60_000,
    refetchInterval: MARKETING_RESUMO_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    initialData: cachedResumo?.data,
    initialDataUpdatedAt: cachedResumo?.savedAt,
    retry: 1,
  });

  const applyCustomPeriod = () => {
    const normalized = normalizeCustomPeriod(customDays);
    setCustomDays(String(normalized));
    setPeriodDays(normalized);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.06),transparent_32%),hsl(var(--background))]">
      <div className="mx-auto w-full max-w-[1680px] space-y-3 p-3 sm:p-4 lg:p-5">
        <header className="overflow-hidden rounded-[26px] bg-[#0b2035] text-white shadow-[0_18px_60px_-35px_rgba(2,15,28,0.85)]">
          <div className="relative px-4 pb-3 pt-4 sm:px-5 lg:px-6">
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,transparent,rgba(240,180,77,0.10))] lg:block" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f0b44d]">
                    {hasPrivateAccess ? 'Sala de controle da aquisição' : 'Acompanhamento do crescimento'}
                  </p>
                  {!hasPrivateAccess ? (
                    <Badge className="gap-1.5 border-sky-300/20 bg-sky-300/10 text-sky-200 hover:bg-sky-300/10">
                      <Building2 className="h-3.5 w-3.5" />
                      Visão da Retífica
                    </Badge>
                  ) : null}
                  <Badge className="gap-1.5 border-teal-300/20 bg-teal-300/10 text-teal-200 hover:bg-teal-300/10">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-teal-300 opacity-75 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-300" />
                    </span>
                    Eventos internos · 5 min
                  </Badge>
                </div>
                <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Crescimento</h1>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300 sm:text-sm">
                  {hasPrivateAccess
                    ? 'Impressão, visita, contato, cliente, O.S. e comissão no mesmo painel — com origem e disponibilidade de cada fonte explícitas.'
                    : 'Acompanhe como o site aparece no Google, recebe visitas e transforma interesse em contatos.'}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] lg:self-center">
                {hasPrivateAccess && isCurrentUserMegaMaster ? (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers || !selectableUsers.length}>
                    <SelectTrigger className="h-9 border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-[250px]">
                      <Users className="mr-2 h-4 w-4 text-amber-300" />
                      <SelectValue placeholder="Selecionar empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-9 items-center rounded-xl border border-white/15 bg-white/5 px-3 text-xs text-slate-200 sm:min-w-[250px]">
                    <Building2 className="mr-2 h-4 w-4 text-amber-300" />
                    <span className="truncate">
                      {hasPrivateAccess
                        ? query.data?.context?.targetName ?? 'Retífica Premium'
                        : query.data?.context?.targetName ?? realUser?.name ?? 'Retífica Premium'}
                    </span>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="h-9 border-white/15 bg-white/5 px-3 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => void query.refetch()}
                  disabled={!queryEnabled || query.isFetching}
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', query.isFetching && 'motion-safe:animate-spin')} />
                  {query.isFetching ? 'Atualizando' : 'Atualizar'}
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.035] px-4 py-2 sm:px-5 lg:px-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1.5">
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
                      'h-7 rounded-full px-2.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white',
                      periodDays === days && 'bg-amber-300 text-slate-950 hover:bg-amber-300 hover:text-slate-950',
                    )}
                    aria-pressed={periodDays === days}
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
                  className="h-7 w-20 border-white/15 bg-white/5 text-center text-[11px] text-white"
                  aria-label="Quantidade personalizada de dias"
                />
                <Button type="button" size="sm" variant="secondary" className="h-7 px-2.5 text-[11px]" onClick={applyCustomPeriod}>
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </header>

        {query.error && !query.data ? (
          <SectionErrorState
            title="Não foi possível carregar o painel"
            description={query.error instanceof Error ? query.error.message : 'Tente novamente em instantes.'}
            className="min-h-[280px]"
          />
        ) : null}

        {query.error && query.data ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Não foi possível atualizar agora. Os dados válidos de {formatDateTime(query.data.quality?.generatedAt)} continuam visíveis.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {!query.data && query.isLoading ? <LoadingDashboard /> : null}

        {hasPrivateAccess && isCurrentUserMegaMaster && !query.error && !query.isLoading && !isLoadingUsers && !selectableUsers.length ? (
          <SectionEmptyState
            icon={Users}
            title="Nenhuma empresa com Crescimento habilitado"
            description="Habilite o módulo Crescimento para a empresa que será analisada."
            className="min-h-[280px]"
          />
        ) : null}

        {query.data ? (
          hasPrivateAccess ? (
            <Tabs defaultValue="visao" className="space-y-4">
              <div className="pb-1">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/80 p-1 sm:grid-cols-3 lg:grid-cols-5">
                  <TabsTrigger value="visao">Resumo</TabsTrigger>
                  <TabsTrigger value="google">Google</TabsTrigger>
                  <TabsTrigger value="contatos">Contatos</TabsTrigger>
                  <TabsTrigger value="resultado">Resultados</TabsTrigger>
                  <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="visao"><OverviewTab resumo={query.data} /></TabsContent>
              <TabsContent value="google">
                <Tabs defaultValue="google-ads" className="space-y-4">
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
                    <TabsTrigger value="google-ads">Google Ads</TabsTrigger>
                    <TabsTrigger value="seo">SEO e IA</TabsTrigger>
                  </TabsList>
                  <TabsContent value="google-ads"><GoogleAdsTab resumo={query.data} /></TabsContent>
                  <TabsContent value="seo"><SeoTab resumo={query.data} /></TabsContent>
                </Tabs>
              </TabsContent>
              <TabsContent value="contatos">
                <ContactsTab
                  resumo={query.data}
                  onLinked={() => void query.refetch()}
                  canManageAttribution={query.data.context?.canManageAttribution === true}
                />
              </TabsContent>
              <TabsContent value="resultado"><ResultsTab resumo={query.data} /></TabsContent>
              <TabsContent value="qualidade"><QualityTab resumo={query.data} /></TabsContent>
            </Tabs>
          ) : (
            <Tabs defaultValue="resumo" className="space-y-4">
              <div className="pb-1">
                <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-muted/80 p-1">
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="google">Google</TabsTrigger>
                  <TabsTrigger value="contatos">Contatos</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="resumo"><BasicOverviewTab resumo={query.data} /></TabsContent>
              <TabsContent value="google"><SeoTab resumo={query.data} /></TabsContent>
              <TabsContent value="contatos"><BasicContactsTab resumo={query.data} /></TabsContent>
            </Tabs>
          )
        ) : null}

        <footer className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {hasPrivateAccess
              ? 'Visão completa protegida: KPIs e resultados aparecem para administradores autorizados; vínculos manuais continuam exclusivos do Mega Master.'
              : 'Visão resumida: nenhum nome, telefone, cliente ou valor de comissão é enviado para esta conta.'}
          </span>
          <span className="inline-flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            Resposta gerada: {formatDateTime(query.data?.quality?.generatedAt)}
          </span>
        </footer>
      </div>
    </div>
  );
}
