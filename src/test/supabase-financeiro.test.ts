import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adaptFinanceiroLancamento,
  adaptFinanceiroMovimento,
  estornarMovimentoFinanceiro,
  extractFinanceiroStoragePath,
  gerarContasRecorrentes,
  getAllFinanceiroExtrato,
  getFinanceiroAnexoSignedUrl,
  getFinanceiroContas,
  getFinanceiroExtrato,
  getFinanceiroLancamentos,
  getFinanceiroResumo,
  registrarPagamentoConta,
  registrarRecebimentoManual,
  registrarRecebimentoNota,
  transferirContasFinanceiras,
  uploadFinanceiroComprovante,
} from '@/api/supabase/financeiro';
import { setActiveSupportSession } from '@/services/auth/supportContext';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => ({ rpc: mocks.rpc })),
    storage: { from: mocks.from },
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
    },
    functions: { invoke: mocks.invoke },
  },
}));

function activateSupportContext() {
  setActiveSupportSession({
    id: '11111111-1111-4111-8111-111111111111',
    reason: 'Consulta financeira autorizada',
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
      name: 'Retífica Premium',
      role: 'RECEPCAO',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  });
}

describe('Supabase Financeiro adapters', () => {
  it('normaliza lançamentos parciais e valores numéricos do wire format', () => {
    expect(adaptFinanceiroLancamento({
      id_lancamento: 'lancamento-1',
      direcao: 'SAIDA',
      origem: 'CONTA_PAGAR',
      titulo: 'Energia elétrica',
      forma_pagamento: 'PIX',
      valor_previsto: '550.75',
      valor_realizado: '200',
      valor_aberto: '350.75',
      status: 'PARCIAL',
      revisar: false,
    })).toMatchObject({
      id: 'lancamento-1',
      direcao: 'SAIDA',
      origem: 'CONTA_PAGAR',
      descricao: 'Energia elétrica',
      formaPagamento: 'PIX',
      previsto: 550.75,
      realizado: 200,
      aberto: 350.75,
      status: 'PARCIAL',
    });
  });

  it('descarta movimento incompleto e mantém saldo acumulado zero', () => {
    expect(adaptFinanceiroMovimento({ id_movimento: 'sem-data' })).toBeNull();
    expect(adaptFinanceiroMovimento({
      id_movimento: 'mov-1',
      data_efetiva: '2026-07-30',
      fk_conta_financeira: 'conta-1',
      direcao: 'ENTRADA',
      origem: 'NOTA_SERVICO',
      valor: '100',
      saldo_acumulado: 0,
    })).toMatchObject({
      id: 'mov-1',
      contaId: 'conta-1',
      valor: 100,
      saldoAcumulado: 0,
    });
  });

  it('extrai somente caminhos do bucket financeiro conhecido', () => {
    expect(extractFinanceiroStoragePath('tenant/mov-1/comprovante.pdf'))
      .toBe('tenant/mov-1/comprovante.pdf');
    expect(extractFinanceiroStoragePath(
      'https://project.supabase.co/storage/v1/object/sign/financeiro-comprovantes/tenant/mov-1/comprovante.pdf?token=x',
    )).toBe('tenant/mov-1/comprovante.pdf');
    expect(extractFinanceiroStoragePath('https://example.com/publico.pdf')).toBeNull();
  });
});

