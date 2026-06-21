import { describe, expect, it } from 'vitest';
import type { IntakeNote } from '@/types';
import { compareIntakeNotes, getIntakeNoteSortLabel } from '@/services/domain/intakeNotesList';

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

  it('describes selected ordering in user-facing language', () => {
    expect(getIntakeNoteSortLabel('date', 'desc')).toBe('Data mais recente');
    expect(getIntakeNoteSortLabel('os', 'asc')).toBe('O.S. menor primeiro');
  });
});
