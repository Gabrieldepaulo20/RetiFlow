import { describe, expect, it } from 'vitest';
import { applyNoteStatusTransition, isTerminalNoteStatus, resolveNoteFinalizedAt } from '@/services/domain/intakeNotes';
import { ALLOWED_TRANSITIONS, FINAL_STATUSES, NoteStatus } from '@/types';
import type { IntakeNote } from '@/types';

function buildNote(overrides: Partial<IntakeNote> = {}): IntakeNote {
  return {
    id: 'n1',
    number: 'OS-1',
    clientId: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    createdByUserId: 'user-1',
    status: 'ABERTO',
    type: 'SERVICO',
    engineType: 'Cabeçote',
    vehicleModel: 'Gol',
    complaint: 'Barulho no motor',
    observations: '',
    totalServices: 0,
    totalProducts: 0,
    totalAmount: 0,
    ...overrides,
  };
}

describe('resolveNoteFinalizedAt', () => {
  it('returns finalizedAt when present', () => {
    const note = buildNote({ status: 'FINALIZADO', finalizedAt: '2026-02-10T12:00:00.000Z' });
    expect(resolveNoteFinalizedAt(note)).toBe('2026-02-10T12:00:00.000Z');
  });

  it('returns null for non-finalized notes without finalizedAt', () => {
    const note = buildNote({ status: 'EM_EXECUCAO' });
    expect(resolveNoteFinalizedAt(note)).toBeNull();
  });

  it('falls back to updatedAt for legacy FINALIZADO notes missing finalizedAt', () => {
    const note = buildNote({
      status: 'FINALIZADO',
      finalizedAt: undefined,
      updatedAt: '2026-02-15T09:00:00.000Z',
    });
    expect(resolveNoteFinalizedAt(note)).toBe('2026-02-15T09:00:00.000Z');
  });
});

describe('applyNoteStatusTransition', () => {
  it('sets the new status and updates updatedAt', () => {
    const note = buildNote({ status: 'ABERTO' });
    const result = applyNoteStatusTransition({
      nextStatus: 'EM_ANALISE',
      previousNote: note,
      changedAt: '2026-03-01T08:00:00.000Z',
    });
    expect(result.status).toBe('EM_ANALISE');
    expect(result.updatedAt).toBe('2026-03-01T08:00:00.000Z');
  });

  it('sets finalizedAt when transitioning to FINALIZADO', () => {
    const note = buildNote({ status: 'ENTREGUE', finalizedAt: undefined });
    const result = applyNoteStatusTransition({
      nextStatus: 'FINALIZADO',
      previousNote: note,
      changedAt: '2026-03-05T10:00:00.000Z',
    });
    expect(result.finalizedAt).toBe('2026-03-05T10:00:00.000Z');
  });

  it('preserves existing finalizedAt if already set when transitioning to FINALIZADO', () => {
    const note = buildNote({
      status: 'ENTREGUE',
      finalizedAt: '2026-03-01T00:00:00.000Z',
    });
    const result = applyNoteStatusTransition({
      nextStatus: 'FINALIZADO',
      previousNote: note,
      changedAt: '2026-03-10T00:00:00.000Z',
    });
    expect(result.finalizedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('clears finalizedAt when leaving FINALIZADO status (admin rollback)', () => {
    const note = buildNote({ status: 'FINALIZADO', finalizedAt: '2026-02-20T00:00:00.000Z' });
    const result = applyNoteStatusTransition({
      nextStatus: 'ENTREGUE',
      previousNote: note,
      changedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(result.finalizedAt).toBeUndefined();
  });

  it('does not touch finalizedAt for transitions not involving FINALIZADO', () => {
    const note = buildNote({ status: 'APROVADO', finalizedAt: undefined });
    const result = applyNoteStatusTransition({
      nextStatus: 'EM_EXECUCAO',
      previousNote: note,
    });
    expect(result.finalizedAt).toBeUndefined();
  });
});

describe('isTerminalNoteStatus', () => {
  const terminal: NoteStatus[] = ['FINALIZADO', 'CANCELADO', 'DESCARTADO', 'SEM_CONSERTO'];
  const nonTerminal: NoteStatus[] = ['ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'AGUARDANDO_COMPRA', 'PRONTO', 'ENTREGUE'];

  terminal.forEach((status) => {
    it(`${status} is terminal`, () => {
      expect(isTerminalNoteStatus(status)).toBe(true);
    });
  });

  nonTerminal.forEach((status) => {
    it(`${status} is not terminal`, () => {
      expect(isTerminalNoteStatus(status)).toBe(false);
    });
  });
});

describe('FINAL_STATUSES', () => {
  it('contains exactly the 4 terminal statuses', () => {
    expect(FINAL_STATUSES.size).toBe(4);
    expect(FINAL_STATUSES.has('FINALIZADO')).toBe(true);
    expect(FINAL_STATUSES.has('CANCELADO')).toBe(true);
    expect(FINAL_STATUSES.has('DESCARTADO')).toBe(true);
    expect(FINAL_STATUSES.has('SEM_CONSERTO')).toBe(true);
  });

  it('terminal statuses have no outgoing transitions', () => {
    for (const status of FINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status]).toHaveLength(0);
    }
  });
});

describe('ALLOWED_TRANSITIONS state machine', () => {
  it('ABERTO can advance to EM_ANALISE', () => {
    expect(ALLOWED_TRANSITIONS.ABERTO).toContain('EM_ANALISE');
  });

  it('ORCAMENTO can be cancelled', () => {
    expect(ALLOWED_TRANSITIONS.ORCAMENTO).toContain('CANCELADO');
  });

  it('EM_EXECUCAO can be marked SEM_CONSERTO', () => {
    expect(ALLOWED_TRANSITIONS.EM_EXECUCAO).toContain('SEM_CONSERTO');
  });

  it('AGUARDANDO_COMPRA has no transitions (blocked state)', () => {
    expect(ALLOWED_TRANSITIONS.AGUARDANDO_COMPRA).toHaveLength(0);
  });

  it('ENTREGUE leads to FINALIZADO', () => {
    expect(ALLOWED_TRANSITIONS.ENTREGUE).toContain('FINALIZADO');
  });

  it('every non-final status has at least one forward transition', () => {
    const nonFinal: NoteStatus[] = ['ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'PRONTO', 'ENTREGUE'];
    for (const status of nonFinal) {
      expect(ALLOWED_TRANSITIONS[status].length).toBeGreaterThan(0);
    }
  });
});
