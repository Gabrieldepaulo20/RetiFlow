import { createClient } from 'npm:@supabase/supabase-js@2';

type AppModuleKey =
  | 'dashboard'
  | 'clients'
  | 'notes'
  | 'kanban'
  | 'closing'
  | 'payables'
  | 'invoices'
  | 'settings'
  | 'admin';

type UserRole = 'ADMIN' | 'FINANCEIRO' | 'PRODUCAO' | 'RECEPCAO';

type ModuleAccess = Partial<Record<AppModuleKey, boolean>>;

type ActionPayload =
  | {
      action: 'create_user' | 'create_admin';
      email: string;
      name: string;
      phone?: string;
      role: UserRole;
      modules?: ModuleAccess;
    }
  | {
      action: 'reset_password' | 'deactivate_user' | 'reactivate_user';
      userId: string;
      email?: string;
    }
  | {
      action: 'set_modules';
      userId: string;
      modules: ModuleAccess;
    };

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

const roleToAccess: Record<UserRole, string> = {
  ADMIN: 'administrador',
  FINANCEIRO: 'financeiro',
  PRODUCAO: 'produção',
  RECEPCAO: 'recepção',
};

const moduleToRpcParam: Record<AppModuleKey, string> = {
  dashboard: 'p_dashboard',
  clients: 'p_clientes',
  notes: 'p_notas_de_entrada',
  kanban: 'p_kanban',
  closing: 'p_fechamento',
  payables: 'p_contas_a_pagar',
  invoices: 'p_nota_fiscal',
  settings: 'p_configuracoes',
  admin: 'p_admin',
};

function getConfiguredOrigins() {
  const raw = Deno.env.get('CORS_ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function getSuperAdminEmails() {
  const raw = Deno.env.get('SUPER_ADMIN_EMAILS') ?? Deno.env.get('SUPER_ADMIN_EMAIL') ?? 'gabrielwilliam208@gmail.com';
  return new Set(raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const configuredOrigins = getConfiguredOrigins();

  if (configuredOrigins.length === 0 || configuredOrigins.includes('*')) {
    return { allowed: true, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': '*' } };
  }

  if (!origin) {
    return { allowed: true, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': configuredOrigins[0] } };
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
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function assertString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Campo obrigatório ausente: ${fieldName}.`);
  }
  return value.trim().slice(0, maxLength);
}

function assertEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('E-mail inválido.');
  }
  return email;
}

function assertUserId(value: unknown) {
  const id = assertString(value, 'userId', 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Identificador de usuário inválido.');
  }
  return id;
}

function assertRole(value: unknown): UserRole {
  if (value === 'ADMIN' || value === 'FINANCEIRO' || value === 'PRODUCAO' || value === 'RECEPCAO') {
    return value;
  }
  throw new Error('Perfil de acesso inválido.');
}

function normalizeModules(value: unknown): ModuleAccess {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<ModuleAccess>((accumulator, [key, enabled]) => {
    if (key in moduleToRpcParam && typeof enabled === 'boolean') {
      accumulator[key as AppModuleKey] = enabled;
    }
    return accumulator;
  }, {});
}

function modulesToRpcPayload(modules: ModuleAccess) {
  return Object.entries(modules).reduce<Record<string, boolean>>((accumulator, [key, enabled]) => {
    const rpcParam = moduleToRpcParam[key as AppModuleKey];
    if (rpcParam && typeof enabled === 'boolean') {
      accumulator[rpcParam] = enabled;
    }
    return accumulator;
  }, {});
}

async function getRequester(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { ok: false as const, response: jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { ok: false as const, response: jsonResponse({ error: 'Configuração Supabase ausente na Function.' }, 500, request) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authUserData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authUserData.user?.email) {
    return { ok: false as const, response: jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request) };
  }

  const requesterEmail = authUserData.user.email.trim().toLowerCase();
  if (!getSuperAdminEmails().has(requesterEmail)) {
    return { ok: false as const, response: jsonResponse({ error: 'Ação restrita ao Super Admin autorizado.' }, 403, request) };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profiles, error: profileError } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('status, acesso, email')
    .eq('email', requesterEmail)
    .limit(1);

  if (profileError) {
    return { ok: false as const, response: jsonResponse({ error: 'Não foi possível validar o perfil interno do Super Admin.' }, 500, request) };
  }

  const profile = profiles?.[0] as { status?: boolean; acesso?: string; email?: string } | undefined;
  if (!profile || profile.status === false || profile.acesso !== 'administrador') {
    return { ok: false as const, response: jsonResponse({ error: 'Super Admin sem perfil interno administrativo ativo.' }, 403, request) };
  }

  return {
    ok: true as const,
    serviceClient,
    requesterEmail,
  };
}

async function findAuthUserByEmail(serviceClient: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Falha ao procurar usuário Auth: ${error.message}`);
  return data.users.find((user) => user.email?.trim().toLowerCase() === email) ?? null;
}

async function ensureAuthInvite(serviceClient: ReturnType<typeof createClient>, email: string, name: string) {
  const existing = await findAuthUserByEmail(serviceClient, email);
  if (existing) return { userId: existing.id, actionLink: undefined };

  const redirectTo = Deno.env.get('AUTH_REDIRECT_TO') || Deno.env.get('APP_BASE_URL') || undefined;
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { name },
      redirectTo,
    },
  });

  if (error || !data.user) {
    throw new Error(`Falha ao gerar convite seguro: ${error?.message ?? 'sem usuário retornado'}`);
  }

  return {
    userId: data.user.id,
    actionLink: data.properties?.action_link,
  };
}

async function findInternalUserId(
  serviceClient: ReturnType<typeof createClient>,
  authUserId: string,
  email: string,
) {
  const { data: byAuthId, error: byAuthIdError } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (byAuthIdError) throw new Error(`Falha ao procurar perfil por Auth ID: ${byAuthIdError.message}`);
  if (byAuthId?.id_usuarios) return byAuthId.id_usuarios as string;

  const { data: byEmail, error: byEmailError } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('email', email)
    .maybeSingle();

  if (byEmailError) throw new Error(`Falha ao procurar perfil por e-mail: ${byEmailError.message}`);
  return byEmail?.id_usuarios ? byEmail.id_usuarios as string : null;
}

async function upsertInternalUser(
  serviceClient: ReturnType<typeof createClient>,
  params: {
    authUserId: string;
    email: string;
    name: string;
    phone?: string;
    role: UserRole;
    status?: boolean;
  },
) {
  const payload = {
    nome: params.name,
    email: params.email,
    telefone: params.phone ?? '',
    acesso: roleToAccess[params.role],
    status: params.status ?? true,
    auth_id: params.authUserId,
  };

  const existingUserId = await findInternalUserId(serviceClient, params.authUserId, params.email);
  if (existingUserId) {
    const { error } = await serviceClient
      .schema('RetificaPremium')
      .from('Usuarios')
      .update(payload)
      .eq('id_usuarios', existingUserId);

    if (error) throw new Error(`Falha ao atualizar perfil interno: ${error.message}`);
    return existingUserId;
  }

  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .insert(payload)
    .select('id_usuarios')
    .single();

  if (error) throw new Error(`Falha ao criar perfil interno: ${error.message}`);
  if (!data?.id_usuarios) throw new Error('Falha ao criar perfil interno.');
  return data.id_usuarios as string;
}

async function setModules(serviceClient: ReturnType<typeof createClient>, userId: string, modules: ModuleAccess) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .rpc('upsert_modulo', {
      p_fk_usuarios: userId,
      ...modulesToRpcPayload(modules),
    });

  if (error) throw new Error(`Falha ao salvar módulos: ${error.message}`);
  if (data && typeof data === 'object' && 'status' in data && data.status !== 200) {
    throw new Error(data.mensagem ?? 'Falha ao salvar módulos.');
  }
}

