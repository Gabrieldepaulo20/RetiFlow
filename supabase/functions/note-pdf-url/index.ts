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

const NOTES_BUCKET = Deno.env.get('NOTES_BUCKET') ?? 'notas';
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 10;
const MAX_EXPIRES_IN_SECONDS = 60 * 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NoteRow = {
  id_notas_servico: string;
  criado_por_usuario: string;
  os: string;
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
  return typeof value === 'object' && value !== null;
}

function normalizeStoragePath(pathOrUrl: string) {
  const value = pathOrUrl.trim();
  if (!value || value.startsWith('blob:')) {
    throw new Error('PDF sem arquivo remoto válido.');
  }

  const normalizePath = (path: string) => {
    const normalized = decodeURIComponent(path)
      .replace(/^\/+/, '')
      .replace(new RegExp(`^object/(?:public|sign)/${NOTES_BUCKET}/`), '')
      .replace(/^\/+/, '');

    if (!normalized || normalized.split('/').some((segment) => segment === '..')) {
      throw new Error('PDF sem caminho de Storage válido.');
    }
    return normalized;
  };

  if (!/^https?:\/\//i.test(value)) {
    return normalizePath(value);
  }

  const url = new URL(value);
  const publicMarker = `/storage/v1/object/public/${NOTES_BUCKET}/`;
  const signedMarker = `/storage/v1/object/sign/${NOTES_BUCKET}/`;
  const marker = url.pathname.includes(publicMarker)
    ? publicMarker
    : url.pathname.includes(signedMarker)
      ? signedMarker
      : null;

  if (!marker) {
    throw new Error('URL externa não pode ser assinada como PDF privado de O.S.');
  }

  const [, storagePath = ''] = url.pathname.split(marker);
  return normalizePath(storagePath);
}

function clampExpiresIn(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_EXPIRES_IN_SECONDS;
  return Math.min(Math.max(Math.trunc(parsed), 60), MAX_EXPIRES_IN_SECONDS);
}

async function getAuthenticatedToken(request: Request) {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
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

  return {
    ok: true as const,
    token,
    userId: data.user.id,
    supabaseUrl,
    anonKey,
  };
}

async function hasValidSupportSession(
  serviceClient: ReturnType<typeof createClient>,
  params: {
    sessionId: string;
    actorUserId: string;
    targetUserId: string;
  },
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .rpc('sessao_suporte_valida', {
      p_sessao_suporte: params.sessionId,
      p_actor_usuario_id: params.actorUserId,
      p_target_usuario_id: params.targetUserId,
    });

  return !error && data === true;
}

