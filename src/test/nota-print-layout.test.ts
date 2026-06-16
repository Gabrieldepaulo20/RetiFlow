import { describe, expect, it } from 'vitest';
import { formatNotaClientPrintName } from '@/components/notes/notaPrintLayout';

describe('notaPrintLayout', () => {
  it('prints only the first two useful customer names', () => {
    expect(formatNotaClientPrintName('MARIA APARECIDA DA SILVA OLIVEIRA SANTOS')).toBe('Maria Aparecida');
    expect(formatNotaClientPrintName('José da Silva')).toBe('José Silva');
    expect(formatNotaClientPrintName('JOAO DO CARMO PEREIRA')).toBe('Joao Carmo');
  });

  it('removes common leading titles from printed customer names', () => {
    expect(formatNotaClientPrintName('SRA. ANA CLARA MENDES')).toBe('Ana Clara');
    expect(formatNotaClientPrintName('Dr Roberto de Almeida')).toBe('Roberto Almeida');
  });

  it('keeps company names compact without changing the stored customer name', () => {
    expect(formatNotaClientPrintName('RETIFICA PREMIUM SERVICOS AUTOMOTIVOS LTDA')).toBe('Retifica Premium');
    expect(formatNotaClientPrintName('SERT - CAR RETIFICA DE MOTORES LTDA')).toBe('Sert - Car');
  });
});
