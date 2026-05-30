import { describe, it, expect } from 'vitest';
import { getContextualQuestion, getSuggestionOverdueDays } from '@/services/domain/payables';
import type { AccountPayable } from '@/types';

const NOW = new Date('2026-05-29T12:00:00');

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'p1',
    title: 'Conta',
    categoryId: 'c1',
    dueDate: '2026-05-29',
    originalAmount: 100,
    finalAmount: 100,
    status: 'PENDENTE',
    recurrence: 'NENHUMA',
    isUrgent: false,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    createdByUserId: 'user-1',
    ...overrides,
  };
}

describe('getContextualQuestion', () => {
  it('pergunta "provavelmente paga" quando vencida há mais de 2 dias', () => {
    const q = getContextualQuestion(payable({ dueDate: '2026-05-25' }), NOW);
    expect(q?.type).toBe('probably_paid');
    expect(q?.actions.some((a) => a.action === 'mark_paid')).toBe(true);
  });

  it('pergunta "vence hoje"', () => {
    expect(getContextualQuestion(payable({ dueDate: '2026-05-29' }), NOW)?.type).toBe('due_today');
  });

  it('pergunta "vence em breve" para 1-3 dias', () => {
    expect(getContextualQuestion(payable({ dueDate: '2026-05-31' }), NOW)?.type).toBe('due_soon');
  });

  it('não pergunta para conta paga ou cancelada', () => {
    expect(getContextualQuestion(payable({ status: 'PAGO', dueDate: '2026-05-20' }), NOW)).toBeNull();
    expect(getContextualQuestion(payable({ status: 'CANCELADO', dueDate: '2026-05-20' }), NOW)).toBeNull();
  });

  it('não pergunta para vencimento distante', () => {
    expect(getContextualQuestion(payable({ dueDate: '2026-06-20' }), NOW)).toBeNull();
  });

  it('pergunta sobre agendamento com data passada', () => {
    const q = getContextualQuestion(payable({ status: 'AGENDADO', scheduledFor: '2026-05-26', dueDate: '2026-06-10' }), NOW);
    expect(q?.type).toBe('scheduled_past');
  });
});

describe('getSuggestionOverdueDays', () => {
  it('retorna dias em atraso para sugestão vencida não paga', () => {
    expect(getSuggestionOverdueDays({ suggestedDueDate: '2026-05-25', suggestedStatus: 'PENDENTE' }, NOW)).toBe(4);
  });
  it('retorna null para sugestão futura ou já paga', () => {
    expect(getSuggestionOverdueDays({ suggestedDueDate: '2026-06-10', suggestedStatus: 'PENDENTE' }, NOW)).toBeNull();
    expect(getSuggestionOverdueDays({ suggestedDueDate: '2026-05-01', suggestedStatus: 'PAGO' }, NOW)).toBeNull();
  });
});
