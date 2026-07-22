import { describe, expect, it } from 'vitest';
import type { IntakeNote } from '@/types';
import {
  calculateIntakeNotesSummary,
  compareIntakeNotes,
  DEFAULT_INTAKE_NOTE_SORT_DIRECTION,
  DEFAULT_INTAKE_NOTE_SORT_FIELD,
  getCurrentIntakeMonthInput,
  getIntakeMonthRange,
  getIntakeNoteSortLabel,
  isIntakeNoteInValueRange,
  normalizeIntakeNoteValueRange,
  parseIntakeNoteValueFilter,
} from '@/services/domain/intakeNotesList';

function note(overrides: Partial<IntakeNote>): IntakeNote {
  return {
    id: 'note-1',
    number: 'OS-1',
    clientId: 'client-1',
    createdAt: '2026-06-01T12:00:00.000Z',
    createdByUserId: 'user-1',
    status: 'ABERTO',
    paymentStatus: 'PENDENTE',
    type: 'SERVICO',
    engineType: 'Motor',
    vehicleModel: 'Gol',
    complaint: '',
    observations: '',
    totalServices: 0,
    totalProducts: 0,
    totalAmount: 0,
    updatedAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('intake notes list sorting', () => {
  it('orders service orders naturally by number', () => {
    const notes = [
      note({ id: '10', number: 'OS 10' }),
      note({ id: '2', number: 'OS 2' }),
      note({ id: '1', number: 'OS 1' }),
    ];

    expect([...notes].sort((a, b) => compareIntakeNotes(a, b, 'os', 'asc')).map((item) => item.number))
      .toEqual(['OS 1', 'OS 2', 'OS 10']);
    expect([...notes].sort((a, b) => compareIntakeNotes(a, b, 'os', 'desc')).map((item) => item.number))
      .toEqual(['OS 10', 'OS 2', 'OS 1']);
  });

  it('orders notes by creation date in both directions', () => {
    const notes = [
      note({ id: 'middle', createdAt: '2026-06-10T12:00:00.000Z' }),
      note({ id: 'older', createdAt: '2026-06-01T12:00:00.000Z' }),
      note({ id: 'newer', createdAt: '2026-06-20T12:00:00.000Z' }),
    ];

    expect([...notes].sort((a, b) => compareIntakeNotes(a, b, 'date', 'asc')).map((item) => item.id))
      .toEqual(['older', 'middle', 'newer']);
    expect([...notes].sort((a, b) => compareIntakeNotes(a, b, 'date', 'desc')).map((item) => item.id))
      .toEqual(['newer', 'middle', 'older']);
  });

  it('keeps the latest service order number first by default without reacting to edits', () => {
    const notes = [
      note({
        id: 'today-edited',
        number: 'OS-700',
        createdAt: '2026-07-22T12:00:00.000Z',
        updatedAt: '2026-07-22T18:00:00.000Z',
      }),
      note({
        id: 'backdated-created-last',
        number: 'OS-701',
        createdAt: '2026-06-10T12:00:00.000Z',
        updatedAt: '2026-07-22T15:00:00.000Z',
      }),
    ];

    expect(DEFAULT_INTAKE_NOTE_SORT_FIELD).toBe('os');
    expect(DEFAULT_INTAKE_NOTE_SORT_DIRECTION).toBe('desc');
    expect(notes.sort((a, b) => compareIntakeNotes(
      a,
      b,
      DEFAULT_INTAKE_NOTE_SORT_FIELD,
      DEFAULT_INTAKE_NOTE_SORT_DIRECTION,
    )).map((item) => item.id)).toEqual(['backdated-created-last', 'today-edited']);
  });

  it('describes selected ordering in user-facing language', () => {
    expect(getIntakeNoteSortLabel('date', 'desc')).toBe('Data mais recente');
    expect(getIntakeNoteSortLabel('os', 'asc')).toBe('O.S. menor primeiro');
  });

  it('builds a full month range for note filters', () => {
    expect(getCurrentIntakeMonthInput(new Date(2026, 5, 20))).toBe('2026-06');

    const range = getIntakeMonthRange('2026-02');
    expect(range?.startInput).toBe('2026-02-01');
    expect(range?.endInput).toBe('2026-02-28');
    expect(range?.label).toBe('Fevereiro de 2026');
    expect(getIntakeMonthRange('2026-13')).toBeNull();
  });

  it('summarizes the entire filtered set instead of a paginated page', () => {
    const allFilteredMonthNotes = Array.from({ length: 80 }, (_, index) => note({
      id: `month-${index + 1}`,
      number: `OS-${index + 1}`,
      status: index < 60 ? 'ENTREGUE' : 'ABERTO',
      totalAmount: 100,
      createdAt: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
    }));
    const firstPageOnly = allFilteredMonthNotes.slice(0, 50);

    const fullSummary = calculateIntakeNotesSummary(allFilteredMonthNotes);
    const firstPageSummary = calculateIntakeNotesSummary(firstPageOnly);

    expect(firstPageSummary.totalCount).toBe(50);
    expect(firstPageSummary.totalAmount).toBe(5000);
    expect(fullSummary.totalCount).toBe(80);
    expect(fullSummary.totalAmount).toBe(8000);
    expect(firstPageSummary.activeCount).toBe(0);
    expect(fullSummary.activeCount).toBe(20);
    expect(fullSummary.billableCount).toBe(60);
    expect(fullSummary.billableAmount).toBe(6000);
  });

  it('parses and applies service order value filters', () => {
    expect(parseIntakeNoteValueFilter('R$ 1.250,50')).toBe(1250.5);
    expect(parseIntakeNoteValueFilter('1.250')).toBe(1250);
    expect(parseIntakeNoteValueFilter('1250.75')).toBe(1250.75);
    expect(parseIntakeNoteValueFilter('abc')).toBeNull();

    const range = normalizeIntakeNoteValueRange('2.000,00', '1.000,00');
    expect(range).toEqual({ min: 1000, max: 2000 });
    expect(isIntakeNoteInValueRange(note({ totalAmount: 1500 }), range)).toBe(true);
    expect(isIntakeNoteInValueRange(note({ totalAmount: 999.99 }), range)).toBe(false);
    expect(isIntakeNoteInValueRange(note({ totalAmount: 2000.01 }), range)).toBe(false);
  });
});
