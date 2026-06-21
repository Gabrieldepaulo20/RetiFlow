import { describe, expect, it } from 'vitest';
import { computeDRE, sumPayablesByClass, type DRELineSums } from '@/services/domain/dre';
import type { AccountPayable, PayableCategoryClass } from '@/types';

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'p',
    title: 'Conta',
    categoryId: 'cat',
    dueDate: '2026-06-10',
    originalAmount: 0,
    finalAmount: 0,
    status: 'PENDENTE',
    recurrence: 'NENHUMA',
    isUrgent: false,
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    createdByUserId: 'u',
    ...overrides,
  };
}

const classeByCat: Record<string, PayableCategoryClass> = {
  pecas: 'CUSTO',
  mao: 'CUSTO',
  aluguel: 'DESPESA',
  imposto: 'IMPOSTO',
  juros: 'FINANCEIRO',
};
const resolve = (id: string) => classeByCat[id];

describe('sumPayablesByClass', () => {
  it('soma por classe e ignora cancelada/excluída', () => {
    const sums = sumPayablesByClass([
      payable({ categoryId: 'pecas', finalAmount: 400 }),
      payable({ categoryId: 'mao', finalAmount: 600 }),
      payable({ categoryId: 'aluguel', finalAmount: 1000 }),
      payable({ categoryId: 'imposto', finalAmount: 150 }),
      payable({ categoryId: 'juros', finalAmount: 50 }),
      payable({ categoryId: 'aluguel', finalAmount: 999, status: 'CANCELADO' }),
      payable({ categoryId: 'pecas', finalAmount: 999, deletedAt: '2026-06-05T00:00:00.000Z' }),
      payable({ categoryId: 'desconhecida', finalAmount: 77 }),
    ], resolve);
    expect(sums).toEqual<DRELineSums>({
      custo: 1000,
      despesa: 1000,
      imposto: 150,
      financeiro: 50,
      naoClassificado: 77,
    });
  });
});

describe('computeDRE', () => {
  it('monta o DRE na ordem correta com margens', () => {
    const dre = computeDRE(10000, { custo: 4000, despesa: 3000, imposto: 600, financeiro: 200, naoClassificado: 0 });
    expect(dre.receitaLiquida).toBe(9400);     // 10000 - 600
    expect(dre.lucroBruto).toBe(5400);          // 9400 - 4000
    expect(dre.resultadoOperacional).toBe(2400); // 5400 - 3000
    expect(dre.lucroLiquido).toBe(2200);        // 2400 - 200
    expect(dre.margemBruta).toBeCloseTo(54);
    expect(dre.margemLiquida).toBeCloseTo(22);
  });

  it('soma não classificado nas despesas e expõe o valor', () => {
    const dre = computeDRE(1000, { custo: 0, despesa: 100, imposto: 0, financeiro: 0, naoClassificado: 300 });
    expect(dre.despesas).toBe(400);
    expect(dre.naoClassificado).toBe(300);
    expect(dre.lucroLiquido).toBe(600); // 1000 - 0 - 0 - 400 - 0
  });

  it('sem receita: margens nulas', () => {
    const dre = computeDRE(0, { custo: 0, despesa: 500, imposto: 0, financeiro: 0, naoClassificado: 0 });
    expect(dre.margemBruta).toBeNull();
    expect(dre.margemLiquida).toBeNull();
    expect(dre.lucroLiquido).toBe(-500);
  });
});
