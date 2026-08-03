import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  addMarketingDays,
  getMarketingDateKey,
  getMarketingDateRange,
  toMarketingDayAfterEndIso,
  toMarketingDayStartIso,
} from '../_shared/marketing-date.ts';
import { resolveMarketingActionMetricsSource } from '../_shared/marketing-sources.ts';
import {
  classifyMarketingAttribution,
  getMarketingClickIdType as getClickIdType,
  isTechnicalMarketingTest as isTechnicalPaidTest,
} from '../_shared/marketing-attribution.ts';
import {
  buildMarketingVisitorSessions,
  getMarketingVisitorKey,
} from '../_shared/marketing-visitors.ts';

type JsonRecord = Record<string, unknown>;
function createServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type ServiceClient = ReturnType<typeof createServiceClient>;
type MarketingIntegrationStatus = 'not_connected' | 'connected' | 'needs_attention' | 'syncing' | 'disabled';

interface InternalUserProfile {
  id_usuarios: string;
  nome: string;
  email: string;
  acesso: string;
  status: boolean;
  modulos?: {
    admin?: boolean | null;
    marketing?: boolean | null;
  } | null;
}

type RawInternalUserProfile = Omit<InternalUserProfile, 'modulos'> & {
  modulos?: InternalUserProfile['modulos'] | InternalUserProfile['modulos'][] | null;
};

interface MarketingIntegrationSummary {
  provider: string;
  status: MarketingIntegrationStatus;
  accountName?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  freshness?: string;
}

interface MarketingDailyMetric {
  date: string;
  visits: number;
  sessions: number;
  pageViews: number;
  actions: number;
  leads: number;
}

interface MarketingPageMetric {
  path: string;
  title?: string | null;
  views: number;
  conversions: number;
}

interface MarketingSourceMetric {
  source: string;
  medium: string;
  visits: number;
  pageViews: number;
  engagedSessions: number;
  engagementRate: number;
  averageSessionDuration: number;
  whatsappClicks: number;
  phoneClicks: number;
  formSubmits: number;
  leads: number;
  aiEngine?: string | null;
}

interface MarketingAiTrafficSummary {
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

interface MarketingSiteWhatsappSummary {
  uniqueClicks: number;
  repeatedClicks: number;
  paidClicks: number;
  organicClicks: number;
  otherClicks: number;
  points: Array<{
    eventLabel: string;
    pagePath: string;
    uniqueClicks: number;
    repeatedClicks: number;
    paidClicks: number;
    organicClicks: number;
    otherClicks: number;
    lastClickedAt: string;
  }>;
}

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

interface GoogleRunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

interface GoogleMetadataMetric {
  apiName?: string;
  uiName?: string;
  description?: string;
  category?: string;
  blockedReasons?: string[];
}

interface GoogleMetadataResponse {
  metrics?: GoogleMetadataMetric[];
}

interface MarketingBusinessProfileSummary {
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

interface SearchConsoleResponse {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

interface Ga4Summary {
  current: {
    activeUsers: number;
    newUsers: number;
    sessions: number;
    pageViews: number;
    events: number;
    engagementRate: number;
    averageSessionDuration: number;
    engagedSessions: number;
    whatsappClicks: number;
    phoneClicks: number;
    formViews: number;
    formStarts: number;
    formSubmits: number;
    generateLeads: number;
  };
  previous: Ga4Summary['current'];
  daily: MarketingDailyMetric[];
  pages: MarketingPageMetric[];
  sources: MarketingSourceMetric[];
  devices: Array<{ device: string; users: number; sessions: number }>;
  eventCounts: Array<{ event: string; count: number }>;
  businessProfile: MarketingBusinessProfileSummary;
  syncedAt: string;
}

interface SearchConsoleSummary {
  current: { clicks: number; impressions: number; ctr: number; position: number };
  previous: { clicks: number; impressions: number; ctr: number; position: number };
  daily: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
  syncedAt: string;
}

interface GoogleAdsCredentials {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId: string;
  customerId: string;
  apiVersion: string;
}

interface GoogleAdsApiResult {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
    optimizationScore?: number | string;
  };
  campaignBudget?: { amountMicros?: number | string };
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupCriterion?: {
    criterionId?: string;
    status?: string;
    keyword?: { text?: string; matchType?: string };
    qualityInfo?: {
      qualityScore?: number | string;
      creativeQualityScore?: string;
      postClickQualityScore?: string;
      searchPredictedCtr?: string;
    };
  };
  searchTermView?: { searchTerm?: string; status?: string };
  landingPageView?: { unexpandedFinalUrl?: string };
  callView?: {
    resourceName?: string;
    callDurationSeconds?: number | string;
    callStatus?: string;
    startCallDateTime?: string;
    endCallDateTime?: string;
    callerAreaCode?: string;
    callerCountryCode?: string;
    callTrackingDisplayLocation?: string;
    type?: string;
  };
  asset?: {
    id?: string;
    name?: string;
    type?: string;
    businessMessageAsset?: {
      messageProvider?: string;
      starterMessage?: string;
      callToAction?: {
        callToActionSelection?: string;
        callToActionDescription?: string;
      };
      whatsappInfo?: {
        countryCode?: string;
        phoneNumber?: string;
      };
    };
  };
  campaignAsset?: {
    status?: string;
    primaryStatus?: string;
  };
  conversionAction?: { id?: string; name?: string; category?: string; status?: string };
  metrics?: JsonRecord;
  segments?: {
    date?: string;
    device?: string;
    clickType?: string;
    dayOfWeek?: string;
    hour?: number | string;
    adNetworkType?: string;
    keyword?: { info?: { text?: string; matchType?: string } };
    conversionAction?: string;
    conversionActionName?: string;
    conversionActionCategory?: string;
  };
}

interface GoogleAdsTotals {
  spend: number;
  impressions: number;
  clicks: number;
  interactions: number;
  leads: number;
  conversions: number;
  allConversions: number;
  cpl: number;
  ctr: number;
  averageCpc: number;
  conversionRate: number;
  conversionValue: number;
  allConversionValue: number;
  valuePerConversion: number;
  roas: number;
  invalidClicks: number;
  invalidClickRate: number;
  searchImpressionShare: number;
  searchTopImpressionShare: number;
  searchAbsoluteTopImpressionShare: number;
  searchBudgetLostImpressionShare: number;
  searchRankLostImpressionShare: number;
}

interface GoogleAdsSummary {
  current: GoogleAdsTotals;
  previous: GoogleAdsTotals;
  items: Array<GoogleAdsTotals & {
    id: string;
    name: string;
    status: string;
    channelType: string;
    dailyBudget: number;
    optimizationScore: number;
  }>;
  daily: Array<GoogleAdsTotals & { date: string }>;
  devices: Array<GoogleAdsTotals & { device: string }>;
  networks: Array<GoogleAdsTotals & { network: string }>;
  adGroups: Array<GoogleAdsTotals & {
    campaignId: string;
    campaign: string;
    id: string;
    name: string;
    status: string;
  }>;
  keywords: Array<GoogleAdsTotals & {
    campaignId: string;
    campaign: string;
    adGroupId: string;
    adGroup: string;
    criterionId: string;
    keyword: string;
    matchType: string;
    status: string;
    qualityScore: number;
    creativeQualityScore: string;
    landingPageQualityScore: string;
    expectedCtrScore: string;
  }>;
  searchTerms: Array<GoogleAdsTotals & {
    campaign: string;
    adGroup: string;
    searchTerm: string;
    status: string;
    keyword: string;
  }>;
  landingPages: Array<GoogleAdsTotals & { url: string }>;
  schedule: Array<GoogleAdsTotals & { dayOfWeek: string; hour: number }>;
  clickTypes: Array<{
    type: string;
    clicks: number;
    interactions: number;
    spend: number;
  }>;
  calls: {
    reported: number;
    received: number;
    missed: number;
    averageDurationSeconds: number;
    longestDurationSeconds: number;
    items: Array<{
      id: string;
      startedAt: string;
      endedAt: string | null;
      durationSeconds: number;
      status: string;
      areaCode: string | null;
      countryCode: string | null;
      displayLocation: string;
      type: string;
    }>;
  };
  conversionActions: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    conversions: number;
    allConversions: number;
    conversionValue: number;
    costPerConversion: number;
  }>;
  messageAssets: Array<{
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
  }>;
  syncedAt: string;
  accountId: string;
}

const GOOGLE_ACCESS_TOKEN_CACHE_TTL_MS = 50 * 60_000;
const GA4_SUMMARY_CACHE_TTL_MS = 10 * 60_000;
const SEARCH_CONSOLE_SUMMARY_CACHE_TTL_MS = 60 * 60_000;
const GOOGLE_ADS_SUMMARY_CACHE_TTL_MS = 10 * 60_000;
const RETIFICA_PREMIUM_MARKETING_EMAIL = 'retificapremium5@gmail.com';
const googleAccessTokenCache = new Map<string, CacheEntry<string>>();
const googleAdsAccessTokenCache = new Map<string, CacheEntry<string>>();
const ga4SummaryCache = new Map<string, CacheEntry<Ga4Summary>>();
const searchConsoleCache = new Map<string, CacheEntry<SearchConsoleSummary>>();
const googleAdsSummaryCache = new Map<string, CacheEntry<GoogleAdsSummary>>();

const localDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id, server-timing',
  Vary: 'Origin',
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const configured = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    const allowed = !origin || localDevOrigins.has(origin);
    return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? (origin || 'null') : 'null' };
  }

  if (configured.includes('*')) {
    const allowed = localDevOrigins.has(origin);
    return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? origin : 'null' };
  }

  const allowed = configured.includes(origin) || localDevOrigins.has(origin);
  return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? origin : 'null' };
}

function jsonResponse(body: unknown, status: number, request: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, max = 500) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrDefault(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return round((numerator / denominator) * 100);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSuperAdminEmails() {
  const raw = Deno.env.get('SUPER_ADMIN_EMAILS') ?? Deno.env.get('SUPER_ADMIN_EMAIL') ?? '';
  return new Set(raw.split(',').map(normalizeEmail).filter(Boolean));
}

function parsePeriod(value: unknown) {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(Math.trunc(parsed), 365));
}

function fromGaDate(value: string) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function encodeJson(value: unknown) {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function parseServiceAccount(raw: string): GoogleServiceAccount {
  const trimmed = raw.trim();
  const json = trimmed.startsWith('{') ? trimmed : atob(trimmed);
  const parsed = JSON.parse(json) as Partial<GoogleServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) throw new Error('Credencial Google incompleta.');
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

async function createServiceAccountJwt(serviceAccount: GoogleServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(claim)}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken(serviceAccount: GoogleServiceAccount) {
  const cached = getCachedValue(googleAccessTokenCache, serviceAccount.client_email);
  if (cached) return cached;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await createServiceAccountJwt(serviceAccount),
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'Falha ao autenticar nos serviços Google.');
  }
  setCachedValue(googleAccessTokenCache, serviceAccount.client_email, payload.access_token, GOOGLE_ACCESS_TOKEN_CACHE_TTL_MS);
  return payload.access_token;
}

async function runGa4Report(accessToken: string, propertyId: string, body: JsonRecord) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as GoogleRunReportResponse & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? 'Falha ao consultar o GA4.');
  return payload;
}

function emptyBusinessProfileTotals(): MarketingBusinessProfileSummary['current'] {
  return {
    interactions: null,
    whatsappClicks: null,
    calls: null,
    directions: null,
    websiteClicks: null,
    bookings: null,
    menus: null,
  };
}

async function fetchGa4Metadata(accessToken: string, propertyId: string) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const payload = await response.json().catch(() => ({})) as GoogleMetadataResponse & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Falha ao consultar o catálogo de métricas do GA4.');
  }
  return payload;
}

function findBusinessProfileMetric(
  metrics: GoogleMetadataMetric[],
  keywords: RegExp[],
) {
  return metrics.find((metric) => {
    const searchable = [
      metric.apiName,
      metric.uiName,
      metric.description,
      metric.category,
    ].filter(Boolean).join(' ');
    const belongsToBusinessProfile = /google business profile|\bbusiness profile\b|\bbusinessprofile\b|\bgbp\b/i.test(searchable);
    return belongsToBusinessProfile && keywords.some((keyword) => keyword.test(searchable));
  })?.apiName ?? null;
}

