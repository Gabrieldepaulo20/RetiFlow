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

async function deleteInternalUserRowsByEmail(email: string): Promise<void> {
  const service = createServiceClient();

  const { data: users, error: usersError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('email', email);

  if (usersError) {
    throw new Error(`[seed] Falha ao localizar usuário interno de teste: ${usersError.message}`);
  }

  const ids = (users ?? []).map((user) => user.id_usuarios as string);
  if (ids.length === 0) return;

  const { error: modulesError } = await service
    .schema('RetificaPremium')
    .from('Modulos')
    .delete()
    .in('fk_usuarios', ids);

  if (modulesError) {
    throw new Error(`[seed] Falha ao remover módulos do usuário de teste: ${modulesError.message}`);
  }

  const { error: deleteError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .delete()
    .in('id_usuarios', ids);

  if (deleteError) {
    throw new Error(`[seed] Falha ao remover usuário interno de teste: ${deleteError.message}`);
  }
}

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
    // Remove resíduos de execuções anteriores que falharam entre Usuarios/Auth.
    await deleteInternalUserRowsByEmail(email);

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

  await deleteInternalUserRowsByEmail(email);

  // Remove de auth.users
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const users = (list as { users?: Array<{ id: string; email?: string }> })?.users ?? [];
  const user = users.find((u) => u.email === email);
  if (user) {
    await service.auth.admin.deleteUser(user.id);
  }
}
