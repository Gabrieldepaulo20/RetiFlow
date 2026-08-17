import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  ChevronDown,
  CircleHelp,
  Clock3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileWarning,
  Gauge,
  Globe2,
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
  getMarketingRecentActivity,
  getMarketingRecentActivityQueryKey,
  getMarketingResumo,
  getMarketingResumoQueryKey,
  linkMarketingLeadToClient,
  type MarketingClientOption,
  type MarketingIntegrationSummary,
  type MarketingLeadItem,
  type MarketingPaidVisitor,
  type MarketingRecentActivity,
  type MarketingResumo,
  type MarketingSearchTotals,
} from '@/api/supabase/marketing';
import {
  MARKETING_RECENT_ACTIVITY_REFRESH_INTERVAL_MS,
  MARKETING_RESUMO_CACHE_TTL_MS,
  MARKETING_RESUMO_PRELOAD_PERIODS,
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
import {
  buildUntrackedAdsClickRows,
  type UntrackedAdsClickRow,
} from '@/lib/marketingClickLedger';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { useFinancialPrivacy } from '@/contexts/FinancialPrivacyContext';

const RETIFICA_PREMIUM_EMAIL = 'retificapremium5@gmail.com';
const periodOptions = [1, 7, 30, 60];

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
  adGroup: 'Conjunto de palavras-chave e anúncios com o mesmo tema. Grupos enxutos facilitam relevância, leitura de custo e otimização.',
  matchType: 'Regra que define o quanto a pesquisa da pessoa precisa se aproximar da palavra-chave configurada.',
  searchTerm: 'Texto que a pessoa realmente digitou no Google antes de o anúncio ser acionado.',
  landingPage: 'Primeira página do site aberta depois do clique no anúncio.',
  allConversions: 'Inclui conversões principais e secundárias. Pode ser maior que a coluna Conversões.',
  conversionStatus: 'Situação da ação no Google Ads. ENABLED significa que ela está habilitada para receber dados.',
  paidVisitor: 'Pessoa identificada quando possível; caso contrário, uma sessão anônima preservada até existir contato ou cadastro.',
  paidVisitorEvents: 'Quantidade de páginas e eventos rastreados nessa visita. Ações mostram interações de maior intenção.',
  paidVisitorStatus: 'Mostra se a sessão apenas visitou, demonstrou interesse ou já foi vinculada a um cliente cadastrado.',
  visitorOrigin: 'Como a sessão chegou ao site: anúncio pago (Google Ads), busca orgânica ou acesso direto/outra origem.',
  visitorDuration: 'Tempo ativo quando o site enviou a medição de engajamento. Nas sessões antigas, mostra apenas o intervalo entre o primeiro e o último evento e deixa essa limitação explícita.',
  visitorUrl: 'Endereço público acessado, sem parâmetros de consulta, termo pesquisado ou identificador bruto do anúncio.',
  offlineTotal: 'Clientes cadastrados que foram atribuídos a um clique de anúncio e entraram no fluxo de envio ao Google.',
  offlineUploaded: 'Conversões de cliente já aceitas pelo serviço de envio do Google.',
  offlinePending: 'Conversões aguardando processamento ou sendo processadas neste momento.',
  offlineRetry: 'Conversões temporariamente rejeitadas que serão enviadas novamente de forma automática.',
} as const;

const siteMetricHelp = {
  visitors: 'Pessoas ativas identificadas pelo Google Analytics no período, somando todas as origens. Uma mesma pessoa pode iniciar mais de uma sessão.',
  whatsapp: 'Cliques únicos rastreados no botão do WhatsApp do site. Google Ads, SEO orgânico e demais origens são classificados separadamente; o clique não confirma mensagem enviada.',
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
  custom: 'Interação na página',
};

const journeyEventLabels: Record<string, string> = {
  ...eventLabels,
  engagement_5s: 'Ativo após 5 segundos',
  engagement_10s: 'Ativo após 10 segundos',
  session_engagement: 'Tempo ativo medido',
  cta_impression: 'Ação exibida',
  cta_click: 'Clique em ação',
  quiz_start: 'Estimativa iniciada',
  quiz_flow_selected: 'Fluxo escolhido',
  quiz_option_selected: 'Opção da pergunta clicada',
  quiz_field_interaction: 'Campo da pergunta acessado',
  quiz_step_view: 'Etapa visualizada',
  quiz_step_complete: 'Etapa concluída',
  quiz_continue_blocked: 'Tentou continuar sem preencher',
  quiz_unknown_selected: 'Não sei selecionado',
  quiz_back: 'Voltou uma etapa',
  quiz_reset: 'Nova triagem iniciada',
  quiz_file_intent: 'Pretende enviar arquivo',
  quiz_result_view: 'Resultado visualizado',
  quiz_estimate_state: 'Estado da estimativa',
  quiz_whatsapp_prepared: 'Resumo para WhatsApp preparado',
  quiz_whatsapp_click: 'WhatsApp da estimativa clicado',
  instagram_click: 'Clique no Instagram',
  directions_click: 'Clique em rota',
  service_detail_click: 'Serviço acessado',
  form_field_complete: 'Campo concluído',
  scroll_depth: 'Profundidade de rolagem',
};

const quizStepLabels: Record<string, string> = {
  requester: 'Quem está solicitando',
  vehicle: 'Veículo',
  situation: 'Situação atual',
  symptoms: 'Sintomas',
  known_information: 'O que já se sabe',
  contact: 'Localização e prioridade',
  result: 'Resultado',
};

const quizFlowLabels: Record<string, string> = {
  vehicle_known: 'Sei qual é meu veículo',
  problem_unknown: 'Não sei exatamente o problema',
};

const quizOptionLabels: Record<string, string> = {
  owner: 'Proprietário do veículo',
  workshop: 'Mecânico ou oficina',
  company: 'Empresa',
  fleet: 'Frotista',
  vehicle_unknown: 'Não sei informar o veículo',
  fuel_gasoline: 'Combustível: gasolina',
  fuel_flex: 'Combustível: etanol/flex',
  fuel_diesel: 'Combustível: diesel',
  fuel_gnv: 'Combustível: GNV',
  fuel_other: 'Combustível: outro',
  fuel_unknown: 'Combustível: não sei',
  running: 'Veículo funcionando',
  stopped: 'Veículo parado',
  engine_disassembled: 'Motor desmontado',
  head_removed: 'Cabeçote já removido',
  mechanic_assessed: 'Cabeçote avaliado por mecânico',
  overheating: 'Superaquecimento',
  water_loss: 'Baixa de água',
  oil_water_mix: 'Óleo e água misturados',
  white_smoke: 'Fumaça branca',
  blue_smoke: 'Fumaça azul',
  power_loss: 'Perda de potência',
  misfires: 'Falhas',
  reservoir_pressure: 'Pressão no reservatório',
  head_gasket: 'Suspeita de junta queimada',
  noise: 'Barulho',
  returned_problem: 'Problema voltou após reparo',
  other: 'Outro',
  unknown: 'Não sei',
  none: 'Nenhum diagnóstico indicado',
  complete_rebuild: 'Retífica completa',
  surfacing: 'Plaina',
  crack_weld: 'Trinca ou solda',
  valves_guides: 'Sedes, válvulas ou guias',
  assembly: 'Montagem',
  has_files_yes: 'Tem fotos ou orçamento anterior',
  has_files_no: 'Não tem fotos ou orçamento anterior',
  urgency_urgent: 'Prazo: urgente',
  urgency_this_week: 'Prazo: nesta semana',
  urgency_researching: 'Prazo: pesquisando',
  urgency_no_deadline: 'Prazo: sem prazo',
  contact_whatsapp: 'Prefere WhatsApp',
  contact_phone: 'Prefere telefone',
  contact_take_part: 'Prefere levar a peça',
};

const quizFieldLabels: Record<string, string> = {
  vehicle_make: 'Marca do veículo',
  vehicle_model: 'Modelo do veículo',
  vehicle_year: 'Ano do veículo',
  vehicle_engine: 'Motorização',
  vehicle_fuel: 'Combustível',
  vehicle_engine_code: 'Código do motor',
  mechanic_assessment: 'Informação recebida do mecânico',
  other_symptom: 'Outro sintoma',
  diagnosis_text: 'Diagnóstico recebido',
  desired_service: 'Serviço desejado',
  city: 'Cidade',
  approximate_quantity: 'Quantidade aproximada de peças',
  part_availability: 'Disponibilidade da peça',
};

const destinationLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  estimate: 'Estimativa guiada',
  service: 'Serviço',
  contact: 'Contato',
  directions: 'Como chegar',
  video: 'Vídeo',
  other: 'Outro destino',
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
  compact = false,
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
  compact?: boolean;
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
      <CardContent className={cn('min-w-0 p-3 sm:p-3.5', compact && 'lg:p-2.5 2xl:p-3.5')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1">
            <p className="min-w-0 text-[10px] font-bold uppercase leading-4 tracking-[0.1em] text-muted-foreground">{label}</p>
            {help ? <HelpTip label={label} description={help} /> : null}
          </div>
          <div className={cn(
            'growth-metric-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm',
            compact && 'lg:h-7 lg:w-7 lg:rounded-md 2xl:h-8 2xl:w-8 2xl:rounded-lg',
            accents[accent],
          )}>
            <Icon className={cn('h-4 w-4', compact && 'lg:h-3.5 lg:w-3.5 2xl:h-4 2xl:w-4')} />
          </div>
        </div>
        <p className={cn(
          'mt-2 break-words text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl',
          compact && 'lg:mt-1.5 lg:text-lg 2xl:mt-2 2xl:text-2xl',
        )}>
          {financial ? <FinancialValue>{value}</FinancialValue> : value}
        </p>
        <p className={cn('mt-0.5 text-[11px] leading-4 text-muted-foreground', compact && 'lg:text-[10px] lg:leading-[0.875rem] 2xl:text-[11px] 2xl:leading-4')}>
          {financialDetail ? <FinancialValue>{detail}</FinancialValue> : detail}
        </p>
        {delta ? (
          <div className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            compact && 'lg:mt-1.5 lg:px-1.5 lg:text-[9px] 2xl:mt-2 2xl:px-2 2xl:text-[10px]',
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

/**
 * Cabeçalho de seção compacto.
 *
 * A versão anterior empilhava rótulo, título grande e parágrafo — cerca de
 * 100px antes de qualquer dado aparecer. São 34 seções no painel, então o
 * custo somado passava de 3.000px de rolagem. Em tablet de 11" em paisagem,
 * com ~700px úteis de altura, isso é o que fazia a informação começar na
 * segunda ou terceira tela.
 *
 * Agora rótulo e título ficam na mesma linha e a descrição vira uma linha só,
 * com o texto completo no `title` para quem quiser ler. Nada foi removido —
 * só deixou de ocupar três linhas o que cabe em uma.
 */
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
    <div
      data-testid="panel-heading"
      className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">{title}</h2>
          {eyebrow ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">{eyebrow}</p>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground" title={description}>
            {description}
          </p>
        ) : null}
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

function getSiteWhatsappOriginCounts(resumo: MarketingResumo) {
  const total = Math.max(0, Math.trunc(
    resumo.site.whatsapp?.uniqueClicks ?? resumo.site.current.whatsappClicks,
  ));
  const reportedPaid = resumo.site.whatsapp?.paidClicks
    ?? resumo.campaigns.paidActions?.whatsappClicks
    ?? 0;
  const paid = Math.min(total, Math.max(0, Math.trunc(reportedPaid)));
  const reportedOrganic = resumo.site.whatsapp?.organicClicks;
  const reportedOther = resumo.site.whatsapp?.otherClicks;
  const organicValue = Number(reportedOrganic);
  const otherValue = Number(reportedOther);
  const hasCompleteClassification = Number.isInteger(organicValue)
    && organicValue >= 0
    && Number.isInteger(otherValue)
    && otherValue >= 0
    && paid + organicValue + otherValue === total;
  const organic = hasCompleteClassification ? Math.max(0, Number(reportedOrganic)) : null;
  const other = hasCompleteClassification ? Math.max(0, Number(reportedOther)) : null;

  return {
    total,
    paid,
    organic,
    other,
    classificationReady: hasCompleteClassification,
  };
}

function formatSiteWhatsappOriginDetail(origins: ReturnType<typeof getSiteWhatsappOriginCounts>) {
  if (!origins.classificationReady) {
    return `${formatNumber(origins.paid)} Google Ads · SEO aguardando atualização segura`;
  }

  return `${formatNumber(origins.paid)} Google Ads · ${formatNumber(origins.organic)} SEO · ${formatNumber(origins.other)} demais`;
}

function WhatsappOriginBreakdown({ resumo }: { resumo: MarketingResumo }) {
  const adClicks = (resumo.campaigns.clickTypes ?? [])
    .filter((item) => item.type === 'CLICK_TO_MESSAGE_THIRD_PARTY_CLICK')
    .reduce((total, item) => total + item.clicks, 0);
  const siteWhatsappOrigins = getSiteWhatsappOriginCounts(resumo);
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
      label: 'Site após anúncio',
      value: formatNumber(siteWhatsappOrigins.paid),
      detail: 'Entraram por mídia paga e clicaram no WhatsApp do site',
      icon: ExternalLink,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      iconTone: 'bg-emerald-600 text-white',
    },
    {
      label: 'Site · SEO orgânico',
      value: siteWhatsappOrigins.organic === null ? '—' : formatNumber(siteWhatsappOrigins.organic),
      detail: siteWhatsappOrigins.classificationReady
        ? 'Busca orgânica confirmada pela origem do site'
        : 'Aguardando a classificação oficial da fonte',
      icon: Globe2,
      tone: 'border-teal-200 bg-teal-50 text-teal-950',
      iconTone: 'bg-teal-600 text-white',
    },
    {
      label: 'Site · demais origens',
      value: siteWhatsappOrigins.other === null ? '—' : formatNumber(siteWhatsappOrigins.other),
      detail: siteWhatsappOrigins.classificationReady
        ? 'Acesso direto, indicação, IA ou outra origem'
        : 'Sem estimar orgânico a partir do restante',
      icon: MousePointerClick,
      tone: 'border-violet-200 bg-violet-50 text-violet-950',
      iconTone: 'bg-violet-600 text-white',
    },
    {
      label: 'Perfil da Empresa',
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
          description="Google Ads, SEO orgânico, demais origens do site e Perfil da Empresa ficam separados. Clique não confirma mensagem enviada."
        />
        <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-5">
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
  const siteWhatsappOrigins = getSiteWhatsappOriginCounts(resumo);
  const showInternalDailyActions = resumo.quality?.actionMetricsSource !== 'ga4';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Metric
          label="Visitantes · todas as origens"
          value={formatNumber(current.visits)}
          detail={`${formatNumber(current.sessions)} visitas no período`}
          help={siteMetricHelp.visitors}
          icon={Users}
          current={current.visits}
          previous={previous.visits}
          accent="navy"
        />
        <Metric
          label="WhatsApp no site · todas as origens"
          value={formatNumber(siteWhatsappOrigins.total)}
          detail={formatSiteWhatsappOriginDetail(siteWhatsappOrigins)}
          help={siteMetricHelp.whatsapp}
          icon={MessageCircle}
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
                  detail: 'Cliques nos resultados orgânicos do Google',
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

function VisitorSessionsCard({ resumo }: { resumo: MarketingResumo }) {
  const allVisitors = resumo.campaigns.allVisitors ?? [];
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<'all' | 'paid' | 'organic' | 'other'>('all');
  const [estimateOnly, setEstimateOnly] = useState(false);
  const isEstimateVisitor = (visitor: (typeof allVisitors)[number]) => (
    visitor.landingPage === '/quanto-custa'
    || visitor.lastPage === '/quanto-custa'
    || visitor.pages?.some((page) => page.path === '/quanto-custa')
    || visitor.actions?.some((action) => (
      action.pagePath === '/quanto-custa'
      || (action.eventName ?? action.detail ?? '').startsWith('quiz_')
    ))
  );
  const estimateVisitors = allVisitors.filter(isEstimateVisitor);
  const visibleVisitors = allVisitors.filter((visitor) => (
    (originFilter === 'all' || visitor.originType === originFilter)
    && (!estimateOnly || isEstimateVisitor(visitor))
  ));

  const originLabel = (originType: 'paid' | 'organic' | 'other') => (
    originType === 'paid' ? 'Google Ads' : originType === 'organic' ? 'Orgânico' : 'Direto / outros'
  );
  const originClassName = (originType: 'paid' | 'organic' | 'other') => (
    originType === 'paid'
      ? 'border-violet-700 bg-violet-700 text-white'
      : originType === 'organic'
        ? 'border-sky-600 bg-sky-600 text-white'
        : 'border-slate-300 bg-slate-100 text-slate-700'
  );
  const sourceLabel = (source: string) => {
    const normalized = source.trim().toLowerCase();
    if (normalized === 'google') return 'Google';
    if (normalized === 'bing') return 'Bing';
    if (['direto', 'direct', '(direct)'].includes(normalized)) return 'Direto';
    return source || 'Origem não informada';
  };
  const engagementPresentation = (level: NonNullable<(typeof allVisitors)[number]['engagementLevel']>) => ({
    converted: { label: 'Virou cliente', className: 'border-emerald-700 bg-emerald-700 text-white' },
    contact: { label: 'Entrou em contato', className: 'border-teal-700 bg-teal-700 text-white' },
    engaged: { label: 'Engajou', className: 'border-amber-300 bg-amber-300 text-slate-950' },
    brief: { label: 'Saída rápida', className: 'border-rose-600 bg-rose-600 text-white' },
    unknown: { label: 'Tempo não medido', className: 'border-slate-300 bg-slate-100 text-slate-600' },
  }[level]);
  const measurementLabel = (visitor: (typeof allVisitors)[number]) => ({
    consented: 'Com consentimento',
    anonymous: 'Sessão anônima',
    mixed: 'Medição mista',
    unknown: 'Não informada',
  }[visitor.measurementMode ?? 'unknown']);
  const originFilters = [
    { value: 'all' as const, label: 'Tudo', count: allVisitors.length },
    { value: 'paid' as const, label: 'Google Ads', count: allVisitors.filter((visitor) => visitor.originType === 'paid').length },
    { value: 'organic' as const, label: 'Orgânico', count: allVisitors.filter((visitor) => visitor.originType === 'organic').length },
    { value: 'other' as const, label: 'Direto / outros', count: allVisitors.filter((visitor) => visitor.originType === 'other').length },
  ];

  return (
    <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
      <CardContent className="min-w-0 p-4 sm:p-5 lg:p-4 2xl:p-6">
        <PanelHeading
          eyebrow="Jornada no site"
          title="De onde vieram e por onde passaram"
          description="Cada linha reúne origem, página de entrada, caminho em ordem, modo de medição, tempo e resultado. Termos brutos não são associados à sessão individual."
          action={(
            <div className="flex max-w-full flex-wrap justify-end gap-1.5">
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="group" aria-label="Filtrar jornadas por origem">
                {originFilters.map((filter) => (
                  <Button
                    key={filter.value}
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={originFilter === filter.value}
                    onClick={() => setOriginFilter(filter.value)}
                    className={cn(
                      'h-7 shrink-0 rounded-lg px-2.5 text-[10px] font-bold',
                      originFilter === filter.value
                        ? 'bg-slate-950 text-white hover:bg-slate-950 hover:text-white'
                        : 'text-slate-600 hover:bg-white',
                    )}
                  >
                    {filter.label} <span className="ml-1 opacity-65">{filter.count}</span>
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={estimateOnly}
                onClick={() => setEstimateOnly((current) => !current)}
                className={cn(
                  'h-9 rounded-xl px-3 text-[10px] font-bold',
                  estimateOnly && 'border-amber-400 bg-amber-300 text-slate-950 hover:bg-amber-300',
                )}
              >
                Só /quanto-custa <span className="ml-1 opacity-65">{estimateVisitors.length}</span>
              </Button>
            </div>
          )}
        />
        <div className="mt-3 max-h-[34rem] w-full max-w-full overflow-auto rounded-xl border 2xl:mt-5" role="region" aria-label="Jornadas das sessões do site" tabIndex={0}>
          <table className="w-full min-w-[850px] table-fixed text-left text-xs 2xl:min-w-[980px]">
            <thead className="sticky top-0 z-20 border-b bg-slate-50/95 text-[10px] uppercase tracking-[0.1em] text-slate-500 backdrop-blur">
              <tr>
                <th className="w-[126px] px-3 py-2.5 font-semibold">Data e hora</th>
                <AdsTableHead label="Origem" help={googleAdsHelp.visitorOrigin} />
                <th className="w-[34%] px-3 py-2.5 font-semibold">Entrada e caminho</th>
                <th className="w-[18%] px-3 py-2.5 font-semibold">Medição</th>
                <AdsTableHead label="Tempo" help={googleAdsHelp.visitorDuration} align="right" />
                <AdsTableHead label="Resultado" help={googleAdsHelp.paidVisitorStatus} />
                <th scope="col" className="w-11 px-2 py-2"><span className="sr-only">Detalhes</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleVisitors.map((visitor) => {
                const sessionKey = `${visitor.visitorId}-${visitor.firstSeenAt}`;
                const expanded = expandedSession === sessionKey;
                const pages = visitor.pages ?? [];
                const actions = visitor.actions ?? [];
                const estimateSession = isEstimateVisitor(visitor);
                const quizActions = actions.filter((action) => (
                  (action.eventName ?? action.detail ?? '').startsWith('quiz_')
                ));
                const durationSource = visitor.durationSource ?? 'event_interval';
                const engagementLevel = visitor.engagementLevel
                  ?? (visitor.convertedClient ? 'converted' : visitor.actionCount > 0 ? 'contact' : 'unknown');
                const engagement = engagementPresentation(engagementLevel);
                const entryUrl = visitor.landingUrl ?? `https://www.premiumretifica.com.br${visitor.landingPage}`;
                return (
                <Fragment key={sessionKey}>
                <tr className={cn('transition-colors', expanded && 'bg-slate-50/80')}>
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(visitor.firstSeenAt)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={cn('whitespace-nowrap font-bold', originClassName(visitor.originType))}>
                      {originLabel(visitor.originType)}
                    </Badge>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-600" title={`${visitor.source} / ${visitor.medium}`}>
                      {sourceLabel(visitor.source)} · {visitor.medium}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <a href={entryUrl} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 font-semibold text-slate-900 hover:text-sky-700 hover:underline" title={entryUrl}>
                      <span className="truncate">{visitor.landingPage || '/'}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden" aria-label={`Caminho com ${pages.length} páginas`}>
                      {(pages.length ? pages : [{ path: visitor.landingPage }]).slice(0, 3).map((page, index) => (
                        <Fragment key={`${page.path}-${index}`}>
                          {index > 0 ? <span className="text-slate-300">→</span> : null}
                          <span className="max-w-[92px] truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600" title={page.path}>
                            {index + 1}. {page.path}
                          </span>
                        </Fragment>
                      ))}
                      {pages.length > 3 ? <span className="text-[9px] font-bold text-slate-500">+{pages.length - 3}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-slate-700">{measurementLabel(visitor)}</p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <p className="font-semibold text-foreground">{formatDuration(visitor.durationSeconds)}</p>
                    <p className="text-[10px] text-muted-foreground">{durationSource === 'active' ? 'tempo ativo' : 'entre eventos'}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={cn('whitespace-nowrap font-bold', engagement.className)}>
                      {engagement.label}
                    </Badge>
                    {estimateSession ? (
                      <p className={cn(
                        'mt-1 text-[9px] font-semibold',
                        quizActions.length ? 'text-teal-700' : 'text-amber-700',
                      )}>
                        {quizActions.length
                          ? `${quizActions.length} ação(ões) na estimativa`
                          : 'Só abriu /quanto-custa'}
                      </p>
                    ) : actions.length ? (
                      <p className="mt-1 text-[9px] font-semibold text-teal-700">{actions.length} ação(ões)</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalhes da sessão ${visitor.visitorId}`}
                      aria-expanded={expanded}
                      onClick={() => setExpandedSession(expanded ? null : sessionKey)}
                    >
                      <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                    </Button>
                  </td>
                </tr>
                {expanded ? (
                  <tr>
                    <td colSpan={7} className="bg-slate-50/70 px-3 py-3 sm:px-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Caminho completo no site</p>
                          <div className="mt-2 space-y-1.5">
                            {pages.length ? pages.map((page, index) => (
                              <div key={`${page.occurredAt}-${page.path}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[9px] font-bold text-amber-300">{index + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={page.url ?? `https://www.premiumretifica.com.br${page.path}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="flex min-w-0 items-center gap-1 font-semibold text-slate-800 hover:text-sky-700 hover:underline"
                                    title={page.url ?? page.path}
                                  >
                                    <span className="truncate">{page.url ?? `https://www.premiumretifica.com.br${page.path}`}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                  <p className="truncate text-[10px] text-slate-500">{page.title ?? formatDateTime(page.occurredAt)}</p>
                                </div>
                              </div>
                            )) : <p className="text-xs text-slate-500">Nenhuma abertura de página registrada.</p>}
                            {visitor.pagesTruncated ? <p className="text-[10px] text-amber-700">A lista foi limitada às 100 primeiras páginas desta sessão.</p> : null}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Ações realizadas</p>
                          {estimateSession && quizActions.length === 0 ? (
                            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                              A sessão abriu /quanto-custa, mas nenhuma pergunta ou botão da estimativa foi rastreado.
                            </p>
                          ) : null}
                          <div className="mt-2 space-y-1.5">
                            {actions.length ? actions.map((action, index) => {
                              const actionName = action.eventName ?? action.detail ?? action.type;
                              const optionLabel = action.optionId
                                ? quizOptionLabels[action.optionId] ?? action.optionId
                                : null;
                              const fieldLabel = action.fieldId
                                ? quizFieldLabels[action.fieldId] ?? action.fieldId
                                : null;
                              const stepLabel = action.stepId
                                ? quizStepLabels[action.stepId] ?? action.stepId
                                : null;
                              const flowLabel = action.flowType
                                ? quizFlowLabels[action.flowType] ?? action.flowType
                                : null;
                              const selectionLabel = action.interactionAction === 'unselect'
                                ? 'desmarcou'
                                : action.interactionAction === 'select'
                                  ? 'marcou'
                                  : null;
                              const actionDetails = [
                                actionName === 'quiz_flow_selected' && flowLabel ? `fluxo: ${flowLabel}` : null,
                                stepLabel,
                                optionLabel ? `${selectionLabel ?? 'opção'}: ${optionLabel}` : null,
                                fieldLabel ? `campo: ${fieldLabel} (conteúdo não exibido)` : null,
                                action.validationReason ? 'preenchimento obrigatório pendente' : null,
                                action.detail && !action.detail.startsWith('quiz_') ? action.detail : null,
                              ].filter(Boolean);
                              return (
                              <div key={`${action.occurredAt}-${action.type}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[9px] font-bold text-amber-300">{index + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold text-slate-800">{journeyEventLabels[actionName] ?? eventLabels[action.type] ?? actionName}</p>
                                  <p className="truncate text-[10px] text-slate-500">{action.pagePath}{actionDetails.length ? ` · ${actionDetails.join(' · ')}` : ''}</p>
                                </div>
                                <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(action.occurredAt)}</span>
                              </div>
                              );
                            }) : <p className="text-xs text-slate-500">Nenhuma ação adicional registrada.</p>}
                            {visitor.actionsTruncated ? <p className="text-[10px] text-amber-700">A lista foi limitada às 100 primeiras ações desta sessão.</p> : null}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-[10px] leading-4 text-slate-500">
                        Entrada:{' '}
                        <a className="font-semibold text-slate-700 hover:underline" href={visitor.landingUrl ?? `https://www.premiumretifica.com.br${visitor.landingPage}`} target="_blank" rel="noreferrer noopener">
                          {visitor.landingUrl ?? `https://www.premiumretifica.com.br${visitor.landingPage}`}
                        </a>
                        {' '}· Saída rastreada:{' '}
                        <a className="font-semibold text-slate-700 hover:underline" href={visitor.lastUrl ?? `https://www.premiumretifica.com.br${visitor.lastPage}`} target="_blank" rel="noreferrer noopener">
                          {visitor.lastUrl ?? `https://www.premiumretifica.com.br${visitor.lastPage}`}
                        </a>
                      </p>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );})}
            </tbody>
          </table>
          {visibleVisitors.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma jornada encontrada neste filtro.
            </div>
          ) : null}
        </div>
        <p className="mt-2.5 text-[10px] leading-4 text-slate-400 2xl:mt-4 2xl:text-xs 2xl:leading-relaxed">
          Mostrando {formatNumber(visibleVisitors.length)} de {formatNumber(allVisitors.length)} jornadas rastreadas. “Tempo ativo” é medido pelo site;
          “entre eventos” é apenas um piso e não permite afirmar que a pessoa saiu imediatamente. Termos brutos não aparecem nesta visão individual.
        </p>
      </CardContent>
    </Card>
  );
}

export function OverviewTab({ resumo }: { resumo: MarketingResumo }) {
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const business = resumo.business?.current ?? resumo.executive?.business;
  const pagesPerSession = current.sessions ? (current.pageViews ?? 0) / current.sessions : 0;
  const previousPagesPerSession = previous.sessions ? (previous.pageViews ?? 0) / previous.sessions : 0;
  const siteWhatsappOrigins = getSiteWhatsappOriginCounts(resumo);
  const showInternalDailyActions = resumo.quality?.actionMetricsSource !== 'ga4';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Metric
          label="Visitantes · todas as origens"
          value={formatNumber(current.visits)}
          detail={`${formatNumber(current.sessions)} visitas no período`}
          help={siteMetricHelp.visitors}
          icon={Users}
          current={current.visits}
          previous={previous.visits}
          accent="navy"
        />
        <Metric
          label="WhatsApp no site · todas as origens"
          value={formatNumber(siteWhatsappOrigins.total)}
          detail={formatSiteWhatsappOriginDetail(siteWhatsappOrigins)}
          help={siteMetricHelp.whatsapp}
          icon={MessageCircle}
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

      <VisitorSessionsCard resumo={resumo} />
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
  const siteWhatsappOrigins = getSiteWhatsappOriginCounts(resumo);
  const channels = [
    {
      label: 'WhatsApp · todas as origens',
      description: formatSiteWhatsappOriginDetail(siteWhatsappOrigins),
      value: siteWhatsappOrigins.total,
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
        <Metric label="WhatsApp no site · todas as origens" value={formatNumber(siteWhatsappOrigins.total)} detail={formatSiteWhatsappOriginDetail(siteWhatsappOrigins)} help={siteMetricHelp.whatsapp} icon={MessageCircle} accent="teal" />
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

export function ContactsTab({
  resumo,
  onLinked,
  canManageAttribution,
}: {
  resumo: MarketingResumo;
  onLinked: () => void;
  canManageAttribution: boolean;
}) {
  const forms = resumo.forms?.current;
  const siteWhatsappOrigins = getSiteWhatsappOriginCounts(resumo);
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
      <div data-testid="contacts-summary-grid" className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 2xl:gap-3">
        <Metric compact label="WhatsApp no site · todas as origens" value={formatNumber(siteWhatsappOrigins.total)} detail={formatSiteWhatsappOriginDetail(siteWhatsappOrigins)} help={siteMetricHelp.whatsapp} icon={MessageCircle} accent="teal" />
        <Metric compact label="Cliques no telefone" value={formatNumber(resumo.site.current.phoneClicks)} detail="Intenções de ligação" icon={PhoneCall} current={resumo.site.current.phoneClicks} previous={resumo.site.previous.phoneClicks} accent="navy" />
        <Metric compact label="Formulários iniciados" value={formatNumber(forms?.starts)} detail={`${formatNumber(forms?.submits)} enviados com sucesso`} icon={FileWarning} current={forms?.starts} previous={resumo.forms?.previous.starts} accent="gold" />
        <Metric compact label="Taxa de conclusão" value={formatPercent(forms?.completionRate)} detail={`${formatNumber(forms?.abandons)} abandonos detectados`} icon={MailCheck} accent="violet" />
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
        <div data-testid="results-client-grid" className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 2xl:gap-3">
          <Metric compact label="Clientes novos" value={formatNumber(business?.newClients)} detail="Primeiro atendimento confirmado" help="Clientes marcados como novos no cadastro ou cujo primeiro contato digital aconteceu antes da criação no Retiflow." icon={UserCheck} current={business?.newClients} previous={previous?.newClients} accent="teal" />
          <Metric compact label="Já eram clientes" value={formatNumber(business?.existingClients)} detail="Retorno de cliente conhecido" help="Pessoas que já eram clientes antes deste novo contato de marketing." icon={Users} current={business?.existingClients} previous={previous?.existingClients} accent="navy" />
          <Metric compact label="Sem classificação" value={formatNumber(business?.unknownClients)} detail="A equipe ainda não confirmou" help="Clientes atribuídos cuja situação como novo ou antigo ainda não pôde ser comprovada." icon={CircleHelp} current={business?.unknownClients} previous={previous?.unknownClients} accent="violet" />
          <Metric compact label="Clientes via ligação" value={formatNumber(business?.confirmedCalls)} detail="Ligação do anúncio confirmada" help={googleAdsHelp.confirmedCallClients} icon={PhoneCall} current={business?.confirmedCalls} previous={previous?.confirmedCalls} accent="gold" />
        </div>
      </section>

      <div data-testid="results-value-grid" className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 2xl:gap-3">
        <Metric
          compact
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
          compact
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
          compact
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
          compact
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

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
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

const untrackedAdsClickPresentation: Record<UntrackedAdsClickRow['kind'], {
  label: string;
  status: string;
  className: string;
}> = {
  site: {
    label: 'Clique no site',
    status: 'Sem sessão medida',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  whatsapp_ad: {
    label: 'Clique direto no WhatsApp',
    status: 'Ação direta no anúncio',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  whatsapp_landing: {
    label: 'WhatsApp intermediário',
    status: 'Ação direta no anúncio',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  call_ad: {
    label: 'Clique direto para ligar',
    status: 'Ação direta no anúncio',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  other: {
    label: 'Outro clique',
    status: 'Somente agregado pelo Google',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

function PaidClickLedger({
  officialClicks,
  paidVisitors,
  untrackedClicks,
}: {
  officialClicks: number;
  paidVisitors: MarketingPaidVisitor[];
  untrackedClicks: UntrackedAdsClickRow[];
}) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const missingSiteSessions = untrackedClicks.filter((row) => row.kind === 'site').length;
  const directAdActions = untrackedClicks.filter((row) => (
    row.kind === 'whatsapp_ad' || row.kind === 'whatsapp_landing' || row.kind === 'call_ad'
  )).length;
  const activeTimeSessions = paidVisitors.filter((visitor) => visitor.durationSource === 'active').length;
  const averageMeasuredDuration = paidVisitors.length
    ? Math.round(paidVisitors.reduce((total, visitor) => total + visitor.durationSeconds, 0) / paidVisitors.length)
    : 0;
  const ledgerRows = paidVisitors.length + untrackedClicks.length;
  const engagementLabel = (visitor: MarketingPaidVisitor) => {
    if (visitor.engagementLevel === 'converted' || visitor.convertedClient) return 'Virou cliente';
    if (visitor.engagementLevel === 'contact' || visitor.actionCount > 0) return 'Realizou contato';
    if (visitor.engagementLevel === 'engaged') return 'Engajou';
    if (visitor.engagementLevel === 'brief') return 'Saída rápida';
    return 'Tempo não medido';
  };

  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="min-w-0 p-4 sm:p-5 lg:p-4 2xl:p-6">
        <PanelHeading
          eyebrow="Conferência clique a clique"
          title="Quem veio pelos anúncios e o que aconteceu"
          description="Sessões reais recebem URL, tempo ativo, caminho e ações. Cliques conhecidos apenas pelo Google permanecem visíveis, mas sem horário, pessoa ou duração inventados."
        />

        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-5">
          {[
            { label: 'Cliques oficiais', value: officialClicks, detail: 'Google Ads' },
            { label: 'Sessões no site', value: paidVisitors.length, detail: 'rastreadas individualmente' },
            {
              label: 'Tempo médio medido',
              value: averageMeasuredDuration,
              detail: paidVisitors.length === 0
                ? 'nenhuma sessão medida'
                : activeTimeSessions === paidVisitors.length
                  ? 'tempo ativo'
                  : 'inclui piso entre eventos',
              duration: true,
            },
            { label: 'Sem sessão medida', value: missingSiteSessions, detail: 'clicaram no site, sem evento' },
            { label: 'Ações no anúncio', value: directAdActions, detail: 'WhatsApp ou ligação direta' },
          ].map((item) => (
            <div key={item.label} className="min-w-0 bg-white px-3 py-2.5">
              <p className="truncate text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">{item.label}</p>
              <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
                <p className="text-lg font-black leading-none text-slate-950">
                  {item.duration ? (paidVisitors.length ? formatDuration(item.value) : '—') : formatNumber(item.value)}
                </p>
                <p className="truncate text-[9px] text-slate-500">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 max-h-[32rem] w-full max-w-full overflow-auto rounded-xl border" role="region" aria-label="Conferência de cliques e sessões do Google Ads" tabIndex={0}>
          <table className="w-full min-w-[900px] text-left text-xs 2xl:min-w-[1040px]">
            <thead className="sticky top-0 z-20 border-b bg-slate-50/95 text-[10px] uppercase tracking-[0.11em] text-slate-500 backdrop-blur">
              <tr>
                <AdsTableHead label="Horário" />
                <AdsTableHead label="Origem" help={googleAdsHelp.visitorOrigin} />
                <AdsTableHead label="Tipo" help={googleAdsHelp.clicks} />
                <AdsTableHead label="Destino e caminho" help={googleAdsHelp.visitorUrl} />
                <AdsTableHead label="Tempo" help={googleAdsHelp.visitorDuration} align="right" />
                <AdsTableHead label="Páginas / ações" help={googleAdsHelp.paidVisitorEvents} align="right" />
                <AdsTableHead label="Situação" help={googleAdsHelp.paidVisitorStatus} />
                <th scope="col" className="w-11 px-2 py-2"><span className="sr-only">Detalhes</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paidVisitors.map((visitor) => {
                const sessionKey = `${visitor.visitorId}-${visitor.firstSeenAt}`;
                const expanded = expandedSession === sessionKey;
                const pages = visitor.pages ?? [];
                const actions = visitor.actions ?? [];
                const pageCount = visitor.pageViewCount ?? Math.max(1, pages.length);
                const actionCount = visitor.activityCount
                  ?? (visitor.actions ? actions.length : visitor.actionCount);
                const durationSource = visitor.durationSource ?? 'event_interval';
                const entryUrl = visitor.landingUrl ?? `https://www.premiumretifica.com.br${visitor.landingPage}`;
                const sessionStatus = engagementLabel(visitor);
                return (
                  <Fragment key={sessionKey}>
                    <tr className={cn('transition-colors', expanded && 'bg-slate-50/80')}>
                      <td className="px-3 py-2 text-slate-500">{formatDateTime(visitor.firstSeenAt)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="whitespace-nowrap border-violet-700 bg-violet-700 font-bold text-white">Google Ads</Badge>
                        <p className="mt-1 text-[10px] font-semibold text-slate-500">{visitor.source} · {visitor.medium}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="whitespace-nowrap border-violet-200 bg-violet-50 text-violet-700">Clique no site</Badge>
                      </td>
                      <td className="max-w-[260px] px-3 py-2">
                        <a href={entryUrl} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 font-semibold text-slate-800 hover:text-sky-700 hover:underline" title={entryUrl}>
                          <span className="truncate">{entryUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
                          {(pages.length ? pages : [{ path: visitor.landingPage }]).slice(0, 3).map((page, pageIndex) => (
                            <Fragment key={`${page.path}-${pageIndex}`}>
                              {pageIndex > 0 ? <span className="text-slate-300">→</span> : null}
                              <span className="max-w-[80px] truncate rounded bg-slate-100 px-1 py-0.5 text-[8px] font-semibold text-slate-600" title={page.path}>
                                {pageIndex + 1}. {page.path}
                              </span>
                            </Fragment>
                          ))}
                          {pages.length > 3 ? <span className="text-[8px] font-bold text-slate-500">+{pages.length - 3}</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <p className="font-semibold text-slate-950">{formatDuration(visitor.durationSeconds)}</p>
                        <p className="text-[9px] text-slate-500">{durationSource === 'active' ? 'tempo ativo' : 'piso entre eventos'}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <p className="font-semibold text-slate-950">{formatNumber(pageCount)} pág.</p>
                        <p className="text-[9px] text-slate-500">{formatNumber(actionCount)} ações</p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={cn('whitespace-nowrap', sessionStatus === 'Virou cliente'
                          ? 'border-emerald-700 bg-emerald-700 font-bold text-white'
                          : sessionStatus === 'Realizou contato'
                            ? 'border-teal-700 bg-teal-700 font-bold text-white'
                            : sessionStatus === 'Engajou'
                              ? 'border-amber-300 bg-amber-300 font-bold text-slate-950'
                            : sessionStatus === 'Saída rápida'
                              ? 'border-rose-600 bg-rose-600 font-bold text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-600')}>
                          {sessionStatus}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalhes da sessão ${visitor.visitorId}`}
                          aria-expanded={expanded}
                          onClick={() => setExpandedSession(expanded ? null : sessionKey)}
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                        </Button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/70 px-3 py-3 sm:px-4">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Caminho no site</p>
                              <div className="mt-2 space-y-1.5">
                                {pages.length ? pages.map((page, index) => (
                                  <div key={`${page.occurredAt}-${page.path}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[9px] font-bold text-amber-300">{index + 1}</span>
                                    <div className="min-w-0 flex-1">
                                      <a href={page.url ?? `https://www.premiumretifica.com.br${page.path}`} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 font-semibold text-slate-800 hover:text-sky-700 hover:underline">
                                        <span className="truncate">{page.url ?? `https://www.premiumretifica.com.br${page.path}`}</span>
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                      </a>
                                      <p className="truncate text-[10px] text-slate-500">{page.title ?? formatDateTime(page.occurredAt)}</p>
                                    </div>
                                  </div>
                                )) : <p className="text-xs text-slate-500">Nenhuma abertura adicional registrada.</p>}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Ações realizadas</p>
                              <div className="mt-2 space-y-1.5">
                                {actions.length ? actions.map((action, index) => (
                                  <div key={`${action.occurredAt}-${action.type}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-slate-800">{eventLabels[action.type] ?? action.type}</p>
                                      <p className="truncate text-[10px] text-slate-500">{action.pagePath}{action.detail ? ` · ${action.detail}` : ''}</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(action.occurredAt)}</span>
                                  </div>
                                )) : <p className="text-xs text-slate-500">Nenhuma ação adicional registrada.</p>}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {untrackedClicks.map((click) => {
                const presentation = untrackedAdsClickPresentation[click.kind];
                return (
                  <tr key={click.id} className="bg-rose-50/20">
                    <td className="px-3 py-2 text-slate-400">Horário não fornecido</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="whitespace-nowrap border-violet-200 bg-violet-50 font-bold text-violet-700">Google Ads</Badge>
                      <p className="mt-1 text-[10px] text-slate-500">Sem sessão rastreada</p>
                    </td>
                    <td className="px-3 py-2"><Badge variant="outline" className={cn('whitespace-nowrap', presentation.className)}>{presentation.label}</Badge></td>
                    <td className="max-w-[260px] px-3 py-2 text-slate-600">
                      {click.destinationUrl ? (
                        <a href={click.destinationUrl} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 font-semibold hover:text-sky-700 hover:underline" title={click.destinationUrl}>
                          <span className="truncate">{click.destinationLabel}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : <span>{click.destinationLabel}</span>}
                      <p className="mt-1 text-[9px] text-slate-400">Busca não individualizada pelo Google</p>
                    </td>
                    <td className="px-3 py-2 text-right"><p className="font-semibold text-slate-500">—</p><p className="text-[9px] text-slate-400">sem sessão</p></td>
                    <td className="px-3 py-2 text-right"><p className="font-semibold text-slate-500">—</p><p className="text-[9px] text-slate-400">não informado</p></td>
                    <td className="px-3 py-2"><Badge variant="outline" className={cn('whitespace-nowrap', presentation.className)}>{presentation.status}</Badge></td>
                    <td className="px-2 py-2" />
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ledgerRows === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Nenhum clique ou sessão paga no período.</div>
          ) : null}
        </div>

        <p className="mt-2.5 text-[10px] leading-4 text-slate-500">
          {formatNumber(ledgerRows)} linhas de conferência para {formatNumber(officialClicks)} cliques oficiais. {formatNumber(activeTimeSessions)} sessão(ões) já têm tempo ativo medido.
          Linhas “sem sessão” vêm dos totais agregados do Google Ads: o Google não fornece pessoa, horário individual nem duração desses cliques, e o Retiflow não inventa esses dados.
        </p>
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
  const siteWhatsappOrigins = getSiteWhatsappOriginCounts(resumo);
  const paidSiteWhatsappPoints = (siteWhatsapp?.points ?? [])
    .filter((point) => point.paidClicks > 0);
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
  const untrackedAdClicks = buildUntrackedAdsClickRows({
    totalClicks: current.clicks,
    paidVisitors,
    landingPages,
    clickTypes,
  });

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
      <section aria-label="Alcance e custo dos anúncios" className="space-y-3">
        <PanelHeading
          eyebrow="Alcance e custo"
          title="Quanto investimos e quantas interações tivemos?"
          description="O total de cliques reúne site, WhatsApp, ligação e outras interações registradas pelo Google. A divisão principal aparece logo abaixo."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-2.5 [&_.growth-metric-icon]:hidden 2xl:[&_.growth-metric-icon]:flex">
          <Metric compact label="Investimento" value={formatCurrency(current.spend)} detail="Custo oficial no período" help={googleAdsHelp.spend} icon={BadgeDollarSign} current={current.spend} previous={ads.previous?.spend} accent="navy" financial />
          <Metric compact label="Impressões" value={formatNumber(current.impressions)} detail="Exibições dos anúncios" help={googleAdsHelp.impressions} icon={Eye} current={current.impressions} previous={ads.previous?.impressions} accent="violet" />
          <Metric compact label="Cliques totais" value={formatNumber(current.clicks)} detail="Site + WhatsApp + outros" help={googleAdsHelp.clicks} icon={MousePointerClick} current={current.clicks} previous={ads.previous?.clicks} accent="teal" />
          <Metric compact label="CTR" value={formatPercent(current.ctr)} detail="Cliques ÷ impressões" help={googleAdsHelp.ctr} icon={Target} accent="violet" />
          <Metric compact label="CPC médio" value={formatCurrency(current.averageCpc)} detail="Custo médio por clique" help={googleAdsHelp.averageCpc} icon={Gauge} accent="gold" financial />
        </div>
      </section>

      <section aria-label="Divisão dos cliques dos anúncios" className="space-y-2.5">
        <PanelHeading
          eyebrow="Destino dos cliques"
          title="Para onde foram os cliques?"
          description="Os cliques do anúncio e os cliques feitos dentro do site ficam separados para não misturar etapas diferentes."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2.5">
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
            </>
          ) : (
            <div className="col-span-full flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
              <div>
                <MousePointerClick className="mx-auto h-5 w-5 text-slate-500" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-800">Detalhamento aguardando sincronização</p>
                <p className="mt-1 text-[11px] text-slate-500">O total continua correto; a divisão chegará na próxima atualização do Google Ads.</p>
              </div>
            </div>
          )}
          <ClickBreakdownItem
            label="WhatsApp no site após anúncio"
            value={siteWhatsappOrigins.paid}
            detail="Somente pessoas identificadas como vindas da mídia paga"
            help="Cliques únicos no WhatsApp dentro do site, limitados às sessões com identificador de anúncio ou origem Google paga. Não inclui busca orgânica, acesso direto, indicação ou IA."
            icon={ExternalLink}
            tone="teal"
            footer={<span>{siteWhatsappOrigins.classificationReady
              ? `${formatNumber(siteWhatsappOrigins.organic)} SEO · ${formatNumber(siteWhatsappOrigins.other)} demais ficam no Resumo`
              : 'SEO e demais origens aguardam a classificação oficial'}</span>}
          />
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
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

        {paidSiteWhatsappPoints.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Onde visitantes dos anúncios clicaram no WhatsApp</p>
            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2">
              {paidSiteWhatsappPoints.slice(0, 4).map((point) => (
                <div key={`${point.eventLabel}:${point.pagePath}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px]">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[10px] font-semibold leading-3 text-slate-800">{formatWhatsappPointLabel(point.eventLabel, point.pagePath)}</p>
                    <p className="truncate text-[9px] text-slate-500">{point.pagePath}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-black text-slate-950">{formatNumber(point.paidClicks)}</p>
                    <p className="text-[8px] font-semibold text-emerald-700">após anúncio</p>
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 [&_.growth-metric-icon]:hidden 2xl:[&_.growth-metric-icon]:flex">
          <Metric compact label="Conversões primárias" value={formatDecimal(current.conversions)} detail="Ações usadas na otimização" help={googleAdsHelp.conversions} icon={Target} current={current.conversions} previous={ads.previous?.conversions} accent="violet" />
          <Metric compact label="Todas as conversões" value={formatDecimal(current.allConversions)} detail="Primárias + secundárias" help={googleAdsHelp.allConversions} icon={ListChecks} current={current.allConversions} previous={ads.previous?.allConversions} accent="navy" />
          <Metric compact label="Taxa de conversão" value={formatPercent(current.conversionRate)} detail="Conversões ÷ cliques" help={googleAdsHelp.conversionRate} icon={ArrowUpRight} accent="teal" />
          <Metric compact label="CPA" value={formatCurrency(current.cpl)} detail="Custo por conversão principal" help={googleAdsHelp.cpa} icon={BadgeDollarSign} accent="rose" financial />
          <Metric compact label="Valor das conversões" value={formatCurrency(current.conversionValue)} detail={`${formatCurrency(current.valuePerConversion)} por conversão`} help={`${googleAdsHelp.conversionValue} ${googleAdsHelp.valuePerConversion}`} icon={Sparkles} accent="teal" financial financialDetail />
        </div>
      </section>

      <section aria-label="Cobertura e qualidade dos anúncios" className="space-y-3">
        <PanelHeading
          eyebrow="Cobertura e qualidade"
          title="Onde estamos perdendo oportunidades?"
          description="Esses indicadores ajudam a decidir se o gargalo está no orçamento, na posição ou na qualidade do tráfego."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-2.5 [&_.growth-metric-icon]:hidden 2xl:[&_.growth-metric-icon]:flex">
          <Metric compact label="Parcela de impressões" value={formatPercent(current.searchImpressionShare)} detail="Cobertura possível na Pesquisa" help={googleAdsHelp.searchImpressionShare} icon={Gauge} accent="navy" />
          <Metric compact label="Perdida por orçamento" value={formatPercent(current.searchBudgetLostImpressionShare)} detail="Limitação de verba" help={googleAdsHelp.searchBudgetLostImpressionShare} icon={AlertTriangle} accent="rose" />
          <Metric compact label="Perdida por classificação" value={formatPercent(current.searchRankLostImpressionShare)} detail="Lance, qualidade e relevância" help={googleAdsHelp.searchRankLostImpressionShare} icon={Search} accent="violet" />
          <Metric compact label="Topo da página" value={formatPercent(current.searchTopImpressionShare)} detail="Acima dos resultados orgânicos" help={googleAdsHelp.searchTopImpressionShare} icon={ArrowUpRight} accent="teal" />
          <Metric compact label="Primeira posição" value={formatPercent(current.searchAbsoluteTopImpressionShare)} detail="Topo absoluto da pesquisa" help={googleAdsHelp.searchAbsoluteTopImpressionShare} icon={Target} accent="gold" />
          <Metric compact label="Cliques inválidos" value={formatNumber(current.invalidClicks)} detail={`${formatPercent(current.invalidClickRate)} dos cliques filtrados`} help={googleAdsHelp.invalidClicks} icon={ShieldCheck} accent="navy" />
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.45fr)]">
        <Card className="min-w-0 rounded-2xl border-border/70 shadow-sm">
          <CardContent className="min-w-0 p-4 sm:p-5 lg:p-4 2xl:p-6">
            <PanelHeading
              eyebrow="Evolução diária"
              title="Investimento, cliques e conversões"
              description="Dados oficiais do Google Ads, com cache de até 10 minutos."
            />
            <div className="mt-4 h-[260px] min-w-0 2xl:mt-5 2xl:h-[300px]">
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

        <Card className="self-start rounded-2xl border-border/70 bg-slate-950 text-white shadow-sm">
          <CardContent className="p-4 2xl:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Conversão de cliente</p>
            <h3 className="mt-1 text-lg font-bold 2xl:text-xl">Retiflow → Google Ads</h3>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-400 2xl:mt-2 2xl:text-sm 2xl:leading-relaxed">
              Cada cliente atribuído a um clique do anúncio entra numa fila privada e idempotente.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 2xl:mt-5">
              {[
                { label: 'Total', value: offline?.total ?? 0, help: googleAdsHelp.offlineTotal },
                { label: 'Enviadas', value: offline?.uploaded ?? 0, help: googleAdsHelp.offlineUploaded },
                { label: 'Na fila', value: (offline?.pending ?? 0) + (offline?.processing ?? 0), help: googleAdsHelp.offlinePending },
                { label: 'Nova tentativa', value: offline?.retry ?? 0, help: googleAdsHelp.offlineRetry },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-2.5 2xl:p-3">
                  <div className="flex items-start gap-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
                    <HelpTip label={item.label} description={item.help} className="text-slate-500 hover:bg-white/10 hover:text-white focus-visible:ring-amber-300 focus-visible:ring-offset-slate-950" />
                  </div>
                  <p className="mt-1 text-lg font-bold text-white 2xl:mt-2 2xl:text-xl">{formatNumber(Number(item.value))}</p>
                </div>
              ))}
            </div>
            <div className={cn(
              'mt-2.5 rounded-xl border p-2.5 text-[11px] leading-4 2xl:mt-3 2xl:p-3 2xl:text-xs 2xl:leading-relaxed',
              offline?.failed
                ? 'border-rose-300/30 bg-rose-300/10 text-rose-100'
                : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
            )}>
              {offline?.failed
                ? `${formatNumber(offline.failed)} envio(s) requerem revisão.`
                : 'Nenhuma conversão com falha definitiva.'}
            </div>
            <p className="mt-2.5 text-[10px] leading-4 text-slate-400 2xl:mt-4 2xl:text-xs 2xl:leading-relaxed">
              Telefone/e-mail fazem o vínculo automático. Conversas só pelo WhatsApp usam o código RP informado no cadastro.
            </p>
          </CardContent>
        </Card>
      </div>

      <PaidClickLedger
        officialClicks={current.clicks}
        paidVisitors={paidVisitors}
        untrackedClicks={untrackedAdClicks}
      />

      <Tabs defaultValue="campanhas" className="min-w-0 space-y-4">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="grid h-auto w-full min-w-[720px] grid-cols-7 gap-1 rounded-xl bg-muted/80 p-1 md:min-w-0">
            <TabsTrigger value="campanhas" className="whitespace-nowrap">Campanhas</TabsTrigger>
            <TabsTrigger value="dispositivos" className="whitespace-nowrap">Dispositivos</TabsTrigger>
            <TabsTrigger value="palavras" className="whitespace-nowrap">Palavras-chave</TabsTrigger>
            <TabsTrigger value="pesquisas" className="whitespace-nowrap">Pesquisas</TabsTrigger>
            <TabsTrigger value="paginas" className="whitespace-nowrap">Páginas</TabsTrigger>
            <TabsTrigger value="horarios" className="whitespace-nowrap">Horários</TabsTrigger>
            <TabsTrigger value="conversoes" className="whitespace-nowrap">Conversões</TabsTrigger>
          </TabsList>
        </div>

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

function JourneyTableCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card">
      <CardContent className="p-0">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function JourneyTab({
  resumo,
  recentActivity,
  recentActivityLoading = false,
  recentActivityError = null,
}: {
  resumo: MarketingResumo;
  recentActivity?: MarketingRecentActivity;
  recentActivityLoading?: boolean;
  recentActivityError?: string | null;
}) {
  const journey = resumo.site.journey;
  if (!journey) {
    return (
      <SectionEmptyState
        icon={Activity}
        title="Jornada ainda sem dados agregados"
        description="Assim que a nova leitura do site estiver disponível, retenção, cliques e etapas aparecerão aqui."
        className="min-h-[280px]"
      />
    );
  }

  const whatsapp = journey.contactChannels.find((item) => item.channel === 'whatsapp');
  const phone = journey.contactChannels.find((item) => item.channel === 'phone');
  const form = journey.contactChannels.find((item) => item.channel === 'form');
  const locations = journey.locations;
  const visibleLocationSessions = locations?.groups.reduce((total, item) => total + item.sessions, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <Metric
          label="Sessões rastreadas"
          value={formatNumber(journey.measurement.trackedSessions)}
          detail={`${formatNumber(journey.measurement.activeTimeMeasuredSessions)} com tempo ativo medido`}
          help="Sessões próprias do site no período. A leitura não inclui pessoas que bloquearam ou impediram o carregamento da medição."
          icon={Users}
          accent="navy"
        />
        <Metric
          label="Ativas em 5 segundos"
          value={formatPercent(journey.retention.active5sRate)}
          detail={`${formatNumber(journey.retention.active5sSessions)} de ${formatNumber(journey.retention.eligibleSessions)} sessões elegíveis`}
          help="Sinal ativo observado após cinco segundos entre sessões com página visualizada. Ausência do sinal não prova rejeição."
          icon={Clock3}
          accent="gold"
        />
        <Metric
          label="Ativas em 10 segundos"
          value={formatPercent(journey.retention.active10sRate)}
          detail={`${formatNumber(journey.retention.active10sSessions)} de ${formatNumber(journey.retention.eligibleSessions)} sessões elegíveis`}
          help="Sinal ativo observado após dez segundos. É a base comparável para acompanhar a meta de retenção."
          icon={Activity}
          accent="teal"
        />
        <Metric
          label="Sessões que clicaram"
          value={formatNumber(journey.clicks.uniqueSessions)}
          detail={`${formatNumber(journey.clicks.totalEvents)} cliques rastreados`}
          help="Visitantes únicos que clicaram em uma ação relevante. Cliques decorativos não entram."
          icon={MousePointerClick}
          accent="violet"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-xs leading-5 text-sky-950">
          <p className="font-semibold">Leitura de retenção com escopo explícito</p>
          <p className="mt-0.5 text-sky-800">
            “Sem sinal” significa apenas que o avanço não foi rastreado. Não é tratado como abandono confirmado nem como pessoa perdida.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800">WhatsApp: {formatNumber(whatsapp?.sessions)} sessões</Badge>
          <Badge variant="outline" className="bg-sky-50 text-sky-800">Telefone: {formatNumber(phone?.sessions)} sessões</Badge>
          <Badge variant="outline" className="bg-violet-50 text-violet-800">Formulário: {formatNumber(form?.sessions)} sessões</Badge>
        </div>
      </div>

      <JourneyTableCard
        title="Cidades informadas na jornada"
        description="Somente cidades digitadas voluntariamente em sessões com consentimento analítico. Cada sessão conta uma vez e locais com menos de três sessões ficam ocultos."
      >
        {locations ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-700" />
                {formatNumber(visibleLocationSessions)} sessões nos grupos exibidos
              </span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800">
                Privacidade: mínimo de {locations.minimumSessions} sessões
              </Badge>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead className="border-b bg-muted/60 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cidade / UF</th>
                    <th className="px-4 py-3 text-right font-semibold">Sessões únicas</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {locations.groups.map((item) => (
                    <tr key={`${item.city}-${item.region ?? 'sem-uf'}`}>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {item.city}{item.region ? ` / ${item.region}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNumber(item.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {locations.groups.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma cidade atingiu o mínimo de três sessões consentidas neste período.
                </p>
              ) : null}
            </div>
            {locations.groupsTruncated ? (
              <p className="border-t px-4 py-2 text-xs text-amber-700">Exibindo as 100 cidades com mais sessões.</p>
            ) : null}
          </>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            A leitura agregada de cidade aguarda a atualização da fonte do painel.
          </p>
        )}
      </JourneyTableCard>

      <JourneyTableCard
        title="Onde as pessoas clicaram"
        description="Destino, componente e posição de cada ação relevante, com visitantes únicos separados por origem."
      >
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b bg-muted/60 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Página e ação</th>
                <th className="px-3 py-3 font-semibold">Componente / posição</th>
                <th className="px-3 py-3 font-semibold">Destino</th>
                <th className="px-3 py-3 font-semibold">Variante</th>
                <th className="px-3 py-3 text-right font-semibold">Sessões</th>
                <th className="px-3 py-3 text-right font-semibold">Pago</th>
                <th className="px-3 py-3 text-right font-semibold">Orgânico</th>
                <th className="px-3 py-3 text-right font-semibold">Eventos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {journey.clicks.groups.map((item) => (
                <tr key={`${item.eventName}-${item.pagePath}-${item.componentId}-${item.position}-${item.destinationType}-${item.destinationPath ?? 'sem-destino'}-${item.experimentId ?? 'sem-experimento'}-${item.variantId ?? 'sem-variante'}`}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-foreground">{item.pagePath}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{journeyEventLabels[item.eventName] ?? item.eventName}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-foreground">{item.componentId === 'not_informed' ? 'Não informado' : item.componentId}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{item.position === 'not_informed' ? 'posição não informada' : item.position}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{destinationLabels[item.destinationType] ?? item.destinationType}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{item.destinationPath ?? 'destino externo ou não informado'}</p>
                  </td>
                  <td className="px-3 py-3">{item.experimentId && item.variantId ? `${item.experimentId} · ${item.variantId}` : 'Sem experimento'}</td>
                  <td className="px-3 py-3 text-right font-semibold">{formatNumber(item.sessions)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(item.paidSessions)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(item.organicSessions)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(item.events)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {journey.clicks.groups.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhum clique relevante rastreado no período.</p>
          ) : null}
        </div>
        {journey.clicks.groupsTruncated ? (
          <p className="border-t px-4 py-2 text-xs text-amber-700">Exibindo os 100 grupos mais relevantes; refine o período para analisar a cauda.</p>
        ) : null}
      </JourneyTableCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <JourneyTableCard
          title="Abandono possível por etapa"
          description="A coluna sem avanço aponta ausência de próxima etapa rastreada; não afirma abandono definitivo."
        >
          <div className="overflow-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="border-b bg-muted/60 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-semibold">Fluxo / etapa</th>
                  <th className="px-3 py-3 text-right font-semibold">Viram</th>
                  <th className="px-3 py-3 text-right font-semibold">Avançaram</th>
                  <th className="px-3 py-3 text-right font-semibold">Taxa</th>
                  <th className="px-3 py-3 text-right font-semibold">Sem avanço rastreado</th>
                  <th className="px-3 py-3 text-right font-semibold">Voltaram</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {journey.quizSteps.map((step) => (
                  <tr key={`${step.experimentId ?? 'sem-exp'}-${step.variantId ?? 'sem-var'}-${step.flowType ?? 'sem-fluxo'}-${step.stepId}`}>
                    <td className="px-3 py-3">
                      <p className="font-semibold">{step.stepId}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{step.flowType ?? 'fluxo não informado'} · {step.variantId ?? 'sem variante'}</p>
                    </td>
                    <td className="px-3 py-3 text-right">{formatNumber(step.views)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatNumber(step.advancedSessions)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(step.advanceRate)}</td>
                    <td className="px-3 py-3 text-right text-amber-700">{formatNumber(step.possibleDropOffSessions)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(step.backEvents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {journey.quizSteps.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">O quiz ainda não recebeu etapas rastreadas neste período.</p>
            ) : null}
            {journey.quizStepsTruncated ? (
              <p className="border-t px-4 py-2 text-xs text-amber-700">Exibindo as primeiras 100 combinações de fluxo e etapa do recorte.</p>
            ) : null}
          </div>
        </JourneyTableCard>

        <JourneyTableCard
          title="Variantes do experimento"
          description="Resultados por visitante, sem multiplicar a conversão por quantidade de eventos."
        >
          <div className="overflow-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b bg-muted/60 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-semibold">Experimento / variante</th>
                  <th className="px-3 py-3 text-right font-semibold">Sessões</th>
                  <th className="px-3 py-3 text-right font-semibold">5 s</th>
                  <th className="px-3 py-3 text-right font-semibold">10 s</th>
                  <th className="px-3 py-3 text-right font-semibold">Quiz iniciado</th>
                  <th className="px-3 py-3 text-right font-semibold">Contato</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {journey.variants.map((variant) => (
                  <tr key={`${variant.experimentId}-${variant.variantId}`}>
                    <td className="px-3 py-3"><p className="font-semibold">{variant.variantId}</p><p className="text-[11px] text-muted-foreground">{variant.experimentId}</p></td>
                    <td className="px-3 py-3 text-right font-semibold">{formatNumber(variant.sessions)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(variant.active5sRate)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(variant.active10sRate)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(variant.quizStartSessions)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatPercent(variant.contactRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {journey.variants.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma variante identificada no período.</p>
            ) : null}
            {journey.variantsTruncated ? (
              <p className="border-t px-4 py-2 text-xs text-amber-700">Exibindo as 50 variantes com mais sessões.</p>
            ) : null}
          </div>
        </JourneyTableCard>
      </div>

      <JourneyTableCard
        title="Retenção e contato por página"
        description="Compara a sobrevivência ativa e a intenção de contato de cada rota do site."
      >
        <div className="overflow-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="border-b bg-muted/60 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Página</th>
                <th className="px-3 py-3 text-right font-semibold">Sessões</th>
                <th className="px-3 py-3 text-right font-semibold">Visualizações</th>
                <th className="px-3 py-3 text-right font-semibold">Ativas 5 s</th>
                <th className="px-3 py-3 text-right font-semibold">Ativas 10 s</th>
                <th className="px-3 py-3 text-right font-semibold">Cliques CTA</th>
                <th className="px-3 py-3 text-right font-semibold">Contato</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {journey.pages.map((page) => (
                <tr key={page.pagePath}>
                  <td className="px-3 py-3 font-semibold">{page.pagePath}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(page.sessions)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(page.views)}</td>
                  <td className="px-3 py-3 text-right">{formatPercent(page.active5sRate)}</td>
                  <td className="px-3 py-3 text-right">{formatPercent(page.active10sRate)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(page.ctaClickSessions)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatPercent(page.contactRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {journey.pages.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma página rastreada no período.</p> : null}
          {journey.pagesTruncated ? <p className="border-t px-4 py-2 text-xs text-amber-700">Exibindo as 100 páginas com mais sessões.</p> : null}
        </div>
      </JourneyTableCard>

      {recentActivity || recentActivityLoading || recentActivityError ? (
        <JourneyTableCard
          title="Atividade recente do site"
          description="Atualiza a cada 30 segundos somente com a aba visível. Identificadores são pseudonimizados e nenhum texto livre, telefone ou nome aparece aqui."
        >
          {recentActivityError ? (
            <div role="alert" className="border-b bg-amber-50 px-4 py-3 text-xs text-amber-900">{recentActivityError}</div>
          ) : null}
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b bg-muted/60 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-semibold">Horário</th>
                  <th className="px-3 py-3 font-semibold">Visita</th>
                  <th className="px-3 py-3 font-semibold">Ação</th>
                  <th className="px-3 py-3 font-semibold">Página</th>
                  <th className="px-3 py-3 font-semibold">Componente / etapa</th>
                  <th className="px-3 py-3 font-semibold">Origem</th>
                  <th className="px-3 py-3 font-semibold">Dispositivo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(recentActivity?.items ?? []).map((item) => (
                  <tr key={item.activityId}>
                    <td className="whitespace-nowrap px-3 py-3">{formatDateTime(item.occurredAt)}</td>
                    <td className="px-3 py-3 font-mono text-[11px]">{item.visitorToken.slice(-8)}</td>
                    <td className="px-3 py-3"><p className="font-semibold">{journeyEventLabels[item.eventName] ?? item.eventName}</p><p className="text-[11px] text-muted-foreground">{item.contactState === 'identified' ? 'contato identificado' : item.contactState === 'intent' ? 'intenção de contato' : 'anônima'}</p></td>
                    <td className="px-3 py-3 font-medium">{item.pagePath}</td>
                    <td className="px-3 py-3">
                      <p>{item.stepId ? quizStepLabels[item.stepId] ?? item.stepId : item.componentId ?? 'Não informado'}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.optionId
                          ? `${item.interactionAction === 'unselect' ? 'Desmarcou' : 'Marcou'}: ${quizOptionLabels[item.optionId] ?? item.optionId}`
                          : item.fieldId
                            ? `Acessou: ${quizFieldLabels[item.fieldId] ?? item.fieldId}`
                            : item.validationReason
                              ? 'Preenchimento obrigatório pendente'
                              : item.eventName === 'quiz_flow_selected' && item.flowType
                                ? `Fluxo: ${quizFlowLabels[item.flowType] ?? item.flowType}`
                              : destinationLabels[item.destinationType] ?? item.destinationType}
                      </p>
                    </td>
                    <td className="px-3 py-3"><p className="font-medium">{item.source} / {item.medium}</p><p className="text-[11px] text-muted-foreground">{item.campaign ?? item.originType}</p></td>
                    <td className="px-3 py-3">{item.deviceType ?? 'não informado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentActivityLoading && !recentActivity?.items.length ? (
              <div className="p-6"><Skeleton className="h-24 w-full rounded-xl" /></div>
            ) : null}
            {!recentActivityLoading && recentActivity && recentActivity.items.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma atividade recente encontrada.</p>
            ) : null}
          </div>
        </JourneyTableCard>
      ) : null}
    </div>
  );
}

export function QualityTab({ resumo }: { resumo: MarketingResumo }) {
  const quality = resumo.quality;

  return (
    <div className="space-y-5">
      <div data-testid="quality-summary-grid" className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 2xl:gap-3">
        <Metric compact label="Último evento" value={quality?.lastEventAt ? formatDateTime(quality.lastEventAt).split(' ')[0] : 'Pendente'} detail={quality?.lastEventAt ? formatDateTime(quality.lastEventAt) : 'Nenhum evento direto'} icon={Activity} accent="teal" />
        <Metric compact label="Falhas de alerta" value={formatNumber(quality?.alertFailures)} detail="Requerem revisão imediata" icon={AlertTriangle} accent={quality?.alertFailures ? 'rose' : 'navy'} />
        <Metric compact label="Cliques repetidos" value={formatNumber(quality?.duplicatedClicks)} detail="Não entram no total único" icon={MousePointerClick} accent="gold" />
        <Metric compact label="Contatos sem cliente" value={formatNumber(quality?.unlinkedLeads)} detail="Aguardando vínculo por código" icon={UserCheck} accent="violet" />
      </div>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <PanelHeading
            eyebrow="Saúde das fontes"
            title="Integrações e defasagem real"
            description="Eventos internos são consultados a cada 5 minutos; GA4 e Search Console mantêm caches e atrasos próprios para proteger quotas e evitar falsa precisão."
          />
          <div data-testid="quality-integrations-grid" className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 2xl:gap-3">
            {resumo.integrations.map((integration) => (
              <IntegrationDetail key={integration.provider} integration={integration} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <PanelHeading eyebrow="Marcos do piloto" title="Snapshots congelados" description="D0, D30, D60 e D90 permitem comprovar a evolução sem reescrever o passado." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(resumo.snapshots ?? []).map((snapshot) => {
                const metrics = snapshot.metrics as { marker?: string };
                return (
                  <div key={`${snapshot.snapshot_type}-${snapshot.period_start}`} className="flex gap-3 rounded-xl border bg-background p-3">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-amber-400 shadow-sm" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{metrics.marker ?? snapshot.snapshot_type}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(snapshot.generated_at)}</p>
                    </div>
                  </div>
                );
              })}
              {(resumo.snapshots ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum snapshot congelado ainda.</p>
              ) : null}
            </div>
          </CardContent>
      </Card>
    </div>
  );
}

function IntegrationDetail({ integration }: { integration: MarketingIntegrationSummary }) {
  const style = statusStyle[integration.status] ?? statusStyle.not_connected;
  const Icon = style.icon;
  return (
    <div className="min-w-0 rounded-xl border bg-background p-3 lg:p-2.5 2xl:p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-amber-300 lg:h-7 lg:w-7 lg:rounded-md 2xl:h-8 2xl:w-8 2xl:rounded-lg">
          <Icon className={cn('h-4 w-4 lg:h-3.5 lg:w-3.5 2xl:h-4 2xl:w-4', integration.status === 'syncing' && 'motion-safe:animate-spin')} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground 2xl:text-sm">{providerLabels[integration.provider] ?? integration.provider}</p>
          <p className="truncate text-[10px] leading-4 text-muted-foreground 2xl:text-xs">{integration.accountName ?? 'Conta ainda não informada'}</p>
        </div>
        <Badge variant="outline" className={cn('shrink-0 px-1.5 py-0 text-[9px] 2xl:text-[10px]', style.className)}>{style.label}</Badge>
      </div>
      <div className="mt-2 border-t pt-2 text-[10px] leading-4 text-muted-foreground 2xl:text-xs">
        <p className="line-clamp-2">{integration.freshness ?? 'Sem informação de atualização'}</p>
        <p className="mt-0.5 truncate">Leitura: {formatDateTime(integration.lastSyncAt)}</p>
        {integration.lastError ? <p className="mt-1 line-clamp-2 text-amber-700">{integration.lastError}</p> : null}
      </div>
    </div>
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
  const queryClient = useQueryClient();
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
  const recentActivityEnabled = Boolean(
    queryEnabled
    && requesterUserId
    && targetUserId
    && hasPrivateAccess
    && isCurrentUserMegaMaster
    && query.data?.context?.canViewRecentActivity === true,
  );
  const recentActivityQuery = useQuery({
    queryKey: getMarketingRecentActivityQueryKey(targetUserId, requesterUserId),
    queryFn: () => getMarketingRecentActivity({
      targetUserId: targetUserId!,
      requesterUserId,
      limit: 50,
    }),
    enabled: recentActivityEnabled,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchInterval: MARKETING_RECENT_ACTIVITY_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });

  useEffect(() => {
    if (!queryEnabled || !requesterUserId) return;

    const inactivePreloadPeriods = MARKETING_RESUMO_PRELOAD_PERIODS.filter((days) => days !== periodDays);
    void Promise.all(inactivePreloadPeriods.map((days) => queryClient.prefetchQuery({
      queryKey: getMarketingResumoQueryKey(days, targetUserId, requesterUserId),
      queryFn: () => getMarketingResumo(days, targetUserId, requesterUserId),
      staleTime: MARKETING_RESUMO_CACHE_TTL_MS,
      gcTime: 60 * 60_000,
    }))).catch(() => {
      // O painel ativo continua funcional mesmo se um periodo secundario nao puder ser antecipado.
    });
  }, [periodDays, queryClient, queryEnabled, requesterUserId, targetUserId]);

  const applyCustomPeriod = () => {
    const normalized = normalizeCustomPeriod(customDays);
    setCustomDays(String(normalized));
    setPeriodDays(normalized);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.06),transparent_32%),hsl(var(--background))]">
      <div className="mx-auto w-full max-w-[1680px] space-y-3 p-3 sm:p-4 lg:p-5">
        <header className="overflow-hidden rounded-[22px] bg-[#0b2035] text-white shadow-[0_18px_60px_-35px_rgba(2,15,28,0.85)]">
          <div className="relative px-4 py-3 sm:px-5 lg:px-5">
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,transparent,rgba(240,180,77,0.10))] lg:block" />
            <div className="relative grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0 max-w-3xl">
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
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Crescimento</h1>
              </div>

              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,180px)_auto] lg:self-center xl:grid-cols-[minmax(0,190px)_auto]">
                {hasPrivateAccess && isCurrentUserMegaMaster ? (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers || !selectableUsers.length}>
                    <SelectTrigger className="h-9 min-w-0 border-white/15 bg-white/5 text-white hover:bg-white/10">
                      <Users className="mr-2 h-4 w-4 text-amber-300" />
                      <SelectValue placeholder="Selecionar empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-9 min-w-0 items-center rounded-xl border border-white/15 bg-white/5 px-3 text-xs text-slate-200">
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
                  className="h-9 shrink-0 border-white/15 bg-white/5 px-3 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    void query.refetch();
                    if (recentActivityEnabled) void recentActivityQuery.refetch();
                  }}
                  disabled={!queryEnabled || query.isFetching || recentActivityQuery.isFetching}
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', (query.isFetching || recentActivityQuery.isFetching) && 'motion-safe:animate-spin')} />
                  {query.isFetching || recentActivityQuery.isFetching ? 'Atualizando' : 'Atualizar'}
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
                    {days} {days === 1 ? 'dia' : 'dias'}
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
              <div className="w-full overflow-x-auto pb-1">
                <TabsList className="grid h-auto min-w-[680px] grid-cols-6 gap-1 rounded-xl bg-muted/80 p-1 md:min-w-0">
                  <TabsTrigger value="visao">Resumo</TabsTrigger>
                  <TabsTrigger value="jornada">Jornada</TabsTrigger>
                  <TabsTrigger value="google">Google</TabsTrigger>
                  <TabsTrigger value="contatos">Contatos</TabsTrigger>
                  <TabsTrigger value="resultado">Resultados</TabsTrigger>
                  <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="visao"><OverviewTab resumo={query.data} /></TabsContent>
              <TabsContent value="jornada">
                <JourneyTab
                  resumo={query.data}
                  recentActivity={recentActivityQuery.data}
                  recentActivityLoading={recentActivityEnabled && recentActivityQuery.isLoading}
                  recentActivityError={recentActivityEnabled && recentActivityQuery.error
                    ? recentActivityQuery.error instanceof Error
                      ? recentActivityQuery.error.message
                      : 'Não foi possível atualizar a atividade recente.'
                    : null}
                />
              </TabsContent>
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
                <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-xl bg-muted/80 p-1">
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="jornada">Jornada</TabsTrigger>
                  <TabsTrigger value="google">Google</TabsTrigger>
                  <TabsTrigger value="contatos">Contatos</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="resumo"><BasicOverviewTab resumo={query.data} /></TabsContent>
              <TabsContent value="jornada"><JourneyTab resumo={query.data} /></TabsContent>
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
