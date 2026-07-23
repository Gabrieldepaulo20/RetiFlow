import { createClient } from 'npm:@supabase/supabase-js@2';

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
  leads: number;
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
  eventCounts: Array<{ event: string; count: number }>;
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

const GOOGLE_ACCESS_TOKEN_CACHE_TTL_MS = 50 * 60_000;
const GOOGLE_SUMMARY_CACHE_TTL_MS = 10 * 60_000;
const googleAccessTokenCache = new Map<string, CacheEntry<string>>();
const ga4SummaryCache = new Map<string, CacheEntry<Ga4Summary>>();
const searchConsoleCache = new Map<string, CacheEntry<SearchConsoleSummary>>();

const localDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getDateRange(periodDays: number) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = addDays(end, -(periodDays - 1));
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(periodDays - 1));
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    previousStartDate: formatDate(previousStart),
    previousEndDate: formatDate(previousEnd),
  };
}

function toIsoStartOfDay(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toIsoEndOfDay(value: string) {
  return `${value}T23:59:59.999Z`;
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

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs = GOOGLE_SUMMARY_CACHE_TTL_MS) {
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

function buildGa4Totals(report: GoogleRunReportResponse, events: Map<string, number>) {
  return {
    activeUsers: metricValue(report, 0, 0),
    sessions: metricValue(report, 0, 1),
    pageViews: metricValue(report, 0, 2),
    events: metricValue(report, 0, 3),
    engagementRate: round(metricValue(report, 0, 4) * 100),
    averageSessionDuration: round(metricValue(report, 0, 5)),
    engagedSessions: metricValue(report, 0, 6),
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
  internalDaily: MarketingDailyMetric[],
  conversionsByPath: Map<string, number>,
  leadsBySource: Map<string, number>,
) {
  const range = getDateRange(periodDays);
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
  ];
  const [currentReport, previousReport, dailyReport, pagesReport, sourcesReport, currentEventsReport, previousEventsReport] = await Promise.all([
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
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '12',
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
  ]);

  const currentEvents = eventCountMap(currentEventsReport);
  const previousEvents = eventCountMap(previousEventsReport);
  const internalByDate = new Map(internalDaily.map((item) => [item.date, item]));
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
    const date = formatDate(addDays(new Date(`${range.startDate}T00:00:00.000Z`), index));
    const ga4 = ga4ByDate.get(date);
    const internal = internalByDate.get(date);
    return {
      date,
      visits: ga4?.visits ?? 0,
      sessions: ga4?.sessions ?? 0,
      pageViews: ga4?.pageViews ?? 0,
      actions: internal?.actions ?? 0,
      leads: internal?.leads ?? 0,
    };
  });

  const pages = (pagesReport.rows ?? []).map((row) => {
    const path = row.dimensionValues?.[0]?.value || '/';
    return {
      path,
      title: row.dimensionValues?.[1]?.value || null,
      views: toNumber(row.metricValues?.[0]?.value),
      conversions: conversionsByPath.get(path) ?? 0,
    };
  });

  const sources = (sourcesReport.rows ?? []).map((row) => {
    const source = row.dimensionValues?.[0]?.value || 'direto';
    return {
      source,
      medium: row.dimensionValues?.[1]?.value || 'sem meio',
      visits: toNumber(row.metricValues?.[0]?.value),
      leads: leadsBySource.get(source) ?? 0,
    };
  });

  const syncedAt = new Date().toISOString();
  const summary: Ga4Summary = {
    current: buildGa4Totals(currentReport, currentEvents),
    previous: buildGa4Totals(previousReport, previousEvents),
    daily,
    pages,
    sources,
    eventCounts: Array.from(currentEvents.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count),
    syncedAt,
  };
  setCachedValue(ga4SummaryCache, cacheKey, summary);
  return summary;
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
  const range = getDateRange(periodDays);
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
  setCachedValue(searchConsoleCache, cacheKey, summary);
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
    commissionRate: toNumber(config.commission_rate) || 0.2,
    dedupeWindowMinutes: toNumber(config.dedupe_window_minutes) || 30,
    adsMonthlyBudget: toNumber(config.ads_monthly_budget) || 1000,
    organicGoalMin: toNumber(config.organic_goal_min) || 0.25,
    organicGoalMax: toNumber(config.organic_goal_max) || 0.6,
    qualifiedCallSeconds: toNumber(config.qualified_call_seconds) || 60,
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

async function loadPrivateMarketingData(
  serviceClient: ServiceClient,
  targetUserId: string,
  previousStartIso: string,
) {
  const [eventsResult, leadsResult, attributionsResult, commissionsResult, snapshotsResult, clientsResult] = await Promise.all([
    serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Site_Eventos')
      .select([
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
        'source',
        'medium',
        'campaign',
        'term',
        'device_type',
        'last_field',
        'validation_reason',
        'form_elapsed_seconds',
        'fields_completed',
        'duplicate_count',
        'deduplicated',
        'alert_status',
      ].join(','))
      .eq('fk_criado_por', targetUserId)
      .gte('occurred_at', previousStartIso)
      .order('occurred_at', { ascending: true }),
    serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Leads')
      .select([
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
        'page_path',
        'fk_clientes',
        'identified_at',
        'identification_method',
      ].join(','))
      .eq('fk_criado_por', targetUserId)
      .gte('occurred_at', previousStartIso)
      .order('occurred_at', { ascending: false }),
    serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Client_Attributions')
      .select('id_marketing_client_attributions, fk_clientes, fk_marketing_leads, lead_code, channel, source, medium, campaign, attribution_method, attributed_at')
      .eq('fk_criado_por', targetUserId)
      .gte('attributed_at', previousStartIso)
      .order('attributed_at', { ascending: false }),
    serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Commission_Snapshots')
      .select('id_marketing_commission_snapshots, fk_clientes, fk_notas_servico, os_numero, services_snapshot, products_excluded_snapshot, commission_rate_snapshot, commission_amount_snapshot, source_snapshot, campaign_snapshot, approved_at')
      .eq('fk_criado_por', targetUserId)
      .gte('approved_at', previousStartIso)
      .order('approved_at', { ascending: false }),
    serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Snapshots')
      .select('snapshot_type, period_start, period_end, metrics, generated_at')
      .eq('fk_criado_por', targetUserId)
      .order('period_start', { ascending: true }),
    serviceClient
      .schema('RetificaPremium')
      .from('Clientes')
      .select('id_clientes, nome, documento')
      .eq('fk_criado_por', targetUserId)
      .order('nome', { ascending: true })
      .limit(1000),
  ]);

  const failed = [
    eventsResult.error,
    leadsResult.error,
    attributionsResult.error,
    commissionsResult.error,
    snapshotsResult.error,
    clientsResult.error,
  ].find(Boolean);
  if (failed) throw new Error(`Não foi possível carregar os dados privados de Crescimento: ${failed.message}`);

  return {
    events: (eventsResult.data ?? []) as unknown as JsonRecord[],
    leads: (leadsResult.data ?? []) as unknown as JsonRecord[],
    attributions: (attributionsResult.data ?? []) as unknown as JsonRecord[],
    commissions: (commissionsResult.data ?? []) as unknown as JsonRecord[],
    snapshots: (snapshotsResult.data ?? []) as unknown as JsonRecord[],
    clients: (clientsResult.data ?? []) as unknown as JsonRecord[],
  };
}

function inRange(value: unknown, startIso: string, endIso?: string) {
  const timestamp = String(value ?? '');
  return timestamp >= startIso && (!endIso || timestamp <= endIso);
}

function buildEmptyDaily(periodDays: number, startDate: string): MarketingDailyMetric[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: periodDays }, (_, index) => ({
    date: formatDate(addDays(start, index)),
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
  const range = getDateRange(periodDays);
  const startIso = toIsoStartOfDay(range.startDate);
  const previousStartIso = toIsoStartOfDay(range.previousStartDate);
  const previousEndIso = toIsoEndOfDay(range.previousEndDate);
  const currentEvents = events.filter((event) => inRange(event.occurred_at, startIso));
  const previousEvents = events.filter((event) => inRange(event.occurred_at, previousStartIso, previousEndIso));
  const currentLeads = leads.filter((lead) => inRange(lead.occurred_at, startIso));
  const previousLeads = leads.filter((lead) => inRange(lead.occurred_at, previousStartIso, previousEndIso));

  const countEvent = (items: JsonRecord[], type: string) => items.filter((item) => item.event_type === type).length;
  const pageMap = new Map<string, MarketingPageMetric>();
  const sourceMap = new Map<string, MarketingSourceMetric>();
  const conversionsByPath = new Map<string, number>();
  const leadsBySource = new Map<string, number>();

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
    const sourceMetric = sourceMap.get(sourceKey) ?? { source, medium, visits: 0, leads: 0 };
    if (event.event_type === 'page_view') sourceMetric.visits += 1;
    sourceMap.set(sourceKey, sourceMetric);
  });

  currentLeads.forEach((lead) => {
    const source = String(lead.source || 'direto');
    leadsBySource.set(source, (leadsBySource.get(source) ?? 0) + 1);
    const existingKey = Array.from(sourceMap.keys()).find((key) => key.startsWith(`${source}\u0000`))
      ?? `${source}\u0000sem meio`;
    const metric = sourceMap.get(existingKey) ?? { source, medium: 'sem meio', visits: 0, leads: 0 };
    metric.leads += 1;
    sourceMap.set(existingKey, metric);
  });

  const daily = buildEmptyDaily(periodDays, range.startDate);
  const dailyByDate = new Map(daily.map((item) => [item.date, item]));
  currentEvents.forEach((event) => {
    const item = dailyByDate.get(String(event.occurred_at ?? '').slice(0, 10));
    if (!item) return;
    if (event.event_type === 'page_view') {
      item.visits += 1;
      item.pageViews += 1;
    }
    if (['whatsapp_click', 'phone_click', 'form_submit'].includes(String(event.event_type))) item.actions += 1;
  });
  currentLeads.forEach((lead) => {
    const item = dailyByDate.get(String(lead.occurred_at ?? '').slice(0, 10));
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
    sources: Array.from(sourceMap.values()).sort((a, b) => b.visits - a.visits).slice(0, 12),
    conversionsByPath,
    leadsBySource,
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
) {
  const range = getDateRange(periodDays);
  const startIso = toIsoStartOfDay(range.startDate);
  const previousStartIso = toIsoStartOfDay(range.previousStartDate);
  const previousEndIso = toIsoEndOfDay(range.previousEndDate);
  const currentAttributions = attributions.filter((item) => inRange(item.attributed_at, startIso));
  const previousAttributions = attributions.filter((item) => inRange(item.attributed_at, previousStartIso, previousEndIso));
  const currentCommissions = commissions.filter((item) => inRange(item.approved_at, startIso));
  const previousCommissions = commissions.filter((item) => inRange(item.approved_at, previousStartIso, previousEndIso));

  const totals = (attributionItems: JsonRecord[], commissionItems: JsonRecord[]) => ({
    identifiedClients: attributionItems.length,
    approvedOrders: commissionItems.length,
    approvedServices: round(commissionItems.reduce((sum, item) => sum + toNumber(item.services_snapshot), 0)),
    excludedProducts: round(commissionItems.reduce((sum, item) => sum + toNumber(item.products_excluded_snapshot), 0)),
    commission: round(commissionItems.reduce((sum, item) => sum + toNumber(item.commission_amount_snapshot), 0)),
  });

  return {
    current: totals(currentAttributions, currentCommissions),
    previous: totals(previousAttributions, previousCommissions),
    attributions: currentAttributions.slice(0, 50),
    commissions: currentCommissions.slice(0, 50),
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

Deno.serve(async (request) => {
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
  if (!requesterEmail || !getSuperAdminEmails().has(requesterEmail)) {
    return jsonResponse({ error: 'Crescimento é um painel privado do Mega Master.' }, 403, request);
  }

  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await request.json().catch(() => ({})) as JsonRecord;
    const periodDays = parsePeriod(body.p_periodo_dias);
    const targetUserId = asString(body.p_target_user_id, 80);
    if (!targetUserId) return jsonResponse({ error: 'Selecione a empresa que será analisada.' }, 400, request);

    const targetUser = await getTargetUser(serviceClient, targetUserId);
    if (!targetUser || targetUser.status === false || targetUser.modulos?.marketing !== true) {
      return jsonResponse({ error: 'Empresa sem o módulo Crescimento habilitado.' }, 403, request);
    }

    if (asString(body.action, 40) === 'link_client') {
      const { data: actor, error: actorError } = await serviceClient
        .schema('RetificaPremium')
        .from('Usuarios')
        .select('id_usuarios')
        .eq('auth_id', userData.user.id)
        .maybeSingle();
      if (actorError || !actor?.id_usuarios) {
        return jsonResponse({ error: 'Perfil Mega Master não encontrado.' }, 403, request);
      }
      return await linkLeadToClient(request, serviceClient, targetUserId, actor.id_usuarios, body);
    }

    const range = getDateRange(periodDays);
    const previousStartIso = toIsoStartOfDay(range.previousStartDate);
    const [config, storedIntegrations, privateData] = await Promise.all([
      getMarketingConfig(serviceClient, targetUserId),
      getMarketingIntegrations(serviceClient, targetUserId),
      loadPrivateMarketingData(serviceClient, targetUserId, previousStartIso),
    ]);
    const internal = aggregateInternalData(periodDays, privateData.events, privateData.leads);
    const business = aggregateBusinessData(periodDays, privateData.attributions, privateData.commissions);

    let integrations = storedIntegrations;
    let ga4: Ga4Summary | null = null;
    let searchConsole: SearchConsoleSummary | null = null;
    const googleCredentialRaw = Deno.env.get('GA4_SERVICE_ACCOUNT_JSON') ?? '';
    const serviceAccount = googleCredentialRaw ? parseServiceAccount(googleCredentialRaw) : null;

    if (config.ga4PropertyId && serviceAccount) {
      try {
        ga4 = await fetchGa4Summary(
          config.ga4PropertyId,
          serviceAccount,
          periodDays,
          internal.daily,
          internal.conversionsByPath,
          internal.leadsBySource,
        );
        integrations = mergeIntegration(integrations, {
          provider: 'ga4',
          status: 'connected',
          accountName: `GA4 ${config.ga4PropertyId}`,
          lastSyncAt: ga4.syncedAt,
          lastError: null,
          freshness: 'Dados intradiários do Google',
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
          freshness: 'Search Console pode ter 2–3 dias de defasagem',
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
      freshness: config.hasSiteKey ? 'Atualização em até 10 minutos' : 'Configuração pendente',
    });
    if (!integrations.some((item) => item.provider === 'google_ads')) {
      integrations.push({
        provider: 'google_ads',
        status: 'not_connected',
        accountName: 'Conta oficial 313-260-4995',
        lastSyncAt: null,
        lastError: 'Aguardando acesso autorizado à conta oficial.',
        freshness: 'Pendente',
      });
    }

    const gaCurrent = ga4?.current;
    const gaPrevious = ga4?.previous;
    const siteCurrent = {
      visits: gaCurrent?.activeUsers ?? internal.current.visits,
      sessions: gaCurrent?.sessions ?? 0,
      pageViews: gaCurrent?.pageViews ?? internal.current.visits,
      whatsappClicks: Math.max(internal.current.whatsappClicks, gaCurrent?.whatsappClicks ?? 0),
      phoneClicks: Math.max(internal.current.phoneClicks, gaCurrent?.phoneClicks ?? 0),
      formViews: Math.max(internal.current.formViews, gaCurrent?.formViews ?? 0),
      formStarts: Math.max(internal.current.formStarts, gaCurrent?.formStarts ?? 0),
      formAbandons: internal.current.formAbandons,
      formSubmitAttempts: internal.current.formSubmitAttempts,
      formValidationErrors: internal.current.formValidationErrors,
      formSubmitErrors: internal.current.formSubmitErrors,
      formSubmits: Math.max(internal.current.formSubmits, gaCurrent?.formSubmits ?? 0, gaCurrent?.generateLeads ?? 0),
      totalEvents: gaCurrent?.events ?? internal.current.totalEvents,
      actionEvents: (gaCurrent?.whatsappClicks ?? internal.current.whatsappClicks)
        + (gaCurrent?.phoneClicks ?? internal.current.phoneClicks)
        + Math.max(internal.current.formSubmits, gaCurrent?.generateLeads ?? 0),
      engagementRate: gaCurrent?.engagementRate ?? 0,
      averageSessionDuration: gaCurrent?.averageSessionDuration ?? 0,
      engagedSessions: gaCurrent?.engagedSessions ?? 0,
      leads: internal.current.leads,
      conversionRate: percentage(internal.current.leads, gaCurrent?.activeUsers ?? internal.current.visits),
    };
    const sitePrevious = {
      visits: gaPrevious?.activeUsers ?? internal.previous.visits,
      sessions: gaPrevious?.sessions ?? 0,
      pageViews: gaPrevious?.pageViews ?? internal.previous.visits,
      whatsappClicks: Math.max(internal.previous.whatsappClicks, gaPrevious?.whatsappClicks ?? 0),
      phoneClicks: Math.max(internal.previous.phoneClicks, gaPrevious?.phoneClicks ?? 0),
      formViews: Math.max(internal.previous.formViews, gaPrevious?.formViews ?? 0),
      formStarts: Math.max(internal.previous.formStarts, gaPrevious?.formStarts ?? 0),
      formAbandons: internal.previous.formAbandons,
      formSubmitAttempts: internal.previous.formSubmitAttempts,
      formValidationErrors: internal.previous.formValidationErrors,
      formSubmitErrors: internal.previous.formSubmitErrors,
      formSubmits: Math.max(internal.previous.formSubmits, gaPrevious?.formSubmits ?? 0, gaPrevious?.generateLeads ?? 0),
      totalEvents: gaPrevious?.events ?? internal.previous.totalEvents,
      actionEvents: (gaPrevious?.whatsappClicks ?? internal.previous.whatsappClicks)
        + (gaPrevious?.phoneClicks ?? internal.previous.phoneClicks)
        + Math.max(internal.previous.formSubmits, gaPrevious?.generateLeads ?? 0),
      engagementRate: gaPrevious?.engagementRate ?? 0,
      averageSessionDuration: gaPrevious?.averageSessionDuration ?? 0,
      engagedSessions: gaPrevious?.engagedSessions ?? 0,
      leads: internal.previous.leads,
    };

    const unlinkedLeads = internal.currentLeads.filter((lead) => !lead.fk_clientes);
    const quality = {
      lastEventAt: internal.currentEvents.at(-1)?.occurred_at ?? null,
      alertFailures: internal.currentEvents.filter((event) => event.alert_status === 'failed').length,
      duplicatedClicks: internal.currentEvents.reduce((sum, event) => sum + toNumber(event.duplicate_count), 0),
      unlinkedLeads: unlinkedLeads.length,
      eventsWithoutSource: internal.currentEvents.filter((event) => !event.source || event.source === 'direto').length,
      refreshIntervalMinutes: 10,
      generatedAt: new Date().toISOString(),
    };

    return jsonResponse({
      status: 200,
      mensagem: 'Painel privado de Crescimento carregado.',
      dados: {
        periodDays,
        context: {
          targetUserId: targetUser.id_usuarios,
          targetName: targetUser.nome,
          targetEmail: targetUser.email,
          privateToMegaMaster: true,
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
          pages: ga4?.pages ?? internal.pages,
          sources: ga4?.sources ?? internal.sources,
          daily: ga4?.daily ?? internal.daily,
          eventCounts: ga4?.eventCounts ?? [],
          recentEvents: [...internal.currentEvents].reverse().slice(0, 50),
        },
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
          items: internal.currentLeads.slice(0, 100),
          unlinked: unlinkedLeads.slice(0, 100),
          total: internal.currentLeads.length,
          unlinkedTotal: unlinkedLeads.length,
          availableClients: privateData.clients,
        },
        business,
        searchConsole,
        campaigns: {
          current: { spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: 0 },
          previous: { spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: 0 },
          items: [],
          daily: [],
          financialAvailable: false,
          statusMessage: 'Google Ads aguardando acesso à conta oficial 313-260-4995.',
        },
        snapshots: privateData.snapshots,
        quality,
      },
    }, 200, request);
  } catch (error) {
    console.error('marketing-dashboard failed', error instanceof Error ? error.message : 'unknown');
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Falha ao carregar Crescimento.',
    }, 500, request);
  }
});
