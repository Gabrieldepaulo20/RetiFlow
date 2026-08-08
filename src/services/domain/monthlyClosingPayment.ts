/**
 * Regras financeiras puras do pagamento de um fechamento mensal.
 *
 * Todos os valores deste módulo são inteiros em centavos. A conversão para/de
 * reais deve acontecer somente nas bordas (formulário, API e apresentação).
 */

export type ClosingInitialPaymentMode = 'NONE' | 'PERCENT_50' | 'PERCENT_60' | 'CUSTOM';

export type ClosingInitialPaymentPlan =
  | { mode: 'NONE' }
  | { mode: 'PERCENT_50' }
  | { mode: 'PERCENT_60' }
  | { mode: 'CUSTOM'; amountCents: number };

export type ClosingPaymentValidationError =
  | 'INVALID_TOTAL'
  | 'INVALID_AMOUNT'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_EXCEEDS_TOTAL'
  | 'FIRST_PAYMENT_REQUIRED'
  | 'CLOSING_ALREADY_PAID'
  | 'SECOND_PAYMENT_MUST_MATCH_BALANCE';

export interface ClosingPaymentValidation {
  valid: boolean;
  error: ClosingPaymentValidationError | null;
}

export interface ClosingInitialPaymentCalculation extends ClosingPaymentValidation {
  mode: ClosingInitialPaymentMode;
  totalCents: number;
  amountCents: number;
  balanceCents: number;
  hasPayment: boolean;
}

export interface ClosingSecondPaymentCalculation extends ClosingPaymentValidation {
  totalCents: number;
  receivedCents: number;
  amountCents: number;
  balanceAfterPaymentCents: number;
}

export type ClosingPaymentSummaryStatus = 'PENDENTE' | 'PARCIAL' | 'PAGO';

export interface ClosingPaymentSummaryInput {
  totalCents: number;
  receivedCents: number;
}

export interface ClosingPaymentSummary {
  totalCents: number;
  receivedCents: number;
  openCents: number;
  overpaidCents: number;
  status: ClosingPaymentSummaryStatus;
  progressPercent: number;
  hasInvalidValues: boolean;
}

export interface ClosingReminderCandidate extends ClosingPaymentSummaryInput {
  closingId: string;
  clientId: string;
}

export interface OpenClosingReminderAggregate {
  closingCount: number;
  clientCount: number;
  totalCents: number;
  receivedCents: number;
  openCents: number;
}

const isNonNegativeCents = (value: number) =>
  Number.isSafeInteger(value) && value >= 0;

const normalizeCents = (value: number) => (isNonNegativeCents(value) ? value : 0);

/** Converte reais para centavos, arredondando uma única vez na borda. */
export const moneyToCents = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
};

/** Converte centavos válidos para reais; valores inválidos viram zero. */
export const centsToMoney = (value: number) => normalizeCents(value) / 100;

const percentageOfCents = (totalCents: number, percent: 50 | 60) => {
  // Separa centenas e resto para manter a multiplicação dentro do intervalo
  // seguro mesmo quando o total se aproxima de Number.MAX_SAFE_INTEGER.
  const hundreds = Math.floor(totalCents / 100);
  const remainder = totalCents % 100;
  return (hundreds * percent) + Math.round((remainder * percent) / 100);
};

export const validateFirstClosingPayment = (
  totalCents: number,
  amountCents: number,
): ClosingPaymentValidation => {
  if (!isNonNegativeCents(totalCents) || totalCents === 0) {
    return { valid: false, error: 'INVALID_TOTAL' };
  }
  if (!isNonNegativeCents(amountCents)) {
    return { valid: false, error: 'INVALID_AMOUNT' };
  }
  if (amountCents === 0) {
    return { valid: false, error: 'PAYMENT_REQUIRED' };
  }
  if (amountCents > totalCents) {
    return { valid: false, error: 'PAYMENT_EXCEEDS_TOTAL' };
  }
  return { valid: true, error: null };
};

/**
 * Calcula a entrada planejada e o saldo do fechamento.
 * `NONE` é um plano válido sem movimentação; os demais modos precisam formar
 * uma primeira parcela válida.
 */
export const calculateInitialClosingPayment = (
  totalCents: number,
  plan: ClosingInitialPaymentPlan,
): ClosingInitialPaymentCalculation => {
  const normalizedTotal = normalizeCents(totalCents);

  if (plan.mode === 'NONE') {
    return {
      mode: plan.mode,
      totalCents: normalizedTotal,
      amountCents: 0,
      balanceCents: normalizedTotal,
      hasPayment: false,
      valid: isNonNegativeCents(totalCents),
      error: isNonNegativeCents(totalCents) ? null : 'INVALID_TOTAL',
    };
  }

  const amountCents = plan.mode === 'CUSTOM'
    ? normalizeCents(plan.amountCents)
    : percentageOfCents(normalizedTotal, plan.mode === 'PERCENT_50' ? 50 : 60);
  const validation = validateFirstClosingPayment(
    totalCents,
    plan.mode === 'CUSTOM' ? plan.amountCents : amountCents,
  );

  return {
    mode: plan.mode,
    totalCents: normalizedTotal,
    amountCents,
    balanceCents: Math.max(0, normalizedTotal - amountCents),
    hasPayment: amountCents > 0,
    ...validation,
  };
};

