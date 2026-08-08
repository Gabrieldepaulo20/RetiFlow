import type { NotePaymentStatus } from '@/types';
import type { FechamentoCompetencia, FechamentoDadosJson } from '@/api/supabase/fechamentos';
import type { MonthlyClosingDateMode } from '@/services/domain/monthlyClosing';
import type { ClosingInitialPaymentMode } from '@/services/domain/monthlyClosingPayment';
import type { PaymentMethod } from '@/types';

/**
 * Matemática pura do rascunho de Fechamento Mensal.
 * Extraída de MonthlyClosing.tsx para permitir teste unitário direto das
 * fórmulas de dinheiro que alimentam `finalizar_fechamento`/`dados_json`.
 */

export interface PreviewItem {
  id: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_porcentagem: number;
  subtotal: number;
}

export interface PreviewNote {
  id: string;
  os: string;
  veiculo: string;
  placa: string | null;
  total: number;
  updatedAt: string;
  /** Eixo financeiro: se já foi recebida (fora do total do fechamento) ou pendente. */
  paymentStatus: NotePaymentStatus;
  /** Total já recebido antes da geração deste fechamento. */
  valorRecebido: number;
  pagoEm: string | null;
  itens: PreviewItem[];
}

export interface ClosingDraft {
  id: string;
  /** UUID estável para permitir retry idempotente da finalização. */
  closingId: string;
  /** Chave estável do comando; nunca é regenerada entre tentativas do mesmo rascunho. */
  generationKey: string;
  /** Fixado no primeiro envio ao backend para retries produzirem o mesmo snapshot. */
  generationStartedAt?: string | null;
  clientId: string;
  clientName: string;
  periodMode?: MonthlyClosingDateMode;
  startDate?: string | null;
  endDate?: string | null;
  cutoffDate?: string | null;
  month: string;
  year: string;
  periodLabel: string;
  notes: PreviewNote[];
  includedNoteIds?: string[];
  discounts: Record<string, number>;
  initialPayment: {
    mode: ClosingInitialPaymentMode;
    customAmountCents?: number;
    date: string;
    method: PaymentMethod;
    accountId: string;
    observations: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Arredonda para centavos antes de persistir/exibir totais consolidados,
 * evitando poeira de ponto flutuante em `valor_total`/`dados_json`.
 */
export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const recalcItemSubtotal = (item: PreviewItem) => {
  const bruto = Math.max(0, item.quantidade) * Math.max(0, item.preco_unitario);
  return bruto * (1 - clampPercent(item.desconto_porcentagem) / 100);
};

export const canDiscountPreviewItem = (item: Pick<PreviewItem, 'quantidade' | 'preco_unitario'>) =>
  Math.max(0, item.quantidade) > 0 && Math.max(0, item.preco_unitario) > 0;

export const recalcNoteTotal = (items: PreviewItem[]) =>
  items.reduce((sum, item) => sum + recalcItemSubtotal(item), 0);

export const getPreviewNoteReceivedAmount = (
  note: Pick<PreviewNote, 'paymentStatus' | 'total' | 'valorRecebido'>,
) => {
  const total = roundMoney(Math.max(0, Number(note.total) || 0));
  if (note.paymentStatus === 'PAGO') return total;
  const received = Number(note.valorRecebido);
  return roundMoney(Math.min(total, Math.max(0, Number.isFinite(received) ? received : 0)));
};

export const getPreviewNoteOpenAmount = (
  note: Pick<PreviewNote, 'paymentStatus' | 'total' | 'valorRecebido'>,
) => roundMoney(Math.max(0, roundMoney(note.total) - getPreviewNoteReceivedAmount(note)));

/** O.S. integralmente recebida — informativa, nunca entra no total do fechamento. */
export const isReceivedNote = (
  note: Pick<PreviewNote, 'paymentStatus' | 'total' | 'valorRecebido'>,
) => getPreviewNoteOpenAmount(note) <= 0;

export const getReceivedDraftNotes = (draft: Pick<ClosingDraft, 'notes'>) => (
  Array.isArray(draft.notes) ? draft.notes : []
).filter((note) => getPreviewNoteReceivedAmount(note) > 0);

export const getDraftNotes = (draft: Pick<ClosingDraft, 'notes'>) =>
  Array.isArray(draft.notes) ? draft.notes : [];

export const getPreviewItems = (note: Pick<PreviewNote, 'itens'>) =>
  Array.isArray(note.itens) ? note.itens : [];

export const getIncludedDraftNotes = (draft: Pick<ClosingDraft, 'notes' | 'includedNoteIds'>) => {
  const notes = getDraftNotes(draft);
  const base = draft.includedNoteIds
    ? notes.filter((note) => new Set(draft.includedNoteIds).has(note.id))
    : notes;
  // Uma O.S. parcial entra apenas pelo saldo aberto; a parte recebida fica no
  // snapshot informativo para a receita não desaparecer do razão/DRE.
  return base.filter((note) => getPreviewNoteOpenAmount(note) > 0);
};

/** Desconto por O.S. sempre clampado 0–100, mesmo que o estado vivo traga valor fora da faixa. */
const getNoteDiscountPercent = (draft: Pick<ClosingDraft, 'discounts'>, noteId: string) =>
  clampPercent(draft.discounts[noteId] ?? 0);

const noteTotalComDesconto = (draft: Pick<ClosingDraft, 'discounts'>, note: PreviewNote) =>
  roundMoney(getPreviewNoteOpenAmount(note) * (1 - getNoteDiscountPercent(draft, note.id) / 100));

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const buildClosingCompetenceSnapshot = (
  draft: Pick<ClosingDraft, 'periodMode' | 'startDate' | 'endDate' | 'cutoffDate' | 'month' | 'year'>,
) => {
  const year = Number.parseInt(draft.year, 10);
  const month = Number.parseInt(draft.month, 10);
  const safeYear = Number.isInteger(year) && year >= 2000 && year <= 9999 ? year : 2000;
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1;
  const monthText = String(safeMonth).padStart(2, '0');
  const monthlyStart = `${safeYear}-${monthText}-01`;
  const monthlyEnd = `${safeYear}-${monthText}-${String(
    new Date(safeYear, safeMonth, 0).getDate(),
  ).padStart(2, '0')}`;

  if (draft.periodMode === 'custom') {
    const legacyCutoff = draft.cutoffDate && ISO_DATE_PATTERN.test(draft.cutoffDate)
      ? draft.cutoffDate
      : null;
    const start = draft.startDate && ISO_DATE_PATTERN.test(draft.startDate)
      ? draft.startDate
      : legacyCutoff ? `${legacyCutoff.slice(0, 8)}01` : null;
    const end = draft.endDate && ISO_DATE_PATTERN.test(draft.endDate)
      ? draft.endDate
      : legacyCutoff;
    if (start && end) return { modo: 'PERSONALIZADO' as const, inicio: start, fim: end };
  }

  return { modo: 'MENSAL' as const, inicio: monthlyStart, fim: monthlyEnd };
};

export const computeDraftTotals = (draft: Pick<ClosingDraft, 'notes' | 'discounts' | 'includedNoteIds'>) => {
  const includedNotes = getIncludedDraftNotes(draft);
  // Totais consolidados somam os valores por O.S. já arredondados em centavos,
  // garantindo que a soma exibida no PDF bata exatamente com os itens listados.
  const totalOriginal = roundMoney(
    includedNotes.reduce((sum, note) => sum + getPreviewNoteOpenAmount(note), 0),
  );
  const totalComDesconto = roundMoney(
    includedNotes.reduce((sum, note) => sum + noteTotalComDesconto(draft, note), 0),
  );
  return { totalOriginal, totalComDesconto };
};

export const buildDadosFromDraft = (
  draft: ClosingDraft,
): FechamentoDadosJson & { competencia: FechamentoCompetencia } => {
  const totals = computeDraftTotals(draft);
  return {
    gerado_em: new Date().toISOString(),
    periodo: draft.periodLabel,
    cliente: { id: draft.clientId, nome: draft.clientName },
    competencia: buildClosingCompetenceSnapshot(draft),
    notas: getIncludedDraftNotes(draft).map((note) => {
      const valorRecebido = getPreviewNoteReceivedAmount(note);
      const saldoAberto = getPreviewNoteOpenAmount(note);
      return {
        id: note.id,
        os: note.os,
        veiculo: note.veiculo,
        placa: note.placa,
        itens: getPreviewItems(note),
        valor_total_os: roundMoney(note.total),
        valor_recebido: valorRecebido,
        saldo_aberto: saldoAberto,
        total_original: saldoAberto,
        desconto_nota: getNoteDiscountPercent(draft, note.id),
        total_com_desconto: noteTotalComDesconto(draft, note),
      };
    }),
    total_original: totals.totalOriginal,
    total_com_desconto: totals.totalComDesconto,
    recebidas: getReceivedDraftNotes(draft).map((note) => {
      const valorRecebido = getPreviewNoteReceivedAmount(note);
      return {
        id: note.id,
        os: note.os,
        veiculo: note.veiculo,
        placa: note.placa,
        total: valorRecebido,
        valor_recebido: valorRecebido,
        total_os: roundMoney(note.total),
        saldo_aberto: getPreviewNoteOpenAmount(note),
        pago_em: note.pagoEm,
      };
    }),
    total_ja_recebido: roundMoney(
      getReceivedDraftNotes(draft).reduce(
        (sum, note) => sum + getPreviewNoteReceivedAmount(note),
        0,
      ),
    ),
  };
};