async function fetchGa4BusinessProfileSummary(
  accessToken: string,
  propertyId: string,
  range: ReturnType<typeof getMarketingDateRange>,
): Promise<MarketingBusinessProfileSummary> {
  const unavailable = (
    status: MarketingBusinessProfileSummary['status'],
  ): MarketingBusinessProfileSummary => ({
    status,
    current: emptyBusinessProfileTotals(),
    previous: emptyBusinessProfileTotals(),
    syncedAt: null,
    dataWindowMonths: 6,
  });

  try {
    const metadata = await fetchGa4Metadata(accessToken, propertyId);
    const metrics = (metadata.metrics ?? []).filter((metric) => !metric.blockedReasons?.length);
    const apiNames = {
      interactions: findBusinessProfileMetric(metrics, [/interaction/i]),
      whatsappClicks: findBusinessProfileMetric(metrics, [/message/i, /chat/i]),
      calls: findBusinessProfileMetric(metrics, [/call/i]),
      directions: findBusinessProfileMetric(metrics, [/direction/i]),
      websiteClicks: findBusinessProfileMetric(metrics, [/website/i]),
      bookings: findBusinessProfileMetric(metrics, [/booking/i]),
      menus: findBusinessProfileMetric(metrics, [/menu/i]),
    };
    const requestedMetrics = Object.values(apiNames).filter((name): name is string => Boolean(name));
    if (!requestedMetrics.length) return unavailable('not_available');

    const [currentReport, previousReport] = await Promise.all([
      runGa4Report(accessToken, propertyId, {
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        metrics: requestedMetrics.map((name) => ({ name })),
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges: [{ startDate: range.previousStartDate, endDate: range.previousEndDate }],
        metrics: requestedMetrics.map((name) => ({ name })),
      }),
    ]);
    const totals = (report: GoogleRunReportResponse) => Object.fromEntries(
      Object.entries(apiNames).map(([key, apiName]) => {
        if (!apiName) return [key, null];
        return [key, metricValue(report, 0, requestedMetrics.indexOf(apiName))];
      }),
    ) as MarketingBusinessProfileSummary['current'];

    return {
      status: 'available',
      current: totals(currentReport),
      previous: totals(previousReport),
      syncedAt: new Date().toISOString(),
      dataWindowMonths: 6,
    };
  } catch (error) {
    console.error(
      'Google Business Profile metrics sync failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return unavailable('error');
  }
}

function metricValue(report: GoogleRunReportResponse, rowIndex: number, metricIndex = 0) {
  return toNumber(report.rows?.[rowIndex]?.metricValues?.[metricIndex]?.value);
}

function eventCountMap(report: GoogleRunReportResponse) {
  return new Map(
    (report.rows ?? []).map((row) => [
      row.dimensionValues?.[0]?.value ?? '',
      toNumber(row.metricValues?.[0]?.value),
    ]),
  );
}

function getNamedEventCount(events: Map<string, number>, names: string[]) {
  return names.reduce((total, name) => total + (events.get(name) ?? 0), 0);
}

const aiTrafficSources = [
  { engine: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'] },
  { engine: 'Perplexity', hosts: ['perplexity.ai'] },
  { engine: 'Gemini', hosts: ['gemini.google.com'] },
  { engine: 'Microsoft Copilot', hosts: ['copilot.microsoft.com'] },
  { engine: 'Claude', hosts: ['claude.ai'] },
  { engine: 'Meta AI', hosts: ['meta.ai'] },
  { engine: 'Grok', hosts: ['grok.com'] },
  { engine: 'You.com', hosts: ['you.com'] },
] as const;

function normalizedSourceHost(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  return normalized.split('/')[0].split('?')[0];
}

function getAiEngine(source: string) {
  const host = normalizedSourceHost(source);
  return aiTrafficSources.find((rule) =>
    rule.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
  )?.engine ?? null;
}

function sourceKey(source: string, medium?: string) {
  return `${normalizedSourceHost(source)}\u0000${String(medium ?? '').trim().toLowerCase()}`;
}

function emptySourceMetric(source: string, medium: string): MarketingSourceMetric {
  return {
    source,
    medium,
    visits: 0,
    pageViews: 0,
    engagedSessions: 0,
    engagementRate: 0,
    averageSessionDuration: 0,
    whatsappClicks: 0,
    phoneClicks: 0,
    formSubmits: 0,
    leads: 0,
    aiEngine: getAiEngine(source),
  };
}

function buildAiTrafficSummary(sources: MarketingSourceMetric[]): MarketingAiTrafficSummary {
  const grouped = new Map<string, MarketingSourceMetric & { aiEngine: string; durationWeighted: number }>();
  sources
    .filter((item): item is MarketingSourceMetric & { aiEngine: string } => Boolean(item.aiEngine))
    .forEach((item) => {
      const existing = grouped.get(item.aiEngine) ?? {
        ...emptySourceMetric(item.source, item.medium),
        aiEngine: item.aiEngine,
        durationWeighted: 0,
      };
      if (!existing.source.split(', ').includes(item.source)) {
        existing.source = `${existing.source}, ${item.source}`;
      }
      existing.visits += item.visits;
      existing.pageViews += item.pageViews;
      existing.engagedSessions += item.engagedSessions;
      existing.durationWeighted += item.averageSessionDuration * item.visits;
      existing.whatsappClicks += item.whatsappClicks;
      existing.phoneClicks += item.phoneClicks;
      existing.formSubmits += item.formSubmits;
      existing.leads += item.leads;
      grouped.set(item.aiEngine, existing);
    });
  const engines = Array.from(grouped.values())
    .map(({ durationWeighted, ...item }) => ({
      ...item,
      engagementRate: percentage(item.engagedSessions, item.visits),
      averageSessionDuration: item.visits ? round(durationWeighted / item.visits) : 0,
    }))
    .sort((a, b) => b.visits - a.visits);
  const sessions = engines.reduce((total, item) => total + item.visits, 0);
  const pageViews = engines.reduce((total, item) => total + item.pageViews, 0);
  const engagedSessions = engines.reduce((total, item) => total + item.engagedSessions, 0);
  const durationWeighted = engines.reduce(
    (total, item) => total + (item.averageSessionDuration * item.visits),
    0,
  );

  return {
    sessions,
    pageViews,
    engagedSessions,
    engagementRate: percentage(engagedSessions, sessions),
    averageSessionDuration: sessions ? round(durationWeighted / sessions) : 0,
    pagesPerSession: sessions ? round(pageViews / sessions, 2) : 0,
    whatsappClicks: engines.reduce((total, item) => total + item.whatsappClicks, 0),
    phoneClicks: engines.reduce((total, item) => total + item.phoneClicks, 0),
    formSubmits: engines.reduce((total, item) => total + item.formSubmits, 0),
    leads: engines.reduce((total, item) => total + item.leads, 0),
    engines,
  };
}

function buildGa4Totals(report: GoogleRunReportResponse, events: Map<string, number>) {
  return {
    activeUsers: metricValue(report, 0, 0),
    sessions: metricValue(report, 0, 1),
    pageViews: metricValue(report, 0, 2),
    events: metricValue(report, 0, 3),
    engagementRate: round(metricValue(report, 0, 4) * 100),
    averageSessionDuration: round(metricValue(report, 0, 5)),
    engagedSessions: metricValue(report, 0, 6),
    newUsers: metricValue(report, 0, 7),
    whatsappClicks: getNamedEventCount(events, ['whatsapp_click']),
    phoneClicks: getNamedEventCount(events, ['phone_click', 'click_phone', 'telefone_click']),
    formViews: getNamedEventCount(events, ['form_view']),
    formStarts: getNamedEventCount(events, ['form_start']),
    formSubmits: getNamedEventCount(events, ['form_submit']),
    generateLeads: getNamedEventCount(events, ['generate_lead']),
  };
}

async function fetchGa4Summary(
  propertyId: string,
  serviceAccount: GoogleServiceAccount,
  periodDays: number,
) {
  const range = getMarketingDateRange(periodDays);
  const cacheKey = [
    serviceAccount.client_email,
    propertyId,
    periodDays,
    range.startDate,
    range.endDate,
  ].join(':');
  const cached = getCachedValue(ga4SummaryCache, cacheKey);
  if (cached) return cached;

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const totalsMetrics = [
    { name: 'activeUsers' },
    { name: 'sessions' },
    { name: 'screenPageViews' },
    { name: 'eventCount' },
    { name: 'engagementRate' },
    { name: 'averageSessionDuration' },
    { name: 'engagedSessions' },
    { name: 'newUsers' },
  ];
  const [
    currentReport,
    previousReport,
    dailyReport,
    pagesReport,
    sourcesReport,
    devicesReport,
    currentEventsReport,
    previousEventsReport,
    businessProfile,
  ] = await Promise.all([
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      metrics: totalsMetrics,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.previousStartDate, endDate: range.previousEndDate }],
      metrics: totalsMetrics,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: '12',
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagedSessions' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '100',
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: '10',
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '100',
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.previousStartDate, endDate: range.previousEndDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '100',
    }),
    fetchGa4BusinessProfileSummary(accessToken, propertyId, range),
  ]);

  const currentEvents = eventCountMap(currentEventsReport);
  const previousEvents = eventCountMap(previousEventsReport);
  const ga4ByDate = new Map<string, { visits: number; sessions: number; pageViews: number }>();
  for (const row of dailyReport.rows ?? []) {
    const date = fromGaDate(row.dimensionValues?.[0]?.value ?? '');
    ga4ByDate.set(date, {
      visits: toNumber(row.metricValues?.[0]?.value),
      sessions: toNumber(row.metricValues?.[1]?.value),
      pageViews: toNumber(row.metricValues?.[2]?.value),
    });
  }

  const daily = Array.from({ length: periodDays }, (_, index) => {
    const date = addMarketingDays(range.startDate, index);
    const ga4 = ga4ByDate.get(date);
    return {
      date,
      visits: ga4?.visits ?? 0,
      sessions: ga4?.sessions ?? 0,
      pageViews: ga4?.pageViews ?? 0,
      actions: 0,
      leads: 0,
    };
  });

  const pages = (pagesReport.rows ?? []).map((row) => {
    const path = row.dimensionValues?.[0]?.value || '/';
    return {
      path,
      title: row.dimensionValues?.[1]?.value || null,
      views: toNumber(row.metricValues?.[0]?.value),
      conversions: 0,
    };
  });

  const sources = (sourcesReport.rows ?? []).map((row) => {
    const source = row.dimensionValues?.[0]?.value || 'direto';
    const medium = row.dimensionValues?.[1]?.value || 'sem meio';
    return {
      source,
      medium,
      visits: toNumber(row.metricValues?.[0]?.value),
      pageViews: toNumber(row.metricValues?.[1]?.value),
      engagedSessions: toNumber(row.metricValues?.[2]?.value),
      engagementRate: round(toNumber(row.metricValues?.[3]?.value) * 100),
      averageSessionDuration: round(toNumber(row.metricValues?.[4]?.value)),
      whatsappClicks: 0,
      phoneClicks: 0,
      formSubmits: 0,
      leads: 0,
      aiEngine: getAiEngine(source),
    };
  });

  const syncedAt = new Date().toISOString();
  const devices = (devicesReport.rows ?? []).map((row) => ({
    device: row.dimensionValues?.[0]?.value || 'Não informado',
    users: toNumber(row.metricValues?.[0]?.value),
    sessions: toNumber(row.metricValues?.[1]?.value),
  }));
  const summary: Ga4Summary = {
    current: buildGa4Totals(currentReport, currentEvents),
    previous: buildGa4Totals(previousReport, previousEvents),
    daily,
    pages,
    sources,
    devices,
    eventCounts: Array.from(currentEvents.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count),
    businessProfile,
    syncedAt,
  };
  setCachedValue(ga4SummaryCache, cacheKey, summary, GA4_SUMMARY_CACHE_TTL_MS);
  return summary;
}

function mergeGa4WithInternalData(
  ga4: Ga4Summary,
  internalDaily: MarketingDailyMetric[],
  conversionsByPath: Map<string, number>,
  internalSources: MarketingSourceMetric[],
  includeInternalActions: boolean,
): Ga4Summary {
  const internalByDate = new Map(internalDaily.map((item) => [item.date, item]));
  const internalByExactSource = new Map(
    internalSources.map((item) => [sourceKey(item.source, item.medium), item]),
  );
  const internalBySource = new Map<string, MarketingSourceMetric>();
  internalSources.forEach((item) => {
    const key = normalizedSourceHost(item.source);
    const existing = internalBySource.get(key) ?? emptySourceMetric(item.source, item.medium);
    existing.visits += item.visits;
    existing.whatsappClicks += item.whatsappClicks;
    existing.phoneClicks += item.phoneClicks;
    existing.formSubmits += item.formSubmits;
    existing.leads += item.leads;
    internalBySource.set(key, existing);
  });
  const mergedSourceHosts = new Set<string>();
  const mergedSources = ga4.sources.map((item) => {
    const sourceHost = normalizedSourceHost(item.source);
    mergedSourceHosts.add(sourceHost);
    const internal = internalByExactSource.get(sourceKey(item.source, item.medium))
      ?? (item.aiEngine ? internalBySource.get(sourceHost) : undefined);

    return {
      ...item,
      whatsappClicks: internal?.whatsappClicks ?? 0,
      phoneClicks: internal?.phoneClicks ?? 0,
      formSubmits: internal?.formSubmits ?? 0,
      leads: internal?.leads ?? 0,
    };
  });
  internalSources.forEach((item) => {
    const sourceHost = normalizedSourceHost(item.source);
    if (!mergedSourceHosts.has(sourceHost)) mergedSources.push(item);
  });

  return {
    ...ga4,
    daily: ga4.daily.map((item) => ({
      ...item,
      actions: includeInternalActions ? (internalByDate.get(item.date)?.actions ?? 0) : 0,
      leads: internalByDate.get(item.date)?.leads ?? 0,
    })),
    pages: ga4.pages.map((item) => ({
      ...item,
      conversions: conversionsByPath.get(item.path) ?? 0,
    })),
    sources: mergedSources.sort((a, b) => b.visits - a.visits),
  };
}

