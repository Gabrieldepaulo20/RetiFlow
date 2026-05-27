import { createClient } from 'npm:@supabase/supabase-js@2';

const localDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retiflow-site-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const allowedEventTypes = new Set([
  'page_view',
  'whatsapp_click',
  'form_submit',
  'lead_created',
  'critical_page_view',
  'custom',
]);

type EventPayload = {
  siteKey?: unknown;
  eventType?: unknown;
  occurredAt?: unknown;
  sessionId?: unknown;
  anonymousId?: unknown;
  pagePath?: unknown;
  pageTitle?: unknown;
  referrer?: unknown;
  source?: unknown;
  medium?: unknown;
  campaign?: unknown;
  term?: unknown;
  content?: unknown;
  deviceType?: unknown;
  city?: unknown;
  region?: unknown;
  metadata?: unknown;
  lead?: {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
  };
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

function asObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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
  const now = Date.now();
  const driftMs = Math.abs(now - date.getTime());
  return driftMs > 1000 * 60 * 60 * 24 * 7 ? new Date().toISOString() : date.toISOString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500, request);

  const body = await request.json().catch(() => ({})) as EventPayload;
  const siteKey = asString(body.siteKey, 200) ?? asString(request.headers.get('x-retiflow-site-key'), 200);
  if (!siteKey) return jsonResponse({ error: 'siteKey obrigatório.' }, 401, request);

  const eventType = asString(body.eventType, 60);
  if (!eventType || !allowedEventTypes.has(eventType)) {
    return jsonResponse({ error: 'Tipo de evento inválido.' }, 400, request);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const siteKeyHash = await sha256Hex(siteKey);
  const { data: config, error: configError } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Config')
    .select('fk_criado_por, allowed_origins, modulo_habilitado')
    .eq('site_key_hash', siteKeyHash)
    .maybeSingle();

  if (configError) return jsonResponse({ error: 'Não foi possível validar o site.' }, 500, request);
  if (!config?.fk_criado_por || config.modulo_habilitado !== true) {
    return jsonResponse({ error: 'Site não autorizado.' }, 403, request);
  }

  const requestOrigin = request.headers.get('Origin') ?? '';
  const allowedOrigins = Array.isArray(config.allowed_origins) ? config.allowed_origins.filter(Boolean) : [];
  if (allowedOrigins.length > 0 && requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    return jsonResponse({ error: 'Origem não autorizada.' }, 403, request);
  }

  const leadEmail = normalizeEmail(body.lead?.email);
  const leadPhone = normalizePhone(body.lead?.phone);
  const pagePath = asString(body.pagePath, 800) ?? '/';
  const source = asString(body.source, 120) ?? 'direto';
  const medium = asString(body.medium, 120) ?? null;
  const campaign = asString(body.campaign, 180) ?? null;
  const dedupeBase = leadEmail ?? leadPhone ?? null;
  const dedupeKey = dedupeBase ? await sha256Hex(`${config.fk_criado_por}:${dedupeBase}`) : null;

  const eventPayload = {
    fk_criado_por: config.fk_criado_por,
    event_type: eventType,
    occurred_at: parseOccurredAt(body.occurredAt),
    session_id: asString(body.sessionId, 180),
    anonymous_id: asString(body.anonymousId, 180),
    page_path: pagePath,
    page_title: asString(body.pageTitle, 300),
    referrer: asString(body.referrer, 1000),
    source,
    medium,
    campaign,
    term: asString(body.term, 180),
    content: asString(body.content, 180),
    device_type: asString(body.deviceType, 80),
    city: asString(body.city, 120),
    region: asString(body.region, 120),
    metadata: asObject(body.metadata),
  };

  const { data: event, error: eventError } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Site_Eventos')
    .insert(eventPayload)
    .select('id_marketing_site_eventos')
    .single();

  if (eventError || !event?.id_marketing_site_eventos) {
    return jsonResponse({ error: 'Não foi possível registrar o evento.' }, 500, request);
  }

  const shouldCreateLead = eventType === 'form_submit' || eventType === 'lead_created';
  if (shouldCreateLead && (leadEmail || leadPhone)) {
    const leadPayload = {
      fk_criado_por: config.fk_criado_por,
      occurred_at: eventPayload.occurred_at,
      nome: asString(body.lead?.name, 180),
      email: leadEmail,
      telefone: leadPhone,
      source,
      medium,
      campaign,
      page_path: pagePath,
      event_id: event.id_marketing_site_eventos,
      dedupe_key: dedupeKey,
      metadata: asObject(body.metadata),
    };

    const { error: leadError } = await serviceClient
      .schema('RetificaPremium')
      .from('Marketing_Leads')
      .insert(leadPayload);

    if (leadError && leadError.code !== '23505') {
      return jsonResponse({ error: 'Evento registrado, mas o lead não pôde ser salvo.' }, 500, request);
    }
  }

  return jsonResponse({
    status: 200,
    mensagem: 'Evento registrado.',
    eventId: event.id_marketing_site_eventos,
  }, 200, request);
});
