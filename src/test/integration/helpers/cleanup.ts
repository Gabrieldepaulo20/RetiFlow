import { createServiceClient } from './client';
import { TEST_PREFIX } from './seed';

/**
 * Deleta todos os registros de Contas_Pagar criados por testes de integração.
 * Usa service role para bypassing de RLS — seguro apenas em ambiente de teste.
 * Retorna quantidade de registros removidos.
 */
export async function cleanupTestContasPagar(): Promise<number> {
  const service = createServiceClient();

  const { data, error } = await service
    .schema('RetificaPremium')
    .from('Contas_Pagar')
    .delete()
    .like('titulo', `${TEST_PREFIX}%`)
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
