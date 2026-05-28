import { createClient } from 'npm:@supabase/supabase-js@2';

type JsonRecord = Record<string, unknown>;

type MarketingProvider = 'ga4' | 'clarity' | 'meta_ads' | 'google_ads' | 'internal';
type MarketingIntegrationStatus = 'not_connected' | 'connected' | 'needs_attention' | 'syncing' | 'disabled';

interface MarketingIntegrationSummary {
  provider: MarketingProvider;
  status: MarketingIntegrationStatus;
  accountName?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

interface MarketingSiteTotals {
  visits: number;
  sessions?: number;
  pageViews?: number;
  whatsappClicks: number;
  formSubmits: number;
  totalEvents?: number;
  actionEvents?: number;
  engagementRate?: number;
  leads: number;
  conversionRate?: number;
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

interface MarketingDailyMetric {
  date: string;
  visits: number;
  pageViews?: number;
  actions: number;
  leads: number;
}

interface MarketingResumo {
  periodDays: number;
  config: JsonRecord;
  integrations: MarketingIntegrationSummary[];
  site: {
    current: MarketingSiteTotals;
    previous: Omit<MarketingSiteTotals, 'conversionRate'>;
    pages: MarketingPageMetric[];
    sources: MarketingSourceMetric[];
    daily: MarketingDailyMetric[];
  };
  campaigns: JsonRecord;
}

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

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

interface Ga4RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

interface Ga4Summary {
  currentVisits: number;
  previousVisits: number;
  currentSessions: number;
  previousSessions: number;
  currentPageViews: number;
  previousPageViews: number;
  currentEvents: number;
  previousEvents: number;
  currentEngagementRate: number;
  previousEngagementRate: number;
  currentActionEvents: number;
  previousActionEvents: number;
  daily: MarketingDailyMetric[];
  pages: MarketingPageMetric[];
  sources: MarketingSourceMetric[];
}

const localDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
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

function parsePeriod(value: unknown) {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(7, Math.min(Math.trunc(parsed), 90));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSuperAdminEmails() {
  const raw = Deno.env.get('SUPER_ADMIN_EMAILS') ?? Deno.env.get('SUPER_ADMIN_EMAIL') ?? '';
  return new Set(raw.split(',').map(normalizeEmail).filter(Boolean));
}

function isMegaMasterEmail(email: string, superAdminEmails: Set<string>) {
  return superAdminEmails.has(normalizeEmail(email));
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundRate(leads: number, visits: number) {
  if (!visits) return 0;
  return Math.round((leads / visits) * 10000) / 100;
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
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Credencial GA4 incompleta.');
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

async function createServiceAccountJwt(serviceAccount: GoogleServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
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

async function getGa4AccessToken(serviceAccount: GoogleServiceAccount) {
  const assertion = await createServiceAccountJwt(serviceAccount);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'Falha ao autenticar no GA4.');
  }
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

  const payload = await response.json().catch(() => ({})) as Ga4RunReportResponse & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Falha ao consultar relatório GA4.');
  }
  return payload;
}

function metricValue(report: Ga4RunReportResponse, rowIndex: number, metricIndex = 0) {
  return toNumber(report.rows?.[rowIndex]?.metricValues?.[metricIndex]?.value);
}

function buildGa4Daily(report: Ga4RunReportResponse, existingDaily: MarketingDailyMetric[], periodDays: number) {
  const { startDate } = getDateRange(periodDays);
  const existingByDate = new Map(existingDaily.map((item) => [item.date, item]));
  const metricsByDate = new Map<string, { visits: number; pageViews: number; actions: number }>();

  for (const row of report.rows ?? []) {
    const date = fromGaDate(row.dimensionValues?.[0]?.value ?? '');
    if (date) {
      metricsByDate.set(date, {
        visits: toNumber(row.metricValues?.[0]?.value),
        pageViews: toNumber(row.metricValues?.[1]?.value),
        actions: toNumber(row.metricValues?.[2]?.value),
      });
    }
  }

  return Array.from({ length: periodDays }, (_, index) => {
    const date = formatDate(addDays(new Date(`${startDate}T00:00:00.000Z`), index));
    const existing = existingByDate.get(date);
    const ga4 = metricsByDate.get(date);
    return {
      date,
      visits: ga4?.visits ?? 0,
      pageViews: ga4?.pageViews ?? 0,
      actions: Math.max(existing?.actions ?? 0, ga4?.actions ?? 0),
      leads: existing?.leads ?? 0,
    };
  });
}

function buildGa4Pages(report: Ga4RunReportResponse, existingPages: MarketingPageMetric[]) {
  const conversionsByPath = new Map(existingPages.map((page) => [page.path, page.conversions]));

  return (report.rows ?? [])
    .map((row) => {
      const path = row.dimensionValues?.[0]?.value || '/';
      return {
        path,
        title: row.dimensionValues?.[1]?.value || null,
        views: toNumber(row.metricValues?.[0]?.value),
        conversions: conversionsByPath.get(path) ?? 0,
      };
    })
    .filter((page) => page.views > 0)
    .slice(0, 8);
}

function buildGa4Sources(report: Ga4RunReportResponse, existingSources: MarketingSourceMetric[]) {
  const leadsBySource = new Map(existingSources.map((source) => [source.source, source.leads]));

  return (report.rows ?? [])
    .map((row) => {
      const source = row.dimensionValues?.[0]?.value || 'direto';
      return {
        source,
        medium: row.dimensionValues?.[1]?.value || 'sem meio',
        visits: toNumber(row.metricValues?.[0]?.value),
        leads: leadsBySource.get(source) ?? 0,
      };
    })
    .filter((source) => source.visits > 0 || source.leads > 0)
    .slice(0, 8);
}

function isActionEventName(value: string) {
  return /click|whatsapp|telefone|phone|call|form|submit|lead|generate_lead|cta|contato|contact/i.test(value);
}

function countActionEvents(report: Ga4RunReportResponse) {
  return (report.rows ?? []).reduce((total, row) => {
    const eventName = row.dimensionValues?.[0]?.value ?? '';
    if (!isActionEventName(eventName)) return total;
    return total + toNumber(row.metricValues?.[0]?.value);
  }, 0);
}

async function fetchGa4Summary(propertyId: string, serviceAccountJson: string, periodDays: number, currentData: MarketingResumo): Promise<Ga4Summary> {
  const serviceAccount = parseServiceAccount(serviceAccountJson);
  const accessToken = await getGa4AccessToken(serviceAccount);
  const range = getDateRange(periodDays);

  const commonLimit = { limit: '8' };
  const [currentReport, previousReport, dailyReport, pagesReport, sourcesReport, currentEventsReport, previousEventsReport] = await Promise.all([
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'eventCount' },
        { name: 'engagementRate' },
      ],
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.previousStartDate, endDate: range.previousEndDate }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'eventCount' },
        { name: 'engagementRate' },
      ],
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'eventCount' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      ...commonLimit,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      ...commonLimit,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '25',
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate: range.previousStartDate, endDate: range.previousEndDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '25',
    }),
  ]);

  return {
    currentVisits: metricValue(currentReport, 0, 0),
    previousVisits: metricValue(previousReport, 0, 0),
    currentSessions: metricValue(currentReport, 0, 1),
    previousSessions: metricValue(previousReport, 0, 1),
    currentPageViews: metricValue(currentReport, 0, 2),
    previousPageViews: metricValue(previousReport, 0, 2),
    currentEvents: metricValue(currentReport, 0, 3),
    previousEvents: metricValue(previousReport, 0, 3),
    currentEngagementRate: metricValue(currentReport, 0, 4),
    previousEngagementRate: metricValue(previousReport, 0, 4),
    currentActionEvents: countActionEvents(currentEventsReport),
    previousActionEvents: countActionEvents(previousEventsReport),
    daily: buildGa4Daily(dailyReport, currentData.site.daily, periodDays),
    pages: buildGa4Pages(pagesReport, currentData.site.pages),
    sources: buildGa4Sources(sourcesReport, currentData.site.sources),
  };
}