async function callStatusRpc(serviceClient: ReturnType<typeof createClient>, rpcName: string, userId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .rpc(rpcName, { p_id_usuarios: userId });

  if (error) throw new Error(`[${rpcName}] ${error.message}`);
  if (data && typeof data === 'object' && 'status' in data && data.status !== 200) {
    throw new Error(data.mensagem ?? `[${rpcName}] Falha ao atualizar usuário.`);
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

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors.headers });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405, request);
  }

  const requester = await getRequester(request);
  if (!requester.ok) return requester.response;

  try {
    const payload = await request.json() as ActionPayload;
    if (!isRecord(payload) || typeof payload.action !== 'string') {
      return jsonResponse({ error: 'Payload inválido.' }, 400, request);
    }

    if (payload.action === 'create_user' || payload.action === 'create_admin') {
      const email = assertEmail(payload.email);
      const name = assertString(payload.name, 'name', 120);
      const phone = typeof payload.phone === 'string' ? payload.phone.trim().slice(0, 30) : '';
      const role = payload.action === 'create_admin' ? 'ADMIN' : assertRole(payload.role);
      const modules = normalizeModules(payload.modules);

      if (payload.role === 'ADMIN' && payload.action !== 'create_admin') {
        return jsonResponse({ error: 'Use create_admin para criar administradores.' }, 400, request);
      }

      const auth = await ensureAuthInvite(requester.serviceClient, email, name);
      const internalUserId = await upsertInternalUser(requester.serviceClient, {
        authUserId: auth.userId,
        email,
        name,
        phone,
        role,
        status: true,
      });

      if (Object.keys(modules).length > 0) {
        await setModules(requester.serviceClient, internalUserId, modules);
      }

      return jsonResponse({
        mensagem: 'Usuário criado/convidado com segurança.',
        id_usuarios: internalUserId,
        auth_user_id: auth.userId,
        action_link: auth.actionLink,
      }, 200, request);
    }

    if (payload.action === 'reset_password') {
      const email = assertEmail(payload.email);
      const redirectTo = Deno.env.get('AUTH_REDIRECT_TO') || Deno.env.get('APP_BASE_URL') || undefined;
      const { data, error } = await requester.serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });

      if (error) throw new Error(`Falha ao gerar recuperação de senha: ${error.message}`);

      return jsonResponse({
        mensagem: 'Link temporário de recuperação gerado para o Super Admin.',
        action_link: data.properties?.action_link,
      }, 200, request);
    }

    if (payload.action === 'set_modules') {
      const userId = assertUserId(payload.userId);
      await setModules(requester.serviceClient, userId, normalizeModules(payload.modules));
      return jsonResponse({ mensagem: 'Módulos atualizados.' }, 200, request);
    }

    if (payload.action === 'deactivate_user' || payload.action === 'reactivate_user') {
      const userId = assertUserId(payload.userId);
      await callStatusRpc(
        requester.serviceClient,
        payload.action === 'deactivate_user' ? 'inativar_usuario' : 'reativar_usuario',
        userId,
      );
      return jsonResponse({ mensagem: payload.action === 'deactivate_user' ? 'Usuário inativado.' : 'Usuário reativado.' }, 200, request);
    }

    return jsonResponse({ error: 'Ação administrativa desconhecida.' }, 400, request);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Erro inesperado na ação administrativa.',
    }, 400, request);
  }
});
