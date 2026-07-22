import { BILLABLE_STATUSES, FINAL_STATUSES, IntakeNote, NoteStatus, PaymentMethod } from '@/types';

/**
 * Nota de Compra permanece fora da UI até que persistência, retomada da O.S.
 * pai, status e PDF usem o contrato próprio de Notas_de_Compra ponta a ponta.
 * O backend continua aceitando a RPC somente para compatibilidade e testes de
 * isolamento, com validação obrigatória do tenant da O.S. vinculada.
 */
export const PURCHASE_NOTES_ENABLED = false;

/**
 * Mantém a data operacional da O.S. em um horário local seguro para a UI.
 * Datas `AAAA-MM-DD` à meia-noite UTC podem aparecer como o dia anterior no Brasil.
 */
export function resolveNoteCalendarTimestamp(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const calendarDate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(calendarDate)
    ? `${calendarDate}T12:00:00`
    : fallback;
}

/**
 * Etapas que a equipe pode selecionar manualmente no fluxo operacional.
 * AGUARDANDO_COMPRA fica fora: essa pausa depende de uma compra vinculada.
 */
export const MANUAL_NOTE_WORKFLOW: readonly NoteStatus[] = [
  'ABERTO',
  'EM_ANALISE',
  'ORCAMENTO',
  'APROVADO',
  'EM_EXECUCAO',
  'PRONTA',
  'ENTREGUE',
];

const REOPEN_STATUS_TARGET: Partial<Record<NoteStatus, NoteStatus>> = {
  ENTREGUE: 'PRONTA',
  RECUSADO: 'ORCAMENTO',
  SEM_CONSERTO: 'EM_EXECUCAO',
  EXCLUIDA: 'ABERTO',
};

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

export function getNextNoteWorkflowStatus(status: NoteStatus): NoteStatus | undefined {
  const currentIndex = MANUAL_NOTE_WORKFLOW.indexOf(status);
  return currentIndex >= 0 ? MANUAL_NOTE_WORKFLOW[currentIndex + 1] : undefined;
}

export function getPreviousNoteWorkflowStatus(status: NoteStatus): NoteStatus | undefined {
  const reopenTarget = REOPEN_STATUS_TARGET[status];
  if (reopenTarget) return reopenTarget;

  const currentIndex = MANUAL_NOTE_WORKFLOW.indexOf(status);
  return currentIndex > 0 ? MANUAL_NOTE_WORKFLOW[currentIndex - 1] : undefined;
}

/**
 * Retorna o motivo do bloqueio, ou null quando a mudança manual é válida.
 * As etapas normais podem ser puladas para correção operacional; finais
 * alternativos preservam o ponto de negócio em que fazem sentido.
 */
export function getNoteStatusTransitionBlockReason(
  note: IntakeNote,
  nextStatus: NoteStatus,
): string | null {
  if (note.status === nextStatus) return 'A O.S. já está neste status.';
  if (note.type !== 'SERVICO') return 'Somente O.S. de serviço pode usar o fluxo operacional.';
  if (note.closingId) return 'Esta O.S. já entrou em um fechamento e não pode mudar de status.';
  if (note.status === 'AGUARDANDO_COMPRA' || nextStatus === 'AGUARDANDO_COMPRA') {
    return 'A etapa Aguardando Compra só pode ser alterada pelo fluxo de compra vinculada.';
  }

  if (note.status === 'RECUSADO' && nextStatus !== 'ORCAMENTO') {
    return 'Uma O.S. recusada deve ser reaberta para Orçamento.';
  }
  if (note.status === 'SEM_CONSERTO' && nextStatus !== 'EM_EXECUCAO') {
    return 'Uma O.S. sem conserto deve ser reaberta para Em Execução.';
  }
  if (note.status === 'EXCLUIDA' && nextStatus !== 'ABERTO') {
    return 'Uma O.S. excluída deve ser restaurada como Aberta.';
  }

  if (nextStatus === 'RECUSADO' && note.status !== 'ORCAMENTO') {
    return 'Recusada só pode ser usada quando a O.S. está em Orçamento.';
  }
  if (nextStatus === 'SEM_CONSERTO' && note.status !== 'EM_EXECUCAO') {
    return 'Sem Conserto só pode ser usado quando a O.S. está Em Execução.';
  }
  if (nextStatus === 'EXCLUIDA' && FINAL_STATUSES.has(note.status)) {
    return 'Reabra a O.S. antes de excluí-la.';
  }

  const isMainWorkflowTarget = MANUAL_NOTE_WORKFLOW.includes(nextStatus);
  const isContextualFinalTarget = nextStatus === 'RECUSADO'
    || nextStatus === 'SEM_CONSERTO'
    || nextStatus === 'EXCLUIDA';
  return isMainWorkflowTarget || isContextualFinalTarget
    ? null
    : 'Status de destino inválido para movimentação manual.';
}

export function getManualNoteStatusTargets(note: IntakeNote): NoteStatus[] {
  return MANUAL_NOTE_WORKFLOW.filter(
    (status) => getNoteStatusTransitionBlockReason(note, status) === null,
  );
}

export function shouldConfirmNoteStatusTransition(note: IntakeNote, nextStatus: NoteStatus): boolean {
  if (isBillableNoteStatus(note.status) || isBillableNoteStatus(nextStatus)) return true;

  const currentIndex = MANUAL_NOTE_WORKFLOW.indexOf(note.status);
  const nextIndex = MANUAL_NOTE_WORKFLOW.indexOf(nextStatus);
  return currentIndex < 0 || nextIndex < 0 || Math.abs(nextIndex - currentIndex) > 1;
}

export function applyNoteStatusTransition({
  nextStatus,
  previousNote,
  changedAt = new Date().toISOString(),
}: StatusTransitionInput): IntakeNote {
  const blockReason = getNoteStatusTransitionBlockReason(previousNote, nextStatus);
  if (blockReason) throw new Error(blockReason);

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