function upsertGa4Integration(
  integrations: MarketingIntegrationSummary[],
  status: MarketingIntegrationStatus,
  propertyId: string,
  lastError: string | null,
) {
  const next = integrations.filter((integration) => integration.provider !== 'ga4');
  next.unshift({
    provider: 'ga4',
    status,
    accountName: `GA4 ${propertyId}`,
    lastSyncAt: status === 'connected' ? new Date().toISOString() : null,
    lastError,
  });
  return next;
}

async function getInternalUserByAuthEmail(serviceClient: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, acesso, status, modulos:Modulos(admin, marketing)')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível validar o perfil interno: ${error.message}`);
  return normalizeInternalUser(data as RawInternalUserProfile | null);
}

async function getTargetUser(serviceClient: ReturnType<typeof createClient>, targetUserId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, acesso, status, modulos:Modulos(admin, marketing)')
    .eq('id_usuarios', targetUserId)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar o cliente selecionado: ${error.message}`);
  return normalizeInternalUser(data as RawInternalUserProfile | null);
}

function normalizeInternalUser(profile: RawInternalUserProfile | null): InternalUserProfile | null {
  if (!profile) return null;
  const modulos = Array.isArray(profile.modulos) ? profile.modulos[0] : profile.modulos;
  return {
    ...profile,
    modulos: modulos ?? null,
  };
}

function assertAdminCanViewTarget(
  requester: InternalUserProfile | null,
  target: InternalUserProfile | null,
  requesterIsMegaMaster: boolean,
) {
  if (!requester || requester.status === false || requester.acesso !== 'administrador') {
    return { ok: false as const, status: 403, message: 'A seleção de cliente é restrita a administradores ativos.' };
  }

  if (!requesterIsMegaMaster && requester.modulos?.admin !== true && requester.modulos?.marketing !== true) {
    return { ok: false as const, status: 403, message: 'Administrador sem módulo Admin ou Crescimento habilitado.' };
  }

  if (!target || target.status === false) {
    return { ok: false as const, status: 404, message: 'Cliente selecionado não encontrado ou inativo.' };
  }

  if (target.modulos?.marketing !== true) {
    return { ok: false as const, status: 403, message: 'Módulo Crescimento não habilitado para o cliente selecionado.' };
  }

  return { ok: true as const };
}

async function getMarketingConfig(serviceClient: ReturnType<typeof createClient>, targetUserId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Config')
    .select('modulo_habilitado, site_key_hash, allowed_origins, ga4_property_id, ga4_status, updated_at')
    .eq('fk_criado_por', targetUserId)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar configuração de marketing: ${error.message}`);
  const config = isRecord(data) ? data : {};

  return {
    moduloHabilitado: config.modulo_habilitado === true,
    ga4Status: typeof config.ga4_status === 'string' ? config.ga4_status : 'not_connected',
    hasSiteKey: Boolean(config.site_key_hash),
    allowedOrigins: Array.isArray(config.allowed_origins) ? config.allowed_origins : [],
    updatedAt: typeof config.updated_at === 'string' ? config.updated_at : null,
    ga4PropertyId: typeof config.ga4_property_id === 'string' ? config.ga4_property_id : null,
  };
}

