import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAnonClient, signInAsTestUser, callRpc, getTestEnv } from './helpers/client';
import { TEST_PREFIX, TEST_CATEGORY_ID, deleteTestUser, ensureTestUser } from './helpers/seed';
import { cleanupAll } from './helpers/cleanup';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

/**
 * Testes de integração — RPCs de Contas a Pagar com Supabase real.
 *
 * O que está sendo validado ponta a ponta:
 * - P0-5: auth guard P0401 (chamada sem sessão → 401)
 * - Insert real via RPC com usuário autenticado
 * - Listagem retorna o registro criado
 * - Update preserva campos não alterados
 * - Registrar pagamento muda status para PAGO/PARCIAL
 * - Cancelar muda status para CANCELADO
 * - Cleanup remove todos os registros de teste
 */
const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('contas-pagar.test');

describe.skipIf(skipIntegration)('Contas a Pagar — integração real com Supabase', () => {
  let createdId: string;
  let cancelId: string;

  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    // Garante usuário de teste existe (idempotente)
    await ensureTestUser(testUserEmail, testUserPassword);
    // Limpa resíduos de execuções anteriores
    await cleanupAll();
  });

  afterAll(async () => {
    // Cleanup final + remove usuário de teste
    await cleanupAll();
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
  });

  // ── P0-5: Auth guard ──────────────────────────────────────────────────────

  it('insert_conta_pagar sem autenticação retorna status 401 (auth guard P0-5)', async () => {
    const anonClient = createAnonClient();

    const result = await callRpc(anonClient, 'insert_conta_pagar', {
      p_titulo: `${TEST_PREFIX} NÃO DEVE SER CRIADO`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_data_vencimento: '2026-12-31',
      p_valor_original: 100,
    });

    expect(result.status).toBe(401);
    expect(result.code).toBe('unauthorized');
  });

  it('update_conta_pagar sem autenticação retorna status 401', async () => {
    const anonClient = createAnonClient();
    const result = await callRpc(anonClient, 'update_conta_pagar', {
      p_id_contas_pagar: '00000000-0000-0000-0000-000000000000',
      p_titulo: 'tentativa indevida',
    });
    expect(result.status).toBe(401);
  });

  it('registrar_pagamento sem autenticação retorna status 401', async () => {
    const anonClient = createAnonClient();
    const result = await callRpc(anonClient, 'registrar_pagamento', {
      p_id_contas_pagar: '00000000-0000-0000-0000-000000000000',
      p_valor_pago: 100,
    });
    expect(result.status).toBe(401);
  });

  it('cancelar_conta_pagar sem autenticação retorna status 401', async () => {
    const anonClient = createAnonClient();
    const result = await callRpc(anonClient, 'cancelar_conta_pagar', {
      p_id_contas_pagar: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.status).toBe(401);
  });

  // ── Insert autenticado ────────────────────────────────────────────────────

  it('insert_conta_pagar com autenticação cria registro e retorna id', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'insert_conta_pagar', {
      p_titulo: `${TEST_PREFIX} Fornecedor ABC — Fatura 001`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_data_vencimento: '2026-12-31T00:00:00',
      p_valor_original: 1500.00,
      p_juros: 0,
      p_desconto: 0,
      p_numero_documento: 'NF-TEST-001',
      p_origem_lancamento: 'MANUAL',
    });

    expect(result.status).toBe(200);
    expect(result.id_contas_pagar).toBeTruthy();
    expect(typeof result.id_contas_pagar).toBe('string');

    createdId = result.id_contas_pagar as string;

    await client.auth.signOut();
  });

  it('insert de um segundo registro para testar cancelamento', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'insert_conta_pagar', {
      p_titulo: `${TEST_PREFIX} Para cancelar`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_data_vencimento: '2026-11-30T00:00:00',
      p_valor_original: 500.00,
    });

    expect(result.status).toBe(200);
    cancelId = result.id_contas_pagar as string;

    await client.auth.signOut();
  });

  // ── Listagem ──────────────────────────────────────────────────────────────

  it('get_contas_pagar retorna os registros criados', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'get_contas_pagar', {
      p_busca: TEST_PREFIX,
      p_limite: 10,
    });

    expect(result.status).toBe(200);
    const dados = result.dados as Array<{ id_contas_pagar: string; titulo: string }>;
    expect(Array.isArray(dados)).toBe(true);
    expect(dados.length).toBeGreaterThanOrEqual(2);

    const found = dados.find((r) => r.id_contas_pagar === createdId);
    expect(found).toBeTruthy();
    expect(found!.titulo).toContain(TEST_PREFIX);

    await client.auth.signOut();
  });

  // ── Update ────────────────────────────────────────────────────────────────

  it('update_conta_pagar altera campos e preserva os demais', async () => {
    const { client } = await signInAsTestUser();

    const updateResult = await callRpc(client, 'update_conta_pagar', {
      p_id_contas_pagar: createdId,
      p_titulo: `${TEST_PREFIX} Fornecedor ABC — Atualizado`,
      p_valor_original: 1600.00,
      p_desconto: 100.00,
    });

    expect(updateResult.status).toBe(200);

    // Verifica o estado após update via detalhes
    const detailResult = await callRpc(client, 'get_conta_pagar_detalhes', {
      p_id_contas_pagar: createdId,
    });

    expect(detailResult.status).toBe(200);
    const conta = (detailResult.dados as { conta: { titulo: string; valor_original: number; valor_final: number } }).conta;
    expect(conta.titulo).toContain('Atualizado');
    expect(conta.valor_original).toBe(1600.00);
    // valor_final = 1600 - 100 desconto = 1500
    expect(conta.valor_final).toBe(1500.00);

    await client.auth.signOut();
  });

  // ── Registrar pagamento ───────────────────────────────────────────────────

  it('registrar_pagamento com valor igual ao total muda status para PAGO', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'registrar_pagamento', {
      p_id_contas_pagar: createdId,
      p_valor_pago: 1500.00,
      p_pago_com: 'PIX',
    });

    expect(result.status).toBe(200);
    expect(result.novo_status).toBe('PAGO');

    await client.auth.signOut();
  });

  it('conta paga não pode receber novo pagamento (status inválido → 400)', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'registrar_pagamento', {
      p_id_contas_pagar: createdId,
      p_valor_pago: 50.00,
    });

    expect(result.status).toBe(400);
    expect(result.code).toBe('invalid_status');

    await client.auth.signOut();
  });

  // ── Cancelar ──────────────────────────────────────────────────────────────

  it('cancelar_conta_pagar muda status para CANCELADO', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'cancelar_conta_pagar', {
      p_id_contas_pagar: cancelId,
    });

    expect(result.status).toBe(200);

    // Confirma status via detalhes
    const detail = await callRpc(client, 'get_conta_pagar_detalhes', {
      p_id_contas_pagar: cancelId,
    });

    const conta = (detail.dados as { conta: { status: string } }).conta;
    expect(conta.status).toBe('CANCELADO');

    await client.auth.signOut();
  });

  it('cancelar conta já cancelada retorna 400 (idempotência protegida)', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'cancelar_conta_pagar', {
      p_id_contas_pagar: cancelId,
    });

    expect(result.status).toBe(400);
    expect(result.code).toBe('invalid_action');

    await client.auth.signOut();
  });

  // ── Persistência ──────────────────────────────────────────────────────────

  it('get_conta_pagar_detalhes retorna histórico de ações registrado', async () => {
    const { client } = await signInAsTestUser();

    const result = await callRpc(client, 'get_conta_pagar_detalhes', {
      p_id_contas_pagar: createdId,
    });

    expect(result.status).toBe(200);
    const dados = result.dados as {
      historico: Array<{ acao: string }>;
    };

    expect(Array.isArray(dados.historico)).toBe(true);
    // Espera pelo menos: CREATED, UPDATED, PAID
    const acoes = dados.historico.map((h) => h.acao);
    expect(acoes).toContain('CREATED');
    expect(acoes).toContain('UPDATED');
    expect(acoes).toContain('PAID');

    await client.auth.signOut();
  });
});
