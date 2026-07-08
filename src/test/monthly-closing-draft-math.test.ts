import { describe, expect, it } from 'vitest';
import {
  buildDadosFromDraft,
  clampPercent,
  computeDraftTotals,
  getIncludedDraftNotes,
  recalcItemSubtotal,
  recalcNoteTotal,
  roundMoney,
  type ClosingDraft,
  type PreviewNote,
} from '@/services/domain/monthlyClosingDraft';

const makeNote = (overrides: Partial<PreviewNote> & { id: string }): PreviewNote => ({
  os: `OS-${overrides.id}`,
  veiculo: 'Gol',
  placa: null,
  total: 100,
  updatedAt: '2026-07-01T10:00:00Z',
  paymentStatus: 'PENDENTE',
  pagoEm: null,
  itens: [
    {
      id: `${overrides.id}-item-0`,
      descricao: 'Serviço',
      quantidade: 1,
      preco_unitario: overrides.total ?? 100,
      desconto_porcentagem: 0,
      subtotal: overrides.total ?? 100,
    },
  ],
  ...overrides,
});

const makeDraft = (overrides: Partial<ClosingDraft>): ClosingDraft => ({
  id: 'draft-1',
  clientId: 'c1',
  clientName: 'Cliente',
  month: '6',
  year: '2026',
  periodLabel: 'Junho 2026',
  notes: [],
  discounts: {},
  createdAt: '2026-07-01T10:00:00Z',
  updatedAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

describe('roundMoney / clampPercent', () => {
  it('arredonda poeira de ponto flutuante para centavos', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1084.9999999999998)).toBe(1085);
    expect(roundMoney(29.997)).toBe(30);
  });

  it('clampa percentual em 0–100', () => {
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(35.5)).toBe(35.5);
  });
});

describe('recalcItemSubtotal / recalcNoteTotal', () => {
  it('aplica desconto percentual do item e nunca produz subtotal negativo', () => {
    expect(recalcItemSubtotal({ id: 'i', descricao: 'x', quantidade: 2, preco_unitario: 50, desconto_porcentagem: 10, subtotal: 0 })).toBe(90);
    // desconto acima de 100 é clampado — não inverte o sinal do subtotal
    expect(recalcItemSubtotal({ id: 'i', descricao: 'x', quantidade: 2, preco_unitario: 50, desconto_porcentagem: 150, subtotal: 0 })).toBe(0);
    // quantidade/preço negativos são tratados como zero
    expect(recalcItemSubtotal({ id: 'i', descricao: 'x', quantidade: -1, preco_unitario: 50, desconto_porcentagem: 0, subtotal: 0 })).toBe(0);
  });

  it('soma itens e devolve 0 para lista vazia', () => {
    expect(recalcNoteTotal([])).toBe(0);
  });
});

describe('computeDraftTotals', () => {
  it('soma O.S. incluídas e aplica desconto por O.S.', () => {
    const draft = makeDraft({
      notes: [makeNote({ id: 'n1', total: 100 }), makeNote({ id: 'n2', total: 200 })],
      discounts: { n2: 50 },
    });
    expect(computeDraftTotals(draft)).toEqual({ totalOriginal: 300, totalComDesconto: 200 });
  });

  it('nunca gera total negativo mesmo com desconto fora da faixa no estado vivo', () => {
    const draft = makeDraft({
      notes: [makeNote({ id: 'n1', total: 100 })],
      discounts: { n1: 150 },
    });
    const totals = computeDraftTotals(draft);
    expect(totals.totalComDesconto).toBe(0);
    expect(totals.totalOriginal).toBe(100);
  });

  it('exclui O.S. já recebidas (PAGO) e respeita includedNoteIds', () => {
    const draft = makeDraft({
      notes: [
        makeNote({ id: 'n1', total: 100 }),
        makeNote({ id: 'n2', total: 200, paymentStatus: 'PAGO' }),
        makeNote({ id: 'n3', total: 300 }),
      ],
      includedNoteIds: ['n1', 'n2', 'inexistente'],
    });
    expect(getIncludedDraftNotes(draft).map((n) => n.id)).toEqual(['n1']);
    expect(computeDraftTotals(draft)).toEqual({ totalOriginal: 100, totalComDesconto: 100 });
  });

  it('mantém soma exata em centavos com descontos que geram dízima', () => {
    // 33.33 com 10% = 29.997 → 30.00 por O.S.; 3 O.S. = 90.00 exato
    const draft = makeDraft({
      notes: [
        makeNote({ id: 'n1', total: 33.33 }),
        makeNote({ id: 'n2', total: 33.33 }),
        makeNote({ id: 'n3', total: 33.33 }),
      ],
      discounts: { n1: 10, n2: 10, n3: 10 },
    });
    expect(computeDraftTotals(draft).totalComDesconto).toBe(90);
  });
});

describe('buildDadosFromDraft', () => {
  it('gera snapshot consistente: soma das O.S. bate exatamente com o total consolidado', () => {
    const draft = makeDraft({
      notes: [
        makeNote({ id: 'n1', total: 150.55 }),
        makeNote({ id: 'n2', total: 99.99 }),
        makeNote({ id: 'n3', total: 500, paymentStatus: 'PAGO', pagoEm: '2026-06-20T12:00:00Z' }),
      ],
      discounts: { n1: 7, n2: 3.5 },
    });

    const dados = buildDadosFromDraft(draft);

    // PAGO fica fora de notas e entra em recebidas
    expect(dados.notas.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect((dados.recebidas ?? []).map((n) => n.id)).toEqual(['n3']);
    expect(dados.total_ja_recebido).toBe(500);

    // soma dos por-O.S. (já arredondados) = total consolidado, sem poeira de float
    const somaNotas = dados.notas.reduce((sum, n) => sum + n.total_com_desconto, 0);
    expect(roundMoney(somaNotas)).toBe(dados.total_com_desconto);
    expect(dados.total_com_desconto).toBe(236.5); // 140.01 + 96.49

    // valores por O.S. em centavos exatos
    expect(dados.notas[0].total_com_desconto).toBe(140.01); // 150.55 * 0.93  = 140.0115
    expect(dados.notas[1].total_com_desconto).toBe(96.49);  // 99.99  * 0.965 = 96.49035
  });

  it('clampa desconto fora da faixa também no snapshot persistido', () => {
    const draft = makeDraft({
      notes: [makeNote({ id: 'n1', total: 100 })],
      discounts: { n1: 999 },
    });
    const dados = buildDadosFromDraft(draft);
    expect(dados.notas[0].desconto_nota).toBe(100);
    expect(dados.notas[0].total_com_desconto).toBe(0);
    expect(dados.total_com_desconto).toBe(0);
  });
});
