import { BILLABLE_STATUSES } from '@/types';
import type { AccountPayable, IntakeNote, PayableStatus } from '@/types';

/**
 * Receita do Dashboard usa a mesma base faturável do sistema (fonte única em @/types),
 * evitando que o conjunto divirja silenciosamente de BILLABLE_STATUSES.
 */
export const DASHBOARD_REVENUE_STATUSES = BILLABLE_STATUSES;
export const DASHBOARD_PAID_PAYABLE_STATUSES = new Set<PayableStatus>(['PAGO', 'PARCIAL']);
// Marco real de operação do Retiflow para contas pagas/lucro: antes disso não há base completa de saídas.
export const DASHBOARD_ACCOUNTING_START_DATE = '2026-06-01';
export const DASHBOARD_ACCOUNTING_START_LABEL = '01/06/2026';
export const DASHBOARD_ACCOUNTING_START_TIME = new Date(`${DASHBOARD_ACCOUNTING_START_DATE}T00:00:00`).getTime();

export type DashboardDateRange = {
  startTime: number;
  endTime: number;
};

/**
 * Epoch ms para comparação de período. Datas "só data" (YYYY-MM-DD), como a
 * competência/vencimento das contas, são interpretadas como meia-noite LOCAL —
 * casando com os limites de período (também construídos em horário local via date-fns).
 * Sem isto, new Date('2026-06-01') vira meia-noite UTC = 31/05 21:00 em BR (UTC-3),
 * jogando a conta para o mês anterior e para o lado errado do corte contábil.
 */
export function toComparableTime(value: string | null | undefined): number {
  if (!value) return NaN;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  return new Date(normalized).getTime();
}

export function getDashboardRevenueDate(note: Pick<IntakeNote, 'createdAt'>): string {
  return note.createdAt;
}

function isDateInsideRange(value: string | null | undefined, range: DashboardDateRange): boolean {
  const time = toComparableTime(value);
  return Number.isFinite(time) && time >= range.startTime && time <= range.endTime;
}

export function isDashboardAccountingDate(value: string | null | undefined): boolean {
  const time = toComparableTime(value);
  return Number.isFinite(time) && time >= DASHBOARD_ACCOUNTING_START_TIME;
}

export function clampDashboardAccountingRange(range: DashboardDateRange): DashboardDateRange {
  return {
    startTime: Math.max(range.startTime, DASHBOARD_ACCOUNTING_START_TIME),
    endTime: range.endTime,
  };
}

export function isDashboardRevenueEligibleNote<T extends Pick<IntakeNote, 'status' | 'createdAt'>>(
  note: T,
): boolean {
  return DASHBOARD_REVENUE_STATUSES.has(note.status)
    && Number.isFinite(toComparableTime(getDashboardRevenueDate(note)));
}

export function getFinalizedRevenueNotesInRange<T extends Pick<IntakeNote, 'status' | 'createdAt'>>(
  notes: T[],
  range: DashboardDateRange,
): T[] {
  return notes.filter((note) => (
    isDashboardRevenueEligibleNote(note)
    && isDateInsideRange(getDashboardRevenueDate(note), range)
  ));
}

export function getPaidPayablesInRange<T extends Pick<AccountPayable, 'status' | 'paidAt' | 'deletedAt'>>(
  payables: T[],
  range: DashboardDateRange,
): T[] {
  return payables.filter((payable) => (
    payable.deletedAt == null
    && DASHBOARD_PAID_PAYABLE_STATUSES.has(payable.status)
    && isDashboardAccountingDate(payable.paidAt)
    && isDateInsideRange(payable.paidAt, range)
  ));
}

export function getPayablePaidAmount(payable: Pick<AccountPayable, 'status' | 'paidAmount' | 'finalAmount'>): number {
  if (payable.paidAmount != null) return payable.paidAmount;
  // PARCIAL sem paidAmount não pode assumir o valor cheio (superestimaria a saída);
  // só PAGO equivale ao finalAmount.
  return payable.status === 'PARCIAL' ? 0 : payable.finalAmount;
}