async function getMarketingIntegrations(serviceClient: ReturnType<typeof createClient>, targetUserId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Integracoes')
    .select('provider, status, external_account_name, last_sync_at, last_error')
    .eq('fk_criado_por', targetUserId)
    .order('provider', { ascending: true });

  if (error) throw new Error(`Não foi possível carregar integrações de marketing: ${error.message}`);

  return (data ?? []).map((item) => ({
    provider: item.provider as MarketingProvider,
    status: item.status as MarketingIntegrationStatus,
    accountName: item.external_account_name ?? null,
    lastSyncAt: item.last_sync_at ?? null,
    lastError: item.last_error ?? null,
  }));
}

async function getMarketingEvents(serviceClient: ReturnType<typeof createClient>, targetUserId: string, previousStartIso: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Site_Eventos')
    .select('id_marketing_site_eventos, event_type, occurred_at, page_path, page_title, source, medium')
    .eq('fk_criado_por', targetUserId)
    .gte('occurred_at', previousStartIso)
    .order('occurred_at', { ascending: true });

  if (error) throw new Error(`Não foi possível carregar eventos de marketing: ${error.message}`);
  return data ?? [];
}

async function getMarketingLeads(serviceClient: ReturnType<typeof createClient>, targetUserId: string, previousStartIso: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Leads')
    .select('occurred_at, source')
    .eq('fk_criado_por', targetUserId)
    .gte('occurred_at', previousStartIso)
    .order('occurred_at', { ascending: true });

  if (error) throw new Error(`Não foi possível carregar leads de marketing: ${error.message}`);
  return data ?? [];
}

