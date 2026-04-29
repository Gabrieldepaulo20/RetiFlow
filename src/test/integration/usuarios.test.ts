import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { deleteTestUser, ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();

describe.skipIf(!envStatus.configured)('Usuários e módulos — integração real com Supabase', () => {
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
  });

  afterAll(async () => {
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
  });

  it('get_usuarios retorna módulos persistidos para o controle administrativo', async () => {
    const { testUserEmail } = getTestEnv();
    const service = createServiceClient();

    const { data: internalUser, error: userError } = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('id_usuarios')
      .eq('email', testUserEmail)
      .maybeSingle();

    expect(userError).toBeNull();
    expect(internalUser?.id_usuarios).toBeTruthy();

    const { error: moduleError } = await service
      .schema('RetificaPremium')
      .from('Modulos')
      .upsert({
        fk_usuarios: internalUser!.id_usuarios,
        dashboard: true,
        clientes: false,
        notas_de_entrada: true,
        kanban: true,
        fechamento: false,
        nota_fiscal: false,
        configuracoes: false,
        contas_a_pagar: true,
        admin: false,
      }, { onConflict: 'fk_usuarios' });

    expect(moduleError).toBeNull();

    const { client } = await signInAsTestUser();
    const envelope = await callRpc(client, 'get_usuarios', {
      p_busca: testUserEmail,
      p_limite: 1,
    });

    expect(envelope.status).toBe(200);
    const [user] = envelope.dados as Array<{ modulos?: Record<string, boolean> }>;
    expect(user.modulos).toMatchObject({
      dashboard: true,
      clientes: false,
      notas_de_entrada: true,
      contas_a_pagar: true,
      admin: false,
    });
  });
});

if (!envStatus.configured) {
  warnIntegrationSkipped('usuarios.test.ts');
}
