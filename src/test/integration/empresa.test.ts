import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('empresa.test');

describe.skipIf(skipIntegration)('Configurações da empresa — integração real com Supabase', () => {
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
      .from('Configuracoes_Empresa_Usuario')
      .delete()
      .eq('fk_usuarios', internalUserId);
  });

  it('usuário autenticado consegue salvar e recarregar dados da própria empresa', async () => {
    const { client } = await signInAsTestUser();

    const initial = await callRpc(client, 'get_configuracao_empresa_usuario', {
      p_fk_usuarios: null,
    });
    expect(initial.status).toBe(200);
    const initialData = initial.dados as { fk_usuarios: string; razao_social: string };
    internalUserId = initialData.fk_usuarios;
    expect(initialData.razao_social).toBeTruthy();

    const saved = await callRpc(client, 'upsert_configuracao_empresa_usuario', {
      p_fk_usuarios: internalUserId,
      p_razao_social: 'Empresa Integração Ltda',
      p_nome_fantasia: 'Integração',
      p_cnpj: '12.345.678/0001-90',
      p_inscricao_estadual: '',
      p_inscricao_municipal: '',
      p_endereco: 'Rua Teste, 123',
      p_cidade: 'Sertãozinho',
      p_estado: 'SP',
      p_cep: '14170-000',
      p_telefone: '(16) 99999-0000',
      p_email: 'integracao@example.com',
      p_site: '',
    });

    expect(saved.status).toBe(200);
    expect(saved.dados).toMatchObject({
      fk_usuarios: internalUserId,
      razao_social: 'Empresa Integração Ltda',
      nome_fantasia: 'Integração',
      cnpj: '12345678000190',
      cidade: 'Sertãozinho',
      estado: 'SP',
      cep: '14170000',
    });

    const reloaded = await callRpc(client, 'get_configuracao_empresa_usuario', {
      p_fk_usuarios: internalUserId,
    });
    expect(reloaded.status).toBe(200);
    expect(reloaded.dados).toMatchObject({
      razao_social: 'Empresa Integração Ltda',
      cnpj: '12345678000190',
    });

    await client.auth.signOut();
  });
});
