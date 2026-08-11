import { describe, expect, it } from 'vitest';
import {
  buildDadosFromDraft,
  canDiscountPreviewItem,
  clampPercent,
  computeDraftTotals,
  getIncludedDraftNotes,
  getPreviewNoteOpenAmount,
  getPreviewNoteReceivedAmount,
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
  valorRecebido: 0,
  pagoEm: null,
  itens: [
    {
      id: `${overrides.id}-item-0`,
      descricao: 'Serviço',
      quantidade: 1,
      preco_unitario: overrides.total ?? 100,
      desconto_original: 0,
      desconto_porcentagem: 0,
      subtotal_original: overrides.total ?? 100,
      subtotal: overrides.total ?? 100,
    },
  ],
  ...overrides,
});

const makeDraft = (overrides: Partial<ClosingDraft>): ClosingDraft => ({
  id: 'draft-1',
  closingId: '00000000-0000-4000-8000-000000000001',
  generationKey: 'finalizar-fechamento:test-1',
  generationStartedAt: null,
  clientId: 'c1',
  clientName: 'Cliente',
  month: '6',
  year: '2026',
  periodLabel: 'Junho 2026',
  notes: [],
  discounts: {},
  initialPayment: {
    mode: 'NONE',
    date: '2026-07-01',
    method: 'PIX',
    accountId: '',
    observations: '',
  },
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
    expect(recalcItemSubtotal({ id: 'i', descricao: 'x', quantidade: 2, preco_unitario: 50, desconto_original: 0, desconto_porcentagem: 10, subtotal_original: 100, subtotal: 0 })).toBe(90);
    // desconto acima de 100 é clampado — não inverte o sinal do subtotal
    expect(recalcItemSubtotal({ id: 'i', descricao: 'x', quantidade: 2, preco_unitario: 50, desconto_original: 0, desconto_porcentagem: 150, subtotal_original: 100, subtotal: 0 })).toBe(0);
    // quantidade/preço negativos são tratados como zero
    expect(recalcItemSubtotal({ id: 'i', descricao: 'x', quantidade: -1, preco_unitario: 50, desconto_original: 0, desconto_porcentagem: 0, subtotal_original: 0, subtotal: 0 })).toBe(0);
  });

  it('soma itens e devolve 0 para lista vazia', () => {
    expect(recalcNoteTotal([])).toBe(0);
  });

  it('permite desconto de item somente quando a linha tem quantidade e valor unitario', () => {
    expect(canDiscountPreviewItem({ quantidade: 1, preco_unitario: 100 })).toBe(true);
    expect(canDiscountPreviewItem({ quantidade: 0, preco_unitario: 100 })).toBe(false);
    expect(canDiscountPreviewItem({ quantidade: 1, preco_unitario: 0 })).toBe(false);
    expect(canDiscountPreviewItem({ quantidade: -1, preco_unitario: 100 })).toBe(false);
  });
});

