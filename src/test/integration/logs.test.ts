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
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
    await cleanupLogs();
  });

  afterAll(async () => {
    await cleanupLogs();
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
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
});
