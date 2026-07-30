import { createClient } from 'npm:@supabase/supabase-js@2';

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

type SupportContextBody = {
  supportContext?: {
    sessionId?: unknown;
    targetUserId?: unknown;
  };
  returnTo?: unknown;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTargetAuthUserId(params: {
  service: ReturnType<typeof createClient>;
  actorAuthUserId: string;
  supportContext?: SupportContextBody['supportContext'];
}) {
  if (!params.supportContext?.sessionId && !params.supportContext?.targetUserId) {
    return {
      authUserId: params.actorAuthUserId,
      actorUsuarioId: null as string | null,
      targetUsuarioId: null as string | null,
      supportSessionId: null as string | null,
    };
  }

  if (!isUuid(params.supportContext.sessionId) || !isUuid(params.supportContext.targetUserId)) {
    throw new Error('Contexto de suporte inválido.');
  }

  const { data: actor, error: actorError } = await params.service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios,email,acesso,status,Modulos(admin)')
    .eq('auth_id', params.actorAuthUserId)
    .maybeSingle();

  const admin = Array.isArray(actor?.Modulos)
    ? Boolean(actor.Modulos[0]?.admin)
    : Boolean((actor?.Modulos as { admin?: boolean } | null)?.admin);

  if (
    actorError
    || !actor
    || actor.status !== true
    || String(actor.acesso ?? '') !== 'administrador'
    || !admin
  ) {
    throw new Error('Operador administrativo inválido para conectar Gmail em modo suporte.');
  }

  const { data: sessionIsValid, error: sessionValidationError } = await params.service
    .schema('RetificaPremium')
    .rpc('sessao_suporte_valida', {
      p_sessao_suporte: params.supportContext.sessionId,
      p_actor_usuario_id: actor.id_usuarios,
      p_target_usuario_id: params.supportContext.targetUserId,
    });

  if (sessionValidationError || sessionIsValid !== true) {
    throw new Error('Sessão de suporte inválida ou encerrada.');
  }

  const { data: target, error: targetError } = await params.service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios,auth_id,status')
    .eq('id_usuarios', params.supportContext.targetUserId)
    .maybeSingle();

  if (targetError || !target?.auth_id || target.status !== true) {
    throw new Error('Cliente alvo sem conta de autenticação para conectar Gmail.');
  }

  return {
    authUserId: target.auth_id as string,
    actorUsuarioId: actor.id_usuarios as string,
    targetUsuarioId: target.id_usuarios as string,
    supportSessionId: params.supportContext.sessionId,
  };
}

function resolveRedirectUri() {
  const configured = Deno.env.get('GOOGLE_REDIRECT_URI')?.trim();
  if (configured) return configured;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '');
  if (!supabaseUrl) return '';
  return `${supabaseUrl}/functions/v1/gmail-oauth-callback`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const redirectUri = resolveRedirectUri();
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500, request);
  }

  const requestBody = await request.json().catch(() => ({})) as SupportContextBody;
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request);

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request);
  if (!clientId || !redirectUri) {
    return jsonResponse({ error: 'Credenciais Google OAuth não configuradas no servidor.' }, 500, request);
  }

  const state = crypto.randomUUID();
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let resolvedTarget: Awaited<ReturnType<typeof resolveTargetAuthUserId>>;
  try {
    resolvedTarget = await resolveTargetAuthUserId({
      service,
      actorAuthUserId: data.user.id,
      supportContext: requestBody.supportContext,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Contexto de suporte inválido.' }, 403, request);
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  let stateError: { message: string } | null = null;

  if (
    resolvedTarget.actorUsuarioId
    && resolvedTarget.targetUsuarioId
    && resolvedTarget.supportSessionId
  ) {
    const result = await service
      .schema('RetificaPremium')
      .rpc('criar_estado_oauth_suporte', {
        p_actor_usuario_id: resolvedTarget.actorUsuarioId,
        p_target_usuario_id: resolvedTarget.targetUsuarioId,
        p_sessao_suporte: resolvedTarget.supportSessionId,
        p_state: state,
        p_expires_at: expiresAt,
      });
    stateError = result.error;
  } else {
    const result = await service
      .schema('RetificaPremium')
      .from('Gmail_OAuth_States')
      .insert({
        fk_auth_user: resolvedTarget.authUserId,
        state,
        expires_at: expiresAt,
        flow_kind: 'self',
      });
    stateError = result.error;
  }

  if (stateError) return jsonResponse({ error: `Falha ao iniciar conexão Google: ${stateError.message}` }, 500, request);

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email https://www.googleapis.com/auth/gmail.readonly');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);

  return jsonResponse({ authUrl: url.toString() }, 200, request);
});
