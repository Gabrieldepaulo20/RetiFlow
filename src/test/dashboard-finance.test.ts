import { describe, expect, it } from 'vitest';
import type { AccountPayable, IntakeNote } from '@/types';
import {
  getDashboardRevenueDate,
  getFinalizedRevenueNotesInRange,
  getPaidPayablesInRange,
  getPayablePaidAmount,
  toComparableTime,
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
    status: 'ENTREGUE',
    paymentStatus: 'PENDENTE',
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
  it('regra de corte: legado usa prazo (ignora batch); novo usa entrega', () => {
    const notes = [
      // Legada (criada antes de 01/06): usa o prazo (maio); a finalização em lote (junho) é ignorada.
      note({
        id: 'legacy-deadline-may-finalized-june-batch',
        totalAmount: 150,
        createdAt: '2026-05-29T12:00:00.000Z',
        deadline: '2026-05-30',
        finalizedAt: '2026-06-10T12:00:00.000Z',
      }),
      // Nova (>= 01/06): usa a entrega real (junho).
      note({
        id: 'new-finalized-june',
        totalAmount: 200,
        createdAt: '2026-06-05T12:00:00.000Z',
        deadline: undefined,
        finalizedAt: '2026-06-20T12:00:00.000Z',
      }),
      // Nova criada em junho mas entregue em julho: cai em julho, não em junho.
      note({
        id: 'new-created-june-finalized-july',
        totalAmount: 300,
        createdAt: '2026-06-25T12:00:00.000Z',
        deadline: undefined,
        finalizedAt: '2026-07-05T12:00:00.000Z',
      }),
    ];

    const mayResult = getFinalizedRevenueNotesInRange(notes, may2026);
    const juneResult = getFinalizedRevenueNotesInRange(notes, june2026);

    expect(mayResult.map((item) => item.id)).toEqual(['legacy-deadline-may-finalized-june-batch']);
    expect(mayResult.reduce((sum, item) => sum + item.totalAmount, 0)).toBe(150);
    expect(juneResult.map((item) => item.id)).toEqual(['new-finalized-june']);
    expect(juneResult.reduce((sum, item) => sum + item.totalAmount, 0)).toBe(200);
  });

  it('não joga lote legado para o mês em que várias O.S. foram finalizadas/importadas', () => {
    const notes = [
      note({
        id: 'legacy-created-january-finalized-june',
        totalAmount: 100,
        createdAt: '2026-01-15T12:00:00.000Z',
        finalizedAt: '2026-06-12T12:00:00.000Z',
      }),
      note({
        id: 'legacy-created-february-finalized-june',
        totalAmount: 200,
        createdAt: '2026-02-10T12:00:00.000Z',
        finalizedAt: '2026-06-12T12:00:00.000Z',
      }),
      note({
        id: 'legacy-created-may-finalized-june',
        totalAmount: 300,
        createdAt: '2026-05-10T12:00:00.000Z',
        finalizedAt: '2026-06-12T12:00:00.000Z',
      }),
    ];

    const juneResult = getFinalizedRevenueNotesInRange(notes, june2026);
    const mayResult = getFinalizedRevenueNotesInRange(notes, may2026);

    expect(juneResult).toEqual([]);
    expect(mayResult.map((item) => item.id)).toEqual(['legacy-created-may-finalized-june']);
  });

  it('ignora saídas pagas antes da base contábil de contas a pagar', () => {
    const payables = [
      payable({ id: 'legacy-paid-in-may', finalAmount: 50, paidAt: '2026-05-12T12:00:00.000Z' }),
    ];

    expect(getPaidPayablesInRange(payables, may2026)).toEqual([]);
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

  it('legado usa o prazo como competência (não a finalização em lote)', () => {
    expect(getDashboardRevenueDate(note({
      createdAt: '2026-05-20T12:00:00.000Z',
      deadline: '2026-06-05',
      finalizedAt: '2026-06-15T12:00:00.000Z',
      updatedAt: '2026-06-20T12:00:00.000Z',
    }))).toBe('2026-06-05');
  });

  it('legado sem prazo cai na data de criação', () => {
    expect(getDashboardRevenueDate(note({
      createdAt: '2026-05-20T12:00:00.000Z',
      deadline: undefined,
      finalizedAt: '2026-06-15T12:00:00.000Z',
    }))).toBe('2026-05-20T12:00:00.000Z');
  });

  it('O.S. nova usa a entrega real (finalizedAt)', () => {
    expect(getDashboardRevenueDate(note({
      createdAt: '2026-06-10T12:00:00.000Z',
      deadline: '2026-06-12',
      finalizedAt: '2026-06-15T12:00:00.000Z',
    }))).toBe('2026-06-15T12:00:00.000Z');
  });

  it('O.S. nova sem finalização cai no prazo e depois na criação', () => {
    expect(getDashboardRevenueDate(note({
      createdAt: '2026-06-10T12:00:00.000Z',
      deadline: '2026-06-12',
      finalizedAt: undefined,
    }))).toBe('2026-06-12');
    expect(getDashboardRevenueDate(note({
      createdAt: '2026-06-10T12:00:00.000Z',
      deadline: undefined,
      finalizedAt: undefined,
    }))).toBe('2026-06-10T12:00:00.000Z');
  });
});

describe('toComparableTime', () => {
  it('interpreta data "só data" como meia-noite local (não UTC)', () => {
    // Sem a normalização, new Date('2026-06-01') seria meia-noite UTC e em BR (UTC-3)
    // cairia em 31/05 21:00, vazando a conta para o mês anterior.
    expect(toComparableTime('2026-06-01')).toBe(new Date('2026-06-01T00:00:00').getTime());
  });

  it('mantém timestamps completos inalterados', () => {
    expect(toComparableTime('2026-06-01T12:00:00.000Z')).toBe(new Date('2026-06-01T12:00:00.000Z').getTime());
  });

  it('retorna NaN para valor vazio', () => {
    expect(Number.isNaN(toComparableTime(undefined))).toBe(true);
    expect(Number.isNaN(toComparableTime(null))).toBe(true);
  });
});

describe('getPayablePaidAmount', () => {
  it('usa paidAmount quando presente', () => {
    expect(getPayablePaidAmount({ status: 'PARCIAL', paidAmount: 30, finalAmount: 100 })).toBe(30);
  });

  it('PARCIAL sem paidAmount não assume o valor cheio', () => {
    expect(getPayablePaidAmount({ status: 'PARCIAL', paidAmount: undefined, finalAmount: 100 })).toBe(0);
  });

  it('PAGO sem paidAmount equivale ao finalAmount', () => {
    expect(getPayablePaidAmount({ status: 'PAGO', paidAmount: undefined, finalAmount: 100 })).toBe(100);
  });
});
