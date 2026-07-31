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

const AUTH_PAGE_SIZE = 1000;

async function findAuthUserByEmail(email: string) {
  const service = createServiceClient();
  let page = 1;

  while (true) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });

    if (error) {
      throw new Error(`[seed] Falha ao listar usuários do Auth: ${error.message}`);
    }

    const users = data.users ?? [];
    const match = users.find((user) => user.email === email);
    if (match) return match;
    if (users.length < AUTH_PAGE_SIZE) return null;

    page += 1;
  }
}

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

  const { data: payables, error: payablesError } = await service
    .schema('RetificaPremium')
    .from('Contas_Pagar')
    .select('id_contas_pagar')
    .in('fk_criado_por', ids);

  if (payablesError) {
    throw new Error(`[seed] Falha ao localizar contas do usuário de teste: ${payablesError.message}`);
  }

  const payableIds = (payables ?? []).map((payable) => payable.id_contas_pagar as string);

  const { error: attachmentsError } = await service
    .schema('RetificaPremium')
    .from('Financeiro_Anexos')
    .delete()
    .in('fk_criado_por', ids);

  if (attachmentsError) {
    throw new Error(`[seed] Falha ao remover anexos financeiros de teste: ${attachmentsError.message}`);
  }

  if (payableIds.length > 0) {
    const { error: payableMovementsError } = await service
      .schema('RetificaPremium')
      .from('Financeiro_Movimentos')
      .delete()
      .in('fk_contas_pagar', payableIds);

    if (payableMovementsError) {
      throw new Error(`[seed] Falha ao remover movimentos das contas de teste: ${payableMovementsError.message}`);
    }
  }

  const { error: movementsError } = await service
    .schema('RetificaPremium')
    .from('Financeiro_Movimentos')
    .delete()
    .in('fk_criado_por', ids);

  if (movementsError) {
    throw new Error(`[seed] Falha ao remover movimentos financeiros de teste: ${movementsError.message}`);
  }

  if (payableIds.length > 0) {
    const { error: resetPayablesError } = await service
      .schema('RetificaPremium')
      .from('Contas_Pagar')
      .update({
        valor_pago: 0,
        status: 'PENDENTE',
        pago_em: null,
        pago_com: null,
        observacoes_pagamento: null,
      })
      .in('id_contas_pagar', payableIds);

    if (resetPayablesError) {
      throw new Error(`[seed] Falha ao neutralizar pagamentos de teste: ${resetPayablesError.message}`);
    }

    const { error: deletePayablesError } = await service
      .schema('RetificaPremium')
      .from('Contas_Pagar')
      .delete()
      .in('id_contas_pagar', payableIds);

    if (deletePayablesError) {
      throw new Error(`[seed] Falha ao remover contas a pagar de teste: ${deletePayablesError.message}`);
    }
  }

  const financialTables = [
    'Financeiro_Modelos_Recorrentes',
    'Financeiro_Recebiveis_Manuais',
    'Categorias_Entradas',
    'Financeiro_Contas',
  ] as const;

  for (const table of financialTables) {
    const { error } = await service
      .schema('RetificaPremium')
      .from(table)
      .delete()
      .in('fk_criado_por', ids);

    if (error) {
      throw new Error(`[seed] Falha ao remover ${table} do usuário de teste: ${error.message}`);
    }
  }

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

  // Verifica todas as páginas para não duplicar nem perder usuário de teste.
  const existing = await findAuthUserByEmail(email);

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

  // Remove de auth.users e confirma o resultado para não deixar resíduos.
  const user = await findAuthUserByEmail(email);
  if (user) {
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) {
      throw new Error(`[seed] Falha ao remover usuário do Auth: ${error.message}`);
    }

    const remainingUser = await findAuthUserByEmail(email);
    if (remainingUser) {
      throw new Error(`[seed] Usuário do Auth permaneceu após exclusão: ${email}`);
    }
  }
}