describe('computeDraftTotals', () => {
  it('preserva o total original e desconta apenas uma linha da O.S.', () => {
    const note = makeNote({
      id: 'os-6434',
      total: 850,
      itens: [
        {
          id: 'valvulas', descricao: 'Válvulas de Escape', quantidade: 1, preco_unitario: 170,
          desconto_original: 0, desconto_porcentagem: 0, subtotal_original: 170, subtotal: 170,
        },
        {
          id: 'sede', descricao: 'Sede de Escape', quantidade: 1, preco_unitario: 120,
          desconto_original: 0, desconto_porcentagem: 0, subtotal_original: 120, subtotal: 120,
        },
        {
          id: 'retifica', descricao: 'Retífica completa', quantidade: 1, preco_unitario: 560,
          desconto_original: 0, desconto_porcentagem: 5, subtotal_original: 560, subtotal: 532,
        },
      ],
    });
    const draft = makeDraft({ notes: [note] });

    expect(computeDraftTotals(draft)).toEqual({ totalOriginal: 850, totalComDesconto: 822 });
    expect(buildDadosFromDraft(draft).notas[0]).toMatchObject({
      valor_total_os: 850,
      total_original: 850,
      total_com_desconto: 822,
      desconto_nota: 0,
    });
  });

  it('soma O.S. incluídas e aplica desconto somente no item escolhido', () => {
    const draft = makeDraft({
      notes: [
        makeNote({ id: 'n1', total: 100 }),
        makeNote({
          id: 'n2',
          total: 200,
          itens: [{
            id: 'n2-item-0',
            descricao: 'Item escolhido',
            quantidade: 1,
            preco_unitario: 200,
            desconto_original: 0,
            desconto_porcentagem: 50,
            subtotal_original: 200,
            subtotal: 100,
          }],
        }),
      ],
    });
    expect(computeDraftTotals(draft)).toEqual({ totalOriginal: 300, totalComDesconto: 200 });
  });

  it('nunca gera total negativo mesmo com desconto de item fora da faixa no estado vivo', () => {
    const draft = makeDraft({
      notes: [makeNote({
        id: 'n1',
        total: 100,
        itens: [{
          id: 'n1-item-0', descricao: 'Item', quantidade: 1, preco_unitario: 100,
          desconto_original: 0, desconto_porcentagem: 150, subtotal_original: 100, subtotal: 0,
        }],
      })],
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
        ...['n1', 'n2', 'n3'].map((id) => makeNote({
          id,
          total: 33.33,
          itens: [{
            id: `${id}-item-0`, descricao: 'Item', quantidade: 1, preco_unitario: 33.33,
            desconto_original: 0, desconto_porcentagem: 10, subtotal_original: 33.33, subtotal: 29.997,
          }],
        })),
      ],
    });
    expect(computeDraftTotals(draft).totalComDesconto).toBe(90);
  });

  it('cobra somente o saldo aberto de O.S. parcialmente recebida', () => {
    const partial = makeNote({
      id: 'parcial',
      total: 500,
      paymentStatus: 'PARCIAL',
      valorRecebido: 175,
      itens: [{
        id: 'parcial-item-0', descricao: 'Item', quantidade: 1, preco_unitario: 500,
        desconto_original: 0, desconto_porcentagem: 10, subtotal_original: 500, subtotal: 450,
      }],
    });
    const draft = makeDraft({ notes: [partial] });

    expect(getPreviewNoteReceivedAmount(partial)).toBe(175);
    expect(getPreviewNoteOpenAmount(partial)).toBe(325);
    expect(getIncludedDraftNotes(draft).map((note) => note.id)).toEqual(['parcial']);
    expect(computeDraftTotals(draft)).toEqual({
      totalOriginal: 325,
      totalComDesconto: 275,
    });
  });
});

