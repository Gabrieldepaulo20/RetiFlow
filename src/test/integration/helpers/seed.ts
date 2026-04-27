import { createServiceClient } from './client';

/**
 * Prefixo usado em todos os registros criados por testes de integração.
 * Permite identificação e limpeza segura sem afetar dados reais.
 */
export const TEST_PREFIX = '[INTEGRATION-TEST]';

/**
 * UUID de categoria estável usada nos testes.
 * Categoria: "Peças e Materiais" — existente em prod e não deve ser removida.
 */
export const TEST_CATEGORY_ID = 'b80ff39d-4da4-4553-8bc4-20a47fecd5ce';

/**
 * Garante que o usuário de teste existe em Supabase Auth e na tabela Usuarios.
 * Operação idempotente — seguro chamar múltiplas vezes.
 * Retorna o auth_id (UUID) do usuário de teste.
 */
export async function ensureTestUser(email: string, password: string): Promise<string> {
  const service = createServiceClient();

  // Verifica se usuário já existe em auth.users
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const users = (list as { users?: Array<{ id: string; email?: string }> })?.users ?? [];
  const existing = users.find((u) => u.email === email);

  let authId: string;

  if (existing) {
    authId = existing.id;
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`[seed] Falha ao criar usuário de teste: ${error?.message}`);
    }
    authId = data.user.id;
  }

  // Garante entrada na tabela Usuarios (upsert por auth_id)
  const { error: upsertError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .upsert(
      {
        nome: 'Integration Test User',
        email,
        telefone: '(00) 00000-0000',
        status: true,
        acesso: 'financeiro',
        auth_id: authId,
      },
      { onConflict: 'auth_id' },
    );

  if (upsertError) {
    throw new Error(`[seed] Falha ao registrar usuário em Usuarios: ${upsertError.message}`);
  }

  return authId;
}

/**
 * Remove o usuário de teste de Supabase Auth e da tabela Usuarios.
 * Chamado em afterAll para limpeza completa.
 */
export async function deleteTestUser(email: string): Promise<void> {
  const service = createServiceClient();

  // Remove de Usuarios primeiro (FK)
  await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .delete()
    .eq('email', email);

  // Remove de auth.users
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const users = (list as { users?: Array<{ id: string; email?: string }> })?.users ?? [];
  const user = users.find((u) => u.email === email);
  if (user) {
    await service.auth.admin.deleteUser(user.id);
  }
}
