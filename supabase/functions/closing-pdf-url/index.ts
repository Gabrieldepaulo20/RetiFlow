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

const FECHAMENTOS_BUCKET = Deno.env.get('FECHAMENTOS_BUCKET') ?? 'fechamentos';
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60;
const MAX_EXPIRES_IN_SECONDS = 60 * 60;

type ClosingRow = {
  id_fechamentos: string;
  fk_clientes: string;
  periodo: string | null;
  pdf_url: string | null;
};

function getConfiguredOrigins() {
  const raw = Deno.env.get('CORS_ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const configuredOrigins = getConfiguredOrigins();

  if (configuredOrigins.length === 0) {
    const allowed = !origin || localDevOrigins.has(origin);
    return { allowed, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? (origin || 'null') : 'null' } };
  }

  if (configuredOrigins.includes('*')) {
    const allowed = localDevOrigins.has(origin);
    return { allowed, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? origin : 'null' } };
  }

  if (!origin) {
    return { allowed: true, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': configuredOrigins[0] } };
  }

  const allowed = configuredOrigins.includes(origin) || localDevOrigins.has(origin);
  return { allowed, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? origin : 'null' } };
}

function jsonResponse(body: unknown, status: number, request: Request) {
  const { headers } = getCorsHeaders(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStoragePath(pathOrUrl: string) {
  const value = pathOrUrl.trim();

  if (!value || value.startsWith('blob:')) {
    throw new Error('PDF sem arquivo remoto valido.');
  }

  const normalizePath = (path: string) => decodeURIComponent(path)
    .replace(/^\/+/, '')
    .replace(new RegExp(`^object/(?:public|sign)/${FECHAMENTOS_BUCKET}/`), '')
    .replace(new RegExp(`^${FECHAMENTOS_BUCKET}/`), '')
    .replace(/^\/+/, '');

  if (!/^https?:\/\//i.test(value)) {
    const path = normalizePath(value);
    if (!path) throw new Error('PDF sem caminho de Storage valido.');
    return path;
  }

  const url = new URL(value);
  const publicMarker = `/storage/v1/object/public/${FECHAMENTOS_BUCKET}/`;
  const signedMarker = `/storage/v1/object/sign/${FECHAMENTOS_BUCKET}/`;
  const marker = url.pathname.includes(publicMarker)
    ? publicMarker
    : url.pathname.includes(signedMarker)
      ? signedMarker
      : null;

  if (!marker) {
    throw new Error('URL externa nao pode ser assinada como PDF privado de fechamento.');
  }

  const [, storagePath = ''] = url.pathname.split(marker);
  const path = normalizePath(storagePath);
  if (!path) throw new Error('PDF sem caminho de Storage valido.');
  return path;
}

function clampExpiresIn(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_EXPIRES_IN_SECONDS;
  return Math.min(Math.max(Math.trunc(parsed), 60), MAX_EXPIRES_IN_SECONDS);
}

async function getAuthenticatedToken(request: Request) {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false as const, response: jsonResponse({ error: 'Autenticacao obrigatoria.' }, 401, request) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    return { ok: false as const, response: jsonResponse({ error: 'Configuracao Supabase ausente na Function.' }, 500, request) };
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false as const, response: jsonResponse({ error: 'Usuario autenticado obrigatorio.' }, 401, request) };
  }

  return { ok: true as const, token, supabaseUrl, anonKey };
}

function hasClosingInList(result: unknown, closingId: string) {
  if (!isRecord(result) || result.status !== 200) return false;
  const rows = Array.isArray(result.dados) ? result.dados : [];

  return rows.some((row) => isRecord(row) && row.id_fechamentos === closingId);
}

async function findClosingByPdfUrl(
  serviceClient: ReturnType<typeof createClient>,
  pathOrUrl: string,
  storagePath: string,
) {
  const baseQuery = serviceClient
    .schema('RetificaPremium')
    .from('Fechamentos')
    .select('id_fechamentos,fk_clientes,periodo,pdf_url');

  const { data: byPath, error: byPathError } = await baseQuery
    .eq('pdf_url', storagePath)
    .maybeSingle<ClosingRow>();
  if (byPathError) throw byPathError;
  if (byPath) return byPath;

  if (pathOrUrl !== storagePath) {
    const { data: byUrl, error: byUrlError } = await serviceClient
      .schema('RetificaPremium')
      .from('Fechamentos')
      .select('id_fechamentos,fk_clientes,periodo,pdf_url')
      .eq('pdf_url', pathOrUrl)
      .maybeSingle<ClosingRow>();
    if (byUrlError) throw byUrlError;
    if (byUrl) return byUrl;
  }

  return null;
}

