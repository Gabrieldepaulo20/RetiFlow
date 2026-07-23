import { beforeAll, describe, expect, it } from 'vitest';
import { createAnonClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();

describe.skipIf(!envStatus.configured)('Crescimento — privacidade Mega Master em produção', () => {
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
  });

  it('nega a API privada para usuário autenticado que não é Mega Master', async () => {
    const { accessToken } = await signInAsTestUser();
    const { url, anonKey } = getTestEnv();
    const response = await fetch(`${url}/functions/v1/marketing-dashboard`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_periodo_dias: 30,
        p_target_user_id: '00000000-0000-0000-0000-000000000000',
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/privado|Mega Master/i),
    });
  });

  it('nega leitura direta de leads e comissões para usuário comum', async () => {
    const { client } = await signInAsTestUser();

    for (const table of ['Marketing_Leads', 'Marketing_Commission_Snapshots']) {
      const { data, error } = await client
        .schema('RetificaPremium')
        .from(table)
        .select('*')
        .limit(1);

      expect(data).toBeNull();
      expect(error?.message ?? '').toMatch(/permission denied/i);
    }
  });

  it('recusa evento de site sem uma chave válida', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.functions.invoke('marketing-events', {
      body: {
        siteKey: 'chave-invalida-de-teste',
        eventId: crypto.randomUUID(),
        leadCode: 'TESTE-NEGADO',
        eventType: 'page_view',
      },
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/non-2xx status code/i);
  });
});

if (!envStatus.configured) {
  warnIntegrationSkipped('marketing-privacy.test.ts');
}
