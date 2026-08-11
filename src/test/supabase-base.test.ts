import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callRPC, callVoidRPC, extractDados } from '@/api/supabase/_base';
import {
  setActiveSupportSession,
  SUPPORT_SESSION_STORAGE_KEY,
} from '@/services/auth/supportContext';

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

function makeActiveSupportSession(reason = 'Atendimento de suporte validado') {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reason,
    startedAt: '2026-07-30T12:00:00.000Z',
    expiresAt: null,
    actorUser: {
      id: 'actor-id',
      email: 'gabrielwilliam208@gmail.com',
      name: 'Gabriel',
      role: 'ADMIN' as const,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      moduleAccess: { admin: true },
    },
    targetUser: {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'patricia@example.com',
      name: 'Patricia',
      role: 'RECEPCAO' as const,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('Supabase RPC base wrapper', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.logError.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    setActiveSupportSession(null);
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

  it('accepts a successful void RPC response', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(callVoidRPC('insert_log', { p_acao: 'UI_ACTIVITY' })).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('insert_log', { p_acao: 'UI_ACTIVITY' });
  });

  it('uses the validated support-context RPC for contextual reads', async () => {
    setActiveSupportSession(makeActiveSupportSession('validar cliente'));
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

  it('does not trust a persisted support candidate before server validation', async () => {
    window.sessionStorage.setItem(
      SUPPORT_SESSION_STORAGE_KEY,
      JSON.stringify(makeActiveSupportSession('validar gmail')),
    );
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: { connected: false } },
      error: null,
    });

    await callRPC('get_gmail_connection_status');

    expect(mocks.rpc).toHaveBeenCalledWith('get_gmail_connection_status', {});
  });

  it('uses the validated support-context RPC for monthly closings', async () => {
    setActiveSupportSession(makeActiveSupportSession('validar fechamento'));
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

  it('loads closing document settings through the validated support session', async () => {
    setActiveSupportSession(makeActiveSupportSession('validar template do fechamento'));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: {} },
      error: null,
    });

    await callRPC('get_configuracao_modelo_usuario', {
      p_fk_usuarios: '22222222-2222-4222-8222-222222222222',
    });
    await callRPC('resolver_configuracao_documento', {
      p_fk_usuarios: '22222222-2222-4222-8222-222222222222',
      p_document_type: 'closing_report',
      p_generated_at: null,
    });

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'get_configuracao_modelo_usuario_contexto_suporte',
      {
        p_fk_usuarios: '22222222-2222-4222-8222-222222222222',
        p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
        p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'resolver_configuracao_documento_contexto_suporte',
      {
        p_fk_usuarios: '22222222-2222-4222-8222-222222222222',
        p_document_type: 'closing_report',
        p_generated_at: null,
        p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
        p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
      },
    );
  });

  it('maps the new closing reads to audited support-context RPCs', async () => {
    setActiveSupportSession(makeActiveSupportSession('validar parcelas do fechamento'));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: {} },
      error: null,
    });

    await callRPC('get_fechamentos_abertos_cliente', {
      p_fk_clientes: 'cliente-1',
    });
    await callRPC('get_parcelas_fechamento', {
      p_id_fechamentos: 'fechamento-1',
    });

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'get_fechamentos_abertos_cliente_contexto_suporte',
      {
        p_fk_clientes: 'cliente-1',
        p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
        p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'get_parcelas_fechamento_contexto_suporte',
      {
        p_id_fechamentos: 'fechamento-1',
        p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
        p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
      },
    );
  });

  it('uses audited support-context RPCs for payable writes', async () => {
    setActiveSupportSession(makeActiveSupportSession('registrar conta'));
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

  it('uses audited support-context RPCs when renaming a payable', async () => {
    setActiveSupportSession(makeActiveSupportSession('renomear conta'));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok' },
      error: null,
    });

    await callRPC('update_conta_pagar', {
      p_id_contas_pagar: '33333333-3333-4333-8333-333333333333',
      p_titulo: 'Ferpeças Ribeirão Preto',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('update_conta_pagar_contexto_suporte', {
      p_id_contas_pagar: '33333333-3333-4333-8333-333333333333',
      p_titulo: 'Ferpeças Ribeirão Preto',
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('uses audited support-context RPCs for email suggestion actions', async () => {
    setActiveSupportSession(makeActiveSupportSession('aceitar sugestão'));
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
    setActiveSupportSession(makeActiveSupportSession('validar cliente'));

    // O contrato legado continua sem variante auditada.
    await expect(callRPC('insert_fechamento', { p_payload: {} })).rejects.toThrow(
      'Ações de escrita em modo suporte estão bloqueadas',
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps closing finalization to the audited support-context RPC', async () => {
    setActiveSupportSession(makeActiveSupportSession('criar fechamento sem entrada'));
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: { id_fechamentos: 'fechamento-1' } },
      error: null,
    });

    await callRPC('finalizar_fechamento', {
      p_id_fechamentos: 'fechamento-1',
      p_recebimento_valor: null,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('finalizar_fechamento_contexto_suporte', {
      p_id_fechamentos: 'fechamento-1',
      p_recebimento_valor: null,
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('keeps PDF, payment and reversal writes blocked in support mode', async () => {
    setActiveSupportSession(makeActiveSupportSession('validar bloqueio financeiro'));

    const writes = [
      ['atualizar_pdf_fechamento', { p_id_fechamentos: 'fechamento-1', p_pdf_url: 'arquivo.pdf' }],
      ['atualizar_pdf_fechamento_seguro', {
        p_id_fechamentos: 'fechamento-1',
        p_pdf_url: 'arquivo-0.pdf',
        p_valor_recebido_esperado: 0,
      }],
      ['registrar_parcela_fechamento', { p_id_fechamentos: 'fechamento-1', p_valor: 400 }],
      ['estornar_parcela_fechamento', { p_id_fechamentos: 'fechamento-1', p_id_financeiro_movimentos: 'movimento-2' }],
    ] as const;

    for (const [rpcName, params] of writes) {
      await expect(callRPC(rpcName, params)).rejects.toThrow(
        `[${rpcName}] Ações de escrita em modo suporte estão bloqueadas`,
      );
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('blocks insert_log in support mode instead of attributing it to the Mega Master', async () => {
    setActiveSupportSession(makeActiveSupportSession('auditar atividade'));

    await expect(callVoidRPC('insert_log', { p_acao: 'UI_ACTIVITY' })).rejects.toThrow(
      'Ações de escrita em modo suporte estão bloqueadas',
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('uses audited support-context RPCs for nota and client writes', async () => {
    setActiveSupportSession(makeActiveSupportSession('editar nota'));
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
