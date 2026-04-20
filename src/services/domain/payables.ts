import { differenceInCalendarDays, format, isBefore, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AccountPayable,
  PayableAttachmentFileType,
  PayableCategory,
  PayableDisplayStatus,
  PayableHistoryAction,
  PayableStatus,
  PaymentMethod,
  RecurrenceType,
} from '@/types';

// ─── Limites de campo ────────────────────────────────────────────────────────
// Padrão: seguir CUSTOMER_FIELD_LIMITS de customers.ts

export const PAYABLE_FIELD_LIMITS = {
  title:        120,
  supplierName:  80,
  docNumber:     60,
  observations: 500,
  paymentNotes: 300,
} as const;

// ─── Categorias padrão ───────────────────────────────────────────────────────
// IDs estáveis para seed — não alterar sem migrar os registros existentes.

export const DEFAULT_PAYABLE_CATEGORIES: Omit<PayableCategory, 'createdAt'>[] = [
  { id: 'paycat-1', name: 'Peças e Materiais',  color: 'bg-blue-100 text-blue-800',    icon: 'Wrench',         isActive: true },
  { id: 'paycat-2', name: 'Utilities',           color: 'bg-yellow-100 text-yellow-800', icon: 'Zap',            isActive: true },
  { id: 'paycat-3', name: 'Aluguel',             color: 'bg-purple-100 text-purple-800', icon: 'Building2',      isActive: true },
  { id: 'paycat-4', name: 'Impostos e Taxas',    color: 'bg-red-100 text-red-800',       icon: 'Landmark',       isActive: true },
  { id: 'paycat-5', name: 'Mão de Obra',         color: 'bg-green-100 text-green-800',   icon: 'Users',          isActive: true },
  { id: 'paycat-6', name: 'Equipamentos',        color: 'bg-cyan-100 text-cyan-800',     icon: 'Package',        isActive: true },
  { id: 'paycat-7', name: 'Serviços Gerais',     color: 'bg-gray-100 text-gray-800',     icon: 'Settings2',      isActive: true },
  { id: 'paycat-8', name: 'Outros',              color: 'bg-slate-100 text-slate-800',   icon: 'MoreHorizontal', isActive: true },
];

// ─── Tipo auxiliar de urgência de vencimento ─────────────────────────────────

export type PayableDueDateUrgency =
  | 'overdue'    // vencida (dueDate < hoje, status ativo)
  | 'critical'   // vence hoje (0 dias) ou amanhã (1 dia)
  | 'warning'    // vence em 2–7 dias
  | 'normal'     // vence em 8+ dias
  | 'paid'       // já paga ou parcialmente paga sem urgência
  | 'cancelled'; // cancelada ou excluída

// ─── Guards de status ────────────────────────────────────────────────────────

/**
 * Retorna o status de exibição da conta.
 * Converte PENDENTE → VENCIDO quando dueDate < hoje.
 * Não altera o status armazenado — é puramente derivado em runtime.
 */
export function getPayableDisplayStatus(payable: AccountPayable): PayableDisplayStatus {
  if (payable.status !== 'PENDENTE') return payable.status;
  const due = startOfDay(parseISO(payable.dueDate));
  const today = startOfDay(new Date());
  return isBefore(due, today) ? 'VENCIDO' : 'PENDENTE';
}

/**
 * True se a conta está vencida (status PENDENTE ou PARCIAL + dueDate < hoje).
 */
export function isPayableOverdue(payable: AccountPayable): boolean {
  if (payable.status !== 'PENDENTE' && payable.status !== 'PARCIAL') return false;
  const due = startOfDay(parseISO(payable.dueDate));
  const today = startOfDay(new Date());
  return isBefore(due, today);
}

// ─── Guards de ação ──────────────────────────────────────────────────────────

/**
 * True se a conta pode ser editada de qualquer forma.
 * CANCELADO e contas excluídas (deletedAt) são somente leitura.
 */
export function canEditPayable(payable: AccountPayable): boolean {
  return payable.deletedAt == null && payable.status !== 'CANCELADO';
}

/**
 * True se a conta está em modo de edição restrita.
 * Contas PAGAS só permitem alterar título, observações e anexos.
 */
export function isPayableEditRestricted(payable: AccountPayable): boolean {
  return payable.status === 'PAGO';
}

/**
 * True se a conta pode ser excluída (exclusão lógica).
 * Toda conta não excluída pode ser deletada — a distinção é na confirmação.
 */
export function canDeletePayable(payable: AccountPayable): boolean {
  return payable.deletedAt == null;
}

/**
 * True se a exclusão requer confirmação dupla (digitação manual).
 * Aplica-se a contas PAGAS ou PARCIAL — dados financeiros sensíveis.
 */
export function requiresDoubleConfirmToDelete(payable: AccountPayable): boolean {
  return payable.status === 'PAGO' || payable.status === 'PARCIAL';
}

/**
 * True se é possível registrar pagamento (total ou parcial) para a conta.
 */
