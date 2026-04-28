import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registrarAcaoFechamento, updateFechamento } from '@/api/supabase/fechamentos';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => ({
      rpc: mocks.rpc,
    })),
  },
}));

describe('Fechamentos Supabase mutations', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('accepts void/null RPC responses for update_fechamento', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(updateFechamento('fechamento-1', { p_pdf_url: 'fechamento-1.pdf' })).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('update_fechamento', {
      p_id_fechamentos: 'fechamento-1',
      p_pdf_url: 'fechamento-1.pdf',
    });
  });

  it('accepts successful envelope responses for action logging', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 200, mensagem: 'ok' }, error: null });

    await expect(registrarAcaoFechamento({
      p_id_fechamentos: 'fechamento-1',
      p_tipo: 'baixado',
    })).resolves.toBeUndefined();
  });

  it('throws envelope errors with the RPC name once', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 500, mensagem: 'Falha ao atualizar' },
      error: null,
    });

    await expect(updateFechamento('fechamento-1', { p_label: 'Abril' }))
      .rejects
      .toThrow('[update_fechamento] Falha ao atualizar');
  });

  it('throws transport errors with the RPC name once', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: '[update_fechamento] permissão negada' },
    });

    await expect(updateFechamento('fechamento-1', { p_label: 'Abril' }))
      .rejects
      .toThrow('[update_fechamento] permissão negada');
  });
});