describe('buildDadosFromDraft', () => {
  it('gera snapshot consistente: soma das O.S. bate exatamente com o total consolidado', () => {
    const draft = makeDraft({
      notes: [
        makeNote({
          id: 'n1', total: 150.55,
          itens: [{
            id: 'n1-item-0', descricao: 'Item', quantidade: 1, preco_unitario: 150.55,
            desconto_original: 0, desconto_porcentagem: 7, subtotal_original: 150.55, subtotal: 140.0115,
          }],
        }),
        makeNote({
          id: 'n2', total: 99.99,
          itens: [{
            id: 'n2-item-0', descricao: 'Item', quantidade: 1, preco_unitario: 99.99,
            desconto_original: 0, desconto_porcentagem: 3.5, subtotal_original: 99.99, subtotal: 96.49035,
          }],
        }),
        makeNote({ id: 'n3', total: 500, paymentStatus: 'PAGO', pagoEm: '2026-06-20T12:00:00Z' }),
      ],
    });

    const dados = buildDadosFromDraft(draft);

    // PAGO fica fora de notas e entra em recebidas
    expect(dados.notas.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect((dados.recebidas ?? []).map((n) => n.id)).toEqual(['n3']);
    expect(dados.total_ja_recebido).toBe(500);
    expect(dados.competencia).toEqual({
      modo: 'MENSAL',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    });

    // soma dos por-O.S. (já arredondados) = total consolidado, sem poeira de float
    const somaNotas = dados.notas.reduce((sum, n) => sum + n.total_com_desconto, 0);
    expect(roundMoney(somaNotas)).toBe(dados.total_com_desconto);
    expect(dados.total_com_desconto).toBe(236.5); // 140.01 + 96.49

    // valores por O.S. em centavos exatos
    expect(dados.notas[0].total_com_desconto).toBe(140.01); // 150.55 * 0.93  = 140.0115
    expect(dados.notas[1].total_com_desconto).toBe(96.49);  // 99.99  * 0.965 = 96.49035
  });

  it('clampa desconto de item fora da faixa também no snapshot persistido', () => {
    const draft = makeDraft({
      notes: [makeNote({
        id: 'n1', total: 100,
        itens: [{
          id: 'n1-item-0', descricao: 'Item', quantidade: 1, preco_unitario: 100,
          desconto_original: 0, desconto_porcentagem: 999, subtotal_original: 100, subtotal: 0,
        }],
      })],
    });
    const dados = buildDadosFromDraft(draft);
    expect(dados.notas[0].desconto_nota).toBe(0);
    expect(dados.notas[0].itens[0].desconto_porcentagem).toBe(100);
    expect(dados.notas[0].total_com_desconto).toBe(0);
    expect(dados.total_com_desconto).toBe(0);
  });

  it('mantém o desconto por linha no snapshot do fechamento', () => {
    const draft = makeDraft({
      notes: [
        makeNote({
          id: 'n1',
          total: 90,
          itens: [{
            id: 'n1-item-0',
            descricao: 'Servico com desconto por linha',
            quantidade: 2,
            preco_unitario: 50,
            desconto_original: 10,
            desconto_porcentagem: 10,
            subtotal_original: 90,
            subtotal: 90,
          }],
        }),
      ],
    });

    const dados = buildDadosFromDraft(draft);

    expect(dados.notas[0].itens[0].desconto_porcentagem).toBe(10);
    expect(dados.notas[0].itens[0].subtotal).toBe(90);
    expect(dados.notas[0].total_original).toBe(90);
    expect(dados.notas[0].total_com_desconto).toBe(90);
  });

  it('preserva no snapshot a parcela recebida e inclui só o saldo aberto', () => {
    const draft = makeDraft({
      notes: [
        makeNote({
          id: 'parcial',
          total: 500,
          paymentStatus: 'PARCIAL',
          valorRecebido: 175,
          pagoEm: '2026-06-15T12:00:00Z',
        }),
      ],
    });

    const dados = buildDadosFromDraft(draft);

    expect(dados.notas).toHaveLength(1);
    expect(dados.notas[0]).toMatchObject({
      id: 'parcial',
      valor_total_os: 500,
      valor_recebido: 175,
      saldo_aberto: 325,
      total_original: 325,
      total_com_desconto: 325,
    });
    expect(dados.recebidas).toEqual([
      expect.objectContaining({
        id: 'parcial',
        total: 175,
        valor_recebido: 175,
        total_os: 500,
        saldo_aberto: 325,
      }),
    ]);
    expect(dados.total_ja_recebido).toBe(175);
  });

  it('persiste o intervalo personalizado que o backend valida contra o prazo', () => {
    const dados = buildDadosFromDraft(makeDraft({
      periodMode: 'custom',
      startDate: '2026-06-20',
      endDate: '2026-07-10',
    }));

    expect(dados.competencia).toEqual({
      modo: 'PERSONALIZADO',
      inicio: '2026-06-20',
      fim: '2026-07-10',
    });
  });
});
