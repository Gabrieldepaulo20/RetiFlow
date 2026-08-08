export type ClosingFinancialStatus = 'PENDENTE' | 'PARCIAL' | 'PAGO';

export interface ClosingFinancialSummary {
  total: number;
  received: number;
  open: number;
  status: ClosingFinancialStatus;
  /** Prévia ainda não persistida: os valores não podem ser rotulados como recebidos. */
  planned?: boolean;
}

export interface ClosingFinancialSummaryDisplay {
  total: number;
  received: number;
  open: number;
  isPaid: boolean;
  isPlanned: boolean;
}

const safeMoney = (value: number) => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

/**
 * Mantém PDF e prévia HTML com a mesma leitura financeira e protege o layout
 * contra números inválidos vindos de snapshots legados.
 */
export function getClosingFinancialSummaryDisplay(
  summary: ClosingFinancialSummary,
): ClosingFinancialSummaryDisplay {
  return {
    total: safeMoney(summary.total),
    received: safeMoney(summary.received),
    open: safeMoney(summary.open),
    isPaid: summary.status === 'PAGO',
    isPlanned: summary.planned === true,
  };
}
