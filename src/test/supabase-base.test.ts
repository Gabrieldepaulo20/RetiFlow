import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callRPC, extractDados } from '@/api/supabase/_base';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => ({
      rpc: mocks.rpc,
    })),
  },
}));

vi.mock('@/lib/monitoring', () => ({
  logError: mocks.logError,
}));

describe('Supabase RPC base wrapper', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.logError.mockReset();
  });

  it('returns the standard envelope when the RPC succeeds', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: [{ id: '1' }], total: 1 },
      error: null,
    });

    await expect(callRPC('get_algo', { p_limite: 1 })).resolves.toEqual({
      status: 200,
      mensagem: 'ok',
      dados: [{ id: '1' }],
      total: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_algo', { p_limite: 1 });
  });

  it('throws and logs transport errors from Supabase', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'JWT expired' },
    });

    await expect(callRPC('get_algo')).rejects.toThrow('[get_algo] JWT expired');
    expect(mocks.logError).toHaveBeenCalledOnce();
  });

  it('throws when the RPC does not return a valid envelope', async () => {
    mocks.rpc.mockResolvedValue({
      data: { dados: [] },
      error: null,
    });

    await expect(callRPC('get_algo')).rejects.toThrow('Resposta inesperada do servidor');
    expect(mocks.logError).toHaveBeenCalledOnce();
  });

  it('throws and logs business errors from the envelope status', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 401, mensagem: 'Não autenticado' },
      error: null,
    });

    await expect(callRPC('insert_algo')).rejects.toThrow('[insert_algo] Não autenticado');
    expect(mocks.logError).toHaveBeenCalledOnce();
  });

  it('extractDados returns data and rejects absent data explicitly', () => {
    expect(extractDados({ status: 200, mensagem: 'ok', dados: { id: '1' } }, 'get_algo')).toEqual({ id: '1' });
    expect(() => extractDados({ status: 200, mensagem: 'ok' }, 'get_algo')).toThrow("Campo 'dados' ausente");
  });
});
