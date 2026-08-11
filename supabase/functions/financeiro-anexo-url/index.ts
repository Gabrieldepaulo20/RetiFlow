import { createClient } from 'npm:@supabase/supabase-js@2.104.0';

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

const FINANCEIRO_BUCKET =
  Deno.env.get('FINANCEIRO_COMPROVANTES_BUCKET') ?? 'financeiro-comprovantes';
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 10;
const MAX_EXPIRES_IN_SECONDS = 60 * 60;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type FinanceiroAnexoRow = {
  id_financeiro_anexos: string;
  fk_financeiro_movimentos: string;
  storage_path: string;
  nome_arquivo: string;
  tipo_mime: string | null;
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
    return {
      allowed,
      headers: {
        ...baseCorsHeaders,
        'Access-Control-Allow-Origin': allowed ? (origin || 'null') : 'null',
      },
    };
  }

  if (configuredOrigins.includes('*')) {
    const allowed = localDevOrigins.has(origin);
    return {
      allowed,
      headers: {
        ...baseCorsHeaders,
        'Access-Control-Allow-Origin': allowed ? origin : 'null',
      },
    };
  }

  if (!origin) {
    return {
      allowed: true,
      headers: {
        ...baseCorsHeaders,
        'Access-Control-Allow-Origin': configuredOrigins[0],
      },
    };
  }

  const allowed = configuredOrigins.includes(origin) || localDevOrigins.has(origin);
  return {
    allowed,
    headers: {
      ...baseCorsHeaders,
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
    },
  };
}

