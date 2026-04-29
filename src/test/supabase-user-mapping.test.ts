import { describe, expect, it } from 'vitest';
import { dbModulesToAppModules, dbUserToSystemUser } from '@/services/auth/supabaseUserMapping';

describe('supabase user mapping', () => {
  it('treats an empty module row as absent so users can fall back to role defaults', () => {
    expect(dbModulesToAppModules({
      dashboard: null,
      clientes: null,
      notas_de_entrada: null,
      kanban: null,
      fechamento: null,
      nota_fiscal: null,
      configuracoes: null,
      contas_a_pagar: null,
      admin: null,
    })).toBeUndefined();
  });

  it('maps explicit module grants and blocks from database names to app keys', () => {
    expect(dbModulesToAppModules({
      dashboard: true,
      clientes: false,
      notas_de_entrada: true,
      kanban: false,
      fechamento: true,
      nota_fiscal: false,
      configuracoes: true,
      contas_a_pagar: true,
      admin: false,
    })).toEqual({
      dashboard: true,
      clients: false,
      notes: true,
      kanban: false,
      closing: true,
      invoices: false,
      settings: true,
      payables: true,
      admin: false,
    });
  });

  it('keeps explicit module access on the mapped system user', () => {
    expect(dbUserToSystemUser({
      id_usuarios: '00000000-0000-0000-0000-000000000001',
      nome: 'Financeiro',
      email: 'financeiro@retiflow.test',
      acesso: 'financeiro',
      status: true,
      modulos: {
        dashboard: false,
        contas_a_pagar: true,
      },
    })).toMatchObject({
      role: 'FINANCEIRO',
      moduleAccess: {
        dashboard: false,
        payables: true,
      },
    });
  });
});
