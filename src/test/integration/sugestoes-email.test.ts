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

  it('get_sugestoes_email reconcilia sugestão pendente que já existe em contas', async () => {
    const { client } = await signInAsTestUser();

    const payable = await callRpc(client, 'insert_conta_pagar', {
      p_titulo: `${TEST_PREFIX} Fornecedor Reconciliado`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_data_vencimento: '2026-10-15T00:00:00',
      p_valor_original: 777.77,
      p_nome_fornecedor: 'Fornecedor Reconciliado',
      p_origem_lancamento: 'MANUAL',
      p_favorecido_tipo: 'FORNECEDOR',
    });
    expect(payable.status).toBe(200);

    const inserted = await callRpc(client, 'insert_sugestao_email', {
      p_assunto: `${TEST_PREFIX} boleto reconciliado`,
      p_nome_remetente: 'Fornecedor Reconciliado',
      p_email_remetente: 'financeiro-reconciliado@example.com',
      p_recebido_em: '2026-10-01T10:00:00',
      p_titulo_sugerido: `${TEST_PREFIX} Boleto Fornecedor Reconciliado`,
      p_valor_sugerido: 777.77,
      p_vencimento_sugerido: '2026-10-15',
      p_fornecedor_sugerido: 'Fornecedor Reconciliado',
      p_forma_pagamento_sugerida: 'BOLETO',
      p_confianca: 94,
      p_fk_categorias_sugerida: TEST_CATEGORY_ID,
    });
    expect(inserted.status).toBe(200);
    const suggestionId = inserted.id_sugestoes_email as string;

    const pending = await callRpc(client, 'get_sugestoes_email', { p_status: 'PENDING' });
    const pendingRows = pending.dados as Array<{ id_sugestoes_email: string }>;
    expect(pendingRows.some((suggestion) => suggestion.id_sugestoes_email === suggestionId)).toBe(false);

    const service = createServiceClient();
    const { data: reconciledRow } = await service
      .schema('RetificaPremium')
      .from('Sugestoes_Email')
      .select('status, motivo_descarte')
      .eq('id_sugestoes_email', suggestionId)
      .single();
    expect(reconciledRow?.status).toBe('DISMISSED');
    expect(reconciledRow?.motivo_descarte).toBe('DUPLICADO');

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

    // Captura de decisão (#2): registra o motivo do descarte e confirma que o
    // trigger preencheu decidido_em e a RPC gravou motivo_descarte.
    const motivo = await callRpc(client, 'definir_motivo_descarte_sugestao', {
      p_id_sugestao: suggestionId,
      p_motivo: 'NAO_E_CONTA',
    });
    expect(motivo.status).toBe(200);

    const service = createServiceClient();
    const { data: decisionRow } = await service
      .schema('RetificaPremium')
      .from('Sugestoes_Email')
      .select('decidido_em, motivo_descarte')
      .eq('id_sugestoes_email', suggestionId)
      .single();
    expect(decisionRow?.motivo_descarte).toBe('NAO_E_CONTA');
    expect(decisionRow?.decidido_em).toBeTruthy();

    await client.auth.signOut();
  });
});
