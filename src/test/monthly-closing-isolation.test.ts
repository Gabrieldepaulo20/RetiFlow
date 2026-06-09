import { describe, expect, it } from 'vitest';
import type { FechamentoListItem } from '@/api/supabase/fechamentos';
import {
  filterFechamentosForClientScope,
  getMonthlyClosingDraftsStorageKey,
} from '@/services/domain/monthlyClosingIsolation';

function makeFechamento(id: string, clienteId: string | null): FechamentoListItem {
  return {
    id_fechamentos: id,
    mes: 'Junho',
    ano: 2026,
    periodo: 'Junho 2026',
    label: `Fechamento ${id}`,
    valor_total: 100,
    versao: 1,
    total_regeneracoes: 0,
    total_edicoes: 0,
    total_downloads: 0,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: null,
    cliente: clienteId ? { id: clienteId, nome: `Cliente ${clienteId}` } : null,
    dados_json: null,
    pdf_url: null,
  };
}

describe('monthly closing tenant isolation helpers', () => {
  it('scopes local draft storage by current operational user', () => {
    expect(getMonthlyClosingDraftsStorageKey('user-a')).toBe('retiflow:monthly-closing-drafts:v2:user-a');
    expect(getMonthlyClosingDraftsStorageKey('user-b')).toBe('retiflow:monthly-closing-drafts:v2:user-b');
    expect(getMonthlyClosingDraftsStorageKey(null)).toBeNull();
  });

  it('hides closings whose client is not in the current account scope', () => {
    const fechamentos = [
      makeFechamento('closing-1', 'client-allowed'),
      makeFechamento('closing-2', 'client-other-account'),
      makeFechamento('closing-3', null),
    ];

    expect(filterFechamentosForClientScope(fechamentos, ['client-allowed'])).toEqual([
      fechamentos[0],
    ]);
  });

  it('returns no closings until the client scope is known', () => {
    expect(filterFechamentosForClientScope([makeFechamento('closing-1', 'client-1')], [])).toEqual([]);
  });
});
