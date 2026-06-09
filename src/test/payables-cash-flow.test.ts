import { describe, expect, it } from 'vitest';
import { calculatePayablesCashFlowSummary, isLaborRelatedPayable } from '@/services/domain/payablesCashFlow';
import type { AccountPayable, PayableCategory } from '@/types';

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'p1',
    title: 'Conta',
    categoryId: 'paycat-1',
    dueDate: '2026-06-10',
    originalAmount: 100,
    finalAmount: 100,
    status: 'PENDENTE',
    recurrence: 'NENHUMA',
    isUrgent: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    createdByUserId: 'u1',
    ...overrides,
  };
}

const categories: PayableCategory[] = [
  { id: 'paycat-1', name: 'Peças e Materiais', color: 'bg-blue-100 text-blue-800', icon: 'Wrench', isActive: true, createdAt: '2026-06-01T00:00:00.000Z' },
  { id: 'paycat-5', name: 'Mão de Obra', color: 'bg-green-100 text-green-800', icon: 'Users', isActive: true, createdAt: '2026-06-01T00:00:00.000Z' },
];

describe('payables cash flow summary', () => {
  it('calcula próximos vencimentos, atraso e totais sem incluir contas pagas ou excluídas', () => {
    const summary = calculatePayablesCashFlowSummary({
      now: new Date('2026-06-09T12:00:00'),
      categories,
      payables: [
        payable({ id: 'overdue', dueDate: '2026-06-01', finalAmount: 80 }),
        payable({ id: 'seven', dueDate: '2026-06-12', finalAmount: 120 }),
        payable({ id: 'thirty', dueDate: '2026-06-25', finalAmount: 300 }),
        payable({ id: 'paid', dueDate: '2026-06-10', finalAmount: 999, status: 'PAGO' }),
        payable({ id: 'deleted', dueDate: '2026-06-10', finalAmount: 999, deletedAt: '2026-06-09T00:00:00.000Z' }),
      ],
    });

    expect(summary.overdueTotal).toBe(80);
    expect(summary.overdueCount).toBe(1);
    expect(summary.nextSevenTotal).toBe(120);
    expect(summary.nextSevenCount).toBe(1);
    expect(summary.nextThirtyTotal).toBe(420);
    expect(summary.nextThirtyCount).toBe(2);
    expect(summary.nextDue.map((item) => item.id)).toEqual(['overdue', 'seven', 'thirty']);
  });

  it('identifica folha, salário e mão de obra sem precisar de tabela de funcionários nesta fase', () => {
    expect(isLaborRelatedPayable(payable({ title: 'Salário João Junho' }))).toBe(true);
    expect(isLaborRelatedPayable(payable({ title: 'Folha Mensal' }))).toBe(true);
    expect(isLaborRelatedPayable(payable({ title: 'Serviço Terceirizado', categoryId: 'paycat-5' }), 'Mão de Obra')).toBe(true);
    expect(isLaborRelatedPayable(payable({ title: 'Boleto Peças' }), 'Peças e Materiais')).toBe(false);
  });
});
