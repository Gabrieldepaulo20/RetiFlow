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
  hasSiteKey?: boolean;
  allowedOrigins?: string[];
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
  newUsers?: number;
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

export interface MarketingSiteWhatsappSummary {
  uniqueClicks: number;
  repeatedClicks: number;
  paidClicks: number;
  organicClicks?: number;
  otherClicks?: number;
  points: Array<{
    eventLabel: string;
    pagePath: string;
    uniqueClicks: number;
    repeatedClicks: number;
    paidClicks: number;
    organicClicks?: number;
    otherClicks?: number;
    lastClickedAt: string;
  }>;
}

export interface MarketingBusinessProfileSummary {
  status: 'available' | 'not_available' | 'error';
  current: {
    interactions: number | null;
    whatsappClicks: number | null;
    calls: number | null;
    directions: number | null;
    websiteClicks: number | null;
    bookings: number | null;
    menus: number | null;
  };
  previous: MarketingBusinessProfileSummary['current'];
  syncedAt: string | null;
  dataWindowMonths: 6;
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
  pageViews?: number;
  engagedSessions?: number;
  engagementRate?: number;
  averageSessionDuration?: number;
  whatsappClicks?: number;
  phoneClicks?: number;
  formSubmits?: number;
  leads: number;
  aiEngine?: string | null;
}

export interface MarketingAiTrafficSummary {
  sessions: number;
  pageViews: number;
  engagedSessions: number;
  engagementRate: number;
  averageSessionDuration: number;
  pagesPerSession: number;
  whatsappClicks: number;
  phoneClicks: number;
  formSubmits: number;
  leads: number;
  engines: Array<MarketingSourceMetric & { aiEngine: string }>;
}

export interface MarketingDailyMetric {
  date: string;
  visits: number;
  sessions?: number;
  pageViews?: number;
  actions: number;
  leads: number;
}

export interface MarketingDeviceMetric {
  device: string;
  users: number;
  sessions: number;
}

export type MarketingJourneyDestination =
  | 'whatsapp'
  | 'phone'
  | 'estimate'
  | 'service'
  | 'contact'
  | 'directions'
  | 'video'
  | 'other';

export interface MarketingJourneySummary {
  measurement: {
    trackedSessions: number;
    pageViewSessions: number;
    activeTimeMeasuredSessions: number;
    consentedSessions: number;
    anonymousSessions: number;
    mixedSessions: number;
    unknownSessions: number;
  };
  retention: {
    eligibleSessions: number;
    active5sSessions: number;
    active10sSessions: number;
    active5sRate: number;
    active10sRate: number;
    no5sSignalSessions: number;
    no10sSignalSessions: number;
    scope: 'tracked_sessions_only';
  };
  contactChannels: Array<{
    channel: 'whatsapp' | 'phone' | 'form';
    sessions: number;
    events: number;
  }>;
  locations?: {
    scope: 'analytics_consented_sessions_only';
    minimumSessions: 3;
    groupsTruncated: boolean;
    groups: Array<{
      city: string;
      region: string | null;
      sessions: number;
    }>;
  };
  clicks: {
    totalEvents: number;
    uniqueSessions: number;
    groupsTruncated: boolean;
    groups: Array<{
      eventName: string;
      pagePath: string;
      componentId: string;
      position: string;
      destinationType: MarketingJourneyDestination;
      destinationPath: string | null;
      experimentId: string | null;
      variantId: string | null;
      events: number;
      sessions: number;
      paidSessions: number;
      organicSessions: number;
      otherSessions: number;
      lastOccurredAt: string;
    }>;
  };
  quizStepsTruncated: boolean;
  quizSteps: Array<{
    experimentId: string | null;
    variantId: string | null;
    flowType: string | null;
    stepId: string;
    views: number;
    completes: number;
    advancedSessions: number;
    possibleDropOffSessions: number;
    advanceRate: number;
    backEvents: number;
    unknownSelections: number;
  }>;
  variantsTruncated: boolean;
  variants: Array<{
    experimentId: string;
    variantId: string;
    sessions: number;
    active5sSessions: number;
    active10sSessions: number;
    ctaClickSessions: number;
    quizStartSessions: number;
    quizResultSessions: number;
    contactSessions: number;
    active5sRate: number;
    active10sRate: number;
    contactRate: number;
  }>;
  pagesTruncated: boolean;
  pages: Array<{
    pagePath: string;
    sessions: number;
    views: number;
    active5sSessions: number;
    active10sSessions: number;
    ctaClickSessions: number;
    quizStartSessions: number;
    contactSessions: number;
    active5sRate: number;
    active10sRate: number;
    contactRate: number;
  }>;
}

