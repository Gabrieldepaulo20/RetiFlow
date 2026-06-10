import { describe, expect, it } from 'vitest';
import { classifyEmailSuggestionForReview, classifyPayableMatch, type PayableMatchCandidate } from '@/services/domain/payables';
import type { AccountPayable, EmailSuggestion } from '@/types';

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'p-existing',
    title: 'Boleto Fornecedor X',
    categoryId: 'cat-1',
    supplierName: 'Distribuidora X',
    docNumber: '12345',
    dueDate: '2026-06-10',
    originalAmount: 300,
    finalAmount: 300,
    status: 'PENDENTE',
    recurrence: 'NENHUMA',
    isUrgent: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    createdByUserId: 'user-1',
    ...overrides,
  };
}

function candidate(overrides: Partial<PayableMatchCandidate>): PayableMatchCandidate {
  return {
    supplierName: 'Distribuidora X',
    docNumber: '12345',
    dueDate: '2026-06-10',
    originalAmount: 300,
    ...overrides,
  };
}

function suggestion(overrides: Partial<EmailSuggestion>): EmailSuggestion {
  return {
    id: 's1',
    subject: 'Boleto fornecedor',
    senderName: 'Distribuidora X',
    senderEmail: 'financeiro@distribuidorax.com.br',
    receivedAt: '2026-06-01T12:00:00.000Z',
    suggestedTitle: 'Boleto Distribuidora X',
    suggestedAmount: 300,
    suggestedDueDate: '2026-06-10',
    suggestedCategoryId: 'cat-1',
    suggestedSupplierName: 'Distribuidora X',
    suggestedPaymentMethod: 'BOLETO',
    confidence: 92,
    status: 'PENDING',
    suggestedStatus: 'PENDENTE',
    createdAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('classifyPayableMatch', () => {
  it('detecta duplicidade provável (mesmo fornecedor, valor, vencimento e documento)', () => {
    const result = classifyPayableMatch(candidate({}), [payable({})]);
    expect(result.kind).toBe('duplicidade_provavel');
    expect(result.match?.id).toBe('p-existing');
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('NÃO trata parcelas diferentes da mesma série como duplicata', () => {
    const existing = payable({
      id: 'p1',
      docNumber: 'BOLETO-1',
      dueDate: '2026-06-10',
      totalInstallments: 3,
      recurrenceIndex: 1,
    });
    const cand = candidate({
      docNumber: 'BOLETO-2',
      dueDate: '2026-07-10',
      totalInstallments: 3,
      recurrenceIndex: 2,
    });
    const result = classifyPayableMatch(cand, [existing]);
    expect(result.kind).toBe('possivel_parcela');
  });

  it('reconhece conta recorrente de outro mês', () => {
    const existing = payable({
      id: 'p1',
      docNumber: '',
      dueDate: '2026-05-10',
      competencyDate: '2026-05-01',
      recurrence: 'MENSAL',
    });
    const cand = candidate({
      docNumber: '',
      dueDate: '2026-06-10',
      competencyDate: '2026-06-01',
      recurrence: 'MENSAL',
    });
    const result = classifyPayableMatch(cand, [existing]);
    expect(result.kind).toBe('possivel_recorrencia');
  });

  it('manda para revisão quando valor e vencimento batem mas o documento difere', () => {
    const existing = payable({ id: 'p1', docNumber: 'NF-100' });
    const cand = candidate({ docNumber: 'NF-999' });
    const result = classifyPayableMatch(cand, [existing]);
    expect(result.kind).toBe('revisar');
  });

  it('classifica como novo quando o fornecedor é diferente', () => {
    const result = classifyPayableMatch(candidate({ supplierName: 'Outro Fornecedor' }), [payable({})]);
    expect(result.kind).toBe('novo');
    expect(result.match).toBeNull();
  });

  it('classifica como novo quando só o fornecedor coincide (valor e data diferentes)', () => {
    const cand = candidate({ originalAmount: 999, dueDate: '2026-09-01', docNumber: 'ZZZ' });
    const result = classifyPayableMatch(cand, [payable({})]);
    expect(result.kind).toBe('novo');
  });

  it('ignora contas canceladas e excluídas', () => {
    const cancelled = payable({ id: 'p1', status: 'CANCELADO' });
    const deleted = payable({ id: 'p2', deletedAt: '2026-06-02T00:00:00.000Z' });
    const result = classifyPayableMatch(candidate({}), [cancelled, deleted]);
    expect(result.kind).toBe('novo');
  });

  it('mesmo documento com valor diferente ainda sinaliza duplicidade provável', () => {
    const existing = payable({ id: 'p1', originalAmount: 300, dueDate: '2026-06-10' });
    const cand = candidate({ originalAmount: 320, dueDate: '2026-06-25' });
    const result = classifyPayableMatch(cand, [existing]);
    expect(result.kind).toBe('duplicidade_provavel');
  });

  it('triagem de sugestão manda alto risco para quarentena', () => {
    const result = classifyEmailSuggestionForReview(
      suggestion({ senderRisk: 'ALTO', fraudSignals: ['Domínio divergente'], confidence: 91 }),
      [],
    );
    expect(result.bucket).toBe('quarantine');
    expect(result.reasons).toContain('Remetente classificado com alto risco');
  });

  it('triagem de sugestão exige revisão abaixo de 80% de confiança', () => {
    const result = classifyEmailSuggestionForReview(suggestion({ confidence: 79 }), []);
    expect(result.bucket).toBe('review');
    expect(result.reasons).toContain('Confiança abaixo de 80%');
  });

  it('triagem de sugestão separa comprovantes do fluxo principal', () => {
    const result = classifyEmailSuggestionForReview(suggestion({ suggestedStatus: 'PAGO' }), []);
    expect(result.bucket).toBe('receipt');
  });

  it('triagem de sugestão bloqueia duplicidade provável na lista principal', () => {
    const result = classifyEmailSuggestionForReview(suggestion({}), [payable({})]);
    expect(result.bucket).toBe('duplicate');
    expect(result.match?.match?.id).toBe('p-existing');
  });
});