async function runSearchConsoleQuery(
  accessToken: string,
  siteUrl: string,
  body: JsonRecord,
) {
  const response = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json().catch(() => ({})) as SearchConsoleResponse & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? 'Falha ao consultar o Search Console.');
  return payload;
}

function searchTotals(report: SearchConsoleResponse) {
  const row = report.rows?.[0];
  return {
    clicks: toNumber(row?.clicks),
    impressions: toNumber(row?.impressions),
    ctr: round(toNumber(row?.ctr) * 100),
    position: round(toNumber(row?.position), 1),
  };
}

function searchRow(row: NonNullable<SearchConsoleResponse['rows']>[number]) {
  return {
    clicks: toNumber(row.clicks),
    impressions: toNumber(row.impressions),
    ctr: round(toNumber(row.ctr) * 100),
    position: round(toNumber(row.position), 1),
  };
}

async function fetchSearchConsoleSummary(
  siteUrl: string,
  serviceAccount: GoogleServiceAccount,
  periodDays: number,
) {
  const range = getMarketingDateRange(periodDays);
  const cacheKey = [
    serviceAccount.client_email,
    siteUrl,
    periodDays,
    range.startDate,
    range.endDate,
  ].join(':');
  const cached = getCachedValue(searchConsoleCache, cacheKey);
  if (cached) return cached;

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const base = { type: 'web', dataState: 'all' };
  const [currentReport, previousReport, dailyReport, queriesReport, pagesReport] = await Promise.all([
    runSearchConsoleQuery(accessToken, siteUrl, {
      ...base,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    runSearchConsoleQuery(accessToken, siteUrl, {
      ...base,
      startDate: range.previousStartDate,
      endDate: range.previousEndDate,
    }),
    runSearchConsoleQuery(accessToken, siteUrl, {
      ...base,
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['date'],
      rowLimit: Math.max(periodDays, 10),
    }),
    runSearchConsoleQuery(accessToken, siteUrl, {
      ...base,
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['query'],
      rowLimit: 15,
    }),
    runSearchConsoleQuery(accessToken, siteUrl, {
      ...base,
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['page'],
      rowLimit: 15,
    }),
  ]);

  const summary: SearchConsoleSummary = {
    current: searchTotals(currentReport),
    previous: searchTotals(previousReport),
    daily: (dailyReport.rows ?? []).map((row) => ({
      date: row.keys?.[0] ?? '',
      ...searchRow(row),
    })),
    queries: (queriesReport.rows ?? []).map((row) => ({
      query: row.keys?.[0] ?? 'Consulta não informada',
      ...searchRow(row),
    })),
    pages: (pagesReport.rows ?? []).map((row) => ({
      page: row.keys?.[0] ?? '/',
      ...searchRow(row),
    })),
    syncedAt: new Date().toISOString(),
  };
  setCachedValue(searchConsoleCache, cacheKey, summary, SEARCH_CONSOLE_SUMMARY_CACHE_TTL_MS);
  return summary;
}

function normalizeGoogleAdsCustomerId(value: string) {
  return value.replace(/\D/g, '');
}

function formatGoogleAdsCustomerId(value: string) {
  const normalized = normalizeGoogleAdsCustomerId(value);
  return normalized.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
}

function getGoogleAdsCredentials(): GoogleAdsCredentials | null {
  const values = {
    developerToken: Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')?.trim() ?? '',
    clientId: Deno.env.get('GOOGLE_ADS_CLIENT_ID')?.trim() ?? '',
    clientSecret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')?.trim() ?? '',
    refreshToken: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN')?.trim() ?? '',
    loginCustomerId: normalizeGoogleAdsCustomerId(Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') ?? ''),
    customerId: normalizeGoogleAdsCustomerId(Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') ?? ''),
    apiVersion: Deno.env.get('GOOGLE_ADS_API_VERSION')?.trim() || 'v24',
  };
  const required = [
    values.developerToken,
    values.clientId,
    values.clientSecret,
    values.refreshToken,
    values.loginCustomerId,
    values.customerId,
  ];
  if (required.every((value) => !value)) return null;
  if (required.some((value) => !value)) throw new Error('Credencial Google Ads incompleta.');
  if (!/^\d{10}$/.test(values.loginCustomerId) || !/^\d{10}$/.test(values.customerId)) {
    throw new Error('Identificador de conta Google Ads inválido.');
  }
  if (!/^v\d+$/.test(values.apiVersion)) throw new Error('Versão da API Google Ads inválida.');
  return values;
}

async function getGoogleAdsAccessToken(credentials: GoogleAdsCredentials) {
  const cached = getCachedValue(googleAdsAccessTokenCache, credentials.clientId);
  if (cached) return cached;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'Falha ao autenticar no Google Ads.');
  }
  setCachedValue(
    googleAdsAccessTokenCache,
    credentials.clientId,
    payload.access_token,
    GOOGLE_ACCESS_TOKEN_CACHE_TTL_MS,
  );
  return payload.access_token;
}

function getGoogleAdsErrorMessage(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  return asString(payload.error.message, 500);
}

function getPublicGoogleAdsFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (/token has been expired or revoked|invalid_grant|expired|revoked/i.test(message)) {
    return 'A autorização do Google Ads expirou ou foi revogada. Reconecte a conta oficial.';
  }
  if (/credencial google ads incompleta/i.test(message)) {
    return 'A configuração segura do Google Ads está incompleta.';
  }
  if (/permission|access denied|authorization_error|customer_not_enabled/i.test(message)) {
    return 'A conta conectada não tem permissão para consultar o Google Ads oficial.';
  }

  return 'Não foi possível sincronizar o Google Ads agora.';
}

async function runGoogleAdsQuery(
  credentials: GoogleAdsCredentials,
  accessToken: string,
  query: string,
) {
  const response = await fetch(
    `https://googleads.googleapis.com/${credentials.apiVersion}/customers/${credentials.customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': credentials.developerToken,
        'login-customer-id': credentials.loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) throw new Error(getGoogleAdsErrorMessage(payload) ?? 'Falha ao consultar o Google Ads.');

  const chunks = Array.isArray(payload) ? payload : [payload];
  return chunks.flatMap((chunk) => {
    if (!isRecord(chunk) || !Array.isArray(chunk.results)) return [];
    return chunk.results.filter(isRecord) as GoogleAdsApiResult[];
  });
}

async function runOptionalGoogleAdsQuery(
  credentials: GoogleAdsCredentials,
  accessToken: string,
  query: string,
  reportName: string,
) {
  try {
    return await runGoogleAdsQuery(credentials, accessToken, query);
  } catch (error) {
    console.error(
      `Google Ads optional report failed: ${reportName}`,
      error instanceof Error ? error.message : 'unknown',
    );
    return [];
  }
}

function googleAdsShareValue(value: unknown) {
  const ratio = toNumber(value);
  return ratio > 0 ? ratio * 100 : 0;
}

function aggregateGoogleAdsRows(rows: GoogleAdsApiResult[]): GoogleAdsTotals {
  const totals = rows.reduce((current, row) => {
    const metrics = row.metrics ?? {};
    const impressions = toNumber(metrics.impressions);
    const searchImpressionShare = googleAdsShareValue(metrics.searchImpressionShare);
    const searchTopShare = googleAdsShareValue(metrics.searchTopImpressionShare);
    const searchAbsoluteTopShare = googleAdsShareValue(metrics.searchAbsoluteTopImpressionShare);
    const searchBudgetLost = googleAdsShareValue(metrics.searchBudgetLostImpressionShare);
    const searchRankLost = googleAdsShareValue(metrics.searchRankLostImpressionShare);
    const hasSearchImpressionShare = metrics.searchImpressionShare !== undefined;
    const hasSearchTopShare = metrics.searchTopImpressionShare !== undefined;
    const hasSearchAbsoluteTopShare = metrics.searchAbsoluteTopImpressionShare !== undefined;
    const hasSearchBudgetLost = metrics.searchBudgetLostImpressionShare !== undefined;
    const hasSearchRankLost = metrics.searchRankLostImpressionShare !== undefined;
    return {
      spend: current.spend + (toNumber(metrics.costMicros) / 1_000_000),
      impressions: current.impressions + impressions,
      clicks: current.clicks + toNumber(metrics.clicks),
      interactions: current.interactions + toNumber(metrics.interactions),
      conversions: current.conversions + toNumber(metrics.conversions),
      allConversions: current.allConversions + toNumber(metrics.allConversions),
      conversionValue: current.conversionValue + toNumber(metrics.conversionsValue),
      allConversionValue: current.allConversionValue + toNumber(metrics.allConversionsValue),
      invalidClicks: current.invalidClicks + toNumber(metrics.invalidClicks),
      shareWeighted: current.shareWeighted + (searchImpressionShare * impressions),
      topShareWeighted: current.topShareWeighted + (searchTopShare * impressions),
      absoluteTopShareWeighted: current.absoluteTopShareWeighted + (searchAbsoluteTopShare * impressions),
      budgetLostWeighted: current.budgetLostWeighted + (searchBudgetLost * impressions),
      rankLostWeighted: current.rankLostWeighted + (searchRankLost * impressions),
      shareWeight: current.shareWeight + (hasSearchImpressionShare ? impressions : 0),
      topShareWeight: current.topShareWeight + (hasSearchTopShare ? impressions : 0),
      absoluteTopShareWeight: current.absoluteTopShareWeight + (hasSearchAbsoluteTopShare ? impressions : 0),
      budgetLostWeight: current.budgetLostWeight + (hasSearchBudgetLost ? impressions : 0),
      rankLostWeight: current.rankLostWeight + (hasSearchRankLost ? impressions : 0),
    };
  }, {
    spend: 0,
    impressions: 0,
    clicks: 0,
    interactions: 0,
    conversions: 0,
    allConversions: 0,
    conversionValue: 0,
    allConversionValue: 0,
    invalidClicks: 0,
    shareWeighted: 0,
    topShareWeighted: 0,
    absoluteTopShareWeighted: 0,
    budgetLostWeighted: 0,
    rankLostWeighted: 0,
    shareWeight: 0,
    topShareWeight: 0,
    absoluteTopShareWeight: 0,
    budgetLostWeight: 0,
    rankLostWeight: 0,
  });
  const spend = round(totals.spend);
  const conversions = round(totals.conversions, 2);
  const allConversions = round(totals.allConversions, 2);
  const conversionValue = round(totals.conversionValue);
  const allConversionValue = round(totals.allConversionValue);
  return {
    spend,
    impressions: totals.impressions,
    clicks: totals.clicks,
    interactions: totals.interactions,
    leads: conversions,
    conversions,
    allConversions,
    cpl: conversions ? round(totals.spend / conversions) : 0,
    ctr: percentage(totals.clicks, totals.impressions),
    averageCpc: totals.clicks ? round(totals.spend / totals.clicks) : 0,
    conversionRate: percentage(conversions, totals.clicks),
    conversionValue,
    allConversionValue,
    valuePerConversion: conversions ? round(totals.conversionValue / conversions) : 0,
    roas: totals.spend ? round(totals.conversionValue / totals.spend, 2) : 0,
    invalidClicks: totals.invalidClicks,
    invalidClickRate: percentage(totals.invalidClicks, totals.clicks + totals.invalidClicks),
    searchImpressionShare: totals.shareWeight ? round(totals.shareWeighted / totals.shareWeight) : 0,
    searchTopImpressionShare: totals.topShareWeight
      ? round(totals.topShareWeighted / totals.topShareWeight)
      : 0,
    searchAbsoluteTopImpressionShare: totals.absoluteTopShareWeight
      ? round(totals.absoluteTopShareWeighted / totals.absoluteTopShareWeight)
      : 0,
    searchBudgetLostImpressionShare: totals.budgetLostWeight
      ? round(totals.budgetLostWeighted / totals.budgetLostWeight)
      : 0,
    searchRankLostImpressionShare: totals.rankLostWeight
      ? round(totals.rankLostWeighted / totals.rankLostWeight)
      : 0,
  };
}

function googleAdsCampaignQuery(startDate: string, endDate: string) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.optimization_score,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion,
      metrics.conversions_from_interactions_rate,
      metrics.invalid_clicks,
      metrics.invalid_click_rate,
      metrics.search_impression_share,
      metrics.search_top_impression_share,
      metrics.search_absolute_top_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;
}

function googleAdsDailyQuery(startDate: string, endDate: string) {
  return `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value,
      metrics.invalid_clicks,
      metrics.invalid_click_rate,
      metrics.search_impression_share,
      metrics.search_top_impression_share,
      metrics.search_absolute_top_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date
  `;
}

function googleAdsDeviceQuery(startDate: string, endDate: string) {
  return `
    SELECT
      segments.device,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value,
      metrics.invalid_clicks
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;
}

function googleAdsNetworkQuery(startDate: string, endDate: string) {
  return `
    SELECT
      segments.ad_network_type,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value,
      metrics.invalid_clicks
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;
}

function googleAdsAdGroupQuery(startDate: string, endDate: string) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value,
      metrics.invalid_clicks
    FROM ad_group
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `;
}

function googleAdsClickTypeQuery(startDate: string, endDate: string) {
  return `
    SELECT
      segments.click_type,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.clicks DESC
  `;
}

function googleAdsCampaignMessageAssetQuery() {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign_asset.status,
      campaign_asset.primary_status,
      asset.id,
      asset.name,
      asset.type,
      asset.business_message_asset.message_provider,
      asset.business_message_asset.starter_message,
      asset.business_message_asset.call_to_action.call_to_action_selection,
      asset.business_message_asset.whatsapp_info.country_code,
      asset.business_message_asset.whatsapp_info.phone_number
    FROM campaign_asset
    WHERE campaign_asset.field_type = 'BUSINESS_MESSAGE'
      AND campaign_asset.status != 'REMOVED'
  `;
}

function googleAdsCampaignMessageAssetPerformanceQuery(startDate: string, endDate: string) {
  return `
    SELECT
      campaign.id,
      asset.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign_asset
    WHERE campaign_asset.field_type = 'BUSINESS_MESSAGE'
      AND campaign_asset.status != 'REMOVED'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function googleAdsCallViewQuery(startDate: string, endDate: string) {
  const endExclusiveDate = addMarketingDays(endDate, 1);
  return `
    SELECT
      call_view.resource_name,
      call_view.call_duration_seconds,
      call_view.call_status,
      call_view.start_call_date_time,
      call_view.end_call_date_time,
      call_view.caller_area_code,
      call_view.caller_country_code,
      call_view.call_tracking_display_location,
      call_view.type
    FROM call_view
    WHERE call_view.start_call_date_time >= '${startDate} 00:00:00'
      AND call_view.start_call_date_time < '${endExclusiveDate} 00:00:00'
    ORDER BY call_view.start_call_date_time DESC
  `;
}

function googleAdsKeywordQuery(startDate: string, endDate: string) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.status,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value
    FROM keyword_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `;
}

function googleAdsSearchTermQuery(startDate: string, endDate: string) {
  return `
    SELECT
      campaign.name,
      ad_group.name,
      search_term_view.search_term,
      search_term_view.status,
      segments.keyword.info.text,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `;
}

function googleAdsLandingPageQuery(startDate: string, endDate: string) {
  return `
    SELECT
      landing_page_view.unexpanded_final_url,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value
    FROM landing_page_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `;
}

function googleAdsScheduleQuery(startDate: string, endDate: string) {
  return `
    SELECT
      segments.day_of_week,
      segments.hour,
      metrics.impressions,
      metrics.clicks,
      metrics.interactions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.day_of_week, segments.hour
  `;
}

function googleAdsConversionActionQuery() {
  return `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.category,
      conversion_action.status,
      conversion_action.type,
      conversion_action.primary_for_goal
    FROM conversion_action
    ORDER BY conversion_action.name
    LIMIT 100
  `;
}

function googleAdsConversionActionPerformanceQuery(startDate: string, endDate: string) {
  return `
    SELECT
      segments.conversion_action,
      segments.conversion_action_name,
      segments.conversion_action_category,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY metrics.conversions DESC
    LIMIT 100
  `;
}

async function fetchGoogleAdsSummary(
  credentials: GoogleAdsCredentials,
  periodDays: number,
) {
  const range = getMarketingDateRange(periodDays);
  const cacheKey = [
    credentials.customerId,
    periodDays,
    range.startDate,
    range.endDate,
  ].join(':');
  const cached = getCachedValue(googleAdsSummaryCache, cacheKey);
  if (cached) return cached;

  const accessToken = await getGoogleAdsAccessToken(credentials);
  const [
    currentRows,
    previousRows,
    dailyRows,
    deviceRows,
    networkRows,
    adGroupRows,
    clickTypeRows,
    callRows,
    keywordRows,
    searchTermRows,
    landingPageRows,
    scheduleRows,
    conversionActionRows,
    conversionActionPerformanceRows,
    campaignMessageAssetRows,
    campaignMessageAssetPerformanceRows,
  ] = await Promise.all([
    runGoogleAdsQuery(credentials, accessToken, googleAdsCampaignQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(
      credentials,
      accessToken,
      googleAdsCampaignQuery(range.previousStartDate, range.previousEndDate),
    ),
    runGoogleAdsQuery(credentials, accessToken, googleAdsDailyQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(credentials, accessToken, googleAdsDeviceQuery(range.startDate, range.endDate)),
    runOptionalGoogleAdsQuery(
      credentials,
      accessToken,
      googleAdsNetworkQuery(range.startDate, range.endDate),
      'networks',
    ),
    runOptionalGoogleAdsQuery(
      credentials,
      accessToken,
      googleAdsAdGroupQuery(range.startDate, range.endDate),
      'ad-groups',
    ),
    runGoogleAdsQuery(credentials, accessToken, googleAdsClickTypeQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(credentials, accessToken, googleAdsCallViewQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(credentials, accessToken, googleAdsKeywordQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(credentials, accessToken, googleAdsSearchTermQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(credentials, accessToken, googleAdsLandingPageQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(credentials, accessToken, googleAdsScheduleQuery(range.startDate, range.endDate)),
    runGoogleAdsQuery(credentials, accessToken, googleAdsConversionActionQuery()),
    runGoogleAdsQuery(
      credentials,
      accessToken,
      googleAdsConversionActionPerformanceQuery(range.startDate, range.endDate),
    ),
    runOptionalGoogleAdsQuery(
      credentials,
      accessToken,
      googleAdsCampaignMessageAssetQuery(),
      'campaign-message-assets',
    ),
    runOptionalGoogleAdsQuery(
      credentials,
      accessToken,
      googleAdsCampaignMessageAssetPerformanceQuery(range.startDate, range.endDate),
      'campaign-message-asset-performance',
    ),
  ]);
  const dailyByDate = new Map<string, GoogleAdsApiResult[]>();
  dailyRows.forEach((row) => {
    const date = row.segments?.date ?? '';
    if (!date) return;
    dailyByDate.set(date, [...(dailyByDate.get(date) ?? []), row]);
  });
  const daily: GoogleAdsSummary['daily'] = [];
  for (let date = range.startDate; date <= range.endDate; date = addMarketingDays(date, 1)) {
    daily.push({ date, ...aggregateGoogleAdsRows(dailyByDate.get(date) ?? []) });
  }
  const summary: GoogleAdsSummary = {
    current: aggregateGoogleAdsRows(currentRows),
    previous: aggregateGoogleAdsRows(previousRows),
    items: currentRows.map((row) => ({
      id: row.campaign?.id ?? '',
      name: row.campaign?.name ?? 'Campanha sem nome',
      status: row.campaign?.status ?? 'UNKNOWN',
      channelType: row.campaign?.advertisingChannelType ?? 'UNKNOWN',
      dailyBudget: round(toNumber(row.campaignBudget?.amountMicros) / 1_000_000),
      optimizationScore: round(toNumber(row.campaign?.optimizationScore) * 100),
      ...aggregateGoogleAdsRows([row]),
    })),
    daily,
    devices: deviceRows.map((row) => ({
      device: row.segments?.device ?? 'UNKNOWN',
      ...aggregateGoogleAdsRows([row]),
    })),
    networks: networkRows.map((row) => ({
      network: row.segments?.adNetworkType ?? 'UNKNOWN',
      ...aggregateGoogleAdsRows([row]),
    })),
    adGroups: adGroupRows.map((row) => ({
      campaignId: row.campaign?.id ?? '',
      campaign: row.campaign?.name ?? 'Campanha sem nome',
      id: row.adGroup?.id ?? '',
      name: row.adGroup?.name ?? 'Grupo sem nome',
      status: row.adGroup?.status ?? 'UNKNOWN',
      ...aggregateGoogleAdsRows([row]),
    })),
    keywords: keywordRows.map((row) => ({
      campaignId: row.campaign?.id ?? '',
      campaign: row.campaign?.name ?? 'Campanha sem nome',
      adGroupId: row.adGroup?.id ?? '',
      adGroup: row.adGroup?.name ?? 'Grupo sem nome',
      criterionId: row.adGroupCriterion?.criterionId ?? '',
      keyword: row.adGroupCriterion?.keyword?.text ?? '',
      matchType: row.adGroupCriterion?.keyword?.matchType ?? 'UNKNOWN',
      status: row.adGroupCriterion?.status ?? 'UNKNOWN',
      qualityScore: toNumber(row.adGroupCriterion?.qualityInfo?.qualityScore),
      creativeQualityScore: row.adGroupCriterion?.qualityInfo?.creativeQualityScore ?? 'UNKNOWN',
      landingPageQualityScore: row.adGroupCriterion?.qualityInfo?.postClickQualityScore ?? 'UNKNOWN',
      expectedCtrScore: row.adGroupCriterion?.qualityInfo?.searchPredictedCtr ?? 'UNKNOWN',
      ...aggregateGoogleAdsRows([row]),
    })),
    searchTerms: searchTermRows.map((row) => ({
      campaign: row.campaign?.name ?? 'Campanha sem nome',
      adGroup: row.adGroup?.name ?? 'Grupo sem nome',
      searchTerm: row.searchTermView?.searchTerm ?? '',
      status: row.searchTermView?.status ?? 'UNKNOWN',
      keyword: row.segments?.keyword?.info?.text ?? '',
      ...aggregateGoogleAdsRows([row]),
    })),
    landingPages: landingPageRows.map((row) => ({
      url: row.landingPageView?.unexpandedFinalUrl ?? '',
      ...aggregateGoogleAdsRows([row]),
    })),
    schedule: scheduleRows.map((row) => ({
      dayOfWeek: row.segments?.dayOfWeek ?? 'UNKNOWN',
      hour: toNumber(row.segments?.hour),
      ...aggregateGoogleAdsRows([row]),
    })),
    clickTypes: clickTypeRows.map((row) => ({
      type: row.segments?.clickType ?? 'UNKNOWN',
      clicks: toNumber(row.metrics?.clicks),
      interactions: toNumber(row.metrics?.interactions),
      spend: round(toNumber(row.metrics?.costMicros) / 1_000_000),
    })),
    calls: (() => {
      const durations = callRows.map((row) => toNumber(row.callView?.callDurationSeconds));
      const totalDuration = durations.reduce((total, duration) => total + duration, 0);
      return {
        reported: callRows.length,
        received: callRows.filter((row) => row.callView?.callStatus === 'RECEIVED').length,
        missed: callRows.filter((row) => row.callView?.callStatus === 'MISSED').length,
        averageDurationSeconds: durations.length ? round(totalDuration / durations.length) : 0,
        longestDurationSeconds: durations.length ? Math.max(...durations) : 0,
        items: callRows.map((row, index) => {
          const resourceName = row.callView?.resourceName ?? '';
          return {
            id: resourceName.split('/').at(-1) || `call-${index + 1}`,
            startedAt: row.callView?.startCallDateTime ?? '',
            endedAt: row.callView?.endCallDateTime ?? null,
            durationSeconds: toNumber(row.callView?.callDurationSeconds),
            status: row.callView?.callStatus ?? 'UNKNOWN',
            areaCode: row.callView?.callerAreaCode ?? null,
            countryCode: row.callView?.callerCountryCode ?? null,
            displayLocation: row.callView?.callTrackingDisplayLocation ?? 'UNKNOWN',
            type: row.callView?.type ?? 'UNKNOWN',
          };
        }),
      };
    })(),
    conversionActions: conversionActionRows.map((row) => {
      const id = row.conversionAction?.id ?? '';
      const performance = conversionActionPerformanceRows.find((item) =>
        String(item.segments?.conversionAction ?? '').endsWith(`/conversionActions/${id}`)
      );
      return {
        id,
        name: row.conversionAction?.name ?? 'Conversão sem nome',
        category: row.conversionAction?.category ?? 'UNKNOWN',
        status: row.conversionAction?.status ?? 'UNKNOWN',
        conversions: round(toNumber(performance?.metrics?.conversions), 2),
        allConversions: round(toNumber(performance?.metrics?.allConversions), 2),
        conversionValue: round(toNumber(performance?.metrics?.conversionsValue)),
        costPerConversion: 0,
      };
    }),
    messageAssets: campaignMessageAssetRows.map((row) => {
      const assetId = row.asset?.id ?? '';
      const campaignId = row.campaign?.id ?? '';
      const performance = campaignMessageAssetPerformanceRows.find((item) =>
        item.asset?.id === assetId && item.campaign?.id === campaignId
      );
      const messageAsset = row.asset?.businessMessageAsset;
      return {
        id: assetId,
        name: row.asset?.name ?? 'WhatsApp do anúncio',
        provider: messageAsset?.messageProvider ?? 'UNKNOWN',
        phoneNumber: messageAsset?.whatsappInfo?.phoneNumber ?? null,
        countryCode: messageAsset?.whatsappInfo?.countryCode ?? null,
        callToAction: messageAsset?.callToAction?.callToActionSelection ?? 'UNKNOWN',
        starterMessageConfigured: Boolean(messageAsset?.starterMessage),
        level: 'CAMPAIGN' as const,
        campaignId,
        campaign: row.campaign?.name ?? 'Campanha sem nome',
        status: row.campaignAsset?.status ?? 'UNKNOWN',
        primaryStatus: row.campaignAsset?.primaryStatus ?? 'UNKNOWN',
        impressions: toNumber(performance?.metrics?.impressions),
        clicks: toNumber(performance?.metrics?.clicks),
        spend: round(toNumber(performance?.metrics?.costMicros) / 1_000_000),
        conversions: round(toNumber(performance?.metrics?.conversions), 2),
      };
    }),
    syncedAt: new Date().toISOString(),
    accountId: credentials.customerId,
  };
  setCachedValue(googleAdsSummaryCache, cacheKey, summary, GOOGLE_ADS_SUMMARY_CACHE_TTL_MS);
  return summary;
}

function normalizeInternalUser(profile: RawInternalUserProfile | null): InternalUserProfile | null {
  if (!profile) return null;
  const modulos = Array.isArray(profile.modulos) ? profile.modulos[0] : profile.modulos;
  return { ...profile, modulos: modulos ?? null };
}

async function getTargetUser(
  serviceClient: ServiceClient,
  targetUserId: string,
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, acesso, status, modulos:Modulos(admin, marketing)')
    .eq('id_usuarios', targetUserId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a empresa selecionada: ${error.message}`);
  return normalizeInternalUser(data as RawInternalUserProfile | null);
}

async function getTargetUserByAuthId(
  serviceClient: ServiceClient,
  authUserId: string,
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, acesso, status, modulos:Modulos(admin, marketing)')
    .eq('auth_id', authUserId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o perfil autenticado: ${error.message}`);
  return normalizeInternalUser(data as RawInternalUserProfile | null);
}

async function getTargetUserByEmail(
  serviceClient: ServiceClient,
  email: string,
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, acesso, status, modulos:Modulos(admin, marketing)')
    .ilike('email', normalizeEmail(email))
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a empresa principal: ${error.message}`);
  return normalizeInternalUser(data as RawInternalUserProfile | null);
}

async function getMarketingConfig(
  serviceClient: ServiceClient,
  targetUserId: string,
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Config')
    .select([
      'modulo_habilitado',
      'site_key_hash',
      'allowed_origins',
      'ga4_property_id',
      'ga4_status',
      'search_console_site_url',
      'search_console_status',
      'pilot_start_date',
      'pilot_end_date',
      'commission_rate',
      'dedupe_window_minutes',
      'ads_monthly_budget',
      'organic_goal_min',
      'organic_goal_max',
      'qualified_call_seconds',
      'updated_at',
    ].join(','))
    .eq('fk_criado_por', targetUserId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a configuração de Crescimento: ${error.message}`);
  const config: JsonRecord = isRecord(data) ? data as JsonRecord : {};
  return {
    moduloHabilitado: config.modulo_habilitado === true,
    hasSiteKey: Boolean(config.site_key_hash),
    allowedOrigins: Array.isArray(config.allowed_origins) ? config.allowed_origins : [],
    ga4PropertyId: asString(config.ga4_property_id, 80),
    ga4Status: asString(config.ga4_status, 40) ?? 'not_connected',
    searchConsoleSiteUrl: asString(config.search_console_site_url, 500),
    searchConsoleStatus: asString(config.search_console_status, 40) ?? 'not_connected',
    pilotStartDate: asString(config.pilot_start_date, 30),
    pilotEndDate: asString(config.pilot_end_date, 30),
    commissionRate: numberOrDefault(config.commission_rate, 0.2),
    dedupeWindowMinutes: numberOrDefault(config.dedupe_window_minutes, 30),
    adsMonthlyBudget: numberOrDefault(config.ads_monthly_budget, 1000),
    organicGoalMin: numberOrDefault(config.organic_goal_min, 0.25),
    organicGoalMax: numberOrDefault(config.organic_goal_max, 0.6),
    qualifiedCallSeconds: numberOrDefault(config.qualified_call_seconds, 60),
    updatedAt: asString(config.updated_at, 80),
  };
}

async function getMarketingIntegrations(
  serviceClient: ServiceClient,
  targetUserId: string,
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Integracoes')
    .select('provider, status, external_account_name, last_sync_at, last_error')
    .eq('fk_criado_por', targetUserId)
    .order('provider', { ascending: true });
  if (error) throw new Error(`Não foi possível carregar as integrações: ${error.message}`);
  return (data ?? []).map((item) => ({
    provider: item.provider as string,
    status: item.status as MarketingIntegrationStatus,
    accountName: item.external_account_name ?? null,
    lastSyncAt: item.last_sync_at ?? null,
    lastError: item.last_error ?? null,
  })) as MarketingIntegrationSummary[];
}

async function loadTimeBoundRows(
  serviceClient: ServiceClient,
  options: {
    table: string;
    select: string;
    targetUserId: string;
    timestampColumn: string;
    idColumn: string;
    startIso: string;
    endExclusiveIso: string;
    ascending: boolean;
    errorLabel: string;
  },
) {
  const pageSize = 1_000;
  const rows: JsonRecord[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await serviceClient
      .schema('RetificaPremium')
      .from(options.table)
      .select(options.select)
      .eq('fk_criado_por', options.targetUserId)
      .gte(options.timestampColumn, options.startIso)
      .lt(options.timestampColumn, options.endExclusiveIso)
      .order(options.timestampColumn, { ascending: options.ascending })
      .order(options.idColumn, { ascending: options.ascending })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`${options.errorLabel}: ${error.message}`);
    const page = (data ?? []) as unknown as JsonRecord[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadPrivateMarketingData(
  serviceClient: ServiceClient,
  targetUserId: string,
  previousStartIso: string,
  currentEndExclusiveIso: string,
) {
  const [
    events,
    leads,
    attributions,
    commissions,
    offlineConversions,
    snapshotsResult,
    clientsResult,
  ] = await Promise.all([
    loadTimeBoundRows(serviceClient, {
      table: 'Marketing_Site_Eventos',
      select: [
        'id_marketing_site_eventos',
        'external_event_id',
        'lead_code',
        'event_type',
        'channel',
        'occurred_at',
        'session_id',
        'anonymous_id',
        'page_path',
        'page_title',
        'referrer',
        'source',
        'medium',
        'campaign',
        'term',
        'gclid',
        'gbraid',
        'wbraid',
        'device_type',
        'last_field',
        'validation_reason',
        'form_elapsed_seconds',
        'fields_completed',
        'duplicate_count',
        'deduplicated',
        'alert_status',
        'metadata',
      ].join(','),
      targetUserId,
      timestampColumn: 'occurred_at',
      idColumn: 'id_marketing_site_eventos',
      startIso: previousStartIso,
      endExclusiveIso: currentEndExclusiveIso,
      ascending: true,
      errorLabel: 'Não foi possível carregar os eventos de Crescimento',
    }),
    loadTimeBoundRows(serviceClient, {
      table: 'Marketing_Leads',
      select: [
        'id_marketing_leads',
        'lead_code',
        'occurred_at',
        'channel',
        'status',
        'nome',
        'email',
        'telefone',
        'source',
        'medium',
        'campaign',
        'term',
        'gclid',
        'gbraid',
        'wbraid',
        'page_path',
        'fk_clientes',
        'identified_at',
        'identification_method',
      ].join(','),
      targetUserId,
      timestampColumn: 'occurred_at',
      idColumn: 'id_marketing_leads',
      startIso: previousStartIso,
      endExclusiveIso: currentEndExclusiveIso,
      ascending: false,
      errorLabel: 'Não foi possível carregar os contatos de Crescimento',
    }),
    loadTimeBoundRows(serviceClient, {
      table: 'Marketing_Client_Attributions',
      select: 'id_marketing_client_attributions, fk_clientes, fk_marketing_leads, lead_code, channel, source, medium, campaign, attribution_method, attributed_at, metadata',
      targetUserId,
      timestampColumn: 'attributed_at',
      idColumn: 'id_marketing_client_attributions',
      startIso: previousStartIso,
      endExclusiveIso: currentEndExclusiveIso,
      ascending: false,
      errorLabel: 'Não foi possível carregar as atribuições de Crescimento',
    }),
    loadTimeBoundRows(serviceClient, {
      table: 'Marketing_Commission_Snapshots',
      select: 'id_marketing_commission_snapshots, fk_clientes, fk_notas_servico, os_numero, services_snapshot, products_excluded_snapshot, commission_rate_snapshot, commission_amount_snapshot, source_snapshot, campaign_snapshot, approved_at',
      targetUserId,
      timestampColumn: 'approved_at',
      idColumn: 'id_marketing_commission_snapshots',
      startIso: previousStartIso,
      endExclusiveIso: currentEndExclusiveIso,
      ascending: false,
      errorLabel: 'Não foi possível carregar as comissões de Crescimento',
    }),
    loadTimeBoundRows(serviceClient, {
      table: 'Marketing_Offline_Conversions',
      select: [
        'id_marketing_offline_conversions',
        'fk_clientes',
        'conversion_kind',
        'click_id_type',
        'conversion_date_time',
        'status',
        'attempts',
        'next_attempt_at',
        'uploaded_at',
        'google_error_code',
        'google_error_message',
        'created_at',
        'updated_at',
      ].join(','),
      targetUserId,
      timestampColumn: 'conversion_date_time',
      idColumn: 'id_marketing_offline_conversions',
      startIso: previousStartIso,
      endExclusiveIso: currentEndExclusiveIso,
      ascending: false,
      errorLabel: 'Não foi possível carregar as conversões offline',
    }),
    serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Snapshots')
      .select('snapshot_type, period_start, period_end, metrics, generated_at')
      .eq('fk_criado_por', targetUserId)
      .order('period_start', { ascending: true }),
    serviceClient
      .schema('RetificaPremium')
      .from('Clientes')
      .select('id_clientes, nome, documento, created_at')
      .eq('fk_criado_por', targetUserId)
      .order('nome', { ascending: true })
      .limit(1000),
  ]);

  const failed = [snapshotsResult.error, clientsResult.error].find(Boolean);
  if (failed) throw new Error(`Não foi possível carregar os dados privados de Crescimento: ${failed.message}`);

  return {
    events,
    leads,
    attributions,
    commissions,
    offlineConversions,
    snapshots: (snapshotsResult.data ?? []) as unknown as JsonRecord[],
    clients: (clientsResult.data ?? []) as unknown as JsonRecord[],
  };
}

async function loadBasicMarketingData(
  serviceClient: ServiceClient,
  targetUserId: string,
  previousStartIso: string,
  currentEndExclusiveIso: string,
) {
  const [events, leads] = await Promise.all([
    loadTimeBoundRows(serviceClient, {
      table: 'Marketing_Site_Eventos',
      select: [
        'id_marketing_site_eventos',
        'event_type',
        'occurred_at',
        'page_path',
        'page_title',
        'source',
        'medium',
        'channel',
        'duplicate_count',
        'metadata',
      ].join(','),
      targetUserId,
      timestampColumn: 'occurred_at',
      idColumn: 'id_marketing_site_eventos',
      startIso: previousStartIso,
      endExclusiveIso: currentEndExclusiveIso,
      ascending: true,
      errorLabel: 'Não foi possível carregar os eventos de Crescimento',
    }),
    loadTimeBoundRows(serviceClient, {
      table: 'Marketing_Leads',
      select: 'id_marketing_leads, occurred_at, source, medium, page_path',
      targetUserId,
      timestampColumn: 'occurred_at',
      idColumn: 'id_marketing_leads',
      startIso: previousStartIso,
      endExclusiveIso: currentEndExclusiveIso,
      ascending: false,
      errorLabel: 'Não foi possível carregar os contatos de Crescimento',
    }),
  ]);

  return {
    events,
    leads,
    attributions: [] as JsonRecord[],
    commissions: [] as JsonRecord[],
    offlineConversions: [] as JsonRecord[],
    snapshots: [] as JsonRecord[],
    clients: [] as JsonRecord[],
  };
}

function inRange(value: unknown, startIso: string, endExclusiveIso: string) {
  const timestamp = String(value ?? '');
  return timestamp >= startIso && timestamp < endExclusiveIso;
}

function buildEmptyDaily(periodDays: number, startDate: string): MarketingDailyMetric[] {
  return Array.from({ length: periodDays }, (_, index) => ({
    date: addMarketingDays(startDate, index),
    visits: 0,
    sessions: 0,
    pageViews: 0,
    actions: 0,
    leads: 0,
  }));
}

function aggregateInternalData(
  periodDays: number,
  events: JsonRecord[],
  leads: JsonRecord[],
) {
  const range = getMarketingDateRange(periodDays);
  const startIso = toMarketingDayStartIso(range.startDate);
  const previousStartIso = toMarketingDayStartIso(range.previousStartDate);
  const currentEndExclusiveIso = toMarketingDayAfterEndIso(range.endDate);
  const currentEvents = events.filter((event) => inRange(event.occurred_at, startIso, currentEndExclusiveIso));
  const previousEvents = events.filter((event) => inRange(event.occurred_at, previousStartIso, startIso));
  const currentLeads = leads.filter((lead) => inRange(lead.occurred_at, startIso, currentEndExclusiveIso));
  const previousLeads = leads.filter((lead) => inRange(lead.occurred_at, previousStartIso, startIso));

  const countEvent = (items: JsonRecord[], type: string) => items.filter((item) => item.event_type === type).length;
  const pageMap = new Map<string, MarketingPageMetric>();
  const sourceMap = new Map<string, MarketingSourceMetric>();
  const conversionsByPath = new Map<string, number>();

  currentEvents.forEach((event) => {
    const path = String(event.page_path || '/');
    const page = pageMap.get(path) ?? {
      path,
      title: typeof event.page_title === 'string' ? event.page_title : null,
      views: 0,
      conversions: 0,
    };
    if (event.event_type === 'page_view') page.views += 1;
    if (['whatsapp_click', 'phone_click', 'form_submit', 'lead_created'].includes(String(event.event_type))) {
      page.conversions += 1;
      conversionsByPath.set(path, (conversionsByPath.get(path) ?? 0) + 1);
    }
    pageMap.set(path, page);

    const source = String(event.source || 'direto');
    const medium = String(event.medium || 'sem meio');
    const sourceKey = `${source}\u0000${medium}`;
    const sourceMetric = sourceMap.get(sourceKey) ?? emptySourceMetric(source, medium);
    if (event.event_type === 'page_view') sourceMetric.visits += 1;
    if (event.event_type === 'page_view') sourceMetric.pageViews += 1;
    if (event.event_type === 'whatsapp_click') sourceMetric.whatsappClicks += 1;
    if (event.event_type === 'phone_click') sourceMetric.phoneClicks += 1;
    if (event.event_type === 'form_submit') sourceMetric.formSubmits += 1;
    sourceMap.set(sourceKey, sourceMetric);
  });

  currentLeads.forEach((lead) => {
    const source = String(lead.source || 'direto');
    const medium = String(lead.medium || 'sem meio');
    const sourceKey = `${source}\u0000${medium}`;
    const metric = sourceMap.get(sourceKey) ?? emptySourceMetric(source, medium);
    metric.leads += 1;
    sourceMap.set(sourceKey, metric);
  });

  const daily = buildEmptyDaily(periodDays, range.startDate);
  const dailyByDate = new Map(daily.map((item) => [item.date, item]));
  currentEvents.forEach((event) => {
    const item = dailyByDate.get(getMarketingDateKey(String(event.occurred_at ?? '')));
    if (!item) return;
    if (event.event_type === 'page_view') {
      item.visits += 1;
      item.pageViews += 1;
    }
    if (['whatsapp_click', 'phone_click', 'form_submit'].includes(String(event.event_type))) item.actions += 1;
  });
  currentLeads.forEach((lead) => {
    const item = dailyByDate.get(getMarketingDateKey(String(lead.occurred_at ?? '')));
    if (item) item.leads += 1;
  });

  const buildTotals = (eventItems: JsonRecord[], leadItems: JsonRecord[]) => ({
    visits: countEvent(eventItems, 'page_view'),
    whatsappClicks: countEvent(eventItems, 'whatsapp_click'),
    phoneClicks: countEvent(eventItems, 'phone_click'),
    formViews: countEvent(eventItems, 'form_view'),
    formStarts: countEvent(eventItems, 'form_start'),
    formAbandons: countEvent(eventItems, 'form_abandon'),
    formSubmitAttempts: countEvent(eventItems, 'form_submit_attempt'),
    formValidationErrors: countEvent(eventItems, 'form_validation_error'),
    formSubmitErrors: countEvent(eventItems, 'form_submit_error'),
    formSubmits: countEvent(eventItems, 'form_submit'),
    leads: leadItems.length,
    totalEvents: eventItems.length,
  });

  const current = buildTotals(currentEvents, currentLeads);
  const previous = buildTotals(previousEvents, previousLeads);
  const formAbandonmentMap = new Map<string, { field: string; count: number; averageSeconds: number; totalSeconds: number }>();
  currentEvents
    .filter((event) => event.event_type === 'form_abandon' || event.event_type === 'form_validation_error')
    .forEach((event) => {
      const field = String(event.last_field || event.validation_reason || 'Não informado');
      const currentItem = formAbandonmentMap.get(field) ?? { field, count: 0, averageSeconds: 0, totalSeconds: 0 };
      currentItem.count += 1;
      currentItem.totalSeconds += toNumber(event.form_elapsed_seconds);
      currentItem.averageSeconds = round(currentItem.totalSeconds / currentItem.count);
      formAbandonmentMap.set(field, currentItem);
    });

  return {
    current,
    previous,
    daily,
    pages: Array.from(pageMap.values()).sort((a, b) => b.views - a.views).slice(0, 12),
    sources: Array.from(sourceMap.values()).sort((a, b) => b.visits - a.visits),
    conversionsByPath,
    formAbandonment: Array.from(formAbandonmentMap.values())
      .map(({ totalSeconds: _totalSeconds, ...item }) => item)
      .sort((a, b) => b.count - a.count),
    currentEvents,
    currentLeads,
  };
}

function aggregateBusinessData(
  periodDays: number,
  attributions: JsonRecord[],
  commissions: JsonRecord[],
  leads: JsonRecord[],
  clients: JsonRecord[],
) {
  const range = getMarketingDateRange(periodDays);
  const startIso = toMarketingDayStartIso(range.startDate);
  const previousStartIso = toMarketingDayStartIso(range.previousStartDate);
  const currentEndExclusiveIso = toMarketingDayAfterEndIso(range.endDate);
  const currentAttributions = attributions.filter((item) => inRange(item.attributed_at, startIso, currentEndExclusiveIso));
  const previousAttributions = attributions.filter((item) => inRange(item.attributed_at, previousStartIso, startIso));
  const currentCommissions = commissions.filter((item) => inRange(item.approved_at, startIso, currentEndExclusiveIso));
  const previousCommissions = commissions.filter((item) => inRange(item.approved_at, previousStartIso, startIso));

  const leadsById = new Map(leads.map((item) => [String(item.id_marketing_leads ?? ''), item]));
  const clientsById = new Map(clients.map((item) => [String(item.id_clientes ?? ''), item]));
  const getMetadata = (item: JsonRecord): JsonRecord => (
    item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? item.metadata as JsonRecord
      : {}
  );
  const classifyCustomer = (item: JsonRecord) => {
    const metadata = getMetadata(item);
    const explicitType = String(metadata.customer_type ?? '').toUpperCase();
    if (['NEW', 'EXISTING', 'UNKNOWN'].includes(explicitType)) return explicitType;

    const lead = leadsById.get(String(item.fk_marketing_leads ?? ''));
    const client = clientsById.get(String(item.fk_clientes ?? ''));
    const leadOccurredAt = String(metadata.lead_occurred_at ?? lead?.occurred_at ?? '');
    const clientCreatedAt = String(client?.created_at ?? '');
    const leadTime = Date.parse(leadOccurredAt);
    const clientTime = Date.parse(clientCreatedAt);
    if (!Number.isFinite(leadTime) || !Number.isFinite(clientTime)) return 'UNKNOWN';
    return clientTime < leadTime ? 'EXISTING' : 'NEW';
  };

  const totals = (attributionItems: JsonRecord[], commissionItems: JsonRecord[]) => {
    const customerTypes = attributionItems.map(classifyCustomer);
    return {
      identifiedClients: attributionItems.length,
      newClients: customerTypes.filter((type) => type === 'NEW').length,
      existingClients: customerTypes.filter((type) => type === 'EXISTING').length,
      unknownClients: customerTypes.filter((type) => type === 'UNKNOWN').length,
      confirmedCalls: attributionItems.filter((item) => getMetadata(item).confirmed_call === true).length,
      confirmedArrivals: attributionItems.filter((item) => getMetadata(item).confirmed_arrival === true).length,
      approvedOrders: commissionItems.length,
      approvedServices: round(commissionItems.reduce((sum, item) => sum + toNumber(item.services_snapshot), 0)),
      excludedProducts: round(commissionItems.reduce((sum, item) => sum + toNumber(item.products_excluded_snapshot), 0)),
      commission: round(commissionItems.reduce((sum, item) => sum + toNumber(item.commission_amount_snapshot), 0)),
    };
  };

  return {
    current: totals(currentAttributions, currentCommissions),
    previous: totals(previousAttributions, previousCommissions),
    attributions: currentAttributions.slice(0, 50),
    commissions: currentCommissions.slice(0, 50),
  };
}

function withoutGoogleClickIds(item: JsonRecord) {
  const { gclid: _gclid, gbraid: _gbraid, wbraid: _wbraid, ...safe } = item;
  return {
    ...safe,
    google_click_id_type: getClickIdType(item),
  };
}

function isPaidMarketingItem(item: JsonRecord) {
  return classifyMarketingAttribution(item) === 'paid';
}

function buildSiteWhatsappSummary(events: JsonRecord[]): MarketingSiteWhatsappSummary {
  const points = new Map<string, MarketingSiteWhatsappSummary['points'][number]>();
  let uniqueClicks = 0;
  let repeatedClicks = 0;
  let paidClicks = 0;
  let organicClicks = 0;
  let otherClicks = 0;

  events
    .filter((event) => event.event_type === 'whatsapp_click' && !isTechnicalPaidTest(event))
    .forEach((event) => {
      const metadata = (
        event.metadata
        && typeof event.metadata === 'object'
        && !Array.isArray(event.metadata)
      ) ? event.metadata as JsonRecord : {};
      const eventLabel = asString(metadata.eventLabel, 120)
        ?? asString(metadata.event_label, 120)
        ?? 'nao_informado';
      const pagePath = asString(event.page_path, 800) ?? '/';
      const duplicateCount = Math.max(0, Math.trunc(toNumber(event.duplicate_count)));
      const attribution = classifyMarketingAttribution(event);
      const occurredAt = asString(event.occurred_at, 80) ?? '';
      const key = `${eventLabel}\u0000${pagePath}`;
      const current = points.get(key) ?? {
        eventLabel,
        pagePath,
        uniqueClicks: 0,
        repeatedClicks: 0,
        paidClicks: 0,
        organicClicks: 0,
        otherClicks: 0,
        lastClickedAt: '',
      };

      uniqueClicks += 1;
      repeatedClicks += duplicateCount;
      paidClicks += attribution === 'paid' ? 1 : 0;
      organicClicks += attribution === 'organic' ? 1 : 0;
      otherClicks += attribution === 'other' ? 1 : 0;
      current.uniqueClicks += 1;
      current.repeatedClicks += duplicateCount;
      current.paidClicks += attribution === 'paid' ? 1 : 0;
      current.organicClicks += attribution === 'organic' ? 1 : 0;
      current.otherClicks += attribution === 'other' ? 1 : 0;
      current.lastClickedAt = occurredAt > current.lastClickedAt
        ? occurredAt
        : current.lastClickedAt;
      points.set(key, current);
    });

  return {
    uniqueClicks,
    repeatedClicks,
    paidClicks,
    organicClicks,
    otherClicks,
    points: Array.from(points.values())
      .sort((left, right) => right.lastClickedAt.localeCompare(left.lastClickedAt))
      .slice(0, 20),
  };
}

function aggregateOfflineConversions(items: JsonRecord[]) {
  const counts = { total: items.length, pending: 0, processing: 0, uploaded: 0, retry: 0, failed: 0 };
  items.forEach((item) => {
    const status = String(item.status ?? '') as keyof typeof counts;
    if (status in counts && status !== 'total') counts[status] += 1;
  });
  return {
    ...counts,
    items: items.slice(0, 100),
  };
}

function mergeIntegration(
  integrations: MarketingIntegrationSummary[],
  next: MarketingIntegrationSummary,
) {
  return [next, ...integrations.filter((item) => item.provider !== next.provider)];
}

async function linkLeadToClient(
  request: Request,
  serviceClient: ServiceClient,
  targetUserId: string,
  actorUserId: string,
  body: JsonRecord,
) {
  const leadId = asString(body.leadId, 80);
  const clientId = asString(body.clientId, 80);
  const method = asString(body.identificationMethod, 80) ?? 'codigo_confirmado';
  if (!leadId || !clientId) {
    return jsonResponse({ error: 'Contato e cliente são obrigatórios.' }, 400, request);
  }

  const [leadResult, clientResult] = await Promise.all([
    serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Leads')
      .select('id_marketing_leads, lead_code, channel, source, medium, campaign')
      .eq('id_marketing_leads', leadId)
      .eq('fk_criado_por', targetUserId)
      .maybeSingle(),
    serviceClient
      .schema('RetificaPremium')
      .from('Clientes')
      .select('id_clientes')
      .eq('id_clientes', clientId)
      .eq('fk_criado_por', targetUserId)
      .maybeSingle(),
  ]);
  if (leadResult.error || clientResult.error || !leadResult.data || !clientResult.data) {
    return jsonResponse({ error: 'Contato ou cliente não pertence à empresa selecionada.' }, 404, request);
  }

  const lead = leadResult.data;
  const { error: attributionError } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Client_Attributions')
    .upsert({
      fk_criado_por: targetUserId,
      fk_clientes: clientId,
      fk_marketing_leads: leadId,
      lead_code: lead.lead_code,
      channel: lead.channel ?? 'internet',
      source: lead.source,
      medium: lead.medium,
      campaign: lead.campaign,
      attribution_method: method,
      attributed_by: actorUserId,
      attributed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fk_criado_por,fk_clientes' });
  if (attributionError) return jsonResponse({ error: 'Não foi possível vincular o cliente.' }, 500, request);

  const { error: leadError } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Leads')
    .update({
      fk_clientes: clientId,
      identified_at: new Date().toISOString(),
      identification_method: method,
      status: 'identificado',
      updated_at: new Date().toISOString(),
    })
    .eq('id_marketing_leads', leadId)
    .eq('fk_criado_por', targetUserId);
  if (leadError) return jsonResponse({ error: 'Cliente vinculado, mas o contato não pôde ser atualizado.' }, 500, request);

  await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Audit_Logs')
    .insert({
      fk_criado_por: targetUserId,
      actor_usuario_id: actorUserId,
      action: 'link_marketing_lead_to_client',
      target_type: 'Clientes',
      target_id: clientId,
      metadata: { leadId, leadCode: lead.lead_code, method },
    });

  return jsonResponse({ status: 200, mensagem: 'Cliente vinculado à origem da internet.' }, 200, request);
}

async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500, request);
  }

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request);

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request);

  const requesterEmail = normalizeEmail(userData.user.email ?? '');
  const requesterIsAllowlisted = Boolean(requesterEmail && getSuperAdminEmails().has(requesterEmail));
  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await request.json().catch(() => ({})) as JsonRecord;
    const periodDays = parsePeriod(body.p_periodo_dias);
    const requestedTargetUserId = asString(body.p_target_user_id, 80);
    const requesterProfile = await getTargetUserByAuthId(serviceClient, userData.user.id);
    const requesterIsActiveAdmin = Boolean(
      requesterProfile
      && requesterProfile.status !== false
      && requesterProfile.acesso.trim().toLowerCase() === 'administrador'
      && requesterProfile.modulos?.admin === true,
    );
    if (requesterIsAllowlisted && !requesterIsActiveAdmin) {
      return jsonResponse({ error: 'Perfil Mega Master inativo ou sem permissão administrativa.' }, 403, request);
    }
    const requesterIsMegaMaster = requesterIsAllowlisted && requesterIsActiveAdmin;
    const hasPrivateAccess = requesterIsActiveAdmin && requesterProfile?.modulos?.marketing === true;
    const canManageAttribution = requesterIsMegaMaster;
    let targetUser = requesterProfile;

    if (hasPrivateAccess) {
      const retificaPremium = await getTargetUserByEmail(serviceClient, RETIFICA_PREMIUM_MARKETING_EMAIL);
      if (!retificaPremium) {
        return jsonResponse({ error: 'A empresa Retífica Premium não foi encontrada.' }, 503, request);
      }

      if (!requesterIsMegaMaster && requestedTargetUserId && requestedTargetUserId !== retificaPremium.id_usuarios) {
        return jsonResponse({ error: 'O Master autorizado consulta somente os dados da Retífica Premium.' }, 403, request);
      }

      targetUser = requesterIsMegaMaster && requestedTargetUserId
        ? await getTargetUser(serviceClient, requestedTargetUserId)
        : retificaPremium;
    }

    if (!targetUser) {
      return jsonResponse({
        error: 'Perfil da empresa não encontrado.',
      }, 403, request);
    }
    if (!hasPrivateAccess && requestedTargetUserId && requestedTargetUserId !== targetUser.id_usuarios) {
      return jsonResponse({ error: 'A empresa autenticada não pode consultar dados de outra conta.' }, 403, request);
    }
    if (targetUser.status === false || targetUser.modulos?.marketing !== true) {
      return jsonResponse({ error: 'Empresa sem o módulo Crescimento habilitado.' }, 403, request);
    }
    const targetUserId = targetUser.id_usuarios;

    if (asString(body.action, 40) === 'link_client') {
      if (!canManageAttribution) {
        return jsonResponse({ error: 'Vínculo de contatos é privado do Mega Master.' }, 403, request);
      }
      if (!requesterProfile?.id_usuarios) {
        return jsonResponse({ error: 'Perfil Mega Master não encontrado.' }, 403, request);
      }
      return await linkLeadToClient(request, serviceClient, targetUserId, requesterProfile.id_usuarios, body);
    }

    const range = getMarketingDateRange(periodDays);
    const previousStartIso = toMarketingDayStartIso(range.previousStartDate);
    const currentEndExclusiveIso = toMarketingDayAfterEndIso(range.endDate);
    const [config, storedIntegrations, privateData] = await Promise.all([
      getMarketingConfig(serviceClient, targetUserId),
      getMarketingIntegrations(serviceClient, targetUserId),
      hasPrivateAccess
        ? loadPrivateMarketingData(serviceClient, targetUserId, previousStartIso, currentEndExclusiveIso)
        : loadBasicMarketingData(serviceClient, targetUserId, previousStartIso, currentEndExclusiveIso),
    ]);
    const internal = aggregateInternalData(periodDays, privateData.events, privateData.leads);
    const business = aggregateBusinessData(
      periodDays,
      privateData.attributions,
      privateData.commissions,
      privateData.leads,
      privateData.clients,
    );
    const paidCurrentEvents = internal.currentEvents.filter((event) =>
      isPaidMarketingItem(event) && !isTechnicalPaidTest(event)
    );
    const paidVisitors = hasPrivateAccess
      ? buildMarketingVisitorSessions(paidCurrentEvents, internal.currentLeads, {
        onlyPaid: true,
        limit: Math.max(1, paidCurrentEvents.length),
      })
      : [];
    const allVisitors = hasPrivateAccess
      ? buildMarketingVisitorSessions(internal.currentEvents, internal.currentLeads, {
        limit: Math.max(1, internal.currentEvents.length),
      })
      : [];
    const countPaidAction = (type: string) =>
      paidCurrentEvents.filter((event) => event.event_type === type).length;
    const paidActions = {
      trackedSessions: new Set(paidCurrentEvents.map(getMarketingVisitorKey).filter(Boolean)).size,
      whatsappClicks: countPaidAction('whatsapp_click'),
      phoneClicks: countPaidAction('phone_click'),
      formSubmits: countPaidAction('form_submit'),
    };
    const offlineConversions = aggregateOfflineConversions(privateData.offlineConversions);
    const internalActionsCanCoverComparison = Boolean(
      config.hasSiteKey
      && config.pilotStartDate
      && config.pilotStartDate <= range.previousStartDate,
    );

    let integrations = storedIntegrations;
    let ga4: Ga4Summary | null = null;
    let searchConsole: SearchConsoleSummary | null = null;
    let googleAds: GoogleAdsSummary | null = null;
    let googleAdsFailureMessage: string | null = null;
    const googleCredentialRaw = Deno.env.get('GA4_SERVICE_ACCOUNT_JSON') ?? '';
    const serviceAccount = googleCredentialRaw ? parseServiceAccount(googleCredentialRaw) : null;

    if (config.ga4PropertyId && serviceAccount) {
      try {
        const cachedGa4 = await fetchGa4Summary(
          config.ga4PropertyId,
          serviceAccount,
          periodDays,
        );
        ga4 = mergeGa4WithInternalData(
          cachedGa4,
          internal.daily,
          internal.conversionsByPath,
          internal.sources,
          internalActionsCanCoverComparison,
        );
        integrations = mergeIntegration(integrations, {
          provider: 'ga4',
          status: 'connected',
          accountName: `GA4 ${config.ga4PropertyId}`,
          lastSyncAt: ga4.syncedAt,
          lastError: null,
          freshness: 'Dados intradiários · cache de até 10 min',
        });
      } catch (error) {
        console.error('GA4 dashboard sync failed', error instanceof Error ? error.message : 'unknown');
        integrations = mergeIntegration(integrations, {
          provider: 'ga4',
          status: 'needs_attention',
          accountName: `GA4 ${config.ga4PropertyId}`,
          lastSyncAt: null,
          lastError: 'Não foi possível sincronizar o GA4 agora.',
          freshness: 'Aguardando Google',
        });
      }
    } else {
      integrations = mergeIntegration(integrations, {
        provider: 'ga4',
        status: 'not_connected',
        accountName: config.ga4PropertyId ? `GA4 ${config.ga4PropertyId}` : null,
        lastSyncAt: null,
        lastError: 'Propriedade ou credencial GA4 ausente.',
        freshness: 'Configuração pendente',
      });
    }

    if (config.searchConsoleSiteUrl && serviceAccount) {
      try {
        searchConsole = await fetchSearchConsoleSummary(
          config.searchConsoleSiteUrl,
          serviceAccount,
          periodDays,
        );
        integrations = mergeIntegration(integrations, {
          provider: 'search_console',
          status: 'connected',
          accountName: config.searchConsoleSiteUrl,
          lastSyncAt: searchConsole.syncedAt,
          lastError: null,
          freshness: 'Defasagem de 2–3 dias · cache de até 60 min',
        });
      } catch (error) {
        console.error('Search Console sync failed', error instanceof Error ? error.message : 'unknown');
        integrations = mergeIntegration(integrations, {
          provider: 'search_console',
          status: 'needs_attention',
          accountName: config.searchConsoleSiteUrl,
          lastSyncAt: null,
          lastError: 'Autorize a conta de serviço na propriedade do Search Console.',
          freshness: 'Aguardando autorização',
        });
      }
    } else {
      integrations = mergeIntegration(integrations, {
        provider: 'search_console',
        status: 'not_connected',
        accountName: config.searchConsoleSiteUrl,
        lastSyncAt: null,
        lastError: 'Propriedade do Search Console ou credencial Google ausente.',
        freshness: 'Configuração pendente',
      });
    }

    integrations = mergeIntegration(integrations, {
      provider: 'internal',
      status: config.hasSiteKey ? 'connected' : 'needs_attention',
      accountName: 'Eventos próprios do site',
      lastSyncAt: internal.currentEvents.at(-1)?.occurred_at as string | undefined ?? null,
      lastError: config.hasSiteKey ? null : 'A chave segura do site ainda não foi configurada.',
      freshness: config.hasSiteKey ? 'Atualização em até 5 minutos' : 'Configuração pendente',
    });

    const googleAdsBelongsToTarget = normalizeEmail(targetUser.email) === RETIFICA_PREMIUM_MARKETING_EMAIL;
    if (googleAdsBelongsToTarget) {
      try {
        const googleAdsCredentials = getGoogleAdsCredentials();
        if (!googleAdsCredentials) {
          integrations = mergeIntegration(integrations, {
            provider: 'google_ads',
            status: 'not_connected',
            accountName: null,
            lastSyncAt: null,
            lastError: 'Credencial Google Ads ainda não configurada.',
            freshness: 'Configuração pendente',
          });
        } else {
          googleAds = await fetchGoogleAdsSummary(googleAdsCredentials, periodDays);
          integrations = mergeIntegration(integrations, {
            provider: 'google_ads',
            status: 'connected',
            accountName: `Retífica Premium · ${formatGoogleAdsCustomerId(googleAds.accountId)}`,
            lastSyncAt: googleAds.syncedAt,
            lastError: null,
            freshness: 'Dados oficiais · cache de até 10 min',
          });
        }
      } catch (error) {
        console.error('Google Ads dashboard sync failed', error instanceof Error ? error.message : 'unknown');
        googleAdsFailureMessage = getPublicGoogleAdsFailureMessage(error);
        integrations = mergeIntegration(integrations, {
          provider: 'google_ads',
          status: 'needs_attention',
          accountName: 'Retífica Premium',
          lastSyncAt: null,
          lastError: googleAdsFailureMessage,
          freshness: 'Aguardando Google Ads',
        });
      }
    } else {
      integrations = mergeIntegration(integrations, {
        provider: 'google_ads',
        status: 'not_connected',
        accountName: null,
        lastSyncAt: null,
        lastError: 'Google Ads não configurado para esta empresa.',
        freshness: 'Configuração pendente',
      });
    }

    const gaCurrent = ga4?.current;
    const gaPrevious = ga4?.previous;
    // Só compara ações próprias quando o piloto cobre integralmente o período
    // atual e o anterior. A existência da chave, sozinha, não prova cobertura
    // histórica nem instrumentação de WhatsApp/formulário.
    const actionMetricsDecision = resolveMarketingActionMetricsSource({
      hasSiteKey: config.hasSiteKey,
      pilotStartDate: config.pilotStartDate,
      comparisonStartDate: range.previousStartDate,
      hasGa4: Boolean(ga4),
    });
    const useFirstPartyActions = actionMetricsDecision.useFirstPartyActions;
    const siteCurrent = {
      visits: gaCurrent?.activeUsers ?? internal.current.visits,
      newUsers: gaCurrent?.newUsers ?? 0,
      sessions: gaCurrent?.sessions ?? 0,
      pageViews: gaCurrent?.pageViews ?? internal.current.visits,
      whatsappClicks: useFirstPartyActions ? internal.current.whatsappClicks : (gaCurrent?.whatsappClicks ?? 0),
      phoneClicks: useFirstPartyActions ? internal.current.phoneClicks : (gaCurrent?.phoneClicks ?? 0),
      formViews: useFirstPartyActions ? internal.current.formViews : (gaCurrent?.formViews ?? 0),
      formStarts: useFirstPartyActions ? internal.current.formStarts : (gaCurrent?.formStarts ?? 0),
      formAbandons: internal.current.formAbandons,
      formSubmitAttempts: internal.current.formSubmitAttempts,
      formValidationErrors: internal.current.formValidationErrors,
      formSubmitErrors: internal.current.formSubmitErrors,
      formSubmits: useFirstPartyActions
        ? internal.current.formSubmits
        : Math.max(gaCurrent?.formSubmits ?? 0, gaCurrent?.generateLeads ?? 0),
      totalEvents: gaCurrent?.events ?? internal.current.totalEvents,
      actionEvents: useFirstPartyActions
        ? internal.current.whatsappClicks + internal.current.phoneClicks + internal.current.formSubmits
        : (gaCurrent?.whatsappClicks ?? 0)
          + (gaCurrent?.phoneClicks ?? 0)
          + Math.max(gaCurrent?.formSubmits ?? 0, gaCurrent?.generateLeads ?? 0),
      engagementRate: gaCurrent?.engagementRate ?? 0,
      averageSessionDuration: gaCurrent?.averageSessionDuration ?? 0,
      engagedSessions: gaCurrent?.engagedSessions ?? 0,
      leads: internal.current.leads,
      conversionRate: percentage(internal.current.leads, gaCurrent?.activeUsers ?? internal.current.visits),
    };
    const sitePrevious = {
      visits: gaPrevious?.activeUsers ?? internal.previous.visits,
      newUsers: gaPrevious?.newUsers ?? 0,
      sessions: gaPrevious?.sessions ?? 0,
      pageViews: gaPrevious?.pageViews ?? internal.previous.visits,
      whatsappClicks: useFirstPartyActions ? internal.previous.whatsappClicks : (gaPrevious?.whatsappClicks ?? 0),
      phoneClicks: useFirstPartyActions ? internal.previous.phoneClicks : (gaPrevious?.phoneClicks ?? 0),
      formViews: useFirstPartyActions ? internal.previous.formViews : (gaPrevious?.formViews ?? 0),
      formStarts: useFirstPartyActions ? internal.previous.formStarts : (gaPrevious?.formStarts ?? 0),
      formAbandons: internal.previous.formAbandons,
      formSubmitAttempts: internal.previous.formSubmitAttempts,
      formValidationErrors: internal.previous.formValidationErrors,
      formSubmitErrors: internal.previous.formSubmitErrors,
      formSubmits: useFirstPartyActions
        ? internal.previous.formSubmits
        : Math.max(gaPrevious?.formSubmits ?? 0, gaPrevious?.generateLeads ?? 0),
      totalEvents: gaPrevious?.events ?? internal.previous.totalEvents,
      actionEvents: useFirstPartyActions
        ? internal.previous.whatsappClicks + internal.previous.phoneClicks + internal.previous.formSubmits
        : (gaPrevious?.whatsappClicks ?? 0)
          + (gaPrevious?.phoneClicks ?? 0)
          + Math.max(gaPrevious?.formSubmits ?? 0, gaPrevious?.generateLeads ?? 0),
      engagementRate: gaPrevious?.engagementRate ?? 0,
      averageSessionDuration: gaPrevious?.averageSessionDuration ?? 0,
      engagedSessions: gaPrevious?.engagedSessions ?? 0,
      leads: internal.previous.leads,
    };
    const siteSources = ga4?.sources ?? internal.sources;
    const aiTraffic = buildAiTrafficSummary(siteSources);
    const businessProfile = ga4?.businessProfile ?? {
      status: 'not_available' as const,
      current: emptyBusinessProfileTotals(),
      previous: emptyBusinessProfileTotals(),
      syncedAt: null,
      dataWindowMonths: 6 as const,
    };

    const unlinkedLeads = internal.currentLeads.filter((lead) => !lead.fk_clientes);
    const quality = {
      lastEventAt: internal.currentEvents.at(-1)?.occurred_at ?? null,
      alertFailures: internal.currentEvents.filter((event) => event.alert_status === 'failed').length,
      duplicatedClicks: internal.currentEvents.reduce((sum, event) => sum + toNumber(event.duplicate_count), 0),
      unlinkedLeads: unlinkedLeads.length,
      eventsWithoutSource: internal.currentEvents.filter((event) => !event.source || event.source === 'direto').length,
      actionMetricsSource: actionMetricsDecision.source,
      actionMetricsLabel: actionMetricsDecision.label,
      refreshIntervalMinutes: 5,
      generatedAt: new Date().toISOString(),
    };
    const emptyGoogleAdsTotals = aggregateGoogleAdsRows([]);
    const googleAdsStatusMessage = googleAds
      ? googleAds.items.length > 0
        ? 'Dados oficiais do Google Ads sincronizados.'
        : 'Conta conectada. Nenhuma campanha ou veiculação no período.'
      : googleAdsFailureMessage ?? 'Google Ads aguardando uma conexão válida.';

    if (!hasPrivateAccess) {
      return jsonResponse({
        status: 200,
        mensagem: 'Resumo de Crescimento carregado.',
        dados: {
          periodDays,
          context: {
            targetUserId: targetUser.id_usuarios,
            targetName: targetUser.nome,
            privateToMegaMaster: false,
            accessLevel: 'basic',
          },
          config: {
            moduloHabilitado: config.moduloHabilitado,
            ga4Status: integrations.find((item) => item.provider === 'ga4')?.status ?? config.ga4Status,
            searchConsoleStatus: integrations.find((item) => item.provider === 'search_console')?.status
              ?? config.searchConsoleStatus,
            updatedAt: config.updatedAt,
          },
          integrations: integrations.map((item) => ({
            provider: item.provider,
            status: item.status,
            lastSyncAt: item.lastSyncAt,
            freshness: item.freshness,
          })),
          site: {
            current: siteCurrent,
            previous: sitePrevious,
            whatsapp: buildSiteWhatsappSummary(internal.currentEvents),
            pages: ga4?.pages ?? internal.pages,
            sources: siteSources,
            aiTraffic,
            devices: ga4?.devices ?? [],
            daily: ga4?.daily ?? internal.daily,
          },
          businessProfile,
          forms: {
            current: {
              views: siteCurrent.formViews,
              starts: siteCurrent.formStarts,
              abandons: siteCurrent.formAbandons,
              submitAttempts: siteCurrent.formSubmitAttempts,
              validationErrors: siteCurrent.formValidationErrors,
              submitErrors: siteCurrent.formSubmitErrors,
              submits: siteCurrent.formSubmits,
              completionRate: percentage(siteCurrent.formSubmits, siteCurrent.formStarts),
              abandonmentRate: percentage(siteCurrent.formAbandons, siteCurrent.formStarts),
            },
            previous: {
              views: sitePrevious.formViews,
              starts: sitePrevious.formStarts,
              abandons: sitePrevious.formAbandons,
              submits: sitePrevious.formSubmits,
            },
            abandonment: [],
          },
          searchConsole,
          campaigns: {
            current: googleAds?.current ?? emptyGoogleAdsTotals,
            previous: googleAds?.previous ?? emptyGoogleAdsTotals,
            items: [],
            daily: googleAds?.daily ?? [],
            devices: [],
            networks: [],
            adGroups: [],
            keywords: [],
            searchTerms: [],
            landingPages: [],
            schedule: [],
            clickTypes: googleAds?.clickTypes ?? [],
            messageAssets: googleAds?.messageAssets ?? [],
            calls: googleAds?.calls
              ? { ...googleAds.calls, items: [] }
              : null,
            conversionActions: [],
            paidActions,
            paidVisitors: [],
            allVisitors: [],
            offlineConversions: null,
            financialAvailable: Boolean(googleAds),
            statusMessage: googleAdsStatusMessage,
          },
          quality: {
            lastEventAt: quality.lastEventAt,
            actionMetricsSource: quality.actionMetricsSource,
            actionMetricsLabel: quality.actionMetricsLabel,
            refreshIntervalMinutes: quality.refreshIntervalMinutes,
            generatedAt: quality.generatedAt,
          },
        },
      }, 200, request);
    }

    return jsonResponse({
      status: 200,
      mensagem: 'Painel privado de Crescimento carregado.',
      dados: {
        periodDays,
        context: {
          targetUserId: targetUser.id_usuarios,
          targetName: targetUser.nome,
          targetEmail: targetUser.email,
          privateToMegaMaster: canManageAttribution,
          privateToAdministrators: true,
          canManageAttribution,
          accessLevel: 'full',
        },
        config: {
          ...config,
          ga4Status: integrations.find((item) => item.provider === 'ga4')?.status ?? config.ga4Status,
          searchConsoleStatus: integrations.find((item) => item.provider === 'search_console')?.status
            ?? config.searchConsoleStatus,
        },
        integrations,
        executive: {
          funnel: {
            visits: siteCurrent.visits,
            whatsappClicks: siteCurrent.whatsappClicks,
            formStarts: siteCurrent.formStarts,
            formSubmits: siteCurrent.formSubmits,
            identifiedClients: business.current.identifiedClients,
            approvedOrders: business.current.approvedOrders,
          },
          business: business.current,
          previousBusiness: business.previous,
        },
        site: {
          current: siteCurrent,
          previous: sitePrevious,
          whatsapp: buildSiteWhatsappSummary(internal.currentEvents),
          pages: ga4?.pages ?? internal.pages,
          sources: siteSources,
          aiTraffic,
          devices: ga4?.devices ?? [],
          daily: ga4?.daily ?? internal.daily,
          eventCounts: ga4?.eventCounts ?? [],
          recentEvents: [...internal.currentEvents].reverse().slice(0, 50).map(withoutGoogleClickIds),
        },
        businessProfile,
        forms: {
          current: {
            views: siteCurrent.formViews,
            starts: siteCurrent.formStarts,
            abandons: siteCurrent.formAbandons,
            submitAttempts: siteCurrent.formSubmitAttempts,
            validationErrors: siteCurrent.formValidationErrors,
            submitErrors: siteCurrent.formSubmitErrors,
            submits: siteCurrent.formSubmits,
            completionRate: percentage(siteCurrent.formSubmits, siteCurrent.formStarts),
            abandonmentRate: percentage(siteCurrent.formAbandons, siteCurrent.formStarts),
          },
          previous: {
            views: sitePrevious.formViews,
            starts: sitePrevious.formStarts,
            abandons: sitePrevious.formAbandons,
            submits: sitePrevious.formSubmits,
          },
          abandonment: internal.formAbandonment,
        },
        leads: {
          items: internal.currentLeads.slice(0, 100).map(withoutGoogleClickIds),
          unlinked: unlinkedLeads.slice(0, 100).map(withoutGoogleClickIds),
          total: internal.currentLeads.length,
          unlinkedTotal: unlinkedLeads.length,
          availableClients: privateData.clients,
        },
        business,
        searchConsole,
        campaigns: {
          current: googleAds?.current ?? emptyGoogleAdsTotals,
          previous: googleAds?.previous ?? emptyGoogleAdsTotals,
          items: googleAds?.items ?? [],
          daily: googleAds?.daily ?? [],
          devices: googleAds?.devices ?? [],
          networks: googleAds?.networks ?? [],
          adGroups: googleAds?.adGroups ?? [],
          keywords: googleAds?.keywords ?? [],
          searchTerms: googleAds?.searchTerms ?? [],
          landingPages: googleAds?.landingPages ?? [],
          schedule: googleAds?.schedule ?? [],
          clickTypes: googleAds?.clickTypes ?? [],
          messageAssets: googleAds?.messageAssets ?? [],
          calls: googleAds?.calls ?? null,
          conversionActions: googleAds?.conversionActions ?? [],
          paidActions,
          paidVisitors,
          allVisitors,
          offlineConversions,
          financialAvailable: Boolean(googleAds),
          statusMessage: googleAdsStatusMessage,
        },
        snapshots: privateData.snapshots,
        quality,
      },
    }, 200, request);
  } catch (error) {
    console.error('marketing-dashboard failed', error instanceof Error ? error.message : 'unknown');
    return jsonResponse({
      error: 'Não foi possível carregar o painel de Crescimento agora.',
    }, 500, request);
  }
}

Deno.serve(async (request) => {
  const startedAt = performance.now();
  const requestId = crypto.randomUUID();
  const response = await handleRequest(request);
  const durationMs = Math.round(performance.now() - startedAt);
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('Server-Timing', `app;dur=${durationMs}`);
  console.log(JSON.stringify({
    event: 'marketing_dashboard_request',
    requestId,
    status: response.status,
    durationMs,
  }));
  return response;
});
