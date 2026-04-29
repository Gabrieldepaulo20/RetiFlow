import { describe, expect, it } from 'vitest';
import {
  isValidBrazilianPlate,
  normalizeDecimalInputDraft,
  normalizeEmail,
  normalizeMoneyInput,
  normalizePlate,
  normalizeWhitespace,
  onlyDigits,
  toTitleCasePtBr,
  validateDueDateNotBeforeBaseDate,
} from '@/services/domain/textNormalization';

describe('textNormalization', () => {
  it('normalizes whitespace without removing accents or punctuation', () => {
    expect(normalizeWhitespace('  retifica   de   motor  ')).toBe('retifica de motor');
    expect(normalizeWhitespace('Cabeçote,  motor  AP')).toBe('Cabeçote, motor AP');
  });

  it('applies pt-BR title case preserving articles and technical terms', () => {
    expect(toTitleCasePtBr('cabeçote DE fReSa')).toBe('Cabeçote de Fresa');
    expect(toTitleCasePtBr('retifica   de   motor')).toBe('Retifica de Motor');
    expect(toTitleCasePtBr('junta DO cabeçote')).toBe('Junta do Cabeçote');
    expect(toTitleCasePtBr('empresa abc ltda')).toBe('Empresa ABC LTDA');
    expect(toTitleCasePtBr('  JOÃO   DA   SILVA  ')).toBe('João da Silva');
    expect(toTitleCasePtBr('motor ap 1.8 16v mwm')).toBe('Motor AP 1.8 16V MWM');
  });

  it('normalizes email, plate and digit-only fields', () => {
    expect(normalizeEmail(' TESTE@EMAIL.COM ')).toBe('teste@email.com');
    expect(normalizePlate(' abc-1d23 ')).toBe('ABC1D23');
    expect(isValidBrazilianPlate('abc-1234')).toBe(true);
    expect(isValidBrazilianPlate('abc1d23')).toBe(true);
    expect(isValidBrazilianPlate('12abc34')).toBe(false);
    expect(onlyDigits('CPF 123.456.789-10')).toBe('12345678910');
    expect(onlyDigits('(16) 98840-5275 ramal A')).toBe('16988405275');
  });

  it('accepts parseable money values and rejects ambiguous text', () => {
    expect(normalizeMoneyInput('10,50')).toMatchObject({ value: 10.5, normalized: '10.50' });
    expect(normalizeMoneyInput('1.234,56')).toMatchObject({ value: 1234.56, normalized: '1234.56' });
    expect(normalizeMoneyInput('1.234.567')).toMatchObject({ value: 1234567, normalized: '1234567' });
    expect(normalizeMoneyInput('10 reais').error).toBeTruthy();
    expect(normalizeDecimalInputDraft('R$ 10,50abc')).toBe('10,50');
  });

  it('validates due date against a local base date', () => {
    expect(validateDueDateNotBeforeBaseDate('2026-04-24', '2026-04-25')).toBe(false);
    expect(validateDueDateNotBeforeBaseDate('2026-04-25', '2026-04-25')).toBe(true);
    expect(validateDueDateNotBeforeBaseDate('2026-04-26', '2026-04-25')).toBe(true);
  });
});
