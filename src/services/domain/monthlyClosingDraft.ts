import type { NotePaymentStatus } from '@/types';
import type { FechamentoDadosJson, FechamentoNota } from '@/api/supabase/fechamentos';
import type { MonthlyClosingDateMode } from '@/services/domain/monthlyClosing';

/**
 * Matemática pura do rascunho de Fechamento Mensal.
 * Extraída de MonthlyClosing.tsx para permitir teste unitário direto das
 * fórmulas de dinheiro que alimentam `insert_fechamento`/`dados_json`.
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
  /**
   * Total BRUTO da nota de entrada no momento em que o rascunho foi montado.
   * Nunca é alterado por edição de item ou desconto no rascunho — serve de
   * referência pristine para detectar divergência (nota alterada no banco
   * DEPOIS do fechamento). Fallback para `total` quando ausente.
   */
  totalNota?: number;
  updatedAt: string;
  /** Eixo financeiro: se já foi recebida (fora do total do fechamento) ou pendente. */
  paymentStatus: NotePaymentStatus;
  pagoEm: string | null;
  itens: PreviewItem[];
}

export interface ClosingDraft {
  id: string;
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

/** O.S. já recebida (paga) no período — informativa, nunca entra no total do fechamento. */
export const isReceivedNote = (note: Pick<PreviewNote, 'paymentStatus'>) => note.paymentStatus === 'PAGO';

export const getReceivedDraftNotes = (draft: Pick<ClosingDraft, 'notes'>) => (
  Array.isArray(draft.notes) ? draft.notes : []
).filter(isReceivedNote);

export const getDraftNotes = (draft: Pick<ClosingDraft, 'notes'>) =>
  Array.isArray(draft.notes) ? draft.notes : [];

export const getPreviewItems = (note: Pick<PreviewNote, 'itens'>) =>
  Array.isArray(note.itens) ? note.itens : [];

export const getIncludedDraftNotes = (draft: Pick<ClosingDraft, 'notes' | 'includedNoteIds'>) => {
  const notes = getDraftNotes(draft);
  const base = draft.includedNoteIds
    ? notes.filter((note) => new Set(draft.includedNoteIds).has(note.id))
    : notes;
  // Notas já recebidas nunca entram no total/cascata do fechamento (só informativas).
  return base.filter((note) => !isReceivedNote(note));
};

/** Desconto por O.S. sempre clampado 0–100, mesmo que o estado vivo traga valor fora da faixa. */
const getNoteDiscountPercent = (draft: Pick<ClosingDraft, 'discounts'>, noteId: string) =>
  clampPercent(draft.discounts[noteId] ?? 0);

const noteTotalComDesconto = (draft: Pick<ClosingDraft, 'discounts'>, note: PreviewNote) =>
  roundMoney(note.total * (1 - getNoteDiscountPercent(draft, note.id) / 100));

export const computeDraftTotals = (draft: Pick<ClosingDraft, 'notes' | 'discounts' | 'includedNoteIds'>) => {
  const includedNotes = getIncludedDraftNotes(draft);
  // Totais consolidados somam os valores por O.S. já arredondados em centavos,
  // garantindo que a soma exibida no PDF bata exatamente com os itens listados.
  const totalOriginal = roundMoney(
    includedNotes.reduce((sum, note) => sum + roundMoney(note.total), 0),
  );
  const totalComDesconto = roundMoney(
    includedNotes.reduce((sum, note) => sum + noteTotalComDesconto(draft, note), 0),
  );
  return { totalOriginal, totalComDesconto };
};

export const buildDadosFromDraft = (draft: ClosingDraft): FechamentoDadosJson => {
  const totals = computeDraftTotals(draft);
  return {
    gerado_em: new Date().toISOString(),
    periodo: draft.periodLabel,
    cliente: { id: draft.clientId, nome: draft.clientName },
    notas: getIncludedDraftNotes(draft).map((note) => ({
      id: note.id,
      os: note.os,
      veiculo: note.veiculo,
      placa: note.placa,
      itens: getPreviewItems(note),
      total_nota: roundMoney(note.totalNota ?? note.total),
      total_original: roundMoney(note.total),
      desconto_nota: getNoteDiscountPercent(draft, note.id),
      total_com_desconto: noteTotalComDesconto(draft, note),
    })),
    total_original: totals.totalOriginal,
    total_com_desconto: totals.totalComDesconto,
    recebidas: getReceivedDraftNotes(draft).map((note) => ({
      id: note.id,
      os: note.os,
      veiculo: note.veiculo,
      placa: note.placa,
      total: roundMoney(note.total),
      pago_em: note.pagoEm,
    })),
    total_ja_recebido: roundMoney(
      getReceivedDraftNotes(draft).reduce((sum, note) => sum + roundMoney(note.total), 0),
    ),
  };
};

/** Nota atual (do banco) comparada contra o snapshot do fechamento. */
export interface DivergenceCurrentNote {
  id: string;
  totalAmount: number;
  updatedAt: string;
}

export interface ClosingDivergence {
  os: string;
  total_original: number;
  total_atual: number;
  alterado_em: string;
}

/**
 * Divergência = a NOTA DE ENTRADA foi alterada no banco DEPOIS do fechamento.
 * Compara o total BRUTO atual da nota contra o total bruto pristine gravado na
 * geração (`total_nota`). Descontos do rascunho (por item ou por O.S.) NÃO
 * contam — são ajustes do fechamento, não mudança da nota. Fechamentos antigos
 * sem `total_nota` caem em `total_original` (total da nota antes do desconto
 * final), que também ignora o desconto por O.S.
 */
export const computeClosingDivergencias = (
  snapshotNotas: FechamentoNota[] | null | undefined,
  currentNotes: DivergenceCurrentNote[],
): ClosingDivergence[] => {
  const notas = Array.isArray(snapshotNotas) ? snapshotNotas : [];
  return notas.flatMap((n) => {
    const curr = currentNotes.find((cn) => cn.id === n.id);
    if (!curr) return [];
    const baseline = typeof n.total_nota === 'number' && Number.isFinite(n.total_nota)
      ? n.total_nota
      : n.total_original;
    if (!Number.isFinite(baseline)) return [];
    if (Math.abs(curr.totalAmount - baseline) < 0.01) return [];
    return [{ os: n.os, total_original: baseline, total_atual: curr.totalAmount, alterado_em: curr.updatedAt }];
  });
};