describe('Supabase Financeiro RPCs', () => {
  beforeEach(() => {
    setActiveSupportSession(null);
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.upload.mockReset();
    mocks.createSignedUrl.mockReset();
    mocks.getUser.mockReset();
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.from.mockReturnValue({
      upload: mocks.upload,
      createSignedUrl: mocks.createSignedUrl,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'access-token-test' } },
      error: null,
    });
  });

  it('adapta o resumo financeiro sem expor o envelope do banco', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: {
          saldo_inicial_informado: true,
          saldo_anterior: '1000',
          entradas_recebidas: 800,
          saidas_pagas: 300,
          saldo_atual: 1500,
          a_receber: 400,
          a_pagar: 150,
          saldo_projetado: 1750,
        },
      },
      error: null,
    });

    await expect(getFinanceiroResumo({
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
      p_modo: 'CAIXA',
    })).resolves.toMatchObject({
      saldoInicialInformado: true,
      saldoAnterior: 1000,
      entradasRecebidas: 800,
      saidasPagas: 300,
      saldoAtual: 1500,
      saldoProjetado: 1750,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_financeiro_resumo', {
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
      p_modo: 'CAIXA',
    });
  });

  it('mantém explícito quando o saldo inicial ainda não foi informado', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: {
          saldo_inicial_informado: false,
          saldo_anterior: 0,
          entradas_recebidas: 900,
          saidas_pagas: 250,
          saldo_atual: 650,
          resultado_periodo: 650,
        },
      },
      error: null,
    });

    await expect(getFinanceiroResumo({
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
    })).resolves.toMatchObject({
      saldoInicialInformado: false,
      saldoAnterior: 0,
      saldoAtual: 650,
      resultadoPeriodo: 650,
    });
  });

  it('mantém paginação e remove linhas inválidas retornadas pelo backend', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        total: 2,
        dados: [
          {
            id_lancamento: 'lancamento-1',
            direcao: 'ENTRADA',
            origem: 'FECHAMENTO',
            descricao: 'Fechamento julho',
            previsto: 1000,
            realizado: 500,
            aberto: 500,
            status: 'PARCIAL',
          },
          { descricao: 'sem id' },
        ],
      },
      error: null,
    });

    const result = await getFinanceiroLancamentos({
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
      p_limite: 50,
      p_offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.dados).toHaveLength(1);
    expect(result.dados[0]?.status).toBe('PARCIAL');
  });

  it('envia recebimento parcial com data e idempotência explícitas', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: {
          id_movimento: 'movimento-1',
          status: 'PARCIAL',
          valor_realizado: 200,
          valor_aberto: 300,
        },
      },
      error: null,
    });

    await expect(registrarRecebimentoNota({
      notaId: 'nota-1',
      valor: 200,
      dataEfetiva: '2026-07-29',
      contaId: 'conta-1',
      formaPagamento: 'PIX',
      observacoes: 'Entrada parcial',
      idempotencyKey: 'receive-note-1-200',
    })).resolves.toEqual({
      id: 'movimento-1',
      movimentoId: 'movimento-1',
      status: 'PARCIAL',
      valorRealizado: 200,
      valorAberto: 300,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('registrar_recebimento_nota', {
      p_id_notas_servico: 'nota-1',
      p_valor: 200,
      p_data_efetiva: '2026-07-29',
      p_fk_conta_financeira: 'conta-1',
      p_forma_pagamento: 'PIX',
      p_observacoes: 'Entrada parcial',
      p_idempotency_key: 'receive-note-1-200',
    });
  });

  it('registra pagamento parcial da saída na data escolhida sem alterar a chave idempotente', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: {
          id_movimento: 'pagamento-1',
          status: 'PARCIAL',
          valor_realizado: 125,
          valor_aberto: 375,
        },
      },
      error: null,
    });

    const input = {
      contaPagarId: 'conta-pagar-1',
      valor: 125,
      dataEfetiva: '2026-07-18',
      contaId: 'caixa-1',
      formaPagamento: 'PIX' as const,
      observacoes: 'Primeira parcela',
      idempotencyKey: 'pay-conta-1-parcela-1',
    };

    const first = await registrarPagamentoConta(input);
    const retry = await registrarPagamentoConta(input);

    expect(first).toEqual(retry);
    expect(first).toMatchObject({
      movimentoId: 'pagamento-1',
      status: 'PARCIAL',
      valorRealizado: 125,
      valorAberto: 375,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'registrar_pagamento_conta', {
      p_id_contas_pagar: 'conta-pagar-1',
      p_valor: 125,
      p_data_efetiva: '2026-07-18',
      p_fk_conta_financeira: 'caixa-1',
      p_forma_pagamento: 'PIX',
      p_observacoes: 'Primeira parcela',
      p_idempotency_key: 'pay-conta-1-parcela-1',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'registrar_pagamento_conta', {
      p_id_contas_pagar: 'conta-pagar-1',
      p_valor: 125,
      p_data_efetiva: '2026-07-18',
      p_fk_conta_financeira: 'caixa-1',
      p_forma_pagamento: 'PIX',
      p_observacoes: 'Primeira parcela',
      p_idempotency_key: 'pay-conta-1-parcela-1',
    });
  });

  it('mantém fechamento líquido como uma única linha sem sintetizar O.S. filhas', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        total: 1,
        dados: [{
          id_lancamento: 'fechamento:1',
          origem: 'FECHAMENTO',
          origem_id: 'fechamento-1',
          origem_numero: 'FEC-1',
          direcao: 'ENTRADA',
          descricao: 'Fechamento líquido de julho',
          previsto: 1200,
          realizado: 1200,
          aberto: 0,
          status: 'PAGO',
        }],
      },
      error: null,
    });

    const result = await getFinanceiroLancamentos({
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
      p_origem: 'FECHAMENTO',
    });

    expect(result.total).toBe(1);
    expect(result.dados).toHaveLength(1);
    expect(result.dados[0]).toMatchObject({
      origem: 'FECHAMENTO',
      origemId: 'fechamento-1',
      previsto: 1200,
      realizado: 1200,
    });
    expect(result.dados.some((item) => item.origem === 'NOTA_SERVICO')).toBe(false);
  });

  it('estorna pelo movimento original preservando motivo, data e idempotência', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: {
          id_movimento: 'estorno-1',
          movimento_id: 'estorno-1',
          status: 'PAGO',
        },
      },
      error: null,
    });

    await expect(estornarMovimentoFinanceiro({
      movimentoId: 'movimento-1',
      motivo: 'Pagamento lançado em duplicidade',
      dataEfetiva: '2026-07-21',
      idempotencyKey: 'reverse-movimento-1',
    })).resolves.toMatchObject({
      movimentoId: 'estorno-1',
      status: 'PAGO',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('estornar_movimento_financeiro', {
      p_id_financeiro_movimentos: 'movimento-1',
      p_motivo: 'Pagamento lançado em duplicidade',
      p_data_efetiva: '2026-07-21',
      p_idempotency_key: 'reverse-movimento-1',
    });
  });

  it('mantém a transferência como operação consolidada e sem impacto líquido', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: {
          id_movimento: 'transferencia-saida-1',
          movimento_id: 'transferencia-saida-1',
          status: 'PAGO',
          valor_realizado: 300,
          valor_aberto: 0,
        },
      },
      error: null,
    });

    await expect(transferirContasFinanceiras({
      contaOrigemId: 'caixa-1',
      contaDestinoId: 'banco-1',
      valor: 300,
      dataEfetiva: '2026-07-22',
      descricao: 'Depósito do caixa',
      idempotencyKey: 'transfer-caixa-banco-1',
    })).resolves.toMatchObject({
      movimentoId: 'transferencia-saida-1',
      status: 'PAGO',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('transferir_contas_financeiras', {
      p_fk_conta_origem: 'caixa-1',
      p_fk_conta_destino: 'banco-1',
      p_valor: 300,
      p_data_efetiva: '2026-07-22',
      p_descricao: 'Depósito do caixa',
      p_idempotency_key: 'transfer-caixa-banco-1',
    });
  });

  it('preserva total e offset na paginação do extrato', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        total: 81,
        dados: [{
          id_movimento: 'movimento-51',
          data_efetiva: '2026-07-22T12:00:00.000Z',
          fk_conta_financeira: 'caixa-1',
          direcao: 'SAIDA',
          origem: 'CONTA_PAGAR',
          valor: 75,
        }],
      },
      error: null,
    });

    const result = await getFinanceiroExtrato({
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
      p_limite: 25,
      p_offset: 50,
    });

    expect(result.total).toBe(81);
    expect(result.dados[0]?.id).toBe('movimento-51');
    expect(mocks.rpc).toHaveBeenCalledWith('get_financeiro_extrato', {
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
      p_limite: 25,
      p_offset: 50,
    });
  });

  it('busca todas as páginas do extrato, inclusive acima de 5.000 registros', async () => {
    mocks.rpc.mockImplementation(async (_functionName, params) => {
      const offset = Number(params.p_offset);
      return {
        data: {
          status: 200,
          mensagem: 'ok',
          total: 5501,
          dados: [{
            id_movimento: `movimento-${offset}`,
            data_efetiva: '2026-07-22T12:00:00.000Z',
            fk_conta_financeira: 'caixa-1',
            conta_nome: 'Caixa geral',
            direcao: 'ENTRADA',
            origem: 'NOTA_SERVICO',
            descricao: `Serviço motor ${offset}`,
            valor: 75,
          }],
        },
        error: null,
      };
    });

    const result = await getAllFinanceiroExtrato({
      p_data_inicio: '2026-07-01',
      p_data_fim: '2026-07-31',
      p_busca: 'motor',
    });

    expect(result.total).toBe(5501);
    expect(result.dados).toHaveLength(12);
    expect(mocks.rpc).toHaveBeenCalledTimes(12);
    expect(mocks.rpc.mock.calls.map(([, params]) => params.p_offset)).toEqual([
      0,
      500,
      1000,
      1500,
      2000,
      2500,
      3000,
      3500,
      4000,
      4500,
      5000,
      5500,
    ]);
    expect(mocks.rpc.mock.calls.every(([, params]) => params.p_busca === 'motor')).toBe(true);
  });

  it('expõe o resultado idempotente da geração recorrente', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          status: 200,
          mensagem: 'ok',
          dados: { geradas: 2, ignoradas: 0 },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: 200,
          mensagem: 'ok',
          dados: { geradas: 0, ignoradas: 0 },
        },
        error: null,
      });

    await expect(gerarContasRecorrentes({
      ate: '2026-09-30',
      horizonteDias: 90,
    })).resolves.toEqual({ geradas: 2, ignoradas: 0 });
    await expect(gerarContasRecorrentes({
      ate: '2026-09-30',
      horizonteDias: 90,
    })).resolves.toEqual({ geradas: 0, ignoradas: 0 });

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith('gerar_contas_recorrentes', {
      p_ate: '2026-09-30',
      p_horizonte_dias: 90,
    });
  });

  it('recebe uma receita manual sem duplicar o impacto na DRE', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: { id_movimento: 'movimento-manual-1', status: 'PAGO' },
      },
      error: null,
    });

    await registrarRecebimentoManual({
      recebivelManualId: 'recebivel-1',
      valor: 450,
      dataEfetiva: '2026-07-30',
      contaId: 'conta-1',
      formaPagamento: 'TRANSFERENCIA',
      idempotencyKey: 'receive-manual-1',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('criar_movimento_manual', {
      p_direcao: 'ENTRADA',
      p_origem: 'RECEBIVEL_MANUAL',
      p_origem_id: 'recebivel-1',
      p_descricao: 'Recebimento de receita manual',
      p_valor: 450,
      p_data_efetiva: '2026-07-30',
      p_fk_conta_financeira: 'conta-1',
      p_forma_pagamento: 'TRANSFERENCIA',
      p_fk_categoria_entrada: null,
      p_fk_categoria_saida: null,
      p_impacta_dre: false,
      p_observacoes: null,
      p_idempotency_key: 'receive-manual-1',
    });
  });

  it('usa as variantes de leitura de suporte com alvo e sessão validados', async () => {
    activateSupportContext();
    mocks.rpc.mockResolvedValue({
      data: {
        status: 200,
        mensagem: 'ok',
        dados: [{ id_financeiro_contas: 'conta-1', nome: 'Caixa geral' }],
      },
      error: null,
    });

    await getFinanceiroContas();

    expect(mocks.rpc).toHaveBeenCalledWith('get_financeiro_contas_contexto_suporte', {
      p_contexto_usuario_id: '22222222-2222-4222-8222-222222222222',
      p_sessao_suporte: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('bloqueia qualquer transferência financeira em modo suporte', async () => {
    activateSupportContext();

    await expect(transferirContasFinanceiras({
      contaOrigemId: 'conta-1',
      contaDestinoId: 'conta-2',
      valor: 100,
      dataEfetiva: '2026-07-30',
      idempotencyKey: 'transfer-1',
    })).rejects.toThrow('Ações de escrita em modo suporte estão bloqueadas');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('mantém pagamento e upload estritamente somente leitura em modo suporte', async () => {
    activateSupportContext();

    await expect(registrarPagamentoConta({
      contaPagarId: 'conta-pagar-1',
      valor: 100,
      dataEfetiva: '2026-07-30',
      contaId: 'caixa-1',
      idempotencyKey: 'support-must-not-write',
    })).rejects.toThrow('Ações de escrita em modo suporte estão bloqueadas');

    const file = new File(['comprovante'], 'comprovante.pdf', {
      type: 'application/pdf',
    });
    await expect(uploadFinanceiroComprovante({
      movimentoId: 'movimento-1',
      file,
    })).rejects.toThrow('Uploads financeiros são bloqueados em modo suporte');

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('faz upload privado com caminho segregado e sem sobrescrever comprovante', async () => {
    mocks.upload.mockResolvedValue({ data: { path: 'ok' }, error: null });
    const file = new File(['comprovante'], 'Comprovante PIX.PDF', {
      type: 'application/pdf',
    });

    const path = await uploadFinanceiroComprovante({
      movimentoId: 'movimento-1',
      file,
    });

    expect(path).toMatch(/^user-1\/movimento-1\/\d+-Comprovante-PIX\.pdf$/);
    expect(mocks.from).toHaveBeenCalledWith('financeiro-comprovantes');
    expect(mocks.upload).toHaveBeenCalledWith(
      path,
      file,
      {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      },
    );
  });

  it('assina comprovante diretamente com validade curta para o tenant dono', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/comprovante.pdf' },
      error: null,
    });

    await expect(getFinanceiroAnexoSignedUrl(
      'retifica-premium/movimento-1/comprovante.pdf',
      { anexoId: 'anexo-1', expiresIn: 120 },
    )).resolves.toBe('https://signed.example/comprovante.pdf');

    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      'retifica-premium/movimento-1/comprovante.pdf',
      120,
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('usa o assinador auditado no modo suporte', async () => {
    activateSupportContext();
    mocks.invoke.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/support-comprovante.pdf' },
      error: null,
    });

    await expect(getFinanceiroAnexoSignedUrl(
      'retifica-premium/movimento-1/comprovante.pdf',
      { anexoId: 'anexo-1' },
    )).resolves.toBe('https://signed.example/support-comprovante.pdf');

    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith('financeiro-anexo-url', {
      body: {
        pathOrUrl: 'retifica-premium/movimento-1/comprovante.pdf',
        attachmentId: 'anexo-1',
        support: {
          sessionId: '11111111-1111-4111-8111-111111111111',
          targetUserId: '22222222-2222-4222-8222-222222222222',
        },
        expiresIn: 60 * 10,
      },
      headers: {
        Authorization: 'Bearer access-token-test',
      },
    });
  });
});
