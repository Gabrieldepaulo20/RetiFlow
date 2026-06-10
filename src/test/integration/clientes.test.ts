import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser, TEST_PREFIX } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('clientes.test');

describe.skipIf(skipIntegration)('Clientes — integracao real com Supabase', () => {
  const createdClientIds = new Set<string>();

  beforeAll(async () => {
    const env = getTestEnv();
    await ensureTestUser(env.testUserEmail, env.testUserPassword);
  });

  afterAll(async () => {
    const ids = [...createdClientIds];
    if (ids.length === 0) return;

    const service = createServiceClient();
    await service.schema('RetificaPremium').from('Clientes').delete().in('id_clientes', ids);
  });

  it('preserva siglas em caixa alta ao criar e atualizar cliente', async () => {
    const { client } = await signInAsTestUser();
    const suffix = String(Date.now()).slice(-8);

    const created = await callRpc(client, 'salvar_cliente_completo', {
      p_payload: {
        nome: `${TEST_PREFIX} Ccm Cliente ${suffix}`,
        documento: `7${suffix.padStart(10, '0')}`,
        tipo_documento: 'CPF',
        status: true,
      },
    });

    expect(created.status).toBe(200);
    const clientId = created.id_cliente as string;
    createdClientIds.add(clientId);

    const updatedName = `${TEST_PREFIX} CCM Cliente ${suffix}`;
    const updated = await callRpc(client, 'salvar_cliente_completo', {
      p_payload: {
        id_clientes: clientId,
        nome: updatedName,
        documento: `7${suffix.padStart(10, '0')}`,
        tipo_documento: 'CPF',
        status: true,
      },
    });

    expect(updated.status).toBe(200);

    const listed = await callRpc(client, 'get_clientes', {
      p_busca: updatedName,
      p_limite: 5,
    });

    expect(listed.status).toBe(200);
    expect(listed.dados).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id_clientes: clientId,
          nome: updatedName,
        }),
      ]),
    );

    await client.auth.signOut();
  });
});