Deno.serve(async (request) => {
  const cors = getCorsHeaders(request);
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: 'Origem nao autorizada.' }), {
      status: 403,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors.headers });
  if (request.method !== 'POST') return jsonResponse({ error: 'Metodo nao permitido.' }, 405, request);

  const auth = await getAuthenticatedToken(request);
  if (!auth.ok) return auth.response;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey) {
    return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY nao configurada na Function.' }, 500, request);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const closingId = isRecord(body) && typeof body.closingId === 'string' ? body.closingId.trim() : '';
    const pathOrUrl = isRecord(body) && typeof body.pathOrUrl === 'string' ? body.pathOrUrl.trim() : '';
    const support = isRecord(body) && isRecord(body.support) ? body.support : null;
    const expiresIn = clampExpiresIn(isRecord(body) ? body.expiresIn : undefined);
    const downloadFilename = isRecord(body)
      && (typeof body.downloadFilename === 'string' || typeof body.downloadFilename === 'boolean')
      && body.downloadFilename
      ? body.downloadFilename
      : undefined;

    if (!closingId && !pathOrUrl) {
      return jsonResponse({ error: 'Informe o fechamento para gerar o link seguro.' }, 400, request);
    }

    const requestedStoragePath = pathOrUrl ? normalizeStoragePath(pathOrUrl) : '';
    const serviceClient = createClient(auth.supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: closingById, error: closingByIdError } = closingId
      ? await serviceClient
        .schema('RetificaPremium')
        .from('Fechamentos')
        .select('id_fechamentos,fk_clientes,periodo,pdf_url')
        .eq('id_fechamentos', closingId)
        .maybeSingle<ClosingRow>()
      : { data: null, error: null };

    if (closingByIdError) throw closingByIdError;
    const closing = closingById ?? (pathOrUrl
      ? await findClosingByPdfUrl(serviceClient, pathOrUrl, requestedStoragePath)
      : null);

    if (!closing?.pdf_url) {
      return jsonResponse({ error: 'Fechamento ou PDF nao encontrado.' }, 404, request);
    }

    const closingStoragePath = normalizeStoragePath(closing.pdf_url);
    if (requestedStoragePath && requestedStoragePath !== closingStoragePath) {
      return jsonResponse({ error: 'O PDF solicitado nao pertence a este fechamento.' }, 400, request);
    }

    const userClient = createClient(auth.supabaseUrl, auth.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${auth.token}` } },
    });

    const isSupportRequest = Boolean(support?.targetUserId && support?.sessionId);
    const rpcName = isSupportRequest ? 'get_fechamentos_contexto_suporte' : 'get_fechamentos';
    const baseRpcParams = {
      p_fk_clientes: closing.fk_clientes,
      p_periodo: closing.periodo,
      p_limite: 50,
      p_offset: 0,
    };
    const rpcParams = isSupportRequest
      ? {
        ...baseRpcParams,
        p_contexto_usuario_id: String(support?.targetUserId),
        p_sessao_suporte: String(support?.sessionId),
      }
      : baseRpcParams;

    const { data: closingList, error: closingListError } = await userClient
      .schema('RetificaPremium')
      .rpc(rpcName, rpcParams);

    if (closingListError) {
      return jsonResponse({ error: closingListError.message }, 403, request);
    }
    if (!hasClosingInList(closingList, closing.id_fechamentos)) {
      return jsonResponse({ error: 'Voce nao tem permissao para abrir este PDF.' }, 403, request);
    }

    const { data: signed, error: signError } = downloadFilename
      ? await serviceClient.storage.from(FECHAMENTOS_BUCKET).createSignedUrl(closingStoragePath, expiresIn, {
        download: downloadFilename,
      })
      : await serviceClient.storage.from(FECHAMENTOS_BUCKET).createSignedUrl(closingStoragePath, expiresIn);

    if (signError || !signed?.signedUrl) {
      return jsonResponse({ error: signError?.message ?? 'Nao foi possivel gerar link seguro do PDF.' }, 404, request);
    }

    return jsonResponse({
      signedUrl: signed.signedUrl,
      expiresIn,
      filename: `fechamento-${closing.id_fechamentos}.pdf`,
    }, 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao abrir PDF.';
    return jsonResponse({ error: message }, 500, request);
  }
});