function buildEmptyDaily(periodDays: number, startDate: string): MarketingDailyMetric[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: periodDays }, (_, index) => ({
    date: formatDate(addDays(start, index)),
    visits: 0,
    actions: 0,
    leads: 0,
  }));
}

function buildInternalSiteSummary(
  periodDays: number,
  events: Array<Record<string, unknown>>,
  leads: Array<Record<string, unknown>>,
) {
  const range = getDateRange(periodDays);
  const startIso = toIsoStartOfDay(range.startDate);
  const previousStartIso = toIsoStartOfDay(range.previousStartDate);
  const previousEndIso = toIsoEndOfDay(range.previousEndDate);

  const currentEvents = events.filter((event) => String(event.occurred_at ?? '') >= startIso);
  const previousEvents = events.filter((event) => {
    const occurredAt = String(event.occurred_at ?? '');
    return occurredAt >= previousStartIso && occurredAt <= previousEndIso;
  });
  const currentLeads = leads.filter((lead) => String(lead.occurred_at ?? '') >= startIso);
  const previousLeads = leads.filter((lead) => {
    const occurredAt = String(lead.occurred_at ?? '');
    return occurredAt >= previousStartIso && occurredAt <= previousEndIso;
  });

  const currentVisits = currentEvents.filter((event) => event.event_type === 'page_view').length;
  const currentActions = currentEvents.filter((event) => event.event_type === 'whatsapp_click' || event.event_type === 'form_submit').length;
  const previousVisits = previousEvents.filter((event) => event.event_type === 'page_view').length;

  const pageMap = new Map<string, MarketingPageMetric>();
  currentEvents.forEach((event) => {
    const path = String(event.page_path || '/');
    const current = pageMap.get(path) ?? { path, title: typeof event.page_title === 'string' ? event.page_title : null, views: 0, conversions: 0 };
    if (event.event_type === 'page_view') current.views += 1;
    if (event.event_type === 'whatsapp_click' || event.event_type === 'form_submit' || event.event_type === 'lead_created') current.conversions += 1;
    pageMap.set(path, current);
  });

  const sourceMap = new Map<string, MarketingSourceMetric>();
  currentEvents.forEach((event) => {
    const source = String(event.source || 'direto');
    const medium = String(event.medium || 'sem meio');
    const key = `${source}\u0000${medium}`;
    const current = sourceMap.get(key) ?? { source, medium, visits: 0, leads: 0 };
    if (event.event_type === 'page_view') current.visits += 1;
    sourceMap.set(key, current);
  });

  currentLeads.forEach((lead) => {
    const source = String(lead.source || 'direto');
    const key = Array.from(sourceMap.keys()).find((item) => item.startsWith(`${source}\u0000`)) ?? `${source}\u0000sem meio`;
    const current = sourceMap.get(key) ?? { source, medium: 'sem meio', visits: 0, leads: 0 };
    current.leads += 1;
    sourceMap.set(key, current);
  });

  const daily = buildEmptyDaily(periodDays, range.startDate);
  const dailyByDate = new Map(daily.map((item) => [item.date, item]));
  currentEvents.forEach((event) => {
    const date = String(event.occurred_at ?? '').slice(0, 10);
    const current = dailyByDate.get(date);
    if (!current) return;
    if (event.event_type === 'page_view') current.visits += 1;
    if (event.event_type === 'whatsapp_click' || event.event_type === 'form_submit') current.actions += 1;
  });
  currentLeads.forEach((lead) => {
    const date = String(lead.occurred_at ?? '').slice(0, 10);
    const current = dailyByDate.get(date);
    if (current) current.leads += 1;
  });

  return {
    current: {
      visits: currentVisits,
      sessions: 0,
      pageViews: currentVisits,
      whatsappClicks: currentEvents.filter((event) => event.event_type === 'whatsapp_click').length,
      formSubmits: currentEvents.filter((event) => event.event_type === 'form_submit').length,
      totalEvents: currentEvents.length,
      actionEvents: currentActions,
      engagementRate: 0,
      leads: currentLeads.length,
      conversionRate: roundRate(currentLeads.length, currentVisits),
    },
    previous: {
      visits: previousVisits,
      sessions: 0,
      pageViews: previousVisits,
      whatsappClicks: previousEvents.filter((event) => event.event_type === 'whatsapp_click').length,
      formSubmits: previousEvents.filter((event) => event.event_type === 'form_submit').length,
      totalEvents: previousEvents.length,
      actionEvents: previousEvents.filter((event) => event.event_type === 'whatsapp_click' || event.event_type === 'form_submit').length,
      engagementRate: 0,
      leads: previousLeads.length,
    },
    pages: Array.from(pageMap.values()).sort((a, b) => b.views - a.views).slice(0, 8),
    sources: Array.from(sourceMap.values()).sort((a, b) => b.visits - a.visits).slice(0, 8),
    daily,
    currentActions,
  };
}

