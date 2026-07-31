import { describe, expect, it } from 'vitest';
import { dashboardResumoToDomainData, type DashboardResumo } from '@/api/supabase/dashboard';

function resumoWithCategory(classe?: string | null): DashboardResumo {
  return {
    notas: [],
    clientes: [],
    contas: [],
    servicos: [],
    categorias: [{
      id_categorias: 'cat-1',
      nome: 'Peças',
      cor: 'bg-blue-100 text-blue-800',
      icone: 'Wrench',
      ativo: true,
      classe,
      created_at: '2026-07-30T12:00:00.000Z',
    }],
  };
}

describe('dashboardResumoToDomainData', () => {
  it('preserva a classe contábil válida da categoria', () => {
    const result = dashboardResumoToDomainData(resumoWithCategory('CUSTO'));

    expect(result.payableCategories[0]?.classe).toBe('CUSTO');
  });

  it('descarta classe contábil desconhecida recebida da API', () => {
    const result = dashboardResumoToDomainData(resumoWithCategory('OUTRA'));

    expect(result.payableCategories[0]?.classe).toBeUndefined();
  });
});
