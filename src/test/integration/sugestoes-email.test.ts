import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { cleanupAll } from './helpers/cleanup';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';
import { deleteTestUser, ensureTestUser, TEST_CATEGORY_ID, TEST_PREFIX } from './helpers/seed';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('sugestoes-email.test');

async function cleanupSuggestions() {
  const service = createServiceClient();
  await service
    .schema('RetificaPremium')
    .from('Sugestoes_Email')
    .delete()
    .like('assunto', `${TEST_PREFIX}%`);
}

describe.skipIf(skipIntegration)('Sugestões de e-mail — integração real com Supabase', () => {
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
    await cleanupSuggestions();
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupSuggestions();
    await cleanupAll();
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
  });

  it('aceitar_sugestao_email cria conta a pagar real e marca sugestão como ACCEPTED', async () => {
    const { client } = await signInAsTestUser();

    const inserted = await callRpc(client, 'insert_sugestao_email', {
      p_assunto: `${TEST_PREFIX} boleto detectado`,
      p_nome_remetente: 'Fornecedor Teste',
      p_email_remetente: 'financeiro@example.com',
      p_recebido_em: '2026-12-01T10:00:00',
      p_titulo_sugerido: `${TEST_PREFIX} Conta vinda do e-mail`,
      p_valor_sugerido: 321.45,
      p_vencimento_sugerido: '2026-12-30',
      p_fornecedor_sugerido: 'Fornecedor Teste',
      p_forma_pagamento_sugerida: 'BOLETO',
      p_confianca: 92,
      p_fk_categorias_sugerida: TEST_CATEGORY_ID,
      p_trecho_email: 'Boleto detectado automaticamente.',
    });

    expect(inserted.status).toBe(200);
    const suggestionId = inserted.id_sugestoes_email as string;

    const accepted = await callRpc(client, 'aceitar_sugestao_email', {
      p_id_sugestoes_email: suggestionId,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.id_contas_pagar).toBeTruthy();

    const payables = await callRpc(client, 'get_contas_pagar', {
      p_busca: TEST_PREFIX,
      p_limite: 10,
    });
    const dados = payables.dados as Array<{ id_contas_pagar: string; titulo: string; origem_lancamento: string }>;
    expect(dados.some((conta) => conta.id_contas_pagar === accepted.id_contas_pagar)).toBe(true);

    const suggestions = await callRpc(client, 'get_sugestoes_email', { p_status: 'ACCEPTED' });
    const acceptedSuggestions = suggestions.dados as Array<{ id_sugestoes_email: string; status: string }>;
    expect(acceptedSuggestions.find((s) => s.id_sugestoes_email === suggestionId)?.status).toBe('ACCEPTED');

    await client.auth.signOut();
  });

  it('ignorar_sugestao_email marca sugestão como DISMISSED sem criar conta', async () => {
    const { client } = await signInAsTestUser();

    const inserted = await callRpc(client, 'insert_sugestao_email', {
      p_assunto: `${TEST_PREFIX} ignorar boleto`,
      p_nome_remetente: 'Fornecedor Ignorado',
      p_email_remetente: 'ignore@example.com',
      p_recebido_em: '2026-12-02T10:00:00',
      p_titulo_sugerido: `${TEST_PREFIX} Conta ignorada`,
      p_valor_sugerido: 111.11,
      p_vencimento_sugerido: '2026-12-31',
      p_fornecedor_sugerido: 'Fornecedor Ignorado',
      p_forma_pagamento_sugerida: 'BOLETO',
      p_confianca: 80,
      p_fk_categorias_sugerida: TEST_CATEGORY_ID,
    });

    expect(inserted.status).toBe(200);
    const suggestionId = inserted.id_sugestoes_email as string;

    const ignored = await callRpc(client, 'ignorar_sugestao_email', {
      p_id_sugestoes_email: suggestionId,
    });
    expect(ignored.status).toBe(200);

    const suggestions = await callRpc(client, 'get_sugestoes_email', { p_status: 'DISMISSED' });
    const ignoredSuggestions = suggestions.dados as Array<{ id_sugestoes_email: string; status: string }>;
    expect(ignoredSuggestions.find((s) => s.id_sugestoes_email === suggestionId)?.status).toBe('DISMISSED');

    const payables = await callRpc(client, 'get_contas_pagar', {
      p_busca: `${TEST_PREFIX} Conta ignorada`,
      p_limite: 10,
    });
    expect((payables.dados as unknown[]).length).toBe(0);

    await client.auth.signOut();
  });
});
