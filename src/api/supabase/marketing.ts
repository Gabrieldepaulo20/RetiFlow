import { supabase } from '@/lib/supabase';
import {
  getMarketingResumoCacheKey,
  writeCachedMarketingResumo,
} from './marketingCache';

export type MarketingProvider = 'ga4' | 'search_console' | 'clarity' | 'meta_ads' | 'google_ads' | 'internal';
export type MarketingIntegrationStatus = 'not_connected' | 'connected' | 'needs_attention' | 'syncing' | 'disabled';

export interface MarketingConfigSummary {
  moduloHabilitado: boolean;
  ga4Status: MarketingIntegrationStatus | 'not_connected';
  searchConsoleStatus?: MarketingIntegrationStatus | 'not_connected';
  hasSiteKey: boolean;
  allowedOrigins: string[];
  updatedAt: string | null;
  ga4PropertyId?: string | null;
  searchConsoleSiteUrl?: string | null;
  pilotStartDate?: string | null;
  pilotEndDate?: string | null;
  commissionRate?: number;
  dedupeWindowMinutes?: number;
  adsMonthlyBudget?: number;
  organicGoalMin?: number;
  organicGoalMax?: number;
  qualifiedCallSeconds?: number;
}

export interface MarketingIntegrationSummary {
  provider: MarketingProvider;
  status: MarketingIntegrationStatus;
  accountName?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  freshness?: string;
}

export interface MarketingSiteTotals {
  visits: number;
  sessions?: number;
  pageViews?: number;
  whatsappClicks: number;
  phoneClicks?: number;
  formViews?: number;
  formStarts?: number;
  formAbandons?: number;
  formSubmitAttempts?: number;
  formValidationErrors?: number;
  formSubmitErrors?: number;
  formSubmits: number;
  totalEvents?: number;
  actionEvents?: number;
  engagementRate?: number;
  averageSessionDuration?: number;
  engagedSessions?: number;
  leads: number;
  conversionRate?: number;
}

export interface MarketingPageMetric {
  path: string;
  title?: string | null;
  views: number;
  conversions: number;
}

export interface MarketingSourceMetric {
  source: string;
  medium: string;
  visits: number;
  leads: number;
}

export interface MarketingDailyMetric {
  date: string;
  visits: number;
  sessions?: number;
  pageViews?: number;
  actions: number;
  leads: number;
}

export interface MarketingEventItem {
  id_marketing_site_eventos?: string;
  external_event_id?: string | null;
  lead_code?: string | null;
  event_type: string;
  channel?: string | null;
  occurred_at: string;
  session_id?: string | null;
  anonymous_id?: string | null;
  page_path?: string | null;
  page_title?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  device_type?: string | null;
  last_field?: string | null;
  validation_reason?: string | null;
  form_elapsed_seconds?: number | null;
  fields_completed?: number | null;
  duplicate_count?: number;
  deduplicated?: boolean;
  alert_status?: string;
}

export interface MarketingLeadItem {
  id_marketing_leads: string;
  lead_code?: string | null;
  occurred_at: string;
  channel?: string | null;
  status?: string;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  page_path?: string | null;
  fk_clientes?: string | null;
  identified_at?: string | null;
  identification_method?: string | null;
}

export interface MarketingClientOption {
  id_clientes: string;
  nome: string;
  documento?: string | null;
}

export interface MarketingBusinessTotals {
  identifiedClients: number;
  approvedOrders: number;
  approvedServices: number;
  excludedProducts: number;
  commission: number;
}

