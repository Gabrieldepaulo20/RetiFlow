import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAnonClient, createServiceClient, callRpc } from './helpers/client';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('tenant-isolation.test');

const TEST_EMAIL = `tenant-isolation-${Date.now()}@retifica.test`;
const TEST_PASSWORD = `TenantIsolation@${Date.now()}`;

describe.skipIf(skipIntegration)('Tenant isolation — dados operacionais por usuário', () => {
  let authId: string | null = null;

  beforeAll(async () => {
    const service = createServiceClient();

    const { data, error } = await service.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(`[tenant-isolation] Falha ao criar usuário isolado: ${error?.message}`);
    }

    authId = data.user.id;

    const { error: insertError } = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .upsert({
        nome: 'Tenant Isolation User',
        email: TEST_EMAIL,
        telefone: '(00) 00000-0000',
        status: true,
        acesso: 'financeiro',
        auth_id: authId,
      }, { onConflict: 'auth_id' });

    if (insertError) {
      throw new Error(`[tenant-isolation] Falha ao criar perfil interno: ${insertError.message}`);
    }
  });

  afterAll(async () => {
    const service = createServiceClient();

    await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .delete()
      .eq('email', TEST_EMAIL);

    if (authId) {
      await service.auth.admin.deleteUser(authId);
    }
  });

  async function signInIsolatedUser() {
    const client = createAnonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();

    return client;
  }

  it('não lista nem abre clientes, O.S. e contas pertencentes a outro usuário', async () => {
    const service = createServiceClient();
    const otherClient = await service
      .schema('RetificaPremium')
      .from('Clientes')
      .select('id_clientes, documento')
      .neq('documento', '')
      .limit(1)
      .maybeSingle();

    const otherNote = await service
      .schema('RetificaPremium')
      .from('Notas_de_Servico')
      .select('id_notas_servico, os')
      .neq('os', '')
      .limit(1)
      .maybeSingle();

    const otherPayable = await service
      .schema('RetificaPremium')
      .from('Contas_Pagar')
      .select('id_contas_pagar, titulo')
      .neq('titulo', '')
      .limit(1)
      .maybeSingle();

    const client = await signInIsolatedUser();

    if (otherClient.data) {
      const list = await callRpc(client, 'get_clientes', {
        p_busca: otherClient.data.documento,
        p_limite: 10,
      });
      expect(list.status).toBe(200);
      expect((list.dados as Array<{ id_clientes: string }>)).not.toContainEqual(
        expect.objectContaining({ id_clientes: otherClient.data.id_clientes }),
      );

      const details = await callRpc(client, 'get_cliente_detalhes', {
        p_id_cliente: otherClient.data.id_clientes,
      });
      expect(details.status).toBe(404);
    }

    if (otherNote.data) {
      const list = await callRpc(client, 'get_notas_servico', {
        p_busca: otherNote.data.os,
        p_limite: 10,
      });
      expect(list.status).toBe(200);
      expect((list.dados as Array<{ id_notas_servico: string }>)).not.toContainEqual(
        expect.objectContaining({ id_notas_servico: otherNote.data.id_notas_servico }),
      );

      const details = await callRpc(client, 'get_nota_servico_detalhes', {
        p_id_nota_servico: otherNote.data.id_notas_servico,
      });
      expect(details.status).toBe(404);
    }

    if (otherPayable.data) {
      const list = await callRpc(client, 'get_contas_pagar', {
        p_busca: otherPayable.data.titulo,
        p_limite: 10,
      });
      expect(list.status).toBe(200);
      expect((list.dados as Array<{ id_contas_pagar: string }>)).not.toContainEqual(
        expect.objectContaining({ id_contas_pagar: otherPayable.data.id_contas_pagar }),
      );

      const details = await callRpc(client, 'get_conta_pagar_detalhes', {
        p_id_contas_pagar: otherPayable.data.id_contas_pagar,
      });
      expect(details.status).toBe(404);
    }

    await client.auth.signOut();
  });
});
