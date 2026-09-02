import { describe, expect, it } from 'vitest';
import {
  normalizeCustomerObservation,
  splitCustomerObservationLines,
} from '@/components/notes/notaCustomerObservation';

describe('observação pública da O.S.', () => {
  it('preserva linhas úteis e normaliza espaços acidentais', () => {
    expect(normalizeCustomerObservation('  Primeira linha  \r\n\tSegunda   linha\n\n\nTerceira  '))
      .toBe('Primeira linha\nSegunda linha\n\nTerceira');
  });

  it('entrega ao documento somente as linhas preenchidas', () => {
    expect(splitCustomerObservationLines('Garantia de 90 dias.\n\nTrazer esta O.S. no retorno.'))
      .toEqual(['Garantia de 90 dias.', 'Trazer esta O.S. no retorno.']);
  });
});
