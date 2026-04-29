import { beforeAll, describe, expect, it } from 'vitest';
import { getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();

describe.skipIf(!envStatus.configured)('Dashboard — integração real com Supabase', () => {
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
  });

  it('dashboard-resumo consolida dados em uma única chamada autenticada', async () => {
    const { client, accessToken } = await signInAsTestUser();
    const { data, error } = await client.functions.invoke<{
      status: number;
      dados?: Record<string, unknown>;
    }>('dashboard-resumo', {
      body: { p_limite: 50 },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(error).toBeNull();
    expect(data?.status).toBe(200);
    expect(data?.dados).toMatchObject({
      notas: expect.any(Array),
      clientes: expect.any(Array),
      contas: expect.any(Array),
      categorias: expect.any(Array),
      servicos: expect.any(Array),
    });
  });
});

if (!envStatus.configured) {
  warnIntegrationSkipped('dashboard.test.ts');
}
