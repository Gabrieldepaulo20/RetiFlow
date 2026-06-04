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
    .select('id_usuarios,email,acesso,Modulos(admin)')
    .eq('auth_id', params.actorAuthUserId)
    .maybeSingle();

  const admin = Array.isArray(actor?.Modulos)
    ? Boolean(actor.Modulos[0]?.admin)
    : Boolean((actor?.Modulos as { admin?: boolean } | null)?.admin);

  if (
    actorError
    || !actor
    || String(actor.email ?? '').toLowerCase() !== 'gabrielwilliam208@gmail.com'
    || String(actor.acesso ?? '') !== 'administrador'
    || !admin
  ) {
    throw new Error('Somente o Mega Master pode conectar Gmail em modo suporte.');
  }

  const { data: session, error: sessionError } = await params.service
    .schema('RetificaPremium')
    .from('Sessoes_Suporte')
    .select('id_sessao_suporte')
    .eq('id_sessao_suporte', params.supportContext.sessionId)
    .eq('fk_actor_usuarios', actor.id_usuarios)
    .eq('fk_target_usuarios', params.supportContext.targetUserId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (sessionError || !session) {
    throw new Error('Sessão de suporte inválida ou expirada.');
  }

  const { data: target, error: targetError } = await params.service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios,auth_id')
    .eq('id_usuarios', params.supportContext.targetUserId)
    .maybeSingle();

  if (targetError || !target?.auth_id) {
    throw new Error('Cliente alvo sem conta de autenticação para conectar Gmail.');
  }

  await params.service
    .schema('RetificaPremium')
    .from('Logs_Acoes_Suporte')
    .insert({
      fk_actor_usuarios: actor.id_usuarios,
      fk_target_usuarios: target.id_usuarios,
      fk_sessao_suporte: params.supportContext.sessionId,
      acao: 'gmail_oauth_start',
      entidade: 'Gmail_OAuth_States',
      entidade_id: null,
      descricao: 'Conexão Gmail iniciada em modo suporte.',
    });

  return {
    authUserId: target.auth_id as string,
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
  let targetAuthUserId = data.user.id;
  try {
    targetAuthUserId = (await resolveTargetAuthUserId({
      service,
      actorAuthUserId: data.user.id,
      supportContext: requestBody.supportContext,
    })).authUserId;
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Contexto de suporte inválido.' }, 403, request);
  }

  const { error: stateError } = await service
    .schema('RetificaPremium')
    .from('Gmail_OAuth_States')
    .insert({
      fk_auth_user: targetAuthUserId,
      state,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

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
