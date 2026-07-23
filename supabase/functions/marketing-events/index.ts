import { createClient } from 'npm:@supabase/supabase-js@2';

const localDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-site-key, x-retiflow-site-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

const allowedEventTypes = new Set([
  'page_view',
  'whatsapp_click',
  'phone_click',
  'form_view',
  'form_start',
  'form_abandon',
  'form_submit_attempt',
  'form_validation_error',
  'form_submit_error',
  'form_submit',
  'lead_created',
  'critical_page_view',
  'custom',
]);

const allowedAlertStatuses = new Set([
  'not_required',
  'pending',
  'sent',
  'failed',
  'already_sent',
]);

type JsonRecord = Record<string, unknown>;
function createServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type ServiceClient = ReturnType<typeof createServiceClient>;

type EventPayload = {
  operation?: unknown;
  siteKey?: unknown;
  eventId?: unknown;
  leadCode?: unknown;
  eventType?: unknown;
  channel?: unknown;
  occurredAt?: unknown;
  sessionId?: unknown;
  anonymousId?: unknown;
  pagePath?: unknown;
  pageLocation?: unknown;
  pageTitle?: unknown;
  referrer?: unknown;
  source?: unknown;
  medium?: unknown;
  campaign?: unknown;
  term?: unknown;
  content?: unknown;
  gclid?: unknown;
  gbraid?: unknown;
  wbraid?: unknown;
  deviceType?: unknown;
  city?: unknown;
  region?: unknown;
  alertStatus?: unknown;
  metadata?: unknown;
  lead?: {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
  };
};

type MarketingConfig = {
  fk_criado_por: string;
  allowed_origins: string[] | null;
  modulo_habilitado: boolean;
  dedupe_window_minutes: number | null;
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

function asString(value: unknown, max = 500) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .slice(0, 30)
      .map(([key, item]) => [
        key.slice(0, 80),
        typeof item === 'string' ? item.slice(0, 500) : item,
      ]),
  );
}

function asNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(Math.trunc(parsed), 86_400);
}

