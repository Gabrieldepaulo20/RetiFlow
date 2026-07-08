import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFechamentoPDFSignedUrl,
  getFechamentos,
  normalizeFechamentoDadosJson,
  registrarAcaoFechamento,
  updateFechamento,
} from '@/api/supabase/fechamentos';
import { SUPPORT_SESSION_STORAGE_KEY } from '@/services/auth/supportContext';

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  from: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
    functions: {
      invoke: mocks.invoke,
    },
    schema: vi.fn(() => ({
      rpc: mocks.rpc,
    })),
    storage: {
      from: mocks.from,
    },
  },
}));

describe('Fechamentos Supabase mutations', () => {
  beforeEach(() => {
    mocks.createSignedUrl.mockReset();
    mocks.from.mockReset();
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.rpc.mockReset();
    mocks.from.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'access-token-test' } },
      error: null,
    });
    window.localStorage.clear();
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

  it('normalizes partial closing JSON returned by the RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        total: 1,
        dados: [{
          id_fechamentos: 'fechamento-1',
          periodo: 'Junho 2026',
          label: 'Fechamento Junho',
          valor_total: 100,
          dados_json: { periodo: 'Junho 2026', cliente: { nome: 'Cliente A' }, total_com_desconto: 100 },
          cliente: { id: 'cliente-1', nome: 'Cliente A' },
        }],
      },
      error: null,
    });

    const result = await getFechamentos({ p_limite: 10 });

    expect(result.dados[0]?.dados_json?.notas).toEqual([]);
    expect(result.dados[0]?.dados_json?.cliente.nome).toBe('Cliente A');
    expect(result.dados[0]?.dados_json?.total_com_desconto).toBe(100);
  });

  it('keeps closing previews safe when dados_json is malformed', () => {
    const normalized = normalizeFechamentoDadosJson({
      cliente: null,
      notas: 'quebrado',
      recebidas: 'quebrado',
      total_original: 'abc',
      total_com_desconto: '50',
    });

    expect(normalized?.cliente.nome).toBe('Cliente');
    expect(normalized?.notas).toEqual([]);
    expect(normalized?.recebidas).toEqual([]);
    expect(normalized?.total_original).toBe(0);
    expect(normalized?.total_com_desconto).toBe(50);
  });

  it('creates a signed URL directly for stored closing PDFs', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/fechamento.pdf' },
      error: null,
    });

    await expect(getFechamentoPDFSignedUrl('usuario-1/fechamento-1.pdf', { fechamentoId: 'fechamento-1' }))
      .resolves
      .toBe('https://signed.example/fechamento.pdf');

    expect(mocks.from).toHaveBeenCalledWith('fechamentos');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('usuario-1/fechamento-1.pdf', 60 * 60);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('converts legacy public closing URLs into private signed URLs', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/legado.pdf' },
      error: null,
    });

    await expect(getFechamentoPDFSignedUrl(
      'https://dqeoxxokvvcpssajycgq.supabase.co/storage/v1/object/public/fechamentos/usuario-1/fechamento-1.pdf',
      { fechamentoId: 'fechamento-1' },
    ))
      .resolves
      .toBe('https://signed.example/legado.pdf');

    expect(mocks.createSignedUrl).toHaveBeenCalledWith('usuario-1/fechamento-1.pdf', 60 * 60);
  });

  it('uses the Edge Function when opening a closing PDF in support mode', async () => {
    window.localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'retifica@example.com', name: 'Retifica' },
    }));
    mocks.invoke.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/suporte.pdf' },
      error: null,
    });

    await expect(getFechamentoPDFSignedUrl('usuario-1/fechamento-1.pdf', { fechamentoId: 'fechamento-1' }))
      .resolves
      .toBe('https://signed.example/suporte.pdf');

    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith('closing-pdf-url', {
      body: {
        pathOrUrl: 'usuario-1/fechamento-1.pdf',
        closingId: 'fechamento-1',
        support: {
          sessionId: '11111111-1111-4111-8111-111111111111',
          targetUserId: '22222222-2222-4222-8222-222222222222',
        },
        expiresIn: 60 * 60,
      },
      headers: {
        Authorization: 'Bearer access-token-test',
      },
    });
  });

  it('falls back to the Edge Function when direct Storage signing fails', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });
    mocks.invoke.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/fallback.pdf' },
      error: null,
    });

    await expect(getFechamentoPDFSignedUrl('usuario-1/fechamento-1.pdf', { fechamentoId: 'fechamento-1' }))
      .resolves
      .toBe('https://signed.example/fallback.pdf');

    expect(mocks.invoke).toHaveBeenCalledWith('closing-pdf-url', {
      body: {
        pathOrUrl: 'usuario-1/fechamento-1.pdf',
        closingId: 'fechamento-1',
        support: undefined,
        expiresIn: 60 * 60,
      },
      headers: {
        Authorization: 'Bearer access-token-test',
      },
    });
  });
});
