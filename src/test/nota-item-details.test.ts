import { describe, expect, it } from 'vitest';
import { getNotaItemDetailLines } from '@/components/notes/notaItemDetails';

describe('nota item details', () => {
  it('keeps detail-only lines as indented PDF lines', () => {
    expect(getNotaItemDetailLines({
      descricao: 'Retifica Cabeçote',
      detalhes: 'Trocar juntas\nLimpeza completa',
    })).toEqual(['Trocar juntas', 'Limpeza completa']);
  });

  it('removes duplicated first line when legacy details include the service name', () => {
    expect(getNotaItemDetailLines({
      descricao: 'Retifica Cabeçote',
      detalhes: 'Retifica Cabeçote\nTrocar juntas\nLimpeza completa',
    })).toEqual(['Trocar juntas', 'Limpeza completa']);
  });
});
