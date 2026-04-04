import { FINAL_STATUSES, IntakeNote, NoteStatus } from '@/types';

interface StatusTransitionInput {
  nextStatus: NoteStatus;
  previousNote: IntakeNote;
  changedAt?: string;
}

export function resolveNoteFinalizedAt(note: IntakeNote): string | null {
  if (note.finalizedAt) {
    return note.finalizedAt;
  }

  if (note.status !== 'FINALIZADO') {
    return null;
  }

  return note.updatedAt || note.createdAt;
}

export function applyNoteStatusTransition({
  nextStatus,
  previousNote,
  changedAt = new Date().toISOString(),
}: StatusTransitionInput): IntakeNote {
  const isTransitioningToFinalized = nextStatus === 'FINALIZADO';
  const isLeavingFinalized = previousNote.status === 'FINALIZADO' && nextStatus !== 'FINALIZADO';

  return {
    ...previousNote,
    status: nextStatus,
    updatedAt: changedAt,
    finalizedAt: isTransitioningToFinalized
      ? previousNote.finalizedAt ?? changedAt
      : isLeavingFinalized
        ? undefined
        : previousNote.finalizedAt,
  };
}

export function isTerminalNoteStatus(status: NoteStatus) {
  return FINAL_STATUSES.has(status);
}
