/**
 * Modelo de apresentação da O.S. — derivações puras usadas pelo modal
 * (`NoteDetailModal`) e pela página (`IntakeNoteDetail`), para que as duas telas
 * mostrem exatamente os mesmos números e etapas.
 *
 * Só lê campos que já existem em `IntakeNote`. Nada aqui inventa dado: quando um
 * campo opcional não vem preenchido, a função devolve `null` e o bloco
 * correspondente é omitido na tela.
 */

import {
  BILLABLE_STATUSES,
  FINAL_STATUSES,
  NoteStatus,
  type IntakeNote,
  type IntakeProduct,
  type IntakeService,
} from '@/types';

/**
 * Etapas do fluxo principal, na ordem do stepper. Os finais alternativos
 * (RECUSADO/SEM_CONSERTO/EXCLUIDA) ficam fora e entram como etapa extra.
 */
export const OS_MAIN_FLOW: NoteStatus[] = [
  'ABERTO',
  'EM_ANALISE',
  'ORCAMENTO',
  'APROVADO',
  'EM_EXECUCAO',
  'AGUARDANDO_COMPRA',
  'PRONTA',
  'ENTREGUE',
];

/** Dica curta ao lado do nome da etapa. */
export const OS_STEP_HINT: Partial<Record<NoteStatus, string>> = {
  APROVADO: 'Espera para execução',
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Datas "só data" (YYYY-MM-DD) viram meia-noite local para não regredir um dia em UTC-3. */
function toLocalDate(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}

/** Data BR; devolve o travessão quando o campo opcional não veio. */
export function formatOSDate(value?: string | null): string {
  if (!value) return '—';
  const date = toLocalDate(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR') : '—';
}

/** Hora BR (HH:MM); vazio quando o valor é "só data" e não carrega hora. */
export function formatOSTime(value?: string | null): string | null {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatOSCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Quantidade sem decimais desnecessários (8 e não 8,00). */
export function formatOSQuantity(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export type OSItemKind = 'SERVICO' | 'PECA';

export interface OSItemRow {
  key: string;
  kind: OSItemKind;
  description: string;
  /** Detalhe/SKU exibido abaixo da descrição, quando existe. */
  detail: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/**
 * Junta serviços e peças numa lista única com etiqueta de tipo — serviços
 * primeiro, preservando a ordem original de cada origem.
 */
export function buildOSItemRows(
  services: IntakeService[],
  products: IntakeProduct[],
): OSItemRow[] {
  const serviceRows: OSItemRow[] = services.map((service) => ({
    key: `servico-${service.id}`,
    kind: 'SERVICO',
    description: service.name,
    detail: service.description && service.description !== service.name ? service.description : null,
    quantity: service.quantity,
    unitPrice: service.price,
    subtotal: service.subtotal,
  }));

  const productRows: OSItemRow[] = products.map((product) => ({
    key: `peca-${product.id}`,
    kind: 'PECA',
    description: product.name,
    detail: product.sku ? `SKU ${product.sku}` : null,
    quantity: product.quantity,
    unitPrice: product.unitPrice,
    subtotal: product.subtotal,
  }));

  return [...serviceRows, ...productRows];
}

export interface OSPaymentSummary {
  total: number;
  /** Soma já recebida. Cai para o total quando a nota é PAGO sem valor detalhado. */
  received: number;
  open: number;
  /** Estágio faturável (ENTREGUE/RECUSADO/SEM_CONSERTO) — libera registrar/estornar. */
  isBillable: boolean;
}

export function buildOSPaymentSummary(note: IntakeNote): OSPaymentSummary {
  const total = note.totalAmount;
  const received = note.valorRecebido ?? (note.paymentStatus === 'PAGO' ? total : 0);
  return {
    total,
    received,
    open: Math.max(0, Number((total - received).toFixed(2))),
    isBillable: BILLABLE_STATUSES.has(note.status),
  };
}

export type OSStepState = 'DONE' | 'CURRENT' | 'PENDING';

export interface OSStep {
  status: NoteStatus;
  state: OSStepState;
}

export interface OSStepperModel {
  steps: OSStep[];
  /**
   * Final alternativo (Recusada/Sem Conserto/Excluída) quando a O.S. saiu do
   * fluxo principal — vira uma etapa extra no fim do stepper.
   */
  altFinal: NoteStatus | null;
}

export function buildOSStepperModel(note: IntakeNote): OSStepperModel {
  const isAltFinal = FINAL_STATUSES.has(note.status) && !OS_MAIN_FLOW.includes(note.status);
  const currentIndex = isAltFinal ? -1 : OS_MAIN_FLOW.indexOf(note.status);

  return {
    altFinal: isAltFinal ? note.status : null,
    steps: OS_MAIN_FLOW.map((status, index) => ({
      status,
      state: index < currentIndex ? 'DONE' : index === currentIndex ? 'CURRENT' : 'PENDING',
    })),
  };
}

export type OSDeadlineTone = 'OK' | 'NEAR' | 'LATE';

export interface OSDeadlineModel {
  /** Fração já decorrida entre abertura e prazo, limitada a 0..100. */
  percent: number;
  /** Dias restantes até o prazo (negativo quando venceu). */
  daysLeft: number;
  tone: OSDeadlineTone;
  message: string;
}

/**
 * Progresso do prazo. Devolve `null` quando a nota não tem prazo, quando já é
 * final (o prazo perdeu sentido) ou quando as datas não são utilizáveis.
 */
export function buildOSDeadlineModel(
  note: IntakeNote,
  now: Date = new Date(),
): OSDeadlineModel | null {
  if (!note.deadline || FINAL_STATUSES.has(note.status)) return null;

  const deadline = toLocalDate(note.deadline);
  const start = toLocalDate(note.createdAt);
  if (!Number.isFinite(deadline.getTime()) || !Number.isFinite(start.getTime())) return null;

  const span = deadline.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const percent = span > 0 ? Math.min(100, Math.max(0, (elapsed / span) * 100)) : 100;
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / MS_PER_DAY);

  if (daysLeft < 0) {
    const overdue = Math.abs(daysLeft);
    return {
      percent: 100,
      daysLeft,
      tone: 'LATE',
      message: `Prazo vencido há ${overdue} dia${overdue === 1 ? '' : 's'}`,
    };
  }

  if (daysLeft <= 2) {
    return {
      percent,
      daysLeft,
      tone: 'NEAR',
      message: daysLeft === 0
        ? 'Prazo vence hoje'
        : `Prazo próximo do vencimento — falta${daysLeft === 1 ? '' : 'm'} ${daysLeft} dia${daysLeft === 1 ? '' : 's'}`,
    };
  }

  return {
    percent,
    daysLeft,
    tone: 'OK',
    message: `Dentro do prazo — faltam ${daysLeft} dias`,
  };
}

/** Dias desde a última atualização — proxy de "tempo nesta etapa". */
export function osDaysInStage(note: IntakeNote, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(note.updatedAt).getTime()) / MS_PER_DAY));
}

/** Texto relativo curto para o rodapé ("há 12 min", "há 3 dias"). */
export function formatOSRelativeTime(value: string, now: Date = new Date()): string {
  const target = new Date(value);
  if (!Number.isFinite(target.getTime())) return '—';

  const minutes = Math.floor((now.getTime() - target.getTime()) / 60000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? '' : 's'}`;
}
