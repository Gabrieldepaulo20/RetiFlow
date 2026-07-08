import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
}));

vi.mock('@/api/supabase/_base', () => ({
  callRPC: mocks.callRPC,
}));

import { getNotasServico } from '@/api/supabase/notas';

describe('getNotasServico — contrato wire de ordenação', () => {
  beforeEach(() => {
    mocks.callRPC.mockReset();
    mocks.callRPC.mockResolvedValue({ status: 200, mensagem: 'ok', total: 0, dados: [] });
  });

  it("traduz o campo de domínio 'date' para o valor 'data' aceito pelo SQL", async () => {
    await getNotasServico({ p_ordem_campo: 'date', p_ordem_direcao: 'asc' });

    expect(mocks.callRPC).toHaveBeenCalledWith('get_notas_servico', {
      p_ordem_campo: 'data',
      p_ordem_direcao: 'asc',
    });
  });

  it("repassa 'os' sem alteração", async () => {
    await getNotasServico({ p_ordem_campo: 'os', p_ordem_direcao: 'desc' });

    expect(mocks.callRPC).toHaveBeenCalledWith('get_notas_servico', {
      p_ordem_campo: 'os',
      p_ordem_direcao: 'desc',
    });
  });

  it('não injeta p_ordem_campo quando o chamador não pede ordenação', async () => {
    await getNotasServico({ p_limite: 10 });

    expect(mocks.callRPC).toHaveBeenCalledWith('get_notas_servico', { p_limite: 10 });
  });
});
