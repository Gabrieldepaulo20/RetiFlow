import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callRpc,
  createAnonClient,
  createServiceClient,
  getTestEnv,
  signInAsTestUser,
} from './helpers/client';
import {
  deleteTestUser,
  ensureTestUser,
  TEST_CATEGORY_ID,
  TEST_PREFIX,
} from './helpers/seed';
import {
  getIntegrationEnvStatus,
  warnIntegrationSkipped,
} from './helpers/env';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('financeiro.test');

const FINANCEIRO_BUCKET = 'financeiro-comprovantes';
const RUN_ID = `financeiro-${Date.now()}`;
const FIXTURE_PREFIX = `${TEST_PREFIX} ${RUN_ID}`;

type RpcResult = {
  status: number;
  dados?: Record<string, unknown> | Array<Record<string, unknown>>;
  total?: number;
  [key: string]: unknown;
};

let financeiroReady = false;
let readinessReason = 'Migration da Central Financeiro ainda não aplicada.';
let testUserProvisioned = false;
let authenticatedClient: SupabaseClient | null = null;
let authenticatedAuthUserId: string | null = null;
let internalUserId: string | null = null;
let caixaId: string | null = null;
let bancoId: string | null = null;
let payableId: string | null = null;
let paymentMovementId: string | null = null;
let transferMovementId: string | null = null;
let recurringModelId: string | null = null;
let closingId: string | null = null;
let noteId: string | null = null;
let clientId: string | null = null;
let vehicleId: string | null = null;
const storagePaths = new Set<string>();

function requireFinanceiro(ctx: TestContext) {
  ctx.skip(!financeiroReady, readinessReason);
}

function saoPauloDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${byType.year}-${byType.month}-${byType.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function monthStart(offsetMonths: number) {
  const today = new Date(`${saoPauloDate()}T12:00:00Z`);
  return new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth() + offsetMonths,
    1,
    12,
  )).toISOString().slice(0, 10);
}

