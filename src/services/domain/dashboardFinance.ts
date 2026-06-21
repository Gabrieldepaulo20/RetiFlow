import type { AccountPayable, IntakeNote, NoteStatus, PayableStatus } from '@/types';

export const DASHBOARD_REVENUE_STATUSES = new Set<NoteStatus>(['ENTREGUE', 'RECUSADO', 'SEM_CONSERTO']);
export const DASHBOARD_PAID_PAYABLE_STATUSES = new Set<PayableStatus>(['PAGO', 'PARCIAL']);
// Marco real de operação do Retiflow para contas pagas/lucro: antes disso não há base completa de saídas.
export const DASHBOARD_ACCOUNTING_START_DATE = '2026-06-01';
export const DASHBOARD_ACCOUNTING_START_LABEL = '01/06/2026';
export const DASHBOARD_ACCOUNTING_START_TIME = new Date(`${DASHBOARD_ACCOUNTING_START_DATE}T00:00:00`).getTime();

export type DashboardDateRange = {
  startTime: number;
  endTime: number;
};

export function getDashboardRevenueDate(note: Pick<IntakeNote, 'createdAt'>): string {
  return note.createdAt;
}

function isDateInsideRange(value: string | null | undefined, range: DashboardDateRange): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= range.startTime && time <= range.endTime;
}

export function isDashboardAccountingDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
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
    && Number.isFinite(new Date(getDashboardRevenueDate(note)).getTime());
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

export function getPayablePaidAmount(payable: Pick<AccountPayable, 'paidAmount' | 'finalAmount'>): number {
  return payable.paidAmount ?? payable.finalAmount;
}
