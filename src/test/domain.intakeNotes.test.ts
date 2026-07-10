import { describe, expect, it } from 'vitest';
import {
  applyNoteStatusTransition,
  getManualNoteStatusTargets,
  getNoteStatusTransitionBlockReason,
  getPreviousNoteWorkflowStatus,
  isDirectStatusTransitionAllowed,
  isTerminalNoteStatus,
  resolveNoteFinalizedAt,
  shouldConfirmNoteStatusTransition,
} from '@/services/domain/intakeNotes';
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
    paymentStatus: 'PENDENTE',
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
    const note = buildNote({ status: 'ENTREGUE', finalizedAt: '2026-02-10T12:00:00.000Z' });
    expect(resolveNoteFinalizedAt(note)).toBe('2026-02-10T12:00:00.000Z');
  });

  it('returns null for non-billable notes without finalizedAt', () => {
    const note = buildNote({ status: 'EM_EXECUCAO' });
    expect(resolveNoteFinalizedAt(note)).toBeNull();
  });

  it('falls back to updatedAt for billable notes missing finalizedAt', () => {
    const note = buildNote({
      status: 'ENTREGUE',
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

  it('sets finalizedAt when transitioning to a billable status (ENTREGUE)', () => {
    const note = buildNote({ status: 'PRONTA', finalizedAt: undefined });
    const result = applyNoteStatusTransition({
      nextStatus: 'ENTREGUE',
      previousNote: note,
      changedAt: '2026-03-05T10:00:00.000Z',
    });
    expect(result.finalizedAt).toBe('2026-03-05T10:00:00.000Z');
  });

  it('allows a direct ABERTO -> ENTREGUE correction and records finalization', () => {
    const note = buildNote({ status: 'ABERTO', finalizedAt: undefined });
    const result = applyNoteStatusTransition({
      nextStatus: 'ENTREGUE',
      previousNote: note,
      changedAt: '2026-03-05T10:00:00.000Z',
    });

    expect(result.status).toBe('ENTREGUE');
    expect(result.finalizedAt).toBe('2026-03-05T10:00:00.000Z');
  });

  it('preserves existing finalizedAt when transitioning to a billable status', () => {
    const note = buildNote({
      status: 'PRONTA',
      finalizedAt: '2026-03-01T00:00:00.000Z',
    });
    const result = applyNoteStatusTransition({
      nextStatus: 'ENTREGUE',
      previousNote: note,
      changedAt: '2026-03-10T00:00:00.000Z',
    });
    expect(result.finalizedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('clears finalizedAt when leaving a billable status (admin rollback)', () => {
    const note = buildNote({ status: 'ENTREGUE', finalizedAt: '2026-02-20T00:00:00.000Z' });
    const result = applyNoteStatusTransition({
      nextStatus: 'EM_EXECUCAO',
      previousNote: note,
      changedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(result.finalizedAt).toBeUndefined();
  });

  it('keeps a recorded payment when reopening a delivered O.S.', () => {
    const note = buildNote({
      status: 'ENTREGUE',
      finalizedAt: '2026-02-20T00:00:00.000Z',
      paymentStatus: 'PAGO',
      paidAt: '2026-02-21T00:00:00.000Z',
      paidWith: 'PIX',
    });
    const result = applyNoteStatusTransition({ nextStatus: 'PRONTA', previousNote: note });

    expect(result.paymentStatus).toBe('PAGO');
    expect(result.paidAt).toBe('2026-02-21T00:00:00.000Z');
    expect(result.paidWith).toBe('PIX');
  });

  it('does not touch finalizedAt for transitions between non-billable statuses', () => {
    const note = buildNote({ status: 'APROVADO', finalizedAt: undefined });
    const result = applyNoteStatusTransition({
      nextStatus: 'EM_EXECUCAO',
      previousNote: note,
    });
    expect(result.finalizedAt).toBeUndefined();
  });

  it('throws when targeting AGUARDANDO_COMPRA (orphan-pause guard)', () => {
    const note = buildNote({ status: 'EM_EXECUCAO' });
    expect(() =>
      applyNoteStatusTransition({ nextStatus: 'AGUARDANDO_COMPRA', previousNote: note }),
    ).toThrow();
  });

  it('still allows admin backward transitions (ENTREGUE -> EM_EXECUCAO)', () => {
    const note = buildNote({ status: 'ENTREGUE', finalizedAt: '2026-02-20T00:00:00.000Z' });
    const result = applyNoteStatusTransition({ nextStatus: 'EM_EXECUCAO', previousNote: note });
    expect(result.status).toBe('EM_EXECUCAO');
  });
});

describe('manual workflow corrections', () => {
  it.each([
    ['ENTREGUE', 'PRONTA'],
    ['RECUSADO', 'ORCAMENTO'],
    ['SEM_CONSERTO', 'EM_EXECUCAO'],
    ['EXCLUIDA', 'ABERTO'],
  ] as const)('reopens %s through its canonical business stage', (current, expected) => {
    expect(getPreviousNoteWorkflowStatus(current)).toBe(expected);
  });

  it('offers direct normal-workflow destinations, including Entregue', () => {
    const targets = getManualNoteStatusTargets(buildNote({ status: 'ABERTO' }));

    expect(targets).toContain('ENTREGUE');
    expect(targets).not.toContain('ABERTO');
    expect(targets).not.toContain('AGUARDANDO_COMPRA');
  });

  it('requires confirmation when stages are skipped or billing changes', () => {
    const openNote = buildNote({ status: 'ABERTO' });
    const deliveredNote = buildNote({ status: 'ENTREGUE' });

    expect(shouldConfirmNoteStatusTransition(openNote, 'EM_ANALISE')).toBe(false);
    expect(shouldConfirmNoteStatusTransition(openNote, 'APROVADO')).toBe(true);
    expect(shouldConfirmNoteStatusTransition(openNote, 'ENTREGUE')).toBe(true);
    expect(shouldConfirmNoteStatusTransition(deliveredNote, 'PRONTA')).toBe(true);
  });

  it('blocks notes already included in a closing', () => {
    const note = buildNote({ status: 'ENTREGUE', closingId: 'closing-1' });

    expect(getManualNoteStatusTargets(note)).toEqual([]);
    expect(getNoteStatusTransitionBlockReason(note, 'PRONTA')).toContain('fechamento');
  });

  it('blocks manual changes while waiting for a linked purchase', () => {
    const note = buildNote({ status: 'AGUARDANDO_COMPRA' });

    expect(getManualNoteStatusTargets(note)).toEqual([]);
    expect(getNoteStatusTransitionBlockReason(note, 'EM_EXECUCAO')).toContain('compra vinculada');
  });

  it('keeps contextual final states tied to the correct business stage', () => {
    expect(getNoteStatusTransitionBlockReason(buildNote({ status: 'ABERTO' }), 'RECUSADO')).toContain('Orçamento');
    expect(getNoteStatusTransitionBlockReason(buildNote({ status: 'APROVADO' }), 'SEM_CONSERTO')).toContain('Em Execução');
    expect(getNoteStatusTransitionBlockReason(buildNote({ status: 'RECUSADO' }), 'ABERTO')).toContain('Orçamento');
  });
});

describe('isDirectStatusTransitionAllowed', () => {
  it('blocks only AGUARDANDO_COMPRA', () => {
    expect(isDirectStatusTransitionAllowed('AGUARDANDO_COMPRA')).toBe(false);
  });

  it('allows every other status as a direct target', () => {
    const others: NoteStatus[] = [
      'ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO',
      'PRONTA', 'ENTREGUE', 'RECUSADO', 'SEM_CONSERTO', 'EXCLUIDA',
    ];
    for (const status of others) {
      expect(isDirectStatusTransitionAllowed(status)).toBe(true);
    }
  });
});

describe('isTerminalNoteStatus', () => {
  const terminal: NoteStatus[] = ['ENTREGUE', 'RECUSADO', 'SEM_CONSERTO', 'EXCLUIDA'];
  const nonTerminal: NoteStatus[] = ['ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'AGUARDANDO_COMPRA', 'PRONTA'];

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
    expect(FINAL_STATUSES.has('ENTREGUE')).toBe(true);
    expect(FINAL_STATUSES.has('RECUSADO')).toBe(true);
    expect(FINAL_STATUSES.has('SEM_CONSERTO')).toBe(true);
    expect(FINAL_STATUSES.has('EXCLUIDA')).toBe(true);
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

  it('ORCAMENTO can be refused (RECUSADO)', () => {
    expect(ALLOWED_TRANSITIONS.ORCAMENTO).toContain('RECUSADO');
  });

  it('EM_EXECUCAO can be marked SEM_CONSERTO', () => {
    expect(ALLOWED_TRANSITIONS.EM_EXECUCAO).toContain('SEM_CONSERTO');
  });

  it('AGUARDANDO_COMPRA has no transitions (blocked state)', () => {
    expect(ALLOWED_TRANSITIONS.AGUARDANDO_COMPRA).toHaveLength(0);
  });

  it('PRONTA leads to ENTREGUE', () => {
    expect(ALLOWED_TRANSITIONS.PRONTA).toContain('ENTREGUE');
  });

  it('every non-final status has at least one forward transition', () => {
    const nonFinal: NoteStatus[] = ['ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'PRONTA'];
    for (const status of nonFinal) {
      expect(ALLOWED_TRANSITIONS[status].length).toBeGreaterThan(0);
    }
  });
});
