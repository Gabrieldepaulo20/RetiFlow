import { createServiceClient } from './client';
import { TEST_PREFIX } from './seed';

/**
 * Deleta todos os registros de Contas_Pagar criados por testes de integração.
 * Usa service role para bypassing de RLS — seguro apenas em ambiente de teste.
 * Retorna quantidade de registros removidos.
 */
export async function cleanupTestContasPagar(): Promise<number> {
  const service = createServiceClient();

  const { data: contas, error: selectError } = await service
    .schema('RetificaPremium')
    .from('Contas_Pagar')
    .select('id_contas_pagar')
    .like('titulo', `${TEST_PREFIX}%`);

  if (selectError) {
    console.warn('[cleanup] Falha ao localizar contas_pagar de teste:', selectError.message);
    return 0;
  }

  const ids = (contas ?? []).map((conta) => conta.id_contas_pagar as string);
  if (ids.length === 0) return 0;

  // A Central Financeiro proíbe apagar uma obrigação que ainda possua
  // movimentos. O cleanup remove primeiro somente o razão ligado às fixtures.
  const { error: movementError } = await service
    .schema('RetificaPremium')
    .from('Financeiro_Movimentos')
    .delete()
    .in('fk_contas_pagar', ids);

  if (movementError) {
    console.warn('[cleanup] Falha ao limpar movimentos financeiros de teste:', movementError.message);
    return 0;
  }

  const { error: resetError } = await service
    .schema('RetificaPremium')
    .from('Contas_Pagar')
    .update({
      valor_pago: 0,
      status: 'PENDENTE',
      pago_em: null,
      pago_com: null,
      observacoes_pagamento: null,
    })
    .in('id_contas_pagar', ids);

  if (resetError) {
    console.warn('[cleanup] Falha ao neutralizar pagamentos de teste:', resetError.message);
    return 0;
  }

  const { data, error } = await service
    .schema('RetificaPremium')
    .from('Contas_Pagar')
    .delete()
    .in('id_contas_pagar', ids)
    .select('id_contas_pagar');

  if (error) {
    console.warn('[cleanup] Falha ao limpar contas_pagar de teste:', error.message);
    return 0;
  }

  return data?.length ?? 0;
}

/**
 * Cleanup completo de todos os artefatos de teste.
 * Chamar em beforeAll (para garantir estado limpo) e afterAll (para não poluir).
 */
export async function cleanupAll(): Promise<void> {
  const removed = await cleanupTestContasPagar();
  if (removed > 0) {
    console.log(`[cleanup] ${removed} registros de teste removidos.`);
  }
}