function normalizeEmail(value: unknown) {
  const email = asString(value, 254)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizePhone(value: unknown) {
  const phone = asString(value, 40)?.replace(/\D/g, '');
  return phone && phone.length >= 8 ? phone.slice(0, 20) : null;
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseOccurredAt(value: unknown) {
  const raw = asString(value, 80);
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const driftMs = Math.abs(Date.now() - date.getTime());
  return driftMs > 1000 * 60 * 60 * 24 * 7 ? new Date().toISOString() : date.toISOString();
}

async function getMarketingConfig(
  serviceClient: ServiceClient,
  siteKey: string,
) {
  const siteKeyHash = await sha256Hex(siteKey);
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Config')
    .select('fk_criado_por, allowed_origins, modulo_habilitado, dedupe_window_minutes')
    .eq('site_key_hash', siteKeyHash)
    .maybeSingle();

  if (error) throw new Error('Não foi possível validar o site.');
  return data as MarketingConfig | null;
}

function isAllowedOrigin(request: Request, config: MarketingConfig) {
  const requestOrigin = request.headers.get('Origin') ?? '';
  const allowedOrigins = Array.isArray(config.allowed_origins)
    ? config.allowed_origins.filter(Boolean)
    : [];
  return allowedOrigins.length === 0 || !requestOrigin || allowedOrigins.includes(requestOrigin);
}

async function updateAlertStatus(
  request: Request,
  serviceClient: ServiceClient,
  config: MarketingConfig,
  body: EventPayload,
) {
  const externalEventId = asString(body.eventId, 100);
  const alertStatus = asString(body.alertStatus, 40);

  if (!externalEventId || !alertStatus || !allowedAlertStatuses.has(alertStatus)) {
    return jsonResponse({ ok: false, error: 'Atualização de alerta inválida.' }, 400, request);
  }

  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Site_Eventos')
    .update({ alert_status: alertStatus })
    .eq('fk_criado_por', config.fk_criado_por)
    .eq('external_event_id', externalEventId)
    .select('id_marketing_site_eventos')
    .maybeSingle();

  if (error) return jsonResponse({ ok: false, error: 'Não foi possível atualizar o alerta.' }, 500, request);

  return jsonResponse({
    ok: true,
    eventId: externalEventId,
    storedEventId: data?.id_marketing_site_eventos ?? null,
    alertStatus,
  }, 200, request);
}

async function findExistingExternalEvent(
  serviceClient: ServiceClient,
  ownerId: string,
  externalEventId: string,
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Site_Eventos')
    .select('id_marketing_site_eventos, external_event_id, lead_code, alert_status, duplicate_count')
    .eq('fk_criado_por', ownerId)
    .eq('external_event_id', externalEventId)
    .maybeSingle();

  if (error) throw new Error('Falha ao validar duplicidade do evento.');
  return data;
}

async function findRecentWhatsAppClick(
  serviceClient: ServiceClient,
  config: MarketingConfig,
  sessionId: string | null,
  anonymousId: string | null,
) {
  if (!sessionId && !anonymousId) return null;

  const dedupeMinutes = Math.max(1, Math.min(Number(config.dedupe_window_minutes ?? 30), 1440));
  const threshold = new Date(Date.now() - dedupeMinutes * 60_000).toISOString();
  let query = serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Site_Eventos')
    .select('id_marketing_site_eventos, external_event_id, lead_code, alert_status, duplicate_count')
    .eq('fk_criado_por', config.fk_criado_por)
    .eq('event_type', 'whatsapp_click')
    .gte('occurred_at', threshold)
    .order('occurred_at', { ascending: false })
    .limit(1);

  query = sessionId ? query.eq('session_id', sessionId) : query.eq('anonymous_id', anonymousId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('Falha ao validar a janela de deduplicação.');
  return data;
}

async function ensureLeadForEvent(input: {
  serviceClient: ServiceClient;
  config: MarketingConfig;
  body: EventPayload;
  eventType: string;
  storedEventId: string;
  externalEventId: string;
  leadCode: string;
  occurredAt: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  pagePath: string;
  metadata: JsonRecord;
}) {
  const isContactIntent = input.eventType === 'whatsapp_click' || input.eventType === 'phone_click';
  if (!isContactIntent && input.eventType !== 'form_submit' && input.eventType !== 'lead_created') return null;

  const leadEmail = normalizeEmail(input.body.lead?.email);
  const leadPhone = normalizePhone(input.body.lead?.phone);
  if (!isContactIntent && !leadEmail && !leadPhone) return null;

  const { data: existingLead, error: existingLeadError } = await input.serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Leads')
    .select('id_marketing_leads')
    .eq('fk_criado_por', input.config.fk_criado_por)
    .eq('event_id', input.storedEventId)
    .maybeSingle();
  if (existingLeadError) throw new Error('Falha ao validar o contato do evento.');
  if (existingLead?.id_marketing_leads) return existingLead.id_marketing_leads as string;

  const dedupeKey = await sha256Hex(`${input.config.fk_criado_por}:${input.externalEventId}`);
  const leadPayload = {
    fk_criado_por: input.config.fk_criado_por,
    occurred_at: input.occurredAt,
    lead_code: input.leadCode,
    channel: asString(input.body.channel, 80) ?? 'site_form',
    nome: asString(input.body.lead?.name, 180),
    email: leadEmail,
    telefone: leadPhone,
    source: input.source,
    medium: input.medium,
    campaign: input.campaign,
    term: asString(input.body.term, 180),
    content: asString(input.body.content, 180),
    gclid: asString(input.body.gclid, 240),
    gbraid: asString(input.body.gbraid, 240),
    wbraid: asString(input.body.wbraid, 240),
    page_path: input.pagePath,
    event_id: input.storedEventId,
    dedupe_key: dedupeKey,
    status: isContactIntent ? 'intencao' : 'novo',
    metadata: input.metadata,
  };

  const { data: insertedLead, error: leadError } = await input.serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Leads')
    .insert(leadPayload)
    .select('id_marketing_leads')
    .single();

  if (!leadError && insertedLead?.id_marketing_leads) {
    await input.serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Site_Eventos')
      .update({ lead_id: insertedLead.id_marketing_leads })
      .eq('id_marketing_site_eventos', input.storedEventId);
    return insertedLead.id_marketing_leads as string;
  }

  if (leadError?.code === '23505') {
    const { data: racedLead, error: racedLeadError } = await input.serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Leads')
      .select('id_marketing_leads')
      .eq('fk_criado_por', input.config.fk_criado_por)
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();
    if (!racedLeadError && racedLead?.id_marketing_leads) {
      return racedLead.id_marketing_leads as string;
    }
  }

  throw new Error('Evento registrado, mas o contato não pôde ser salvo.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Configuração Supabase ausente.' }, 500, request);
  }

  const body = await request.json().catch(() => ({})) as EventPayload;
  const siteKey = asString(body.siteKey, 200)
    ?? asString(request.headers.get('x-site-key'), 200)
    ?? asString(request.headers.get('x-retiflow-site-key'), 200);
  if (!siteKey) return jsonResponse({ ok: false, error: 'siteKey obrigatório.' }, 401, request);

  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

  try {
    const config = await getMarketingConfig(serviceClient, siteKey);
    if (!config?.fk_criado_por || config.modulo_habilitado !== true) {
      return jsonResponse({ ok: false, error: 'Site não autorizado.' }, 403, request);
    }
    if (!isAllowedOrigin(request, config)) {
      return jsonResponse({ ok: false, error: 'Origem não autorizada.' }, 403, request);
    }

    if (asString(body.operation, 40) === 'alert_update') {
      return await updateAlertStatus(request, serviceClient, config, body);
    }

    const eventType = asString(body.eventType, 60);
    if (!eventType || !allowedEventTypes.has(eventType)) {
      return jsonResponse({ ok: false, error: 'Tipo de evento inválido.' }, 400, request);
    }

    const externalEventId = asString(body.eventId, 100);
    const leadCode = asString(body.leadCode, 60);
    if (!externalEventId || !leadCode) {
      return jsonResponse({ ok: false, error: 'eventId e leadCode são obrigatórios.' }, 400, request);
    }

    const metadata = asObject(body.metadata);
    const occurredAt = parseOccurredAt(body.occurredAt);
    const source = asString(body.source, 120) ?? 'direto';
    const medium = asString(body.medium, 120);
    const campaign = asString(body.campaign, 180);
    const pagePath = asString(body.pagePath, 800) ?? '/';

    const existingExternalEvent = await findExistingExternalEvent(
      serviceClient,
      config.fk_criado_por,
      externalEventId,
    );
    if (existingExternalEvent) {
      const storedLeadId = await ensureLeadForEvent({
        serviceClient,
        config,
        body,
        eventType,
        storedEventId: existingExternalEvent.id_marketing_site_eventos,
        externalEventId,
        leadCode: existingExternalEvent.lead_code ?? leadCode,
        occurredAt,
        source,
        medium,
        campaign,
        pagePath,
        metadata,
      });
      return jsonResponse({
        ok: true,
        eventId: existingExternalEvent.external_event_id,
        storedEventId: existingExternalEvent.id_marketing_site_eventos,
        leadId: storedLeadId,
        leadCode: existingExternalEvent.lead_code,
        deduplicated: true,
        shouldAlert: false,
        alertStatus: existingExternalEvent.alert_status,
      }, 200, request);
    }

    const sessionId = asString(body.sessionId, 180);
    const anonymousId = asString(body.anonymousId, 180);
    if (eventType === 'whatsapp_click') {
      const recentClick = await findRecentWhatsAppClick(serviceClient, config, sessionId, anonymousId);
      if (recentClick) {
        const nextDuplicateCount = Number(recentClick.duplicate_count ?? 0) + 1;
        await serviceClient
          .schema('RetificaPremium')
          .from('Marketing_Site_Eventos')
          .update({
            duplicate_count: nextDuplicateCount,
            deduplicated: true,
            alert_status: recentClick.alert_status === 'sent' ? 'already_sent' : recentClick.alert_status,
          })
          .eq('id_marketing_site_eventos', recentClick.id_marketing_site_eventos);

        return jsonResponse({
          ok: true,
          eventId: recentClick.external_event_id,
          storedEventId: recentClick.id_marketing_site_eventos,
          leadCode: recentClick.lead_code,
          deduplicated: true,
          shouldAlert: false,
          alertStatus: recentClick.alert_status === 'sent' ? 'already_sent' : recentClick.alert_status,
        }, 200, request);
      }
    }

    const alertStatus = eventType === 'whatsapp_click' ? 'pending' : 'not_required';

    const eventPayload = {
      fk_criado_por: config.fk_criado_por,
      external_event_id: externalEventId,
      lead_code: leadCode,
      event_type: eventType,
      channel: asString(body.channel, 80),
      occurred_at: occurredAt,
      session_id: sessionId,
      anonymous_id: anonymousId,
      page_path: pagePath,
      page_location: asString(body.pageLocation, 1200),
      page_title: asString(body.pageTitle, 300),
      referrer: asString(body.referrer, 1000),
      source,
      medium,
      campaign,
      term: asString(body.term, 180),
      content: asString(body.content, 180),
      gclid: asString(body.gclid, 240),
      gbraid: asString(body.gbraid, 240),
      wbraid: asString(body.wbraid, 240),
      device_type: asString(body.deviceType, 80),
      city: asString(body.city, 120),
      region: asString(body.region, 120),
      last_field: asString(metadata.lastField, 120),
      validation_reason: asString(metadata.validationReason, 300),
      form_elapsed_seconds: asNonNegativeInteger(metadata.elapsedSeconds),
      fields_completed: asNonNegativeInteger(metadata.fieldsCompleted),
      alert_status: alertStatus,
      metadata,
    };

    const { data: event, error: eventError } = await serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Site_Eventos')
      .insert(eventPayload)
      .select('id_marketing_site_eventos')
      .single();

    if (eventError || !event?.id_marketing_site_eventos) {
      return jsonResponse({ ok: false, error: 'Não foi possível registrar o evento.' }, 500, request);
    }

    const storedLeadId = await ensureLeadForEvent({
      serviceClient,
      config,
      body,
      eventType,
      storedEventId: event.id_marketing_site_eventos,
      externalEventId,
      leadCode,
      occurredAt,
      source,
      medium,
      campaign,
      pagePath,
      metadata,
    });

    return jsonResponse({
      ok: true,
      eventId: externalEventId,
      storedEventId: event.id_marketing_site_eventos,
      leadId: storedLeadId,
      leadCode,
      deduplicated: false,
      shouldAlert: eventType === 'whatsapp_click',
      alertStatus,
    }, 200, request);
  } catch (error) {
    console.error('marketing-events failed', error instanceof Error ? error.message : 'unknown');
    return jsonResponse({ ok: false, error: 'Falha ao registrar o evento.' }, 500, request);
  }
});