function closingCompetence(date: string) {
  const [yearText, monthText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return {
    year,
    month: monthNames[month - 1]!,
    start: `${yearText}-${monthText}-01`,
    end,
  };
}

function idFrom(result: RpcResult, ...keys: string[]) {
  const dados = result.dados;
  if (!dados || Array.isArray(dados)) return null;
  for (const key of keys) {
    const value = dados[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

async function cleanupResult(
  label: string,
  promise: PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await promise;
  if (error) throw new Error(`[financeiro cleanup:${label}] ${error.message}`);
}

async function cleanupFinanceiroFixtures() {
  if (!internalUserId) return;
  const service = createServiceClient();

  if (storagePaths.size > 0) {
    const { error } = await service.storage
      .from(FINANCEIRO_BUCKET)
      .remove([...storagePaths]);
    if (error) throw new Error(`[financeiro cleanup:storage] ${error.message}`);
    storagePaths.clear();
  }

  await cleanupResult(
    'anexos',
    service.schema('RetificaPremium').from('Financeiro_Anexos')
      .delete().eq('fk_criado_por', internalUserId),
  );
  await cleanupResult(
    'movimentos',
    service.schema('RetificaPremium').from('Financeiro_Movimentos')
      .delete().eq('fk_criado_por', internalUserId),
  );
  await cleanupResult(
    'neutralizar-contas-pagar',
    service.schema('RetificaPremium').from('Contas_Pagar')
      .update({
        valor_pago: 0,
        status: 'PENDENTE',
        pago_em: null,
        pago_com: null,
        observacoes_pagamento: null,
      })
      .eq('fk_criado_por', internalUserId).like('titulo', `${TEST_PREFIX}%`),
  );
  await cleanupResult(
    'contas-pagar',
    service.schema('RetificaPremium').from('Contas_Pagar')
      .delete().eq('fk_criado_por', internalUserId).like('titulo', `${TEST_PREFIX}%`),
  );
  await cleanupResult(
    'modelos',
    service.schema('RetificaPremium').from('Financeiro_Modelos_Recorrentes')
      .delete().eq('fk_criado_por', internalUserId),
  );
  await cleanupResult(
    'recebiveis',
    service.schema('RetificaPremium').from('Financeiro_Recebiveis_Manuais')
      .delete().eq('fk_criado_por', internalUserId),
  );
  await cleanupResult(
    'categorias',
    service.schema('RetificaPremium').from('Categorias_Entradas')
      .delete().eq('fk_criado_por', internalUserId),
  );
  await cleanupResult(
    'contas-financeiras',
    service.schema('RetificaPremium').from('Financeiro_Contas')
      .delete().eq('fk_criado_por', internalUserId),
  );
}

async function cleanupClosingFixture() {
  const service = createServiceClient();

  if (noteId) {
    await cleanupResult(
      'desvincular-nota',
      service.schema('RetificaPremium').from('Notas_de_Servico')
        .update({ fk_fechamentos: null }).eq('id_notas_servico', noteId),
    );
  }
  if (closingId) {
    await cleanupResult(
      'fechamento-logs',
      service.schema('RetificaPremium').from('Fechamento_Logs')
        .delete().eq('fk_fechamentos', closingId),
    );
    await cleanupResult(
      'fechamento',
      service.schema('RetificaPremium').from('Fechamentos')
        .delete().eq('id_fechamentos', closingId),
    );
  }
  if (noteId) {
    await cleanupResult(
      'itens-nota',
      service.schema('RetificaPremium').from('Rel_NotaS_Serv')
        .delete().eq('fk_notas_servico', noteId),
    );
    await cleanupResult(
      'nota',
      service.schema('RetificaPremium').from('Notas_de_Servico')
        .delete().eq('id_notas_servico', noteId),
    );
  }
  if (clientId) {
    await cleanupResult(
      'cliente',
      service.schema('RetificaPremium').from('Clientes')
        .delete().eq('id_clientes', clientId),
    );
  }
  if (vehicleId) {
    await cleanupResult(
      'veiculo',
      service.schema('RetificaPremium').from('Veiculos')
        .delete().eq('id_veiculos', vehicleId),
    );
  }
}

async function probeFinanceiroFoundation() {
  const service = createServiceClient();
  const tableProbe = await service
    .schema('RetificaPremium')
    .from('Financeiro_Contas')
    .select('id_financeiro_contas', { head: true, count: 'exact' })
    .limit(1);

  if (tableProbe.error) {
    readinessReason = `Migration financeira ausente: ${tableProbe.error.message}`;
    return false;
  }

  const bucketProbe = await service.storage.getBucket(FINANCEIRO_BUCKET);
  if (bucketProbe.error || !bucketProbe.data) {
    readinessReason = `Bucket financeiro privado ausente: ${bucketProbe.error?.message ?? 'não encontrado'}`;
    return false;
  }
  if (bucketProbe.data.public) {
    readinessReason = 'Bucket financeiro está público; integração bloqueada por segurança.';
    return false;
  }

  return true;
}

describe.skipIf(skipIntegration)('Central Financeiro — aceite com Supabase real', () => {
  beforeAll(async () => {
    if (!await probeFinanceiroFoundation()) {
      console.warn(`[financeiro.test] ${readinessReason}`);
      return;
    }

    const env = getTestEnv();
    const authId = await ensureTestUser(env.testUserEmail, env.testUserPassword);
    testUserProvisioned = true;
    authenticatedAuthUserId = authId;

    const service = createServiceClient();
    const userResult = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('id_usuarios')
      .eq('auth_id', authId)
      .single();
    if (userResult.error || !userResult.data?.id_usuarios) {
      readinessReason = `Usuário interno de integração indisponível: ${userResult.error?.message ?? 'sem id'}`;
      return;
    }
    internalUserId = userResult.data.id_usuarios as string;

    const modulesResult = await service
      .schema('RetificaPremium')
      .from('Modulos')
      .upsert({
        fk_usuarios: internalUserId,
        dashboard: true,
        clientes: true,
        notas_de_entrada: true,
        kanban: true,
        fechamento: true,
        nota_fiscal: false,
        configuracoes: false,
        contas_a_pagar: true,
        marketing: false,
        admin: false,
      }, { onConflict: 'fk_usuarios' });
    if (modulesResult.error) {
      readinessReason = `Módulo financeiro do usuário de integração indisponível: ${modulesResult.error.message}`;
      return;
    }

    const session = await signInAsTestUser();
    authenticatedClient = session.client;

    try {
      await callRpc(authenticatedClient, 'get_financeiro_resumo', {
        p_data_inicio: saoPauloDate(-1),
        p_data_fim: saoPauloDate(1),
        p_modo: 'CAIXA',
        p_fk_conta_financeira: null,
      });
      await callRpc(authenticatedClient, 'get_financeiro_lancamentos', {
        p_data_inicio: saoPauloDate(-1),
        p_data_fim: saoPauloDate(1),
        p_modo: 'CAIXA',
        p_limite: 1,
        p_offset: 0,
      });
      await callRpc(authenticatedClient, 'get_financeiro_extrato', {
        p_data_inicio: saoPauloDate(-1),
        p_data_fim: saoPauloDate(1),
        p_limite: 1,
        p_offset: 0,
      });
    } catch (error) {
      readinessReason = `RPCs financeiras ainda indisponíveis: ${
        error instanceof Error ? error.message : String(error)
      }`;
      console.warn(`[financeiro.test] ${readinessReason}`);
      return;
    }

    await cleanupFinanceiroFixtures();

    const caixa = await callRpc(authenticatedClient, 'salvar_conta_financeira', {
      p_id_financeiro_conta: null,
      p_nome: `${FIXTURE_PREFIX} Caixa`,
      p_tipo: 'CAIXA',
      p_saldo_inicial: 0,
      p_data_corte: null,
      p_padrao: true,
      p_ativa: true,
    }) as RpcResult;
    const banco = await callRpc(authenticatedClient, 'salvar_conta_financeira', {
      p_id_financeiro_conta: null,
      p_nome: `${FIXTURE_PREFIX} Banco`,
      p_tipo: 'BANCO',
      p_saldo_inicial: 0,
      p_data_corte: null,
      p_padrao: false,
      p_ativa: true,
    }) as RpcResult;

    caixaId = idFrom(caixa, 'id', 'id_conta');
    bancoId = idFrom(banco, 'id', 'id_conta');
    if (!caixaId || !bancoId) {
      readinessReason = 'RPC salvar_conta_financeira não retornou os IDs esperados.';
      return;
    }

    financeiroReady = true;
  });

  afterAll(async () => {
    if (authenticatedClient) {
      await cleanupFinanceiroFixtures();
      await cleanupClosingFixture();
      await authenticatedClient.auth.signOut();
    }
    if (testUserProvisioned) {
      const { testUserEmail } = getTestEnv();
      await deleteTestUser(testUserEmail);
    }
  });

  it('não inventa saldo bancário quando o saldo inicial não foi informado', async (ctx) => {
    requireFinanceiro(ctx);

    const result = await callRpc(authenticatedClient!, 'get_financeiro_resumo', {
      p_data_inicio: saoPauloDate(-1),
      p_data_fim: saoPauloDate(1),
      p_modo: 'CAIXA',
      p_fk_conta_financeira: null,
    }) as RpcResult;
    const resumo = result.dados as Record<string, unknown>;

    expect(result.status).toBe(200);
    expect(resumo.saldo_inicial_informado).toBe(false);
    expect(Number(resumo.resultado_periodo)).toBe(0);
  });

  it('registra parcial na data escolhida e não duplica no retry idempotente', async (ctx) => {
    requireFinanceiro(ctx);

    const payable = await callRpc(authenticatedClient!, 'insert_conta_pagar', {
      p_titulo: `${FIXTURE_PREFIX} Parcial`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_data_vencimento: `${saoPauloDate(15)}T00:00:00`,
      p_valor_original: 600,
      p_juros: 0,
      p_desconto: 0,
      p_favorecido_tipo: 'FORNECEDOR',
      p_origem_lancamento: 'MANUAL',
    });
    payableId = payable.id_contas_pagar as string;
    expect(payableId).toBeTruthy();

    const selectedDate = saoPauloDate(-3);
    const key = `${RUN_ID}:partial-payment`;
    const params = {
      p_id_contas_pagar: payableId,
      p_valor: 225,
      p_data_efetiva: `${selectedDate}T12:00:00-03:00`,
      p_fk_conta_financeira: caixaId,
      p_forma_pagamento: 'PIX',
      p_observacoes: FIXTURE_PREFIX,
      p_idempotency_key: key,
    };
    const first = await callRpc(authenticatedClient!, 'registrar_pagamento_conta', params) as RpcResult;
    const retry = await callRpc(authenticatedClient!, 'registrar_pagamento_conta', params) as RpcResult;
    paymentMovementId = idFrom(first, 'movimento_id', 'id_movimento');

    expect(first.status).toBe(200);
    expect(idFrom(retry, 'movimento_id', 'id_movimento')).toBe(paymentMovementId);
    expect((first.dados as Record<string, unknown>).status).toBe('PARCIAL');
    expect(Number((first.dados as Record<string, unknown>).valor_aberto)).toBe(375);
    await expect(callRpc(authenticatedClient!, 'registrar_pagamento_conta', {
      ...params,
      p_valor: 226,
    })).rejects.toThrow(/idempotencia|outra operacao/i);

    const service = createServiceClient();
    const movements = await service
      .schema('RetificaPremium')
      .from('Financeiro_Movimentos')
      .select('id_financeiro_movimentos,data_efetiva')
      .eq('fk_criado_por', internalUserId!)
      .eq('chave_idempotencia', key);
    expect(movements.error).toBeNull();
    expect(movements.data).toHaveLength(1);
    expect(movements.data?.[0]?.id_financeiro_movimentos).toBe(paymentMovementId);
    expect(String(movements.data?.[0]?.data_efetiva).slice(0, 10)).toBe(selectedDate);

    const storedPayable = await service
      .schema('RetificaPremium')
      .from('Contas_Pagar')
      .select('status,valor_pago,pago_em')
      .eq('id_contas_pagar', payableId!)
      .single();
    expect(storedPayable.error).toBeNull();
    expect(storedPayable.data?.status).toBe('PARCIAL');
    expect(Number(storedPayable.data?.valor_pago)).toBe(225);
    expect(String(storedPayable.data?.pago_em).slice(0, 10)).toBe(selectedDate);
  });

  it('estorna com contrapartida imutável e recompõe o saldo da conta a pagar', async (ctx) => {
    requireFinanceiro(ctx);
    expect(paymentMovementId).toBeTruthy();

    const key = `${RUN_ID}:reverse-payment`;
    const params = {
      p_id_financeiro_movimentos: paymentMovementId,
      p_motivo: 'Pagamento parcial lançado para teste',
      p_data_efetiva: `${saoPauloDate(-2)}T12:00:00-03:00`,
      p_idempotency_key: key,
    };
    const first = await callRpc(authenticatedClient!, 'estornar_movimento_financeiro', params) as RpcResult;
    const retry = await callRpc(authenticatedClient!, 'estornar_movimento_financeiro', params) as RpcResult;
    const reversalId = idFrom(first, 'movimento_id', 'id_movimento');

    expect(first.status).toBe(200);
    expect(idFrom(retry, 'movimento_id', 'id_movimento')).toBe(reversalId);

    const service = createServiceClient();
    const original = await service
      .schema('RetificaPremium')
      .from('Financeiro_Movimentos')
      .select('status,direcao,estornado_em')
      .eq('id_financeiro_movimentos', paymentMovementId!)
      .single();
    const reversals = await service
      .schema('RetificaPremium')
      .from('Financeiro_Movimentos')
      .select('id_financeiro_movimentos,direcao,tipo_movimento')
      .eq('fk_movimento_origem', paymentMovementId!);
    const storedPayable = await service
      .schema('RetificaPremium')
      .from('Contas_Pagar')
      .select('status,valor_pago')
      .eq('id_contas_pagar', payableId!)
      .single();

    expect(original.data).toMatchObject({ status: 'CONFIRMADO', direcao: 'SAIDA' });
    expect(original.data?.estornado_em).toBeTruthy();
    expect(reversals.data).toEqual([
      expect.objectContaining({
        id_financeiro_movimentos: reversalId,
        direcao: 'ENTRADA',
        tipo_movimento: 'ESTORNO',
      }),
    ]);
    expect(storedPayable.data?.status).toBe('PENDENTE');
    expect(Number(storedPayable.data?.valor_pago)).toBe(0);
  });

  it('mantém transferência consolidada idempotente e líquida em zero', async (ctx) => {
    requireFinanceiro(ctx);

    const key = `${RUN_ID}:transfer`;
    const params = {
      p_fk_conta_origem: caixaId,
      p_fk_conta_destino: bancoId,
      p_valor: 340,
      p_data_efetiva: `${saoPauloDate()}T12:00:00-03:00`,
      p_descricao: FIXTURE_PREFIX,
      p_idempotency_key: key,
    };
    const first = await callRpc(authenticatedClient!, 'transferir_contas_financeiras', params) as RpcResult;
    const retry = await callRpc(authenticatedClient!, 'transferir_contas_financeiras', params) as RpcResult;
    transferMovementId = idFrom(first, 'movimento_id', 'id_movimento');

    expect(idFrom(retry, 'movimento_id', 'id_movimento')).toBe(transferMovementId);

    const service = createServiceClient();
    const movements = await service
      .schema('RetificaPremium')
      .from('Financeiro_Movimentos')
      .select('direcao,valor,fk_transferencia,chave_idempotencia')
      .eq('fk_criado_por', internalUserId!)
      .in('chave_idempotencia', [key, `${key}:entrada`]);

    expect(movements.error).toBeNull();
    expect(movements.data).toHaveLength(2);
    expect(new Set(movements.data?.map((item) => item.fk_transferencia)).size).toBe(1);
    const liquid = (movements.data ?? []).reduce(
      (sum, item) => sum + (item.direcao === 'ENTRADA' ? Number(item.valor) : -Number(item.valor)),
      0,
    );
    expect(liquid).toBe(0);

    const summary = await callRpc(authenticatedClient!, 'get_financeiro_resumo', {
      p_data_inicio: saoPauloDate(-1),
      p_data_fim: saoPauloDate(1),
      p_modo: 'CAIXA',
      p_fk_conta_financeira: null,
    }) as RpcResult;
    expect(Number((summary.dados as Record<string, unknown>).resultado_periodo)).toBe(0);
  });

  it('confirma o saldo inicial uma única vez após o backfill e exige ajuste depois', async (ctx) => {
    requireFinanceiro(ctx);

    const confirmed = await callRpc(authenticatedClient!, 'salvar_conta_financeira', {
      p_id_financeiro_conta: caixaId,
      p_nome: `${FIXTURE_PREFIX} Caixa`,
      p_tipo: 'CAIXA',
      p_saldo_inicial: 50,
      p_data_corte: '2026-06-01',
      p_padrao: true,
      p_ativa: true,
    }) as RpcResult;
    expect(confirmed.status).toBe(200);

    await expect(callRpc(authenticatedClient!, 'salvar_conta_financeira', {
      p_id_financeiro_conta: caixaId,
      p_nome: `${FIXTURE_PREFIX} Caixa`,
      p_tipo: 'CAIXA',
      p_saldo_inicial: 60,
      p_data_corte: '2026-06-01',
      p_padrao: true,
      p_ativa: true,
    })).rejects.toThrow(/ajuste auditado|saldo|corte/i);
  });

  it('gera recorrências uma vez por competência mesmo após reprocessamento', async (ctx) => {
    requireFinanceiro(ctx);

    const start = monthStart(1);
    const until = monthStart(3);
    const saved = await callRpc(authenticatedClient!, 'salvar_modelo_recorrente', {
      p_id_modelo_recorrente: null,
      p_titulo: `${FIXTURE_PREFIX} Aluguel`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_fk_fornecedores: null,
      p_nome_fornecedor: `${FIXTURE_PREFIX} Locador`,
      p_valor: 900,
      p_recorrencia: 'MENSAL',
      p_dia_vencimento: 10,
      p_competencia_inicial: start,
      p_forma_pagamento_prevista: 'PIX',
      p_observacoes: FIXTURE_PREFIX,
      p_ativa: true,
    }) as RpcResult;
    recurringModelId = idFrom(saved, 'id', 'id_modelo');
    expect(recurringModelId).toBeTruthy();

    const first = await callRpc(authenticatedClient!, 'gerar_contas_recorrentes', {
      p_ate: until,
      p_horizonte_dias: 90,
    }) as RpcResult;
    const retry = await callRpc(authenticatedClient!, 'gerar_contas_recorrentes', {
      p_ate: until,
      p_horizonte_dias: 90,
    }) as RpcResult;

    expect(Number((first.dados as Record<string, unknown>).geradas)).toBeGreaterThan(0);
    expect(Number((retry.dados as Record<string, unknown>).geradas)).toBe(0);

    const generated = await createServiceClient()
      .schema('RetificaPremium')
      .from('Contas_Pagar')
      .select('id_contas_pagar,competencia_recorrencia')
      .eq('fk_modelo_recorrente', recurringModelId!);
    expect(generated.error).toBeNull();
    expect(generated.data?.length).toBe(Number((first.dados as Record<string, unknown>).geradas));
    expect(new Set(generated.data?.map((item) => item.competencia_recorrencia)).size)
      .toBe(generated.data?.length);
  });

  it('pagina o extrato sem repetir a mesma linha', async (ctx) => {
    requireFinanceiro(ctx);

    const common = {
      p_data_inicio: saoPauloDate(-7),
      p_data_fim: saoPauloDate(1),
      p_fk_conta_financeira: null,
      p_busca: FIXTURE_PREFIX,
      p_limite: 1,
    };
    const firstPage = await callRpc(authenticatedClient!, 'get_financeiro_extrato', {
      ...common,
      p_offset: 0,
    }) as RpcResult;
    const secondPage = await callRpc(authenticatedClient!, 'get_financeiro_extrato', {
      ...common,
      p_offset: 1,
    }) as RpcResult;
    const firstRows = firstPage.dados as Array<Record<string, unknown>>;
    const secondRows = secondPage.dados as Array<Record<string, unknown>>;

    expect(firstPage.total).toBeGreaterThanOrEqual(2);
    expect(firstRows).toHaveLength(1);
    expect(secondRows).toHaveLength(1);
    expect(firstRows[0]?.id).not.toBe(secondRows[0]?.id);
  });

  it('projeta o fechamento líquido uma vez e exclui a O.S. filha', async (ctx) => {
    requireFinanceiro(ctx);

    const suffix = String(Date.now()).slice(-8);
    const competenceDate = saoPauloDate();
    const competence = closingCompetence(competenceDate);
    const createdClient = await callRpc(authenticatedClient!, 'salvar_cliente_completo', {
      p_payload: {
        nome: `${FIXTURE_PREFIX} Cliente`,
        documento: `6${suffix.padStart(10, '0')}`,
        tipo_documento: 'CPF',
        status: true,
      },
    });
    clientId = createdClient.id_cliente as string;
    expect(clientId).toBeTruthy();

    const createdNote = await callRpc(authenticatedClient!, 'nova_nota', {
      p_payload: {
        tipo_nota: 'Serviço',
        numero_nota: `${FIXTURE_PREFIX} OS`,
        fk_clientes: clientId,
        contato_nome: `${FIXTURE_PREFIX} Contato`,
        prazo: competenceDate,
        defeito: 'Teste financeiro de fechamento',
        total_servicos: 150,
        total_produtos: 0,
        total: 150,
        veiculo: {
          modelo: 'Motor financeiro',
          placa: null,
          km: 0,
          motor: 'Gasolina',
        },
        itens: [{
          descricao: `${FIXTURE_PREFIX} Serviço`,
          quantidade: 1,
          valor: 150,
          desconto: 0,
        }],
      },
    });
    noteId = createdNote.id_nota as string;
    expect(noteId).toBeTruthy();

    const details = await callRpc(authenticatedClient!, 'get_nota_servico_detalhes', {
      p_id_nota_servico: noteId,
    });
    vehicleId = (details.cabecalho as { veiculo: { id: string } }).veiculo.id;

    const statuses = await callRpc(authenticatedClient!, 'get_status_notas', {
      p_tipo_nota: 'Serviço',
    });
    const billable = (statuses.dados as Array<{ id_status_notas: number; nome: string }>)
      .find((status) => ['Entregue', 'Finalizado'].includes(status.nome));
    expect(billable).toBeDefined();
    await callRpc(authenticatedClient!, 'update_nota_servico', {
      p_payload: {
        id_notas_servico: noteId,
        fk_status: billable!.id_status_notas,
        total_servicos: 150,
        total_produtos: 0,
        total: 150,
      },
    });

    closingId = crypto.randomUUID();
    const period = `${FIXTURE_PREFIX} Período`;
    const closing = await callRpc(authenticatedClient!, 'finalizar_fechamento', {
      p_id_fechamentos: closingId,
      p_fk_clientes: clientId,
      p_mes: competence.month,
      p_ano: competence.year,
      p_periodo: period,
      p_label: `${FIXTURE_PREFIX} Fechamento líquido`,
      p_valor_total: 120,
      p_dados_json: {
        gerado_em: new Date().toISOString(),
        periodo: period,
        cliente: { id: clientId, nome: `${FIXTURE_PREFIX} Cliente` },
        competencia: { modo: 'MENSAL', inicio: competence.start, fim: competence.end },
        notas: [{
          id: noteId,
          os: `${FIXTURE_PREFIX} OS`,
          veiculo: 'Motor financeiro',
          placa: null,
          itens: [],
          valor_total_os: 150,
          valor_recebido: 0,
          saldo_aberto: 150,
          total_original: 150,
          desconto_nota: 20,
          total_com_desconto: 120,
        }],
        total_original: 150,
        total_com_desconto: 120,
        recebimento_inicial: null,
      },
      p_pdf_url: null,
      p_chave_idempotencia: `${RUN_ID}:finalizar-fechamento`,
      p_fk_template_documento: null,
      p_documento_tema_snapshot: null,
      p_documento_config_snapshot: null,
      p_recebimento_valor: null,
      p_recebimento_data: null,
      p_recebimento_conta: null,
      p_recebimento_forma: null,
      p_recebimento_observacoes: null,
      p_recebimento_idempotencia: null,
    });
    expect(closing.status).toBe(200);
    expect(closingId).toBeTruthy();

    const projection = await callRpc(authenticatedClient!, 'get_financeiro_lancamentos', {
      p_data_inicio: saoPauloDate(-1),
      p_data_fim: saoPauloDate(1),
      p_modo: 'COMPETENCIA',
      p_busca: `${FIXTURE_PREFIX} Fechamento líquido`,
      p_limite: 10,
      p_offset: 0,
    }) as RpcResult;
    const rows = projection.dados as Array<Record<string, unknown>>;

    expect(projection.total).toBe(1);
    expect(rows).toEqual([
      expect.objectContaining({
        origem: 'FECHAMENTO',
        origem_id: closingId,
        previsto: 120,
      }),
    ]);
    expect(rows.some((row) => row.origem === 'NOTA_SERVICO')).toBe(false);
  });

  it('mantém escrita de suporte indisponível e comprovante em bucket privado', async (ctx) => {
    requireFinanceiro(ctx);
    expect(transferMovementId).toBeTruthy();
    expect(authenticatedAuthUserId).toBeTruthy();

    await expect(callRpc(authenticatedClient!, 'registrar_pagamento_conta_contexto_suporte', {
      p_id_contas_pagar: payableId,
      p_valor: 1,
      p_data_efetiva: `${saoPauloDate()}T12:00:00-03:00`,
      p_fk_conta_financeira: caixaId,
      p_idempotency_key: `${RUN_ID}:forbidden-support-write`,
      p_contexto_usuario_id: internalUserId,
      p_sessao_suporte: '00000000-0000-0000-0000-000000000000',
    })).rejects.toThrow(/function|permission|allowed|schema cache/i);

    const path = `${authenticatedAuthUserId}/${transferMovementId}/${RUN_ID}-comprovante.pdf`;
    const upload = await authenticatedClient!.storage
      .from(FINANCEIRO_BUCKET)
      .upload(path, new Blob(['%PDF integration financeiro'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: false,
      });
    expect(upload.error).toBeNull();
    storagePaths.add(path);

    const linked = await callRpc(authenticatedClient!, 'insert_financeiro_anexo', {
      p_fk_financeiro_movimentos: transferMovementId,
      p_nome_arquivo: 'comprovante.pdf',
      p_caminho: path,
      p_mime_type: 'application/pdf',
      p_tamanho_bytes: 28,
    });
    expect(linked.status).toBe(200);

    const anonymousDownload = await createAnonClient().storage
      .from(FINANCEIRO_BUCKET)
      .download(path);
    expect(anonymousDownload.data).toBeNull();
    expect(anonymousDownload.error).toBeTruthy();

    const signed = await authenticatedClient!.storage
      .from(FINANCEIRO_BUCKET)
      .createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toContain('/storage/v1/object/sign/financeiro-comprovantes/');

    await authenticatedClient!.storage.from(FINANCEIRO_BUCKET).remove([path]);
    const immutableEvidence = await createServiceClient().storage
      .from(FINANCEIRO_BUCKET)
      .download(path);
    expect(immutableEvidence.error).toBeNull();
    expect(immutableEvidence.data).toBeTruthy();

    const bucket = await createServiceClient().storage.getBucket(FINANCEIRO_BUCKET);
    expect(bucket.error).toBeNull();
    expect(bucket.data?.public).toBe(false);
  });
});