function jsonResponse(body: unknown, status: number, request: Request) {
  const { headers } = getCorsHeaders(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStoragePath(pathOrUrl: string) {
  const value = pathOrUrl.trim().replace(/^\/+/, '');
  if (!value || value.startsWith('blob:') || value.startsWith('local-upload://')) {
    throw new Error('Comprovante sem arquivo remoto válido.');
  }
  if (!/^https?:\/\//i.test(value)) return value;

  const url = new URL(value);
  const markers = [
    `/storage/v1/object/public/${FINANCEIRO_BUCKET}/`,
    `/storage/v1/object/sign/${FINANCEIRO_BUCKET}/`,
    `/storage/v1/object/authenticated/${FINANCEIRO_BUCKET}/`,
    `/${FINANCEIRO_BUCKET}/`,
  ];
  const marker = markers.find((candidate) => url.pathname.includes(candidate));
  if (!marker) {
    throw new Error('URL externa não pode ser assinada como comprovante financeiro.');
  }
  return decodeURIComponent(url.pathname.split(marker)[1] ?? '').replace(/^\/+/, '');
}

function clampExpiresIn(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_EXPIRES_IN_SECONDS;
  return Math.min(Math.max(Math.trunc(parsed), 60), MAX_EXPIRES_IN_SECONDS);
}

async function authenticate(request: Request) {
  const token = (request.headers.get('Authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!token) {
    return {
      ok: false as const,
      response: jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request),
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false as const,
      response: jsonResponse({ error: 'Configuração Supabase ausente na Function.' }, 500, request),
    };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false as const,
      response: jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request),
    };
  }

  return { ok: true as const, token, supabaseUrl, anonKey };
}

function responseContainsAttachment(payload: unknown, attachment: FinanceiroAnexoRow) {
  if (!isRecord(payload) || payload.status !== 200 || !Array.isArray(payload.dados)) {
    return false;
  }
  return payload.dados.some((item) => (
    isRecord(item)
    && (
      item.id === attachment.id_financeiro_anexos
      || item.id_financeiro_anexos === attachment.id_financeiro_anexos
    )
    && (
      item.caminho === attachment.storage_path
      || item.storage_path === attachment.storage_path
    )
  ));
}

function hasAuthorizedUpload(result: unknown, input: {
  movementId: string;
  targetUserId: string;
}) {
  if (!isRecord(result) || result.status !== 200 || !isRecord(result.dados)) return false;
  return result.dados.movement_id === input.movementId
    && result.dados.target_user_id === input.targetUserId;
}

function sanitizeFilename(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return normalized || 'comprovante';
}

function resolveMimeType(filename: string, supplied: string) {
  const aliases: Record<string, string> = {
    'application/x-pdf': 'application/pdf',
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
  };
  const raw = supplied.trim().toLowerCase();
  const normalized = aliases[raw] ?? raw;
  if (ALLOWED_UPLOAD_TYPES.has(normalized)) return normalized;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return '';
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
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405, request);
  }

  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey) {
    return jsonResponse(
      { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada na Function.' },
      500,
      request,
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = isRecord(body) && body.action === 'createUpload'
      ? 'createUpload'
      : 'sign';
    const attachmentId = isRecord(body) && typeof body.attachmentId === 'string'
      ? body.attachmentId.trim()
      : '';
    const pathOrUrl = isRecord(body) && typeof body.pathOrUrl === 'string'
      ? body.pathOrUrl.trim()
      : '';
    const support = isRecord(body) && isRecord(body.support) ? body.support : null;
    const expiresIn = clampExpiresIn(isRecord(body) ? body.expiresIn : undefined);

    const serviceClient = createClient(auth.supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userClient = createClient(auth.supabaseUrl, auth.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${auth.token}` } },
    });

    if (action === 'createUpload') {
      const movementId = isRecord(body) && typeof body.movementId === 'string'
        ? body.movementId.trim()
        : '';
      const fingerprint = isRecord(body) && typeof body.fingerprint === 'string'
        ? body.fingerprint.trim().toLowerCase()
        : '';
      const filename = isRecord(body) && typeof body.filename === 'string'
        ? sanitizeFilename(body.filename)
        : '';
      const suppliedMimeType = isRecord(body) && typeof body.mimeType === 'string'
        ? body.mimeType
        : '';
      const mimeType = resolveMimeType(filename, suppliedMimeType);
      const size = isRecord(body) ? Number(body.size) : Number.NaN;
      const targetUserId = typeof support?.targetUserId === 'string'
        ? support.targetUserId.trim()
        : '';
      const sessionId = typeof support?.sessionId === 'string'
        ? support.sessionId.trim()
        : '';
      if (
        !movementId
        || !targetUserId
        || !sessionId
        || !/^[0-9a-f]{64}$/.test(fingerprint)
        || !filename
        || !ALLOWED_UPLOAD_TYPES.has(mimeType)
        || !Number.isSafeInteger(size)
        || size <= 0
        || size > MAX_UPLOAD_BYTES
      ) {
        return jsonResponse({ error: 'Dados do comprovante ou sessao de suporte invalidos.' }, 400, request);
      }

      const { data: authorization, error: authorizationError } = await userClient
        .schema('RetificaPremium')
        .rpc('autorizar_upload_comprovante_contexto_suporte', {
          p_id_financeiro_movimentos: movementId,
          p_contexto_usuario_id: targetUserId,
          p_sessao_suporte: sessionId,
        });
      if (authorizationError || !hasAuthorizedUpload(authorization, {
        movementId,
        targetUserId,
      })) {
        return jsonResponse({
          error: authorizationError?.message ?? 'Upload nao autorizado para esta sessao.',
        }, 403, request);
      }

      const path = `support/${targetUserId}/${movementId}/${fingerprint}-${filename}`;
      const { data: signedUpload, error: signedUploadError } = await serviceClient.storage
        .from(FINANCEIRO_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });
      if (signedUploadError || !signedUpload?.token) {
        return jsonResponse({
          error: signedUploadError?.message ?? 'Nao foi possivel autorizar o upload privado.',
        }, 500, request);
      }
      return jsonResponse({
        path,
        token: signedUpload.token,
        filename,
        mimeType,
        expiresIn: 60 * 60 * 2,
      }, 200, request);
    }

    if (!attachmentId && !pathOrUrl) {
      return jsonResponse({ error: 'Informe o comprovante para gerar o link seguro.' }, 400, request);
    }

    const attachmentQuery = serviceClient
      .schema('RetificaPremium')
      .from('Financeiro_Anexos')
      .select(
        'id_financeiro_anexos,fk_financeiro_movimentos,storage_path,nome_arquivo,tipo_mime',
      );
    const { data: attachment, error: attachmentError } = attachmentId
      ? await attachmentQuery
        .eq('id_financeiro_anexos', attachmentId)
        .maybeSingle<FinanceiroAnexoRow>()
      : await attachmentQuery
        .eq('storage_path', normalizeStoragePath(pathOrUrl))
        .maybeSingle<FinanceiroAnexoRow>();

    if (attachmentError) throw attachmentError;
    if (!attachment?.storage_path) {
      return jsonResponse({ error: 'Comprovante não encontrado.' }, 404, request);
    }

    const isSupportRequest = Boolean(support?.targetUserId && support?.sessionId);
    const rpcName = isSupportRequest
      ? 'get_financeiro_anexos_contexto_suporte'
      : 'get_financeiro_anexos';
    const rpcParams = isSupportRequest
      ? {
          p_fk_financeiro_movimentos: attachment.fk_financeiro_movimentos,
          p_contexto_usuario_id: String(support?.targetUserId),
          p_sessao_suporte: String(support?.sessionId),
        }
      : { p_fk_financeiro_movimentos: attachment.fk_financeiro_movimentos };
    const { data: details, error: detailsError } = await userClient
      .schema('RetificaPremium')
      .rpc(rpcName, rpcParams);

    if (detailsError) {
      return jsonResponse({ error: detailsError.message }, 403, request);
    }
    if (!responseContainsAttachment(details, attachment)) {
      return jsonResponse(
        { error: 'Você não tem permissão para abrir este comprovante.' },
        403,
        request,
      );
    }

    const storagePath = normalizeStoragePath(attachment.storage_path);
    const { data: signed, error: signError } = await serviceClient.storage
      .from(FINANCEIRO_BUCKET)
      .createSignedUrl(storagePath, expiresIn);
    if (signError || !signed?.signedUrl) {
      return jsonResponse(
        { error: signError?.message ?? 'Não foi possível gerar o link seguro.' },
        404,
        request,
      );
    }

    return jsonResponse({
      signedUrl: signed.signedUrl,
      expiresIn,
      filename: attachment.nome_arquivo,
      type: attachment.tipo_mime,
    }, 200, request);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Erro inesperado ao abrir comprovante.';
    return jsonResponse({ error: message }, 500, request);
  }
});