export interface MarketingSearchTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface MarketingResumo {
  periodDays: number;
  context?: {
    targetUserId?: string;
    targetName?: string;
    targetEmail?: string;
    privateToMegaMaster?: boolean;
  };
  config: MarketingConfigSummary;
  integrations: MarketingIntegrationSummary[];
  site: {
    current: MarketingSiteTotals;
    previous: Omit<MarketingSiteTotals, 'conversionRate'>;
    pages: MarketingPageMetric[];
    sources: MarketingSourceMetric[];
    daily: MarketingDailyMetric[];
    eventCounts?: Array<{ event: string; count: number }>;
    recentEvents?: MarketingEventItem[];
  };
  executive?: {
    funnel: {
      visits: number;
      whatsappClicks: number;
      formStarts: number;
      formSubmits: number;
      identifiedClients: number;
      approvedOrders: number;
    };
    business: MarketingBusinessTotals;
    previousBusiness: MarketingBusinessTotals;
  };
  forms?: {
    current: {
      views: number;
      starts: number;
      abandons: number;
      submitAttempts: number;
      validationErrors: number;
      submitErrors: number;
      submits: number;
      completionRate: number;
      abandonmentRate: number;
    };
    previous: {
      views: number;
      starts: number;
      abandons: number;
      submits: number;
    };
    abandonment: Array<{ field: string; count: number; averageSeconds: number }>;
  };
  leads?: {
    items: MarketingLeadItem[];
    unlinked: MarketingLeadItem[];
    total: number;
    unlinkedTotal: number;
    availableClients?: MarketingClientOption[];
  };
  business?: {
    current: MarketingBusinessTotals;
    previous: MarketingBusinessTotals;
    attributions: Array<Record<string, unknown>>;
    commissions: Array<Record<string, unknown>>;
  };
  searchConsole?: {
    current: MarketingSearchTotals;
    previous: MarketingSearchTotals;
    daily: Array<MarketingSearchTotals & { date: string }>;
    queries: Array<MarketingSearchTotals & { query: string }>;
    pages: Array<MarketingSearchTotals & { page: string }>;
    syncedAt: string;
  } | null;
  campaigns: {
    current: {
      spend: number;
      impressions?: number;
      clicks: number;
      leads: number;
      cpl: number;
    };
    items: unknown[];
    daily: unknown[];
    financialAvailable: boolean;
    statusMessage?: string;
  };
  snapshots?: Array<{
    snapshot_type: string;
    period_start: string;
    period_end: string;
    metrics: Record<string, unknown>;
    generated_at: string;
  }>;
  quality?: {
    lastEventAt: string | null;
    alertFailures: number;
    duplicatedClicks: number;
    unlinkedLeads: number;
    eventsWithoutSource: number;
    refreshIntervalMinutes: number;
    generatedAt: string;
  };
}

const inFlightResumoRequests = new Map<string, Promise<MarketingResumo>>();
export const DEFAULT_MARKETING_RESUMO_PERIOD_DAYS = 30;

export function getMarketingResumoQueryKey(periodDays = DEFAULT_MARKETING_RESUMO_PERIOD_DAYS, targetUserId?: string | null) {
  const safePeriod = Number.isFinite(periodDays) ? Math.trunc(periodDays) : DEFAULT_MARKETING_RESUMO_PERIOD_DAYS;
  return ['marketing-growth', safePeriod, targetUserId?.trim() || 'self'] as const;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente.');
  }
  return data.session.access_token;
}

function getFunctionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getErrorResponse(error: unknown) {
  return typeof error === 'object' && error !== null && 'context' in error
    ? (error as { context?: unknown }).context
    : null;
}

async function getMarketingFunctionErrorMessage(error: unknown, fallback: string) {
  const context = getErrorResponse(error);
  if (context instanceof Response) {
    try {
      const parsed = await context.clone().json() as { error?: string; mensagem?: string };
      return parsed.error ?? parsed.mensagem ?? fallback;
    } catch {
      return fallback;
    }
  }

  return getFunctionErrorMessage(error, fallback);
}

async function fetchMarketingResumo(periodDays = 30, targetUserId?: string | null) {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<{ dados?: MarketingResumo; error?: string; mensagem?: string }>('marketing-dashboard', {
    body: {
      p_periodo_dias: periodDays,
      ...(targetUserId ? { p_target_user_id: targetUserId } : {}),
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data?.dados) {
    throw new Error(data?.error ?? data?.mensagem ?? await getMarketingFunctionErrorMessage(error, 'Não foi possível carregar o módulo Crescimento.'));
  }

  writeCachedMarketingResumo(periodDays, targetUserId, data.dados);
  return data.dados;
}

export async function getMarketingResumo(periodDays = 30, targetUserId?: string | null) {
  const cacheKey = getMarketingResumoCacheKey(periodDays, targetUserId);
  const existingRequest = inFlightResumoRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetchMarketingResumo(periodDays, targetUserId)
    .finally(() => {
      inFlightResumoRequests.delete(cacheKey);
    });

  inFlightResumoRequests.set(cacheKey, request);
  return request;
}

export async function linkMarketingLeadToClient(input: {
  targetUserId: string;
  leadId: string;
  clientId: string;
  identificationMethod?: string;
}) {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<{ status?: number; error?: string; mensagem?: string }>('marketing-dashboard', {
    body: {
      action: 'link_client',
      p_target_user_id: input.targetUserId,
      leadId: input.leadId,
      clientId: input.clientId,
      identificationMethod: input.identificationMethod ?? 'codigo_confirmado',
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || data?.status !== 200) {
    throw new Error(data?.error ?? data?.mensagem ?? await getMarketingFunctionErrorMessage(error, 'Não foi possível vincular o contato ao cliente.'));
  }

  return data;
}