/** Retorna o valor obrigatório da segunda parcela: todo o saldo ainda aberto. */
export const calculateSecondClosingPayment = (
  totalCents: number,
  receivedCents: number,
): ClosingSecondPaymentCalculation => {
  const normalizedTotal = normalizeCents(totalCents);
  const normalizedReceived = normalizeCents(receivedCents);

  if (!isNonNegativeCents(totalCents) || totalCents === 0) {
    return {
      totalCents: normalizedTotal,
      receivedCents: normalizedReceived,
      amountCents: 0,
      balanceAfterPaymentCents: 0,
      valid: false,
      error: 'INVALID_TOTAL',
    };
  }
  if (!isNonNegativeCents(receivedCents)) {
    return {
      totalCents: normalizedTotal,
      receivedCents: normalizedReceived,
      amountCents: normalizedTotal,
      balanceAfterPaymentCents: 0,
      valid: false,
      error: 'INVALID_AMOUNT',
    };
  }
  if (normalizedReceived === 0) {
    return {
      totalCents: normalizedTotal,
      receivedCents: normalizedReceived,
      amountCents: normalizedTotal,
      balanceAfterPaymentCents: 0,
      valid: false,
      error: 'FIRST_PAYMENT_REQUIRED',
    };
  }
  if (normalizedReceived >= normalizedTotal) {
    return {
      totalCents: normalizedTotal,
      receivedCents: normalizedReceived,
      amountCents: 0,
      balanceAfterPaymentCents: 0,
      valid: false,
      error: 'CLOSING_ALREADY_PAID',
    };
  }

  return {
    totalCents: normalizedTotal,
    receivedCents: normalizedReceived,
    amountCents: normalizedTotal - normalizedReceived,
    balanceAfterPaymentCents: 0,
    valid: true,
    error: null,
  };
};

export const validateSecondClosingPayment = (
  totalCents: number,
  receivedCents: number,
  amountCents: number,
): ClosingPaymentValidation => {
  const calculation = calculateSecondClosingPayment(totalCents, receivedCents);
  if (!calculation.valid) return { valid: false, error: calculation.error };
  if (!isNonNegativeCents(amountCents)) {
    return { valid: false, error: 'INVALID_AMOUNT' };
  }
  if (amountCents !== calculation.amountCents) {
    return { valid: false, error: 'SECOND_PAYMENT_MUST_MATCH_BALANCE' };
  }
  return { valid: true, error: null };
};

export const isExactSecondClosingPayment = (
  totalCents: number,
  receivedCents: number,
  amountCents: number,
) => validateSecondClosingPayment(totalCents, receivedCents, amountCents).valid;

export const buildClosingPaymentSummary = ({
  totalCents,
  receivedCents,
}: ClosingPaymentSummaryInput): ClosingPaymentSummary => {
  const validTotal = isNonNegativeCents(totalCents);
  const validReceived = isNonNegativeCents(receivedCents);
  const normalizedTotal = normalizeCents(totalCents);
  const normalizedReceived = normalizeCents(receivedCents);
  const openCents = Math.max(0, normalizedTotal - normalizedReceived);
  const overpaidCents = Math.max(0, normalizedReceived - normalizedTotal);

  const status: ClosingPaymentSummaryStatus = normalizedTotal > 0 && openCents === 0
    ? 'PAGO'
    : normalizedReceived > 0
      ? 'PARCIAL'
      : 'PENDENTE';

  return {
    totalCents: normalizedTotal,
    receivedCents: normalizedReceived,
    openCents,
    overpaidCents,
    status,
    progressPercent: normalizedTotal > 0
      ? Math.min(100, Math.round((normalizedReceived / normalizedTotal) * 10_000) / 100)
      : 0,
    hasInvalidValues: !validTotal || !validReceived || overpaidCents > 0,
  };
};

/** Mantém somente fechamentos com saldo, opcionalmente de um único cliente. */
export const filterOpenClosingReminders = <T extends ClosingReminderCandidate>(
  candidates: readonly T[],
  clientId?: string,
) => candidates.filter((candidate) => (
  (!clientId || candidate.clientId === clientId)
  && buildClosingPaymentSummary(candidate).openCents > 0
));

/** Consolida o lembrete sem somar fechamentos já pagos ou de outro cliente. */
export const aggregateOpenClosingReminders = <T extends ClosingReminderCandidate>(
  candidates: readonly T[],
  clientId?: string,
): OpenClosingReminderAggregate => {
  const openCandidates = filterOpenClosingReminders(candidates, clientId);
  const clientIds = new Set<string>();

  return openCandidates.reduce<OpenClosingReminderAggregate>((aggregate, candidate) => {
    const summary = buildClosingPaymentSummary(candidate);
    clientIds.add(candidate.clientId);
    return {
      closingCount: aggregate.closingCount + 1,
      clientCount: clientIds.size,
      totalCents: aggregate.totalCents + summary.totalCents,
      receivedCents: aggregate.receivedCents + summary.receivedCents,
      openCents: aggregate.openCents + summary.openCents,
    };
  }, {
    closingCount: 0,
    clientCount: 0,
    totalCents: 0,
    receivedCents: 0,
    openCents: 0,
  });
};