async function buildTargetMarketingResumo(
  serviceClient: ReturnType<typeof createClient>,
  targetUser: InternalUserProfile,
  periodDays: number,
) {
  const range = getDateRange(periodDays);
  const [config, integrations, events, leads] = await Promise.all([
    getMarketingConfig(serviceClient, targetUser.id_usuarios),
    getMarketingIntegrations(serviceClient, targetUser.id_usuarios),
    getMarketingEvents(serviceClient, targetUser.id_usuarios, toIsoStartOfDay(range.previousStartDate)),
    getMarketingLeads(serviceClient, targetUser.id_usuarios, toIsoStartOfDay(range.previousStartDate)),
  ]);
  const site = buildInternalSiteSummary(periodDays, events, leads);

  return {
    periodDays,
    context: {
      targetUserId: targetUser.id_usuarios,
      targetName: targetUser.nome,
      targetEmail: targetUser.email,
    },
    config,
    integrations,
    site: {
      current: site.current,
      previous: site.previous,
      pages: site.pages,
      sources: site.sources,
      daily: site.daily,
    },
    campaigns: {
      current: { spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: 0 },
      items: [],
      daily: [],
      financialAvailable: false,
    },
  } as MarketingResumo & { context: JsonRecord };
}

function mergeGa4Summary(data: MarketingResumo, ga4: Ga4Summary, propertyId: string): MarketingResumo {
  const current = {
    ...data.site.current,
    visits: ga4.currentVisits,
    sessions: ga4.currentSessions,
    pageViews: ga4.currentPageViews,
    totalEvents: ga4.currentEvents,
    actionEvents: Math.max(data.site.current.actionEvents ?? 0, ga4.currentActionEvents),
    engagementRate: Math.round(ga4.currentEngagementRate * 10000) / 100,
    conversionRate: roundRate(data.site.current.leads, ga4.currentVisits),
  };
  const previous = {
    ...data.site.previous,
    visits: ga4.previousVisits,
    sessions: ga4.previousSessions,
    pageViews: ga4.previousPageViews,
    totalEvents: ga4.previousEvents,
    actionEvents: Math.max(data.site.previous.actionEvents ?? 0, ga4.previousActionEvents),
    engagementRate: Math.round(ga4.previousEngagementRate * 10000) / 100,
  };

  return {
    ...data,
    config: {
      ...data.config,
      ga4Status: 'connected',
    },
    integrations: upsertGa4Integration(data.integrations ?? [], 'connected', propertyId, null),
    site: {
      ...data.site,
      current,
      previous,
      daily: ga4.daily,
      pages: ga4.pages,
      sources: ga4.sources,
    },
  };
}

