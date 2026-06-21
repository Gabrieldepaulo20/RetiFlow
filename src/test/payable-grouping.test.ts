import { describe, expect, it } from 'vitest';
import { groupPayables } from '@/services/domain/payables';
import type { AccountPayable } from '@/types';

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'p1',
    title: 'Conta',
    categoryId: 'cat-pecas',
    dueDate: '2026-06-10',
    originalAmount: 100,
    finalAmount: 100,
    status: 'PENDENTE',
    recurrence: 'NENHUMA',
    isUrgent: false,
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    createdByUserId: 'u1',
    ...overrides,
  };
}

const catName = (id: string) => ({ 'cat-pecas': 'Peças', 'cat-mao': 'Mão de Obra' } as Record<string, string>)[id];

describe('groupPayables', () => {
  it('agrupa por favorecido separando funcionários de fornecedores, com subtotal', () => {
    const items = [
      payable({ id: 'a', favorecidoTipo: 'FUNCIONARIO', finalAmount: 2000 }),
      payable({ id: 'b', favorecidoTipo: 'FORNECEDOR', finalAmount: 300 }),
      payable({ id: 'c', favorecidoTipo: 'FUNCIONARIO', finalAmount: 1800 }),
      payable({ id: 'd', favorecidoTipo: undefined, finalAmount: 100 }),
    ];
    const groups = groupPayables(items, 'favorecido', catName);
    // Funcionários: 3800 (maior subtotal primeiro); Fornecedores: 400 (b + d sem tipo)
    expect(groups.map((g) => [g.key, g.subtotal])).toEqual([
      ['FUNCIONARIO', 3800],
      ['FORNECEDOR', 400],
    ]);
    expect(groups[0].label).toBe('Funcionários (salários)');
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('agrupa por categoria usando o nome resolvido e cai em "Sem categoria" quando faltar', () => {
    const items = [
      payable({ id: 'a', categoryId: 'cat-pecas', finalAmount: 500 }),
      payable({ id: 'b', categoryId: 'cat-mao', finalAmount: 900 }),
      payable({ id: 'c', categoryId: 'desconhecida', finalAmount: 50 }),
    ];
    const groups = groupPayables(items, 'category', catName);
    expect(groups.map((g) => [g.label, g.subtotal])).toEqual([
      ['Mão de Obra', 900],
      ['Peças', 500],
      ['Sem categoria', 50],
    ]);
  });

  it('agrupa por fornecedor e normaliza ausência de nome', () => {
    const items = [
      payable({ id: 'a', supplierName: 'SERRAF', finalAmount: 400 }),
      payable({ id: 'b', supplierName: 'serraf', finalAmount: 100 }),
      payable({ id: 'c', supplierName: undefined, finalAmount: 999 }),
    ];
    const groups = groupPayables(items, 'supplier', catName);
    expect(groups[0].label).toBe('Sem fornecedor');
    expect(groups[0].subtotal).toBe(999);
    const serraf = groups.find((g) => g.key === 'serraf');
    expect(serraf?.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(serraf?.subtotal).toBe(500);
  });
});
