import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createAnonClient, createServiceClient, getTestEnv } from './helpers/client';
import { deleteTestUser, ensureTestUser, TEST_PREFIX } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();
if (!envStatus.configured) warnIntegrationSkipped('admin-escalation-hardening.test');

const RUN_ID = Date.now();
const NORMAL_EMAIL = `admin-hardening-normal-${RUN_ID}@retifica.test`;
const ADMIN_EMAIL = `admin-hardening-admin-${RUN_ID}@retifica.test`;
const TARGET_EMAIL = `admin-hardening-target-${RUN_ID}@retifica.test`;
const PASSWORD = `AdminHardening@${RUN_ID}!`;

async function signIn(email: string) {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) {
    throw new Error(`[admin-hardening] Login falhou: ${error?.message ?? 'sem sessão'}`);
  }
  return { client, accessToken: data.session.access_token };
}

async function getInternalUserId(email: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('email', email)
    .maybeSingle();

  if (error || !data?.id_usuarios) {
    throw new Error(`[admin-hardening] Usuário interno não encontrado: ${error?.message ?? email}`);
  }

  return data.id_usuarios as string;
}

async function configureInternalUser(email: string, acesso: 'financeiro' | 'administrador', adminModule: boolean) {
  const service = createServiceClient();
  const userId = await getInternalUserId(email);

  const { error: userError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .update({
      nome: `${TEST_PREFIX} ${email.split('@')[0]}`,
      acesso,
      status: true,
    })
    .eq('id_usuarios', userId);

  if (userError) {
    throw new Error(`[admin-hardening] Falha ao configurar usuário: ${userError.message}`);
  }

  const { error: moduleError } = await service
    .schema('RetificaPremium')
    .from('Modulos')
    .upsert({
      fk_usuarios: userId,
      dashboard: true,
      clientes: true,
      notas_de_entrada: true,
      kanban: true,
      fechamento: true,
      nota_fiscal: false,
      configuracoes: acesso === 'administrador',
      contas_a_pagar: true,
      admin: adminModule,
    }, { onConflict: 'fk_usuarios' });

  if (moduleError) {
    throw new Error(`[admin-hardening] Falha ao configurar módulos: ${moduleError.message}`);
  }

  return userId;
}

async function invokeAdminUsers(accessToken: string, body: Record<string, unknown>) {
  const { url, anonKey } = getTestEnv();
  return fetch(`${url.replace(/\/$/, '')}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function expectAdminUsersDenied(accessToken: string, body: Record<string, unknown>, expectedStatuses = [400, 403]) {
  const response = await invokeAdminUsers(accessToken, body);
  expect(expectedStatuses).toContain(response.status);
  const payload = await response.json() as { error?: string };
  expect(payload.error).toBeTruthy();
  return payload.error ?? '';
}

describe.skipIf(!envStatus.configured)('Admin escalation hardening — payload adulterado não vira admin', () => {
  let normalUserId = '';
  let adminUserId = '';
  let targetUserId = '';

  beforeAll(async () => {
    await ensureTestUser(NORMAL_EMAIL, PASSWORD);
    await ensureTestUser(ADMIN_EMAIL, PASSWORD);
    await ensureTestUser(TARGET_EMAIL, PASSWORD);

    normalUserId = await configureInternalUser(NORMAL_EMAIL, 'financeiro', false);
    adminUserId = await configureInternalUser(ADMIN_EMAIL, 'administrador', true);
    targetUserId = await configureInternalUser(TARGET_EMAIL, 'financeiro', false);
  });

  afterAll(async () => {
    await deleteTestUser(NORMAL_EMAIL);
    await deleteTestUser(ADMIN_EMAIL);
    await deleteTestUser(TARGET_EMAIL);
  });

  it('usuário operacional autenticado não consegue usar a Edge Function admin-users', async () => {
    const { accessToken, client } = await signIn(NORMAL_EMAIL);

    await expectAdminUsersDenied(accessToken, {
      action: 'create_user',
      email: `tentativa-${RUN_ID}@retifica.test`,
      name: 'Tentativa Indevida',
      role: 'FINANCEIRO',
      modules: { admin: true },
    }, [403]);

    await client.auth.signOut();
  });

  it('admin comum não consegue criar, promover, excluir, impersonar ou ver presença de Mega Master', async () => {
    const { accessToken, client } = await signIn(ADMIN_EMAIL);

    await expectAdminUsersDenied(accessToken, {
      action: 'create_admin',
      email: `admin-criado-${RUN_ID}@retifica.test`,
      name: 'Admin Indevido',
      role: 'ADMIN',
    }, [403]);

    await expectAdminUsersDenied(accessToken, {
      action: 'promote_to_admin',
      userId: targetUserId,
    }, [403]);

    await expectAdminUsersDenied(accessToken, {
      action: 'analyze_delete_user',
      userId: targetUserId,
      confirmEmail: TARGET_EMAIL,
    }, [403]);

    await expectAdminUsersDenied(accessToken, {
      action: 'start_support_impersonation',
      targetUserId,
      reason: 'Teste de bloqueio de suporte indevido',
    }, [400, 403]);

    await expectAdminUsersDenied(accessToken, {
      action: 'get_user_presence',
    }, [403]);

    await client.auth.signOut();
  });

  it('admin comum não consegue forçar módulo Admin em usuário operacional', async () => {
    const { accessToken, client } = await signIn(ADMIN_EMAIL);

    const error = await expectAdminUsersDenied(accessToken, {
      action: 'set_modules',
      userId: targetUserId,
      modules: { admin: true, dashboard: true },
    }, [400]);

    expect(error).toMatch(/módulo admin/i);

    const service = createServiceClient();
    const { data, error: moduleError } = await service
      .schema('RetificaPremium')
      .from('Modulos')
      .select('admin')
      .eq('fk_usuarios', targetUserId)
      .maybeSingle();

    expect(moduleError).toBeNull();
    expect(data?.admin).toBe(false);

    await client.auth.signOut();
  });

  it('RPCs administrativas sensíveis não executam com access token de usuário comum', async () => {
    const { client } = await signIn(NORMAL_EMAIL);

    await expect(callRpc(client, 'upsert_modulo', {
      p_fk_usuarios: normalUserId,
      p_admin: true,
      p_dashboard: true,
    })).rejects.toThrow(/permission denied|not allowed|42501/i);

    await expect(callRpc(client, 'insert_usuario', {
      p_nome: 'Tentativa Admin',
      p_email: `rpc-admin-${RUN_ID}@retifica.test`,
      p_telefone: '',
      p_acesso: 'administrador',
      p_status: true,
    })).rejects.toThrow(/permission denied|not allowed|42501/i);

    await expect(callRpc(client, 'inativar_usuario', {
      p_id_usuarios: adminUserId,
    })).rejects.toThrow(/permission denied|not allowed|42501/i);

    await client.auth.signOut();
  });

  it('get_usuarios autenticado exige perfil administrador e módulo Admin server-side', async () => {
    const { client } = await signIn(NORMAL_EMAIL);
    const envelope = await callRpc(client, 'get_usuarios', { p_limite: 1 });

    expect(envelope.status).toBe(403);
    expect(envelope.code).toBe('admin_required');

    await client.auth.signOut();
  });
});
