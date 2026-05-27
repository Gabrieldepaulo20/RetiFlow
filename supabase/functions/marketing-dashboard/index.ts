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

function parsePeriod(value: unknown) {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(7, Math.min(Math.trunc(parsed), 90));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
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
    const body = await request.json().catch(() => ({})) as { p_periodo_dias?: unknown };
    const { data, error } = await userClient
      .schema('RetificaPremium')
      .rpc('get_marketing_resumo', { p_periodo_dias: parsePeriod(body.p_periodo_dias) });

    if (error) throw new Error(error.message);
    const envelope = data as { status?: number; mensagem?: string; dados?: unknown };
    if (!envelope || envelope.status !== 200 || !envelope.dados) {
      return jsonResponse({ error: envelope?.mensagem ?? 'Não foi possível carregar o módulo Crescimento.' }, envelope?.status === 403 ? 403 : 500, request);
    }

    return jsonResponse({
      status: 200,
      mensagem: envelope.mensagem ?? 'Resumo do módulo Crescimento carregado.',
      dados: envelope.dados,
    }, 200, request);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Falha ao carregar o módulo Crescimento.',
    }, 500, request);
  }
});
