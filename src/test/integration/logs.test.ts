import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServiceClient, getTestEnv } from './helpers/client';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';
import { ensureTestUser, deleteTestUser, TEST_PREFIX } from './helpers/seed';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('logs.test');

async function cleanupLogs() {
  const service = createServiceClient();
  await service
    .schema('RetificaPremium')
    .from('Logs')
    .delete()
    .like('descricao', `${TEST_PREFIX}%`);
}

describe.skipIf(skipIntegration)('Logs — integração real com Supabase', () => {
  const isolationUserEmail = `logs-isolation-${Date.now()}@retifica.test`;
  const isolationUserPassword = `LogsIsolation@${Date.now()}`;
  let isolationInternalUserId = '';

  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
    await ensureTestUser(isolationUserEmail, isolationUserPassword);

    const service = createServiceClient();
    const { data: isolationUser, error } = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('id_usuarios')
      .eq('email', isolationUserEmail)
      .single();
    if (error || !isolationUser) {
      throw new Error(`[logs.test] Falha ao localizar usuário isolado: ${error?.message}`);
    }
    isolationInternalUserId = isolationUser.id_usuarios as string;

    await cleanupLogs();
  });

  afterAll(async () => {
    await cleanupLogs();
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
    await deleteTestUser(isolationUserEmail);
  });

  it('insertLog persiste atividade e getLogs lê o registro criado', async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    const [{ supabase }, logsApi] = await Promise.all([
      import('@/lib/supabase'),
      import('@/api/supabase/logs'),
    ]);

    const login = await supabase.auth.signInWithPassword({
      email: testUserEmail,
      password: testUserPassword,
    });
    expect(login.error).toBeNull();

    const description = `${TEST_PREFIX} log real ${crypto.randomUUID()}`;
    await logsApi.insertLog({
      p_acao: 'INTEGRATION_TEST',
      p_tabela_nome: 'Sistema',
      p_entidade_id: '',
      p_descricao: description,
    });

    const logs = await logsApi.getLogs({
      p_acao: 'INTEGRATION_TEST',
      p_limite: 20,
    });
    expect(logs.dados.some((log) => log.descricao === description)).toBe(true);

    await supabase.auth.signOut();
  });

  it('não lê nem registra logs em nome de outro usuário', async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    const [{ supabase }, logsApi] = await Promise.all([
      import('@/lib/supabase'),
      import('@/api/supabase/logs'),
    ]);
    const service = createServiceClient();
    const hiddenDescription = `${TEST_PREFIX} log isolado ${crypto.randomUUID()}`;

    const { error: seedError } = await service
      .schema('RetificaPremium')
      .from('Logs')
      .insert({
        acao: 'INTEGRATION_TEST',
        tabela_nome: 'Sistema',
        entidade_id: '',
        descricao: hiddenDescription,
        fk_usuarios: isolationInternalUserId,
      });
    expect(seedError).toBeNull();

    const login = await supabase.auth.signInWithPassword({
      email: testUserEmail,
      password: testUserPassword,
    });
    expect(login.error).toBeNull();

    const ownLogs = await logsApi.getLogs({ p_acao: 'INTEGRATION_TEST', p_limite: 100 });
    expect(ownLogs.dados.some((log) => log.descricao === hiddenDescription)).toBe(false);

    await expect(logsApi.getLogs({
      p_fk_usuarios: isolationInternalUserId,
      p_limite: 20,
    })).rejects.toThrow('Não é permitido consultar logs de outro usuário.');

    await expect(logsApi.insertLog({
      p_acao: 'INTEGRATION_TEST',
      p_tabela_nome: 'Sistema',
      p_entidade_id: '',
      p_descricao: `${TEST_PREFIX} tentativa de falsificação`,
      p_fk_usuarios: isolationInternalUserId,
    })).rejects.toThrow('Não é permitido registrar logs em nome de outro usuário.');

    await supabase.auth.signOut();
  });
});
