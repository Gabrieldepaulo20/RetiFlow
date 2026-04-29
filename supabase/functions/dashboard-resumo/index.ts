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

  if (configured.length === 0 || configured.includes('*')) {
    return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': '*' };
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

function parseLimit(value: unknown) {
  const parsed = Number(value ?? 500);
  if (!Number.isFinite(parsed)) return 500;
  return Math.max(1, Math.min(Math.trunc(parsed), 500));
}

async function callRpc<T>(
  client: ReturnType<typeof createClient>,
  name: string,
  params: Record<string, unknown> = {},
) {
  const { data, error } = await client.schema('RetificaPremium').rpc(name, params);
  if (error) throw new Error(`[${name}] ${error.message}`);
  return data as T;
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
    const body = await request.json().catch(() => ({})) as { p_limite?: unknown };
    const limit = parseLimit(body.p_limite);
    const [notasEnvelope, clientesEnvelope, contasEnvelope, categoriasEnvelope] = await Promise.all([
      callRpc<{ dados?: Array<Record<string, unknown>>; total?: number }>(userClient, 'get_notas_servico', { p_limite: limit }),
      callRpc<{ dados?: Array<Record<string, unknown>>; total?: number }>(userClient, 'get_clientes', { p_limite: limit }),
      callRpc<{ dados?: Array<Record<string, unknown>>; total?: number }>(userClient, 'get_contas_pagar', { p_limite: limit }),
      callRpc<{ dados?: Array<Record<string, unknown>> }>(userClient, 'get_categorias_conta_pagar', { p_ativo: true }),
    ]);

    const notas = Array.isArray(notasEnvelope.dados) ? notasEnvelope.dados : [];
    const servicos: Array<Record<string, unknown>> = [];

    await Promise.all(notas.map(async (nota) => {
      const noteId = typeof nota.id_notas_servico === 'string' ? nota.id_notas_servico : '';
      if (!noteId) return;

      try {
        const detalhes = await callRpc<{
          status?: number;
          itens_servico?: Array<Record<string, unknown>>;
        }>(userClient, 'get_nota_servico_detalhes', { p_id_nota_servico: noteId });

        if (detalhes.status !== 200 || !Array.isArray(detalhes.itens_servico)) return;
        detalhes.itens_servico.forEach((item) => servicos.push({ ...item, note_id: noteId }));
      } catch {
        // Um detalhe quebrado não deve derrubar o dashboard inteiro.
      }
    }));

    return jsonResponse({
      status: 200,
      mensagem: 'Resumo do dashboard carregado.',
      dados: {
        notas,
        clientes: clientesEnvelope.dados ?? [],
        contas: contasEnvelope.dados ?? [],
        categorias: categoriasEnvelope.dados ?? [],
        servicos,
        totais: {
          notas: notasEnvelope.total ?? notas.length,
          clientes: clientesEnvelope.total ?? clientesEnvelope.dados?.length ?? 0,
          contas: contasEnvelope.total ?? contasEnvelope.dados?.length ?? 0,
        },
      },
    }, 200, request);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Falha ao carregar resumo do dashboard.',
    }, 500, request);
  }
});
