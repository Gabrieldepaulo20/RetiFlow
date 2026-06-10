import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callRPC, extractDados } from '@/api/supabase/_base';
import { SUPPORT_SESSION_STORAGE_KEY } from '@/services/auth/supportContext';

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
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it('uses the validated support-context RPC for contextual reads', async () => {
    window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'validar cliente',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: [] },
      error: null,
    });

    await callRPC('get_clientes', { p_limite: 10 });

    expect(mocks.rpc).toHaveBeenCalledWith('get_clientes_contexto_suporte', {
      p_limite: 10,
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('restores support context from persistent storage after a page refresh', async () => {
    window.localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'validar gmail',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: { connected: false } },
      error: null,
    });

    await callRPC('get_gmail_connection_status');

    expect(mocks.rpc).toHaveBeenCalledWith('get_gmail_connection_status_contexto_suporte', {
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('uses the validated support-context RPC for monthly closings', async () => {
    window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'validar fechamento',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: [] },
      error: null,
    });

    await callRPC('get_fechamentos', { p_limite: 10 });

    expect(mocks.rpc).toHaveBeenCalledWith('get_fechamentos_contexto_suporte', {
      p_limite: 10,
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('uses audited support-context RPCs for payable writes', async () => {
    window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'registrar conta',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', id_contas_pagar: '33333333-3333-4333-8333-333333333333' },
      error: null,
    });

    await callRPC('insert_conta_pagar', {
      p_titulo: 'Conta suporte',
      p_fk_categorias: '44444444-4444-4444-8444-444444444444',
      p_data_vencimento: '2026-06-30',
      p_valor_original: 100,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('insert_conta_pagar_contexto_suporte', {
      p_titulo: 'Conta suporte',
      p_fk_categorias: '44444444-4444-4444-8444-444444444444',
      p_data_vencimento: '2026-06-30',
      p_valor_original: 100,
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('uses audited support-context RPCs for email suggestion actions', async () => {
    window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'aceitar sugestao',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', id_contas_pagar: '33333333-3333-4333-8333-333333333333' },
      error: null,
    });

    await callRPC('aceitar_sugestao_email', {
      p_id_sugestoes_email: '55555555-5555-4555-8555-555555555555',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('aceitar_sugestao_email_contexto_suporte', {
      p_id_sugestoes_email: '55555555-5555-4555-8555-555555555555',
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('keeps unsupported writes blocked while a support context is active', async () => {
    window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'validar cliente',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));

    // Fechamentos não têm variante de suporte e devem continuar bloqueados
    await expect(callRPC('insert_fechamento', { p_payload: {} })).rejects.toThrow(
      'Ações de escrita em modo suporte estão bloqueadas',
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('uses audited support-context RPCs for nota and client writes', async () => {
    window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'editar nota',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'patricia@example.com', name: 'Patricia' },
    }));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok' },
      error: null,
    });

    await callRPC('update_nota_servico', { p_payload: { id_notas_servico: 'abc' } });
    expect(mocks.rpc).toHaveBeenCalledWith('update_nota_servico_contexto_suporte', {
      p_payload: { id_notas_servico: 'abc' },
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });

    mocks.rpc.mockClear();
    await callRPC('novo_cliente', { p_payload: { nome: 'Patricia' } });
    expect(mocks.rpc).toHaveBeenCalledWith('salvar_cliente_completo_contexto_suporte', {
      p_payload: { nome: 'Patricia' },
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('extractDados returns data and rejects absent data explicitly', () => {
    expect(extractDados({ status: 200, mensagem: 'ok', dados: { id: '1' } }, 'get_algo')).toEqual({ id: '1' });
    expect(() => extractDados({ status: 200, mensagem: 'ok' }, 'get_algo')).toThrow("Campo 'dados' ausente");
  });
});
