import { BILLABLE_STATUSES, FINAL_STATUSES, IntakeNote, NoteStatus, PaymentMethod } from '@/types';

interface StatusTransitionInput {
  nextStatus: NoteStatus;
  previousNote: IntakeNote;
  changedAt?: string;
}

/** Estágio faturável = gera receita por competência (ENTREGUE/RECUSADO/SEM_CONSERTO). */
export function isBillableNoteStatus(status: NoteStatus): boolean {
  return BILLABLE_STATUSES.has(status);
}

/** Data de competência: quando a nota se tornou faturável. */
export function resolveNoteFinalizedAt(note: IntakeNote): string | null {
  if (note.finalizedAt) {
    return note.finalizedAt;
  }

  if (!isBillableNoteStatus(note.status)) {
    return null;
  }

  return note.updatedAt || note.createdAt;
}

/**
 * AGUARDANDO_COMPRA é uma pausa que só pode ser criada pelo fluxo de nota de compra
 * (`createPurchaseNote`/edição que grava `previousStatus` + cria a nota-filha que
 * retoma a O.S. automaticamente quando a compra é finalizada). Entrar nesse status
 * por uma troca direta de status — avançar, voltar, drag — deixaria a O.S. em pausa
 * órfã, sem `previousStatus` e sem nada para retomá-la. Por isso a transição direta
 * é proibida no domínio; todo caller de `updateNoteStatus` deve pré-checar isto.
 */
export function isDirectStatusTransitionAllowed(nextStatus: NoteStatus): boolean {
  return nextStatus !== 'AGUARDANDO_COMPRA';
}

export function applyNoteStatusTransition({
  nextStatus,
  previousNote,
  changedAt = new Date().toISOString(),
}: StatusTransitionInput): IntakeNote {
  if (!isDirectStatusTransitionAllowed(nextStatus)) {
    throw new Error(
      'Transição direta para AGUARDANDO_COMPRA não é permitida; use o fluxo de nota de compra.',
    );
  }

  const isTransitioningToBillable = isBillableNoteStatus(nextStatus);
  const isLeavingBillable = isBillableNoteStatus(previousNote.status) && !isBillableNoteStatus(nextStatus);

  return {
    ...previousNote,
    status: nextStatus,
    updatedAt: changedAt,
    finalizedAt: isTransitioningToBillable
      ? previousNote.finalizedAt ?? changedAt
      : isLeavingBillable
        ? undefined
        : previousNote.finalizedAt,
  };
}

export function isTerminalNoteStatus(status: NoteStatus) {
  return FINAL_STATUSES.has(status);
}

export function isNotePaid(note: IntakeNote): boolean {
  return note.paymentStatus === 'PAGO';
}

/** Registra o recebimento do cliente (eixo financeiro, separado do fluxo). */
export function applyNotePayment(
  note: IntakeNote,
  { paidWith, paidAt = new Date().toISOString() }: { paidWith?: PaymentMethod; paidAt?: string },
): IntakeNote {
  return {
    ...note,
    paymentStatus: 'PAGO',
    paidAt,
    paidWith,
    updatedAt: paidAt,
  };
}

/** Estorna o recebimento — volta a nota para pendente. */
export function revertNotePayment(note: IntakeNote, changedAt = new Date().toISOString()): IntakeNote {
  return {
    ...note,
    paymentStatus: 'PENDENTE',
    paidAt: undefined,
    paidWith: undefined,
    updatedAt: changedAt,
  };
}
