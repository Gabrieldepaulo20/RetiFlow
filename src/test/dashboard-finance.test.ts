import { describe, expect, it } from 'vitest';
import type { AccountPayable, IntakeNote } from '@/types';
import {
  DASHBOARD_ACCOUNTING_START_LABEL,
  getDashboardRevenueDate,
  getFinalizedRevenueNotesInRange,
  getPaidPayablesInRange,
  getPayablePaidAmount,
} from '@/services/domain/dashboardFinance';

const may2026 = {
  startTime: new Date('2026-05-01T00:00:00.000').getTime(),
  endTime: new Date('2026-05-31T23:59:59.999').getTime(),
};

const june2026 = {
  startTime: new Date('2026-06-01T00:00:00.000').getTime(),
  endTime: new Date('2026-06-30T23:59:59.999').getTime(),
};

function note(overrides: Partial<IntakeNote>): IntakeNote {
  return {
    id: 'note-1',
    number: 'OS-1',
    clientId: 'client-1',
    createdAt: '2026-04-25T12:00:00.000Z',
    createdByUserId: 'user-1',
    status: 'FINALIZADO',
    type: 'SERVICO',
    engineType: 'Motor',
    vehicleModel: 'Civic',
    complaint: '',
    observations: '',
    totalServices: 0,
    totalProducts: 0,
    totalAmount: 100,
    finalizedAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-10T12:00:00.000Z',
    ...overrides,
  };
}

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'payable-1',
    title: 'Conta',
    categoryId: 'cat-1',
    dueDate: '2026-05-05',
    originalAmount: 50,
    finalAmount: 50,
    status: 'PAGO',
    paidAt: '2026-05-12T12:00:00.000Z',
    recurrence: 'NENHUMA',
    isUrgent: false,
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-12T12:00:00.000Z',
    createdByUserId: 'user-1',
    ...overrides,
  };
}

describe('dashboardFinance', () => {
  it(`ignora entradas e saídas anteriores a ${DASHBOARD_ACCOUNTING_START_LABEL}`, () => {
    const notes = [
      note({ id: 'legacy-finalized-in-may', totalAmount: 100, finalizedAt: '2026-05-10T12:00:00.000Z' }),
    ];
    const payables = [
      payable({ id: 'legacy-paid-in-may', finalAmount: 50, paidAt: '2026-05-12T12:00:00.000Z' }),
    ];

    expect(getFinalizedRevenueNotesInRange(notes, may2026)).toEqual([]);
    expect(getPaidPayablesInRange(payables, may2026)).toEqual([]);
  });

  it('usa a data de finalização para reconhecer entradas de O.S. a partir da base contábil', () => {
    const notes = [
      note({ id: 'finalized-in-month', totalAmount: 100, finalizedAt: '2026-06-10T12:00:00.000Z' }),
      note({ id: 'created-in-month-but-finalized-later', totalAmount: 200, createdAt: '2026-06-10T12:00:00.000Z', finalizedAt: '2026-07-01T12:00:00.000Z' }),
      note({ id: 'not-finalized', status: 'ENTREGUE', totalAmount: 300, finalizedAt: undefined, updatedAt: '2026-06-10T12:00:00.000Z' }),
    ];

    const result = getFinalizedRevenueNotesInRange(notes, june2026);

    expect(result.map((item) => item.id)).toEqual(['finalized-in-month']);
    expect(result.reduce((sum, item) => sum + item.totalAmount, 0)).toBe(100);
  });

  it('usa somente contas pagas com paidAt dentro do período para calcular saída', () => {
    const payables = [
      payable({ id: 'paid-in-month', finalAmount: 50, paidAmount: 45, paidAt: '2026-06-12T12:00:00.000Z' }),
      payable({ id: 'paid-without-paid-at', finalAmount: 70, paidAt: undefined, dueDate: '2026-06-15', updatedAt: '2026-06-20T12:00:00.000Z' }),
      payable({ id: 'pending-with-paid-at', status: 'PENDENTE', finalAmount: 80, paidAt: '2026-06-12T12:00:00.000Z' }),
      payable({ id: 'paid-outside-month', finalAmount: 90, paidAt: '2026-07-01T12:00:00.000Z' }),
      payable({ id: 'deleted-paid', finalAmount: 100, paidAt: '2026-06-12T12:00:00.000Z', deletedAt: '2026-06-13T12:00:00.000Z' }),
    ];

    const result = getPaidPayablesInRange(payables, june2026);

    expect(result.map((item) => item.id)).toEqual(['paid-in-month']);
    expect(result.reduce((sum, item) => sum + getPayablePaidAmount(item), 0)).toBe(45);
  });

  it('mantém compatibilidade com notas finalizadas legadas sem finalizedAt', () => {
    expect(getDashboardRevenueDate(note({ finalizedAt: undefined, updatedAt: '2026-05-20T12:00:00.000Z' })))
      .toBe('2026-05-20T12:00:00.000Z');
  });
});
