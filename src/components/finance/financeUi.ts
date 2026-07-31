import type { FinanceiroLancamento, FinanceiroOrigem } from '@/api/supabase/financeiro';

export const ORIGEM_LABELS: Record<FinanceiroOrigem, string> = {
  NOTA_SERVICO: 'O.S.',
  FECHAMENTO: 'Fechamento',
  CONTA_PAGAR: 'Conta a pagar',
  RECEBIVEL_MANUAL: 'Receita manual',
  MOVIMENTO_MANUAL: 'Movimento manual',
  SALDO_INICIAL: 'Saldo inicial',
  APORTE: 'Aporte',
  REEMBOLSO: 'Reembolso',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA: 'Transferência',
  ESTORNO: 'Estorno',
};

export const STATUS_STYLES = {
  PENDENTE: 'border-amber-200 bg-amber-50 text-amber-800',
  PARCIAL: 'border-sky-200 bg-sky-50 text-sky-800',
  PAGO: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  CANCELADO: 'border-slate-200 bg-slate-100 text-slate-600',
  REVISAR: 'border-rose-200 bg-rose-50 text-rose-800',
} as const;

export const STATUS_LABELS = {
  PENDENTE: 'Pendente',
  PARCIAL: 'Parcial',
  PAGO: 'Realizado',
  CANCELADO: 'Cancelado',
  REVISAR: 'Revisar',
} as const;

export function brl(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

export function dateBR(value: string | null | undefined) {
  if (!value) return '—';
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

export function moneyInput(value: string) {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function makeIdempotencyKey(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `financeiro-ui:${prefix}:${random}`;
}

export function sourceLink(item: FinanceiroLancamento) {
  if (!item.origemId) return null;
  if (item.origem === 'NOTA_SERVICO') return `/notas-entrada/${item.origemId}`;
  if (item.origem === 'FECHAMENTO') return '/fechamento';
  if (item.origem === 'CONTA_PAGAR') {
    return `/financeiro?tab=saidas&modal=details&id=${item.origemId}`;
  }
  return null;
}
