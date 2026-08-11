import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  atualizarFechamentoPdf,
  finalizarFechamento,
  getAllFechamentos,
  getFechamentoPDFSignedUrl,
  getFechamentos,
  getFechamentosAbertosCliente,
  normalizeFechamentoDadosJson,
  registrarAcaoFechamento,
  type FinalizarFechamentoInput,
  uploadFechamentoPDF,
} from '@/api/supabase/fechamentos';
import { setActiveSupportSession } from '@/services/auth/supportContext';

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
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

function activateSupportContext() {
  setActiveSupportSession({
    id: '11111111-1111-4111-8111-111111111111',
    reason: 'Atendimento de fechamento validado',
    startedAt: '2026-07-30T12:00:00.000Z',
    expiresAt: null,
    actorUser: {
      id: 'actor-id',
      email: 'gabrielwilliam208@gmail.com',
      name: 'Gabriel',
      role: 'ADMIN',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      moduleAccess: { admin: true },
    },
    targetUser: {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'retifica@example.com',
      name: 'Retifica',
      role: 'RECEPCAO',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  });
}

const FINAL_CLOSING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FINAL_CLIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FINAL_NOTE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FINAL_ACCOUNT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FINAL_PAYMENT_DATE = '2026-08-08T12:00:00-03:00';

const finalizarInput: FinalizarFechamentoInput = {
  id: FINAL_CLOSING_ID,
  clienteId: FINAL_CLIENT_ID,
  mes: 'Agosto',
  ano: 2026,
  periodo: 'Agosto/2026',
  label: 'Fechamento Agosto 2026',
  valorTotal: 1_000,
  dadosJson: {
    gerado_em: '2026-08-08T12:00:00.000Z',
    periodo: 'Agosto/2026',
    cliente: { id: FINAL_CLIENT_ID, nome: 'Cliente A' },
    competencia: { modo: 'MENSAL', inicio: '2026-08-01', fim: '2026-08-31' },
    notas: [{
      id: FINAL_NOTE_ID,
      os: 'OS-1',
      veiculo: 'Gol',
      placa: null,
      itens: [],
      valor_total_os: 1_000,
      valor_recebido: 0,
      saldo_aberto: 1_000,
      total_original: 1_000,
      desconto_nota: 0,
      total_com_desconto: 1_000,
    }],
    total_original: 1_000,
    total_com_desconto: 1_000,
    recebimento_inicial: {
      valor: 600,
      data_efetiva: FINAL_PAYMENT_DATE,
      conta_id: FINAL_ACCOUNT_ID,
      forma_pagamento: 'CHEQUE',
      observacoes: 'Primeiro cheque',
      chave_idempotencia: 'parcela-inicial-fechamento-novo-1',
    },
  },
  idempotencyKey: 'finalizar-fechamento-novo-1',
  pagamentoInicial: {
    valor: 600,
    dataEfetiva: FINAL_PAYMENT_DATE,
    contaId: FINAL_ACCOUNT_ID,
    formaPagamento: 'CHEQUE',
    observacoes: 'Primeiro cheque',
    idempotencyKey: 'parcela-inicial-fechamento-novo-1',
  },
};

describe('Fechamentos Supabase mutations', () => {
  beforeEach(() => {
    mocks.createSignedUrl.mockReset();
    mocks.from.mockReset();
    mocks.getUser.mockReset();
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.rpc.mockReset();
    mocks.upload.mockReset();
    mocks.from.mockReturnValue({ createSignedUrl: mocks.createSignedUrl, upload: mocks.upload });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'usuario-1' } }, error: null });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'access-token-test' } },
      error: null,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    setActiveSupportSession(null);
  });

  it('accepts void/null RPC responses for action logging', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(registrarAcaoFechamento({
      p_id_fechamentos: 'fechamento-1',
      p_tipo: 'baixado',
    })).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_acao_fechamento', {
      p_id_fechamentos: 'fechamento-1',
      p_tipo: 'baixado',
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

    await expect(registrarAcaoFechamento({
      p_id_fechamentos: 'fechamento-1',
      p_tipo: 'compartilhado',
    }))
      .rejects
      .toThrow('[registrar_acao_fechamento] Falha ao atualizar');
  });

  it('throws transport errors with the RPC name once', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: '[registrar_acao_fechamento] permissão negada' },
    });

    await expect(registrarAcaoFechamento({
      p_id_fechamentos: 'fechamento-1',
      p_tipo: 'regenerado',
    }))
      .rejects
      .toThrow('[registrar_acao_fechamento] permissão negada');
  });

  it('blocks direct closing mutations while support context is active', async () => {
    activateSupportContext();

    await expect(registrarAcaoFechamento({
      p_id_fechamentos: 'fechamento-1',
      p_tipo: 'baixado',
    }))
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
          dados_json: {
            periodo: 'Junho 2026',
            cliente: { nome: 'Cliente A' },
            competencia: { modo: 'MENSAL', inicio: '2026-06-01', fim: '2026-06-30' },
            total_com_desconto: 100,
          },
          cliente: { id: 'cliente-1', nome: 'Cliente A' },
        }],
      },
      error: null,
    });

    const result = await getFechamentos({ p_limite: 10 });

    expect(result.dados[0]?.dados_json?.notas).toEqual([]);
    expect(result.dados[0]?.dados_json?.cliente.nome).toBe('Cliente A');
    expect(result.dados[0]?.dados_json?.competencia).toEqual({
      modo: 'MENSAL',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    });
    expect(result.dados[0]?.dados_json?.total_com_desconto).toBe(100);
  });

  it('normalizes partial payment status and received amount from closings', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        total: 1,
        dados: [{
          id_fechamentos: 'fechamento-parcial',
          periodo: 'Julho 2026',
          label: 'Fechamento Julho',
          valor_total: 1000,
          status_pagamento: 'PARCIAL',
          valor_recebido: '350.50',
          dados_json: null,
          cliente: { id: 'cliente-1', nome: 'Cliente A' },
        }],
      },
      error: null,
    });

    const result = await getFechamentos();

    expect(result.dados[0]?.status_pagamento).toBe('PARCIAL');
    expect(result.dados[0]?.valor_recebido).toBe(350.5);
    expect(result.dados[0]?.valorRecebido).toBe(350.5);
  });

  it('pagina a listagem completa de fechamentos sem parar nos primeiros 500', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          status: 200,
          total: 3,
          dados: [
            { id_fechamentos: 'fechamento-1', valor_total: 100, dados_json: null },
            { id_fechamentos: 'fechamento-2', valor_total: 200, dados_json: null },
          ],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: 200,
          total: 3,
          dados: [{ id_fechamentos: 'fechamento-3', valor_total: 300, dados_json: null }],
        },
        error: null,
      });

    const result = await getAllFechamentos({ pageSize: 2 });

    expect(result.map((item) => item.id_fechamentos)).toEqual([
      'fechamento-1',
      'fechamento-2',
      'fechamento-3',
    ]);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'get_fechamentos', {
      p_limite: 2,
      p_offset: 0,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'get_fechamentos', {
      p_limite: 2,
      p_offset: 2,
    });
  });

  it('adapta fechamentos abertos do cliente e envia somente o identificador esperado', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: {
          cliente_id: 'cliente-1',
          quantidade: '2',
          saldo_total: '700.50',
          fechamentos: [
            {
              id_fechamentos: 'fechamento-1',
              periodo: 'Junho/2026',
              label: 'Fechamento Junho',
              valor_total: '1000',
              valor_recebido: '600',
              valor_aberto: '400',
              status_pagamento: 'PARCIAL',
              created_at: '2026-07-01T12:00:00.000Z',
            },
            {
              id: 'fechamento-2',
              periodo: 'Julho/2026',
              valorTotal: 300.5,
              valorRecebido: 0,
              saldo: 300.5,
              status: 'PENDENTE',
            },
            { label: 'linha sem id' },
          ],
        },
      },
      error: null,
    });

    await expect(getFechamentosAbertosCliente('cliente-1')).resolves.toEqual({
      clienteId: 'cliente-1',
      quantidade: 2,
      saldoTotal: 700.5,
      fechamentos: [
        {
          id: 'fechamento-1',
          periodo: 'Junho/2026',
          label: 'Fechamento Junho',
          valorTotal: 1_000,
          valorRecebido: 600,
          saldo: 400,
          status: 'PARCIAL',
          createdAt: '2026-07-01T12:00:00.000Z',
        },
        {
          id: 'fechamento-2',
          periodo: 'Julho/2026',
          label: 'Fechamento',
          valorTotal: 300.5,
          valorRecebido: 0,
          saldo: 300.5,
          status: 'PENDENTE',
          createdAt: null,
        },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_fechamentos_abertos_cliente', {
      p_fk_clientes: 'cliente-1',
    });
  });

  it('finaliza com parâmetros exatos e expõe retry idempotente do envelope', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          status: 200,
          mensagem: 'ok',
          dados: {
            id_fechamentos: FINAL_CLOSING_ID,
            movimento_id: 'movimento-parcela-1',
            status: 'PARCIAL',
            valor_recebido: '600',
            valor_aberto: '400',
            idempotent_retry: false,
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: 200,
          mensagem: 'retry',
          dados: {
            id_fechamentos: FINAL_CLOSING_ID,
            movimento_id: 'movimento-parcela-1',
            status: 'PARCIAL',
            valor_recebido: 600,
            valor_aberto: 400,
            idempotent_retry: true,
          },
        },
        error: null,
      });

    const first = await finalizarFechamento(finalizarInput);
    const retry = await finalizarFechamento(finalizarInput);

    expect(first).toEqual({
      id: FINAL_CLOSING_ID,
      movimentoId: 'movimento-parcela-1',
      status: 'PARCIAL',
      valorRecebido: 600,
      valorAberto: 400,
      idempotentRetry: false,
    });
    expect(retry).toEqual({ ...first, idempotentRetry: true });

    const expectedParams = {
      p_id_fechamentos: FINAL_CLOSING_ID,
      p_fk_clientes: FINAL_CLIENT_ID,
      p_mes: 'Agosto',
      p_ano: 2026,
      p_periodo: 'Agosto/2026',
      p_label: 'Fechamento Agosto 2026',
      p_valor_total: 1_000,
      p_dados_json: finalizarInput.dadosJson,
      p_pdf_url: null,
      p_chave_idempotencia: 'finalizar-fechamento-novo-1',
      p_fk_template_documento: null,
      p_documento_tema_snapshot: null,
      p_documento_config_snapshot: null,
      p_recebimento_valor: 600,
      p_recebimento_data: FINAL_PAYMENT_DATE,
      p_recebimento_conta: FINAL_ACCOUNT_ID,
      p_recebimento_forma: 'CHEQUE',
      p_recebimento_observacoes: 'Primeiro cheque',
      p_recebimento_idempotencia: 'parcela-inicial-fechamento-novo-1',
    };
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'finalizar_fechamento', expectedParams);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'finalizar_fechamento', expectedParams);
  });

  it('rejeita resposta de finalização sem identificador', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 200, mensagem: 'ok', dados: { status: 'PENDENTE' } },
      error: null,
    });

    await expect(finalizarFechamento(finalizarInput))
      .rejects
      .toThrow('[finalizar_fechamento] Resposta sem identificador do fechamento.');
  });

  it('vincula PDF versionado somente se o recebido continuar igual', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 200, mensagem: 'ok' }, error: null });

    await expect(atualizarFechamentoPdf(
      'fechamento-novo-1',
      'usuario-1/fechamento-novo-1-60000.pdf',
      { expectedValorRecebido: 600 },
    )).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('atualizar_pdf_fechamento_seguro', {
      p_id_fechamentos: 'fechamento-novo-1',
      p_pdf_url: 'usuario-1/fechamento-novo-1-60000.pdf',
      p_valor_recebido_esperado: 600,
    });
  });

  it('faz upload do PDF em um path versionado pelo recebido', async () => {
    mocks.upload.mockResolvedValue({ data: { path: 'ok' }, error: null });
    const blob = new Blob(['pdf'], { type: 'application/pdf' });

    await expect(uploadFechamentoPDF(
      'fechamento-novo-1',
      blob,
      { versionCents: 60000 },
    )).resolves.toBe('usuario-1/fechamento-novo-1-60000.pdf');
    expect(mocks.upload).toHaveBeenCalledWith(
      'usuario-1/fechamento-novo-1-60000.pdf',
      blob,
      { contentType: 'application/pdf', cacheControl: '3600', upsert: true },
    );
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

  it('preserves partial receipt audit fields in the closing snapshot', () => {
    const normalized = normalizeFechamentoDadosJson({
      periodo: 'Julho 2026',
      cliente: { id: 'cliente-1', nome: 'Cliente A' },
      notas: [{
        id: 'nota-1',
        os: 'OS-1',
        veiculo: 'Gol',
        itens: [],
        valor_total_os: '500',
        valor_recebido: '175',
        saldo_aberto: '325',
        total_original: '325',
        desconto_nota: 0,
        total_com_desconto: '325',
      }],
      recebidas: [{
        id: 'nota-1',
        os: 'OS-1',
        veiculo: 'Gol',
        total: '175',
        valor_recebido: '175',
        total_os: '500',
        saldo_aberto: '325',
      }],
    });

    expect(normalized?.notas[0]).toMatchObject({
      valor_total_os: 500,
      valor_recebido: 175,
      saldo_aberto: 325,
      total_original: 325,
    });
    expect(normalized?.recebidas?.[0]).toMatchObject({
      total: 175,
      valor_recebido: 175,
      total_os: 500,
      saldo_aberto: 325,
    });
    expect(normalized?.total_ja_recebido).toBe(175);
  });

  it('preserves the immutable item baseline used to audit line discounts', () => {
    const normalized = normalizeFechamentoDadosJson({
      periodo: 'Julho 2026',
      cliente: { id: 'cliente-1', nome: 'Cliente A' },
      notas: [{
        id: 'nota-1',
        os: 'OS-1',
        veiculo: 'Gol',
        itens: [{
          id: 'item-1',
          descricao: 'Retífica completa',
          quantidade: 1,
          preco_unitario: 560,
          desconto_original: 0,
          desconto_porcentagem: 5,
          subtotal_original: 560,
          subtotal: 532,
        }],
        total_original: 560,
        desconto_nota: 0,
        total_com_desconto: 532,
      }],
    });

    expect(normalized?.notas[0]?.itens[0]).toMatchObject({
      id: 'item-1',
      desconto_original: 0,
      desconto_porcentagem: 5,
      subtotal_original: 560,
      subtotal: 532,
    });
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

  it('asks Supabase Storage for a downloadable signed URL when filename is provided', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/fechamento.pdf?download=Fechamento.pdf' },
      error: null,
    });

    await expect(getFechamentoPDFSignedUrl('usuario-1/fechamento-1.pdf', {
      fechamentoId: 'fechamento-1',
      downloadFilename: 'Fechamento Retifica Junho 2026.pdf',
    }))
      .resolves
      .toBe('https://signed.example/fechamento.pdf?download=Fechamento.pdf');

    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      'usuario-1/fechamento-1.pdf',
      60 * 60,
      { download: 'Fechamento Retifica Junho 2026.pdf' },
    );
  });

  it('uses the Edge Function when opening a closing PDF in support mode', async () => {
    activateSupportContext();
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

  it('passes the download filename through the Edge Function in support mode', async () => {
    activateSupportContext();
    mocks.invoke.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/suporte.pdf?download=1' },
      error: null,
    });

    await expect(getFechamentoPDFSignedUrl('usuario-1/fechamento-1.pdf', {
      fechamentoId: 'fechamento-1',
      downloadFilename: 'Fechamento Retifica Junho 2026.pdf',
    }))
      .resolves
      .toBe('https://signed.example/suporte.pdf?download=1');

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
        downloadFilename: 'Fechamento Retifica Junho 2026.pdf',
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