function markGa4Unavailable(data: MarketingResumo, propertyId: string, reason: string): MarketingResumo {
  return {
    ...data,
    config: {
      ...data.config,
      ga4Status: propertyId ? 'needs_attention' : 'not_connected',
    },
    integrations: upsertGa4Integration(
      data.integrations ?? [],
      propertyId ? 'needs_attention' : 'not_connected',
      propertyId || 'não configurado',
      reason,
    ),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500, request);

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request);

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    const body = await request.json().catch(() => ({})) as { p_periodo_dias?: unknown; p_target_user_id?: unknown };
    const periodDays = parsePeriod(body.p_periodo_dias);
    const targetUserId = typeof body.p_target_user_id === 'string' ? body.p_target_user_id.trim() : '';
    let responseData: MarketingResumo;
    let responseMessage = 'Resumo do módulo Crescimento carregado.';

    if (targetUserId) {
      if (!serviceRoleKey) return jsonResponse({ error: 'Configuração administrativa ausente para seleção de cliente.' }, 500, request);

      const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const requesterEmail = userData.user.email?.trim().toLowerCase() ?? '';
      const [requester, targetUser] = await Promise.all([
        getInternalUserByAuthEmail(serviceClient, requesterEmail),
        getTargetUser(serviceClient, targetUserId),
      ]);
      const requesterIsMegaMaster = isMegaMasterEmail(requesterEmail, getSuperAdminEmails());
      const access = assertAdminCanViewTarget(requester, targetUser, requesterIsMegaMaster);
      if (!access.ok) return jsonResponse({ error: access.message }, access.status, request);

      responseData = await buildTargetMarketingResumo(serviceClient, targetUser, periodDays);
      responseMessage = 'Resumo do cliente selecionado carregado.';
    } else {
      const { data, error } = await userClient
        .schema('RetificaPremium')
        .rpc('get_marketing_resumo', { p_periodo_dias: periodDays });

      if (error) throw new Error(error.message);
      const envelope = data as { status?: number; mensagem?: string; dados?: unknown };
      if (!envelope || envelope.status !== 200 || !envelope.dados) {
        return jsonResponse({ error: envelope?.mensagem ?? 'Não foi possível carregar o módulo Crescimento.' }, envelope?.status === 403 ? 403 : 500, request);
      }
      responseMessage = envelope.mensagem ?? responseMessage;
      responseData = envelope.dados as MarketingResumo;
    }

    const configPropertyId = typeof responseData.config.ga4PropertyId === 'string' ? responseData.config.ga4PropertyId.trim() : '';
    const ga4PropertyId = configPropertyId || (Deno.env.get('GA4_PROPERTY_ID') ?? '').trim();
    const ga4ServiceAccountJson = Deno.env.get('GA4_SERVICE_ACCOUNT_JSON') ?? '';

    if (ga4PropertyId && ga4ServiceAccountJson) {
      try {
        const ga4Summary = await fetchGa4Summary(ga4PropertyId, ga4ServiceAccountJson, periodDays, responseData);
        responseData = mergeGa4Summary(responseData, ga4Summary, ga4PropertyId);
      } catch (error) {
        console.error('GA4 dashboard sync failed', error instanceof Error ? error.message : 'unknown');
        responseData = markGa4Unavailable(
          responseData,
          ga4PropertyId,
          'Não foi possível sincronizar o GA4 agora. Os dados internos continuam disponíveis.',
        );
      }
    } else {
      responseData = markGa4Unavailable(
        responseData,
        ga4PropertyId,
        'Configure GA4_PROPERTY_ID e GA4_SERVICE_ACCOUNT_JSON nos secrets da Edge Function.',
      );
    }

    return jsonResponse({
      status: 200,
      mensagem: responseMessage,
      dados: responseData,
    }, 200, request);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Falha ao carregar o módulo Crescimento.',
    }, 500, request);
  }
});