export interface MarketingRecentActivityItem {
  activityId: string;
  visitorToken: string;
  occurredAt: string;
  eventName: string;
  category: 'page' | 'retention' | 'cta' | 'quiz' | 'contact' | 'form' | 'other';
  pagePath: string;
  originType: 'paid' | 'organic' | 'other';
  source: string;
  medium: string;
  campaign: string | null;
  deviceType: string | null;
  componentId: string | null;
  position: string | null;
  flowType: string | null;
  stepId: string | null;
  optionId?: string | null;
  fieldId?: string | null;
  interactionAction?: string | null;
  validationReason?: string | null;
  experimentId: string | null;
  variantId: string | null;
  estimateState: string | null;
  destinationType: MarketingJourneyDestination;
  destinationPath: string | null;
  contactState: 'anonymous' | 'intent' | 'identified';
}

export interface MarketingRecentActivity {
  items: MarketingRecentActivityItem[];
  nextCursor: string | null;
  hasMore: boolean;
  refreshAfterSeconds: 30;
  generatedAt: string;
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
  google_click_id_type?: 'gclid' | 'gbraid' | 'wbraid' | null;
}

export interface MarketingClientOption {
  id_clientes: string;
  nome: string;
  documento?: string | null;
}

export interface MarketingBusinessTotals {
  identifiedClients: number;
  newClients: number;
  existingClients: number;
  unknownClients: number;
  confirmedCalls: number;
  confirmedArrivals: number;
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

export interface MarketingAdsTotals {
  spend: number;
  impressions?: number;
  clicks: number;
  interactions?: number;
  leads: number;
  conversions?: number;
  allConversions?: number;
  cpl: number;
  ctr?: number;
  averageCpc?: number;
  conversionRate?: number;
  conversionValue?: number;
  allConversionValue?: number;
  valuePerConversion?: number;
  roas?: number;
  invalidClicks?: number;
  invalidClickRate?: number;
  searchImpressionShare?: number;
  searchTopImpressionShare?: number;
  searchAbsoluteTopImpressionShare?: number;
  searchBudgetLostImpressionShare?: number;
  searchRankLostImpressionShare?: number;
}

export interface MarketingAdsCampaignMetric extends MarketingAdsTotals {
  id: string;
  name: string;
  status: string;
  channelType: string;
  dailyBudget?: number;
  optimizationScore?: number;
}

export interface MarketingAdsDailyMetric extends MarketingAdsTotals {
  date: string;
}

export interface MarketingAdsDeviceMetric extends MarketingAdsTotals {
  device: string;
}

export interface MarketingAdsNetworkMetric extends MarketingAdsTotals {
  network: string;
}

export interface MarketingAdsAdGroupMetric extends MarketingAdsTotals {
  campaignId: string;
  campaign: string;
  id: string;
  name: string;
  status: string;
}

export interface MarketingAdsKeywordMetric extends MarketingAdsTotals {
  campaignId: string;
  campaign: string;
  adGroupId: string;
  adGroup: string;
  criterionId: string;
  keyword: string;
  matchType: string;
  status: string;
  qualityScore: number;
  creativeQualityScore?: string;
  landingPageQualityScore?: string;
  expectedCtrScore?: string;
}

export interface MarketingAdsSearchTermMetric extends MarketingAdsTotals {
  campaign: string;
  adGroup: string;
  searchTerm: string;
  status: string;
  keyword: string;
}

export interface MarketingAdsLandingPageMetric extends MarketingAdsTotals {
  url: string;
}

export interface MarketingAdsScheduleMetric extends MarketingAdsTotals {
  dayOfWeek: string;
  hour: number;
}

export interface MarketingAdsClickTypeMetric {
  type: string;
  clicks: number;
  interactions: number;
  spend: number;
}

export interface MarketingAdsMessageAssetMetric {
  id: string;
  name: string;
  provider: string;
  phoneNumber: string | null;
  countryCode: string | null;
  callToAction: string;
  starterMessageConfigured: boolean;
  level: 'CAMPAIGN';
  campaignId: string;
  campaign: string;
  status: string;
  primaryStatus: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

export interface MarketingAdsCallSummary {
  reported: number;
  received: number;
  missed: number;
  averageDurationSeconds: number;
  longestDurationSeconds: number;
  items?: MarketingAdsCallDetail[];
}

export interface MarketingAdsCallDetail {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  status: string;
  areaCode: string | null;
  countryCode: string | null;
  displayLocation: string;
  type: string;
}

export interface MarketingAdsPaidActionSummary {
  trackedSessions: number;
  whatsappClicks: number;
  phoneClicks: number;
  formSubmits: number;
}

export interface MarketingAdsConversionActionMetric {
  id: string;
  name: string;
  category: string;
  status: string;
  type: string;
  primaryForGoal: boolean;
  conversions: number;
  allConversions: number;
  conversionValue: number;
  costPerConversion: number;
}

export interface MarketingMeasurementLedgerItem {
  key: string;
  label: string;
  classification: 'click' | 'intention' | 'session' | 'operational' | 'commercial_result';
  availability: 'available' | 'partial' | 'unavailable';
  values: Array<{
    key: string;
    label: string;
    value: number | null;
    unit: 'count' | 'BRL';
  }>;
  sourceOfTruth: string;
  queryOrField: string;
  period: {
    startDate: string;
    endDate: string;
    timeZone: 'America/Sao_Paulo';
  };
  deduplication: string;
  expectedLatency: string;
  limitations: string;
}

export interface MarketingPaidVisitor {
  visitorId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Segundos ativos quando medidos pelo site; nas sessões antigas, intervalo entre eventos. */
  durationSeconds: number;
  /** `active` quando o site mediu atividade visível; caso contrário, apenas intervalo entre eventos. */
  durationSource?: 'active' | 'event_interval';
  landingPage: string;
  lastPage: string;
  /** URL pública sem query string nem identificador de anúncio. */
  landingUrl?: string;
  /** Última URL pública rastreada, também sem query string. */
  lastUrl?: string;
  source: string;
  medium: string;
  campaign: string | null;
  /** Termo capturado na própria sessão; ausente quando a origem não o fornece. */
  searchTerm?: string | null;
  clickIdType: string | null;
  /** Como a sessão chegou: anúncio pago, busca orgânica, ou direto/outros. */
  originType: 'paid' | 'organic' | 'other';
  eventCount: number;
  actionCount: number;
  pageViewCount?: number;
  activityCount?: number;
  pages?: Array<{
    path: string;
    url?: string;
    title: string | null;
    occurredAt: string;
  }>;
  pagesTruncated?: boolean;
  actions?: Array<{
    type: string;
    eventName?: string | null;
    occurredAt: string;
    pagePath: string;
    detail: string | null;
    flowType?: string | null;
    stepId?: string | null;
    optionId?: string | null;
    fieldId?: string | null;
    interactionAction?: string | null;
    validationReason?: string | null;
  }>;
  actionsTruncated?: boolean;
  engagementLevel?: 'converted' | 'contact' | 'engaged' | 'brief' | 'unknown';
  /** Se a sessão foi medida antes, depois ou nos dois momentos do consentimento opcional. */
  measurementMode?: 'anonymous' | 'consented' | 'mixed' | 'unknown';
  leadCode?: string | null;
  leadName?: string | null;
  leadContact?: string | null;
  convertedClient: boolean;
  clientId?: string | null;
}

/** Mesma forma de MarketingPaidVisitor — usado pelo painel "Todas as sessões" (não só pago). */
export type MarketingVisitorSession = MarketingPaidVisitor;

export interface MarketingOfflineConversionSummary {
  total: number;
  pending: number;
  processing: number;
  uploaded: number;
  retry: number;
  failed: number;
  items: Array<{
    id_marketing_offline_conversions: string;
    fk_clientes: string;
    click_id_type: string;
    conversion_date_time: string;
    status: string;
    attempts: number;
    uploaded_at?: string | null;
    google_error_code?: string | null;
    google_error_message?: string | null;
  }>;
}

export interface MarketingResumo {
  periodDays: number;
  context?: {
    targetUserId?: string;
    targetName?: string;
    targetEmail?: string;
    privateToMegaMaster?: boolean;
    privateToAdministrators?: boolean;
    canManageAttribution?: boolean;
    canViewRecentActivity?: boolean;
    accessLevel?: 'basic' | 'full';
  };
  config: MarketingConfigSummary;
  integrations: MarketingIntegrationSummary[];
  measurementLedger?: MarketingMeasurementLedgerItem[];
  site: {
    current: MarketingSiteTotals;
    previous: Omit<MarketingSiteTotals, 'conversionRate'>;
    journey?: MarketingJourneySummary;
    whatsapp?: MarketingSiteWhatsappSummary;
    pages: MarketingPageMetric[];
    sources: MarketingSourceMetric[];
    aiTraffic?: MarketingAiTrafficSummary;
    devices?: MarketingDeviceMetric[];
    daily: MarketingDailyMetric[];
    eventCounts?: Array<{ event: string; count: number }>;
  };
  businessProfile?: MarketingBusinessProfileSummary;
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
    current: MarketingAdsTotals;
    previous?: MarketingAdsTotals;
    items: MarketingAdsCampaignMetric[];
    daily: MarketingAdsDailyMetric[];
    devices?: MarketingAdsDeviceMetric[];
    networks?: MarketingAdsNetworkMetric[];
    adGroups?: MarketingAdsAdGroupMetric[];
    keywords?: MarketingAdsKeywordMetric[];
    searchTerms?: MarketingAdsSearchTermMetric[];
    landingPages?: MarketingAdsLandingPageMetric[];
    schedule?: MarketingAdsScheduleMetric[];
    clickTypes?: MarketingAdsClickTypeMetric[];
    messageAssets?: MarketingAdsMessageAssetMetric[];
    calls?: MarketingAdsCallSummary | null;
    conversionActions?: MarketingAdsConversionActionMetric[];
    paidActions?: MarketingAdsPaidActionSummary;
    paidVisitors?: MarketingPaidVisitor[];
    allVisitors?: MarketingVisitorSession[];
    offlineConversions?: MarketingOfflineConversionSummary | null;
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
    alertFailures?: number;
    duplicatedClicks?: number;
    unlinkedLeads?: number;
    eventsWithoutSource?: number;
    actionMetricsSource?: 'internal' | 'ga4' | 'internal_partial';
    actionMetricsLabel?: string;
    refreshIntervalMinutes: number;
    generatedAt: string;
  };
}

const inFlightResumoRequests = new Map<string, Promise<MarketingResumo>>();
export const DEFAULT_MARKETING_RESUMO_PERIOD_DAYS = 30;

export function getMarketingResumoQueryKey(
  periodDays = DEFAULT_MARKETING_RESUMO_PERIOD_DAYS,
  targetUserId: string | null | undefined,
  requesterUserId: string,
) {
  const safePeriod = Number.isFinite(periodDays) ? Math.trunc(periodDays) : DEFAULT_MARKETING_RESUMO_PERIOD_DAYS;
  return ['marketing-growth', requesterUserId.trim(), safePeriod, targetUserId?.trim() || 'self'] as const;
}

export function getMarketingRecentActivityQueryKey(
  targetUserId: string | null | undefined,
  requesterUserId: string,
) {
  return [
    'marketing-recent-activity',
    requesterUserId.trim(),
    targetUserId?.trim() || 'self',
  ] as const;
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

async function fetchMarketingResumo(
  periodDays: number,
  targetUserId: string | null | undefined,
  requesterUserId: string,
) {
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

  writeCachedMarketingResumo(periodDays, targetUserId, requesterUserId, data.dados);
  return data.dados;
}

export async function getMarketingResumo(
  periodDays: number,
  targetUserId: string | null | undefined,
  requesterUserId: string,
) {
  const cacheKey = getMarketingResumoCacheKey(periodDays, targetUserId, requesterUserId);
  const existingRequest = inFlightResumoRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetchMarketingResumo(periodDays, targetUserId, requesterUserId)
    .finally(() => {
      inFlightResumoRequests.delete(cacheKey);
    });

  inFlightResumoRequests.set(cacheKey, request);
  return request;
}

export async function getMarketingRecentActivity(input: {
  targetUserId: string;
  requesterUserId: string;
  limit?: number;
  cursor?: string | null;
}) {
  const accessToken = await getAccessToken();
  const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(50, Math.trunc(input.limit!))) : 50;
  const { data, error } = await supabase.functions.invoke<{
    dados?: MarketingRecentActivity;
    error?: string;
    mensagem?: string;
  }>('marketing-dashboard', {
    body: {
      action: 'recent_activity',
      p_target_user_id: input.targetUserId,
      limit: safeLimit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data?.dados) {
    throw new Error(data?.error ?? data?.mensagem ?? await getMarketingFunctionErrorMessage(
      error,
      'Não foi possível carregar a atividade recente do site.',
    ));
  }

  return data.dados;
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
