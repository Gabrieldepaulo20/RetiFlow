import { describe, expect, it } from 'vitest';
import {
  calcServiceTotal,
  generateClosingRecords,
  getFinalizedNotesForClosing,
  getNoteDiscount,
  normalizeClosingRecord,
} from '@/services/domain/monthlyClosing';
import { Customer, IntakeNote, IntakeService } from '@/types';

const customer: Customer = {
  id: 'c1',
  name: 'Cliente Teste',
  docType: 'CNPJ',
  docNumber: '00.000.000/0001-00',
  phone: '(11) 99999-9999',
  email: 'cliente@teste.com',
  address: 'Rua 1',
  city: 'Sao Paulo',
  state: 'SP',
  notes: '',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const services: IntakeService[] = [];

function buildNote(overrides: Partial<IntakeNote>): IntakeNote {
  return {
    id: 'n1',
    number: 'OS-1',
    clientId: customer.id,
    createdAt: '2026-01-05T10:00:00.000Z',
    createdByUserId: 'user-1',
    status: 'FINALIZADO',
    type: 'SERVICO',
    engineType: 'Cabeçote',
    vehicleModel: 'Gol',
    complaint: 'Teste',
    observations: '',
    totalServices: 100,
    totalProducts: 0,
    totalAmount: 100,
    updatedAt: '2026-01-07T10:00:00.000Z',
    ...overrides,
  };
}

describe('monthly closing domain service', () => {
  it('uses finalizedAt instead of createdAt to include notes in the correct period', () => {
    const januaryCreatedButFebruaryFinalized = buildNote({
      id: 'n-finalized-at',
      createdAt: '2026-01-20T10:00:00.000Z',
      finalizedAt: '2026-02-03T12:00:00.000Z',
      updatedAt: '2026-02-03T12:00:00.000Z',
    });

    const results = getFinalizedNotesForClosing(
      {
        customers: [customer],
        notes: [januaryCreatedButFebruaryFinalized],
        services,
      },
      {
        periodType: 'mensal',
        month: '2',
        year: '2026',
        quinzena: '1',
        weekDate: new Date('2026-02-10T00:00:00.000Z'),
        customRange: {},
        clientFilter: 'all',
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('n-finalized-at');
  });

  it('falls back to updatedAt for legacy finalized notes without finalizedAt', () => {
    const legacyFinalized = buildNote({
      id: 'n-legacy',
      createdAt: '2026-01-10T10:00:00.000Z',
      finalizedAt: undefined,
      updatedAt: '2026-02-08T15:00:00.000Z',
    });

    const results = getFinalizedNotesForClosing(
      {
        customers: [customer],
        notes: [legacyFinalized],
        services,
      },
      {
        periodType: 'mensal',
        month: '2',
        year: '2026',
        quinzena: '1',
        weekDate: new Date('2026-02-10T00:00:00.000Z'),
        customRange: {},
        clientFilter: 'all',
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('n-legacy');
  });

  it('recalculates persisted closing totals and discounts during normalization', () => {
    const normalized = normalizeClosingRecord({
      id: 'closing-1',
      clientId: customer.id,
      clientName: customer.name,
      label: 'Fechamento Fevereiro',
      period: 'Fevereiro/2026',
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T10:00:00.000Z',
      version: 1,
      regenerationCount: 1,
      editCount: 0,
      downloadCount: 0,
      notes: [
        {
          id: 'n-1',
          number: '1',
          total: 9999,
          services: [
            { name: 'Mao de obra', price: 100, quantity: 2, discount: 10, discountType: 'percent' },
            { name: 'Peca', price: 50, quantity: 1, discount: 5, discountType: 'value' },
          ],
        },
      ],
      logs: [],
      total: 9999,
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.notes[0]?.number).toBe('OS-1');
    expect(calcServiceTotal(normalized!.notes[0]!.services[0]!)).toBe(180);
    expect(calcServiceTotal(normalized!.notes[0]!.services[1]!)).toBe(45);
    expect(normalized?.notes[0]?.total).toBe(225);
    expect(normalized?.total).toBe(225);
    expect(getNoteDiscount(normalized!.notes[0]!)).toBe(25);
    expect(normalized?.logs).toHaveLength(1);
  });

  it('generates one closing per client with default service discounts', () => {
    const secondCustomer: Customer = {
      ...customer,
      id: 'c2',
      name: 'Outro Cliente',
      email: 'outro@teste.com',
    };

    const firstNote = buildNote({
      id: 'n-1',
      number: 'OS-1',
      clientId: customer.id,
      totalAmount: 230,
    });

    const secondNote = buildNote({
      id: 'n-2',
      number: 'OS-2',
      clientId: secondCustomer.id,
      totalAmount: 80,
    });

    const generatedServices: IntakeService[] = [
      {
        id: 's-1',
        noteId: firstNote.id,
        name: 'Mao de obra',
        description: '',
        price: 115,
        quantity: 2,
        subtotal: 230,
      },
      {
        id: 's-2',
        noteId: secondNote.id,
        name: 'Usinagem',
        description: '',
        price: 80,
        quantity: 1,
        subtotal: 80,
      },
    ];

    const groupedByClient = new Map<string, IntakeNote[]>([
      [customer.id, [firstNote]],
      [secondCustomer.id, [secondNote]],
    ]);

    const closings = generateClosingRecords({
      filters: {
        periodType: 'mensal',
        month: '2',
        year: '2026',
        quinzena: '1',
        weekDate: new Date('2026-02-10T00:00:00.000Z'),
        customRange: {},
        clientFilter: 'all',
      },
      dateRange: {
        start: new Date('2026-02-01T00:00:00.000Z'),
        end: new Date('2026-02-28T23:59:59.000Z'),
      },
      customers: [customer, secondCustomer],
      notes: [firstNote, secondNote],
      services: generatedServices,
      groupedByClient,
    });

    expect(closings).toHaveLength(2);
    expect(closings[0]?.notes[0]?.services[0]?.discount).toBe(0);
    expect(closings[0]?.notes[0]?.services[0]?.discountType).toBe('percent');
    expect(closings[0]?.logs[0]?.type).toBe('generated');
    expect(closings.map((closing) => closing.clientName)).toEqual(
      expect.arrayContaining([customer.name, secondCustomer.name]),
    );
  });
});