export function canRegisterPayment(payable: AccountPayable): boolean {
  return (
    payable.deletedAt == null &&
    (payable.status === 'PENDENTE' ||
      payable.status === 'PARCIAL' ||
      payable.status === 'AGENDADO')
  );
}

/**
 * True se a conta pode ser cancelada.
 * Não faz sentido cancelar o que já está pago ou já foi cancelado.
 */
export function canCancelPayable(payable: AccountPayable): boolean {
  return (
    payable.deletedAt == null &&
    payable.status !== 'PAGO' &&
    payable.status !== 'CANCELADO'
  );
}

// ─── Cálculos financeiros ────────────────────────────────────────────────────

/**
 * Calcula o valor final da conta: originalAmount + juros - desconto.
 * Retorna no mínimo 0 (desconto não pode gerar valor negativo).
 * Arredondado a 2 casas decimais para evitar drift de ponto flutuante.
 */
export function calculatePayableFinalAmount(
  originalAmount: number,
  interest = 0,
  discount = 0,
): number {
  const result = originalAmount + interest - discount;
  return Math.max(0, Number(result.toFixed(2)));
}

/**
 * Calcula o saldo devedor restante de uma conta parcialmente paga.
 * Retorna 0 se não há paidAmount ou se já foi totalmente pago.
 */
export function calculatePayableRemainingBalance(payable: AccountPayable): number {
  if (payable.status === 'PAGO') return 0;
  if (!payable.paidAmount) return payable.finalAmount;
  const remaining = payable.finalAmount - payable.paidAmount;
  return Math.max(0, Number(remaining.toFixed(2)));
}

// ─── Cálculos de datas ───────────────────────────────────────────────────────

/**
 * Diferença em dias corridos entre hoje e o vencimento.
 * Positivo = dias restantes; negativo = dias em atraso; null = não aplicável.
 * Não considera fuso horário — usa startOfDay para comparação de datas.
 */
export function getDaysRelativeToDue(payable: AccountPayable): number | null {
  if (payable.status === 'PAGO' || payable.status === 'CANCELADO') return null;
  const due = startOfDay(parseISO(payable.dueDate));
  const today = startOfDay(new Date());
  return differenceInCalendarDays(due, today);
}

/**
 * Dias restantes até o vencimento. Retorna null se vencida, paga ou cancelada.
 */
export function getDaysUntilDue(payable: AccountPayable): number | null {
  const diff = getDaysRelativeToDue(payable);
  if (diff === null || diff < 0) return null;
  return diff;
}

/**
 * Dias em atraso. Retorna null se não está vencida, paga ou cancelada.
 */
export function getDaysOverdue(payable: AccountPayable): number | null {
  if (!isPayableOverdue(payable)) return null;
  const diff = getDaysRelativeToDue(payable);
  if (diff === null || diff >= 0) return null;
  return Math.abs(diff);
}

/**
 * Classifica a urgência do vencimento para uso em cores e ícones na UI.
 */
export function getDueDateUrgencyLevel(payable: AccountPayable): PayableDueDateUrgency {
  if (payable.deletedAt != null) return 'cancelled';
  if (payable.status === 'CANCELADO') return 'cancelled';
  if (payable.status === 'PAGO') return 'paid';

  const diff = getDaysRelativeToDue(payable);
  if (diff === null) return 'normal';
  if (diff < 0) return 'overdue';
  if (diff <= 1) return 'critical';
  if (diff <= 7) return 'warning';
  return 'normal';
}

// ─── Labels humanizados ──────────────────────────────────────────────────────

/**
 * Retorna um texto legível sobre o vencimento da conta.
 * Exemplos: "Vencida há 3 dias", "Vence hoje", "Vence em 5 dias", "Paga em 10/04/2026".
 */
export function formatPayableDueDateLabel(payable: AccountPayable): string {
  if (payable.status === 'CANCELADO') return 'Cancelada';

  if (payable.status === 'PAGO') {
    if (payable.paidAt) {
      return `Paga em ${format(parseISO(payable.paidAt), 'dd/MM/yyyy', { locale: ptBR })}`;
    }
    return 'Paga';
  }

  const diff = getDaysRelativeToDue(payable);

  if (diff === null) {
    return format(parseISO(payable.dueDate), 'dd/MM/yyyy', { locale: ptBR });
  }

  if (diff < 0) {
    const days = Math.abs(diff);
    return days === 1 ? 'Vencida há 1 dia' : `Vencida há ${days} dias`;
  }
  if (diff === 0) return 'Vence hoje';
  if (diff === 1) return 'Vence amanhã';
  return `Vence em ${diff} dias`;
}

/**
 * Retorna um label de recorrência/parcela para exibição em badge.
 * Exemplos: "Parcela 2/6", "Recorrente — Mensal", null se não aplicável.
 */
export function formatPayableRecurrenceLabel(
  payable: AccountPayable,
  recurrenceLabel: string,
): string | null {
  if (payable.recurrence === 'NENHUMA' && !payable.totalInstallments) return null;

  if (payable.totalInstallments && payable.totalInstallments > 1) {
    const index = payable.recurrenceIndex ?? 1;
    return `Parcela ${index}/${payable.totalInstallments}`;
  }

  if (payable.recurrence !== 'NENHUMA') {
    return `Recorrente — ${recurrenceLabel}`;
  }

  return null;
}

