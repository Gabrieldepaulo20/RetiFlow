import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('modelos.test');

describe.skipIf(skipIntegration)('Modelos por usuário — integração real com Supabase', () => {
  let internalUserId: string | null = null;

  beforeAll(async () => {
    const env = getTestEnv();
    await ensureTestUser(env.testUserEmail, env.testUserPassword);
  });

  afterAll(async () => {
    if (!internalUserId) return;
    const service = createServiceClient();
    await service
      .schema('RetificaPremium')
      .from('Configuracoes_Modelos_Usuario')
      .delete()
      .eq('fk_usuarios', internalUserId);
  });

  it('usuário autenticado consegue ler e salvar o próprio modelo', async () => {
    const { client } = await signInAsTestUser();

    const initial = await callRpc(client, 'get_configuracao_modelo_usuario', {
      p_fk_usuarios: null,
    });
    expect(initial.status).toBe(200);
    const initialData = initial.dados as { fk_usuarios: string; os_modelo: string };
    internalUserId = initialData.fk_usuarios;
    expect(initialData.os_modelo).toBeTruthy();

    const saved = await callRpc(client, 'upsert_configuracao_modelo_usuario', {
      p_fk_usuarios: internalUserId,
      p_os_modelo: 'a4_vertical',
      p_cor_documento: '#1e3a5f',
      p_fechamento_modelo: 'compacto',
      p_cor_fechamento: '#8b2252',
    });

    expect(saved.status).toBe(200);
    expect(saved.dados).toMatchObject({
      fk_usuarios: internalUserId,
      os_modelo: 'a4_vertical',
      cor_documento: '#1e3a5f',
      fechamento_modelo: 'compacto',
      cor_fechamento: '#8b2252',
    });

    await client.auth.signOut();
  });
});
