import { describe, expect, it } from 'vitest';
import { buildEmailSuggestionTitle, extractFirstBrazilianDate, extractFirstMoneyValue } from '@/services/domain/gmailSuggestions';

describe('gmail suggestion helpers', () => {
  it('extracts Brazilian currency values', () => {
    expect(extractFirstMoneyValue('Boleto no valor de R$ 1.234,56')).toBe(1234.56);
    expect(extractFirstMoneyValue('Total: 98,40')).toBe(98.4);
  });

  it('returns null for invalid money values', () => {
    expect(extractFirstMoneyValue('sem valor financeiro')).toBeNull();
  });

  it('extracts Brazilian due dates as ISO dates', () => {
    expect(extractFirstBrazilianDate('Vencimento 28/04/2026')).toBe('2026-04-28');
    expect(extractFirstBrazilianDate('vence em 05-12-2026')).toBe('2026-12-05');
  });

  it('builds a safe suggestion title', () => {
    expect(buildEmailSuggestionTitle('  Fatura   energia  ', 'CPFL')).toBe('Fatura energia');
    expect(buildEmailSuggestionTitle('', 'Fornecedor Teste')).toBe('Conta de Fornecedor Teste');
  });
});