function detailsAuthorizeNote(
  details: unknown,
  note: NoteRow,
  storagePath: string,
) {
  if (!isRecord(details) || details.status !== 200 || !isRecord(details.cabecalho)) {
    return false;
  }

  const header = details.cabecalho;
  if (header.id_nota !== note.id_notas_servico || typeof header.pdf_url !== 'string') {
    return false;
  }

  try {
    return normalizeStoragePath(header.pdf_url) === storagePath;
  } catch {
    return false;
  }
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

  const auth = await getAuthenticatedToken(request);
  if (!auth.ok) return auth.response;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey) {
    return jsonResponse({
      error: 'SUPABASE_SERVICE_ROLE_KEY não configurada na Function.',
    }, 500, request);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const pathOrUrl = isRecord(body) && typeof body.pathOrUrl === 'string'
      ? body.pathOrUrl.trim()
      : '';
    const support = isRecord(body) && isRecord(body.support) ? body.support : null;
    const sessionId = support && typeof support.sessionId === 'string'
      ? support.sessionId.trim()
      : '';
    const targetUserId = support && typeof support.targetUserId === 'string'
      ? support.targetUserId.trim()
      : '';
    const expiresIn = clampExpiresIn(isRecord(body) ? body.expiresIn : undefined);

    if (!pathOrUrl) {
      return jsonResponse({ error: 'Informe o PDF para gerar o link seguro.' }, 400, request);
    }
    if (!UUID_PATTERN.test(sessionId) || !UUID_PATTERN.test(targetUserId)) {
      return jsonResponse({ error: 'Contexto de suporte válido é obrigatório.' }, 400, request);
    }

    const storagePath = normalizeStoragePath(pathOrUrl);
    const serviceClient = createClient(auth.supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: actorRows, error: actorError } = await serviceClient
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('id_usuarios')
      .eq('auth_id', auth.userId)
      .limit(2);

    if (actorError || !actorRows || actorRows.length !== 1) {
      return jsonResponse({ error: 'Operador de suporte não identificado.' }, 403, request);
    }
    const actorUserId = String(actorRows[0].id_usuarios);

    const supportParams = { sessionId, actorUserId, targetUserId };
    if (!await hasValidSupportSession(serviceClient, supportParams)) {
      return jsonResponse({ error: 'Sessão de suporte inválida ou revogada.' }, 403, request);
    }

    const pdfCandidates = [...new Set([storagePath, pathOrUrl])];
    const { data: noteRows, error: noteError } = await serviceClient
      .schema('RetificaPremium')
      .from('Notas_de_Servico')
      .select('id_notas_servico,criado_por_usuario,os,pdf_url')
      .in('pdf_url', pdfCandidates)
      .limit(2);

    if (noteError) throw noteError;
    const notes = (noteRows ?? []) as NoteRow[];
    if (notes.length === 0) {
      return jsonResponse({ error: 'O.S. ou PDF não encontrado.' }, 404, request);
    }
    if (notes.length !== 1) {
      return jsonResponse({ error: 'O PDF informado não identifica uma única O.S.' }, 409, request);
    }

    const note = notes[0];
    if (!note.pdf_url || note.criado_por_usuario !== targetUserId) {
      return jsonResponse({ error: 'Você não tem permissão para abrir este PDF.' }, 403, request);
    }
    if (normalizeStoragePath(note.pdf_url) !== storagePath) {
      return jsonResponse({ error: 'O PDF solicitado não pertence a esta O.S.' }, 400, request);
    }

    const userClient = createClient(auth.supabaseUrl, auth.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${auth.token}` } },
    });
    const { data: details, error: detailsError } = await userClient
      .schema('RetificaPremium')
      .rpc('get_nota_servico_detalhes_contexto_suporte', {
        p_id_nota_servico: note.id_notas_servico,
        p_contexto_usuario_id: targetUserId,
        p_sessao_suporte: sessionId,
      });

    if (detailsError || !detailsAuthorizeNote(details, note, storagePath)) {
      return jsonResponse({ error: 'Você não tem permissão para abrir este PDF.' }, 403, request);
    }

    // Revalida imediatamente antes da assinatura: revogação/saída ocorrida
    // durante as consultas anteriores encerra o fluxo sem expor a URL.
    if (!await hasValidSupportSession(serviceClient, supportParams)) {
      return jsonResponse({ error: 'Sessão de suporte inválida ou revogada.' }, 403, request);
    }

    const { data: signed, error: signError } = await serviceClient.storage
      .from(NOTES_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (signError || !signed?.signedUrl) {
      return jsonResponse({
        error: signError?.message ?? 'Não foi possível gerar link seguro do PDF.',
      }, 404, request);
    }

    const { error: auditError } = await serviceClient
      .schema('RetificaPremium')
      .from('Logs_Acoes_Suporte')
      .insert({
        fk_actor_usuarios: actorUserId,
        fk_target_usuarios: targetUserId,
        fk_sessao_suporte: sessionId,
        acao: 'abrir_pdf_nota',
        entidade: 'Notas_de_Servico',
        entidade_id: note.id_notas_servico,
        descricao: 'PDF privado da O.S. aberto em modo suporte.',
      });

    if (auditError) {
      return jsonResponse({
        error: 'Não foi possível registrar a auditoria. O PDF não foi liberado.',
      }, 500, request);
    }

    // O link só sai da Function se a permissão continuar válida também após
    // assinatura e auditoria. Uma revogação nessa janela descarta a URL.
    if (!await hasValidSupportSession(serviceClient, supportParams)) {
      return jsonResponse({ error: 'Sessão de suporte inválida ou revogada.' }, 403, request);
    }

    return jsonResponse({
      signedUrl: signed.signedUrl,
      expiresIn,
      filename: `${note.os || note.id_notas_servico}.pdf`,
    }, 200, request);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Erro inesperado ao abrir PDF.';
    return jsonResponse({ error: message }, 500, request);
  }
});
