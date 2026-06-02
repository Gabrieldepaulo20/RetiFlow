import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registrarAcaoFechamento, updateFechamento } from '@/api/supabase/fechamentos';
import { SUPPORT_SESSION_STORAGE_KEY } from '@/services/auth/supportContext';

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
    window.sessionStorage.clear();
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

  it('blocks direct closing mutations while support context is active', async () => {
    window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'validar fechamento',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));

    await expect(updateFechamento('fechamento-1', { p_label: 'Abril' }))
      .rejects
      .toThrow('Ações de escrita em modo suporte estão bloqueadas');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