// ─── Deduplicação ────────────────────────────────────────────────────────────

/**
 * Gera uma chave normalizada para detecção de duplicidade.
 * Considera: fornecedor + número do documento + valor + vencimento.
 * Retorna null quando não há dados suficientes para uma comparação confiável
 * (sem fornecedor identificável — nesse caso, skip da verificação).
 *
 * Uso: comparar a chave gerada com registros existentes não cancelados.
 */
export function generatePayableDuplicateKey(
  p: Pick<
    AccountPayable,
    'supplierId' | 'supplierName' | 'docNumber' | 'originalAmount' | 'dueDate'
  >,
): string | null {
  const supplierKey = p.supplierId ?? p.supplierName?.toLowerCase().trim();
  if (!supplierKey) return null;

  const docKey = p.docNumber?.toLowerCase().trim() ?? '';
  const amountKey = p.originalAmount.toFixed(2);
  const dateKey = p.dueDate.split('T')[0]; // apenas YYYY-MM-DD

  return [supplierKey, docKey, amountKey, dateKey].join('|');
}

/**
 * Verifica se existe duplicidade entre a conta candidata e um array de contas existentes.
 * Ignora canceladas e excluídas (não faz sentido bloquear por registros inativos).
 *
 * Retorna a conta duplicada encontrada, ou null se não houver.
 */
export function findPayableDuplicate(
  candidate: Pick<AccountPayable, 'supplierId' | 'supplierName' | 'docNumber' | 'originalAmount' | 'dueDate'>,
  existing: AccountPayable[],
  excludeId?: string,
): AccountPayable | null {
  const candidateKey = generatePayableDuplicateKey(candidate);
  if (!candidateKey) return null;

  return (
    existing.find((p) => {
      if (p.id === excludeId) return false;
      if (p.deletedAt != null) return false;
      if (p.status === 'CANCELADO') return false;
      return generatePayableDuplicateKey(p) === candidateKey;
    }) ?? null
  );
}

// ─── Construção de log de histórico ─────────────────────────────────────────

interface BuildPayableHistoryEntryInput {
  payableId: string;
  action: PayableHistoryAction;
  userId: string;
  extra?: {
    oldStatus?: PayableStatus;
    newStatus?: PayableStatus | 'VENCIDO';
    paidAmount?: number;
    finalAmount?: number;
    filename?: string;
    fieldChanges?: AccountPayable['id'] extends string
      ? Array<{ field: string; oldValue: string; newValue: string }>
      : never;
  };
}

/**
 * Constrói a descrição textual de um evento de histórico.
 * Retorna objeto parcial de PayableHistory — falta apenas o `id` (gerado pelo caller).
 */
export function buildPayableHistoryDescription(
  input: BuildPayableHistoryEntryInput,
): Omit<import('@/types').PayableHistory, 'id'> {
  const { payableId, action, userId, extra = {} } = input;
  const now = new Date().toISOString();

  let description = '';

  switch (action) {
    case 'CREATED':
      description = 'Conta cadastrada no sistema.';
      break;

    case 'UPDATED':
      description = extra.fieldChanges?.length
        ? `${extra.fieldChanges.length} campo(s) editado(s).`
        : 'Informações da conta atualizadas.';
      break;

    case 'PAID':
      description = extra.paidAmount != null
        ? `Pagamento de R$ ${extra.paidAmount.toFixed(2).replace('.', ',')} registrado.`
        : 'Pagamento integral registrado.';
      break;

    case 'PARTIAL_PAID': {
      const paid = extra.paidAmount ?? 0;
      const total = extra.finalAmount ?? 0;
      const remaining = Math.max(0, total - paid);
      description =
        `Pagamento parcial de R$ ${paid.toFixed(2).replace('.', ',')} registrado. ` +
        `Saldo devedor: R$ ${remaining.toFixed(2).replace('.', ',')}.`;
      break;
    }

    case 'CANCELLED':
      description = 'Conta cancelada.';
      break;

    case 'DELETED':
      description = 'Conta excluída.';
      break;

    case 'ATTACHMENT_ADDED':
      description = extra.filename
        ? `Arquivo "${extra.filename}" anexado.`
        : 'Novo anexo adicionado.';
      break;
  }

  return {
    payableId,
    action,
    description,
    fieldChanges: action === 'UPDATED' ? extra.fieldChanges : undefined,
    userId,
    createdAt: now,
  };
}

// ─── Re-exports convenientes ─────────────────────────────────────────────────
// Evita que os consumers precisem importar de dois lugares para uso conjunto.

export type {
  AccountPayable,
  PayableAttachmentFileType,
  PayableCategory,
  PayableDisplayStatus,
  PayableHistoryAction,
  PayableStatus,
  PaymentMethod,
  RecurrenceType,
};
