import { describe, expect, it } from 'vitest';
import type { AccountPayable, PayableStatus } from '@/types';
import { canCancelPayable, canDeletePayable } from '@/services/domain/payables';

function payable(status: PayableStatus, deletedAt?: string): AccountPayable {
  return {
    id: `payable-${status}`,
    title: 'Conta de teste',
    categoryId: 'cat-1',
    dueDate: '2026-07-30',
    originalAmount: 100,
    finalAmount: 100,
    status,
    recurrence: 'NENHUMA',
    isUrgent: false,
    deletedAt,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdByUserId: 'user-1',
  };
}

describe('payable action guards', () => {
  it.each(['PARCIAL', 'PAGO'] as const)('bloqueia cancelamento e exclusão de conta %s', (status) => {
    expect(canCancelPayable(payable(status))).toBe(false);
    expect(canDeletePayable(payable(status))).toBe(false);
  });

  it('mantém as ações disponíveis para uma conta pendente ativa', () => {
    expect(canCancelPayable(payable('PENDENTE'))).toBe(true);
    expect(canDeletePayable(payable('PENDENTE'))).toBe(true);
  });

  it('bloqueia ações em conta já excluída', () => {
    const deleted = payable('PENDENTE', '2026-07-30T12:00:00.000Z');

    expect(canCancelPayable(deleted)).toBe(false);
    expect(canDeletePayable(deleted)).toBe(false);
  });
});
