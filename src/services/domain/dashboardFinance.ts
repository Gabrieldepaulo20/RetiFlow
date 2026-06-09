import type { AccountPayable, IntakeNote, NoteStatus, PayableStatus } from '@/types';

export const DASHBOARD_REVENUE_STATUSES = new Set<NoteStatus>(['FINALIZADO']);
export const DASHBOARD_PAID_PAYABLE_STATUSES = new Set<PayableStatus>(['PAGO', 'PARCIAL']);

export type DashboardDateRange = {
  startTime: number;
  endTime: number;
};

export function getDashboardRevenueDate(note: Pick<IntakeNote, 'finalizedAt' | 'updatedAt' | 'createdAt'>): string {
  return note.finalizedAt ?? note.updatedAt ?? note.createdAt;
}

function isDateInsideRange(value: string | null | undefined, range: DashboardDateRange): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= range.startTime && time <= range.endTime;
}

export function getFinalizedRevenueNotesInRange<T extends Pick<IntakeNote, 'status' | 'finalizedAt' | 'updatedAt' | 'createdAt'>>(
  notes: T[],
  range: DashboardDateRange,
): T[] {
  return notes.filter((note) => (
    DASHBOARD_REVENUE_STATUSES.has(note.status)
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
    && isDateInsideRange(payable.paidAt, range)
  ));
}

export function getPayablePaidAmount(payable: Pick<AccountPayable, 'paidAmount' | 'finalAmount'>): number {
  return payable.paidAmount ?? payable.finalAmount;
}
