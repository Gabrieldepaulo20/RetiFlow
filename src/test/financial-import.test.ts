import { describe, expect, it } from 'vitest';
import {
  buildMeaningfulFinancialEntryTitle,
  canCreateImportedFinancialEntry,
  isSimilarImportedFinancialEntry,
  normalizeFinancialImportDirection,
} from '@/services/domain/financialImport';

describe('financialImport', () => {
  it('nunca transforma direção desconhecida em saída por padrão', () => {
    expect(normalizeFinancialImportDirection(undefined)).toBe('INCERTO');
    expect(normalizeFinancialImportDirection('PIX')).toBe('INCERTO');
  });

  it('exige confirmação de que a entrada não pertence a uma O.S.', () => {
    expect(canCreateImportedFinancialEntry({ direction: 'ENTRADA' })).toBe(false);
    expect(canCreateImportedFinancialEntry({ direction: 'ENTRADA', serviceOrderDecision: 'YES' })).toBe(false);
    expect(canCreateImportedFinancialEntry({ direction: 'ENTRADA', serviceOrderDecision: 'UNKNOWN' })).toBe(false);
    expect(canCreateImportedFinancialEntry({ direction: 'ENTRADA', serviceOrderDecision: 'NO' })).toBe(true);
  });

  it('gera nome específico quando a IA retorna título genérico', () => {
    expect(buildMeaningfulFinancialEntryTitle({
      title: 'Recebimento',
      counterparty: 'Cliente Silva',
      timing: 'REALIZADA',
      date: '2026-07-31',
    })).toBe('Cliente Silva · Recebimento 31/07/2026');
  });

  it('aponta possível duplicidade apenas para entrada não estornada com mesma data e valor', () => {
    const expected = { value: 480.5, date: '2026-07-31' };
    expect(isSimilarImportedFinancialEntry({
      direcao: 'ENTRADA',
      valor: 480.5,
      dataEfetiva: '2026-07-31T12:00:00-03:00',
    }, expected)).toBe(true);
    expect(isSimilarImportedFinancialEntry({
      direcao: 'SAIDA',
      valor: 480.5,
      dataEfetiva: '2026-07-31T12:00:00-03:00',
    }, expected)).toBe(false);
    expect(isSimilarImportedFinancialEntry({
      direcao: 'ENTRADA',
      valor: 480.5,
      dataEfetiva: '2026-07-31T12:00:00-03:00',
      estornado: true,
    }, expected)).toBe(false);
  });
});
