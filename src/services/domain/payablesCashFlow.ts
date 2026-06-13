import { addDays, format } from 'date-fns';
import type { AccountPayable, PayableCategory } from '@/types';
import { calculatePayableRemainingBalance, isPayableOverdue } from '@/services/domain/payables';

export type PayablesCashFlowSummary = {
  nextSevenTotal: number;
  nextSevenCount: number;
  nextThirtyTotal: number;
  nextThirtyCount: number;
  overdueTotal: number;
  overdueCount: number;
  laborTotal: number;
  laborCount: number;
  nextDue: AccountPayable[];
};

const PENDING_CASH_FLOW_STATUSES = new Set(['PENDENTE', 'PARCIAL', 'AGENDADO']);
const LABOR_KEYWORDS = ['salário', 'salario', 'folha', 'funcion', 'mão de obra', 'mao de obra'];

function isPendingCashFlowPayable(payable: AccountPayable) {
  return payable.deletedAt == null && PENDING_CASH_FLOW_STATUSES.has(payable.status);
}

export function isLaborRelatedPayable(payable: AccountPayable, categoryName?: string | null) {
  const haystack = `${payable.title} ${payable.supplierName ?? ''} ${categoryName ?? ''}`.toLowerCase();
  return LABOR_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function calculatePayablesCashFlowSummary(input: {
  payables: AccountPayable[];
  categories: PayableCategory[];
  now?: Date;
}): PayablesCashFlowSummary {
  const now = input.now ?? new Date();
  const todayISO = format(now, 'yyyy-MM-dd');
  const inSevenDaysISO = format(addDays(now, 7), 'yyyy-MM-dd');
  const inThirtyDaysISO = format(addDays(now, 30), 'yyyy-MM-dd');
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const pendingSorted = input.payables
    .filter(isPendingCashFlowPayable)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const inRange = (payable: AccountPayable, endDate: string) => payable.dueDate >= todayISO && payable.dueDate <= endDate;
  const nextSeven = pendingSorted.filter((payable) => inRange(payable, inSevenDaysISO));
  const nextThirty = pendingSorted.filter((payable) => inRange(payable, inThirtyDaysISO));
  const overdue = pendingSorted.filter((payable) => isPayableOverdue(payable, now));
  const laborPayables = pendingSorted.filter((payable) => isLaborRelatedPayable(payable, categoryById.get(payable.categoryId)?.name));

  return {
    nextSevenTotal: nextSeven.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0),
    nextSevenCount: nextSeven.length,
    nextThirtyTotal: nextThirty.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0),
    nextThirtyCount: nextThirty.length,
    overdueTotal: overdue.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0),
    overdueCount: overdue.length,
    laborTotal: laborPayables.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0),
    laborCount: laborPayables.length,
    nextDue: pendingSorted.slice(0, 5),
  };
}
