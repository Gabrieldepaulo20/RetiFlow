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

const PAYABLE_ATTACHMENTS_BUCKET = Deno.env.get('PAYABLE_ATTACHMENTS_BUCKET') ?? 'contas-pagar';
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 10;
const MAX_EXPIRES_IN_SECONDS = 60 * 60;

type AttachmentRow = {
  id_anexo: string;
  fk_contas_pagar: string;
  tipo: string | null;
  nome_arquivo: string;
  url: string;
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
  const value = pathOrUrl.trim().replace(/^\/+/, '');

  if (!value || value.startsWith('blob:') || value.startsWith('local-upload://')) {
    throw new Error('Anexo sem arquivo remoto válido.');
  }

  if (!/^https?:\/\//i.test(value)) {
    return value;
  }

  const url = new URL(value);
  const marker = `/${PAYABLE_ATTACHMENTS_BUCKET}/`;
  const markerIndex = url.pathname.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error('URL externa não pode ser assinada como anexo privado.');
  }

  return decodeURIComponent(url.pathname.slice(markerIndex + marker.length)).replace(/^\/+/, '');
}

function clampExpiresIn(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_EXPIRES_IN_SECONDS;
  return Math.min(Math.max(Math.trunc(parsed), 60), MAX_EXPIRES_IN_SECONDS);
}

async function getAuthenticatedToken(request: Request) {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false as const, response: jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    return { ok: false as const, response: jsonResponse({ error: 'Configuração Supabase ausente na Function.' }, 500, request) };
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false as const, response: jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request) };
  }

  return { ok: true as const, token, supabaseUrl, anonKey };
}

function hasAttachmentInDetails(details: unknown, attachment: AttachmentRow) {
  const root = isRecord(details) && isRecord(details.dados) ? details.dados : details;
  const anexos = isRecord(root) && Array.isArray(root.anexos) ? root.anexos : [];

  return anexos.some((item) => {
    if (!isRecord(item)) return false;
    return item.id_anexo === attachment.id_anexo || item.url === attachment.url;
  });
}

Deno.serve(async (request) => {
  const cors = getCorsHeaders(request);
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: 'Origem não autorizada.' }), {
      status: 403,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors.headers });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const auth = await getAuthenticatedToken(request);
  if (!auth.ok) return auth.response;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey) {
    return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada na Function.' }, 500, request);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const attachmentId = isRecord(body) && typeof body.attachmentId === 'string' ? body.attachmentId.trim() : '';
    const pathOrUrl = isRecord(body) && typeof body.pathOrUrl === 'string' ? body.pathOrUrl.trim() : '';
    const support = isRecord(body) && isRecord(body.support) ? body.support : null;
    const expiresIn = clampExpiresIn(isRecord(body) ? body.expiresIn : undefined);

    if (!attachmentId && !pathOrUrl) {
      return jsonResponse({ error: 'Informe o anexo para gerar o link seguro.' }, 400, request);
    }

    const serviceClient = createClient(auth.supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const attachmentQuery = serviceClient
      .schema('RetificaPremium')
      .from('Contas_Pagar_Anexos')
      .select('id_anexo,fk_contas_pagar,tipo,nome_arquivo,url');

    const { data: attachment, error: attachmentError } = attachmentId
      ? await attachmentQuery.eq('id_anexo', attachmentId).maybeSingle<AttachmentRow>()
      : await attachmentQuery.eq('url', normalizeStoragePath(pathOrUrl)).maybeSingle<AttachmentRow>();

    if (attachmentError) throw attachmentError;
    if (!attachment?.url) {
      return jsonResponse({ error: 'Anexo não encontrado.' }, 404, request);
    }

    const userClient = createClient(auth.supabaseUrl, auth.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${auth.token}` } },
    });

    const isSupportRequest = Boolean(support?.targetUserId && support?.sessionId);
    const rpcName = isSupportRequest ? 'get_conta_pagar_detalhes_contexto_suporte' : 'get_conta_pagar_detalhes';
    const rpcParams = isSupportRequest
      ? {
        p_id_contas_pagar: attachment.fk_contas_pagar,
        p_contexto_usuario_id: String(support?.targetUserId),
        p_sessao_suporte: String(support?.sessionId),
      }
      : { p_id_contas_pagar: attachment.fk_contas_pagar };

    const { data: details, error: detailsError } = await userClient
      .schema('RetificaPremium')
      .rpc(rpcName, rpcParams);

    if (detailsError) {
      return jsonResponse({ error: detailsError.message }, 403, request);
    }
    if (!isRecord(details) || details.status !== 200 || !hasAttachmentInDetails(details, attachment)) {
      return jsonResponse({ error: 'Você não tem permissão para abrir este anexo.' }, 403, request);
    }

    const storagePath = normalizeStoragePath(attachment.url);
    const { data: signed, error: signError } = await serviceClient.storage
      .from(PAYABLE_ATTACHMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (signError || !signed?.signedUrl) {
      return jsonResponse({ error: signError?.message ?? 'Não foi possível gerar link seguro do anexo.' }, 404, request);
    }

    return jsonResponse({
      signedUrl: signed.signedUrl,
      expiresIn,
      filename: attachment.nome_arquivo,
      type: attachment.tipo,
    }, 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao abrir anexo.';
    return jsonResponse({ error: message }, 500, request);
  }
});
