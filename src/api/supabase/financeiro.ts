import { supabase } from '@/lib/supabase';
import {
  assertActiveSupportScopeUnchanged,
  readActiveSupportContext,
} from '@/services/auth/supportContext';
import { sanitizeStorageFilename } from '@/services/storage/storagePaths';
import type { PaymentMethod, RecurrenceType } from '@/types';
import { toPaymentMethod } from '@/types';
import { callRPC, extractDados, type RPCEnvelope } from './_base';

const FINANCEIRO_BUCKET = 'financeiro-comprovantes';
const DEFAULT_SIGNED_URL_TTL = 60 * 10;

export type FinanceiroModo = 'CAIXA' | 'PREVISTO' | 'COMPETENCIA';
export type FinanceiroDirecao = 'ENTRADA' | 'SAIDA';
export type FinanceiroStatus = 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'CANCELADO' | 'REVISAR';
export type FinanceiroTipoConta = 'CAIXA' | 'BANCO' | 'PIX' | 'CARTEIRA' | 'OUTRA';
export type FinanceiroOrigem =
  | 'NOTA_SERVICO'
  | 'FECHAMENTO'
  | 'CONTA_PAGAR'
  | 'RECEBIVEL_MANUAL'
  | 'MOVIMENTO_MANUAL'
  | 'SALDO_INICIAL'
  | 'APORTE'
  | 'REEMBOLSO'
  | 'AJUSTE'
  | 'TRANSFERENCIA'
  | 'ESTORNO';

export interface FinanceiroPeriodoParams {
  p_data_inicio: string;
  p_data_fim: string;
  p_modo?: FinanceiroModo;
  p_fk_conta_financeira?: string;
}

export type FinanceiroLancamentosParams = FinanceiroPeriodoParams & {
  p_direcao?: FinanceiroDirecao;
  p_status?: FinanceiroStatus;
  p_origem?: FinanceiroOrigem;
  p_busca?: string;
  p_limite?: number;
  p_offset?: number;
};

export type FinanceiroExtratoParams = Omit<FinanceiroPeriodoParams, 'p_modo'> & {
  p_busca?: string;
  p_limite?: number;
  p_offset?: number;
};

export interface FinanceiroModelosRecorrentesParams {
  p_incluir_inativos?: boolean;
  p_limite?: number;
  p_offset?: number;
}

export interface FinanceiroConta {
  id: string;
  nome: string;
  tipo: FinanceiroTipoConta;
  saldoInicial: number;
  saldoInicialConfirmado: boolean;
  dataCorte: string | null;
  ativa: boolean;
  padrao: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CategoriaEntrada {
  id: string;
  nome: string;
  cor: string | null;
  icone: string | null;
  impactaDre: boolean;
  ativa: boolean;
}

export interface FinanceiroResumo {
  saldoInicialInformado: boolean;
  saldoAnterior: number;
  entradasRecebidas: number;
  saidasPagas: number;
  saldoAtual: number;
  aReceber: number;
  aPagar: number;
  saldoProjetado: number;
  resultadoPeriodo: number;
  faturamentoCompetencia: number;
  despesasCompetencia: number;
  resultadoCompetencia: number;
}

export interface FinanceiroLancamento {
  id: string;
  direcao: FinanceiroDirecao;
  origem: FinanceiroOrigem;
  origemId: string | null;
  origemNumero: string | null;
  pessoa: string | null;
  descricao: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  vencimento: string | null;
  competencia: string | null;
  dataEfetiva: string | null;
  contaId: string | null;
  contaNome: string | null;
  formaPagamento: PaymentMethod | null;
  previsto: number;
  realizado: number;
  aberto: number;
  status: FinanceiroStatus;
  revisar: boolean;
  createdAt: string | null;
}

export interface FinanceiroMovimento {
  id: string;
  direcao: FinanceiroDirecao;
  origem: FinanceiroOrigem;
  origemId: string | null;
  descricao: string;
  valor: number;
  dataEfetiva: string;
  contaId: string;
  contaNome: string | null;
  formaPagamento: PaymentMethod | null;
  saldoAcumulado: number | null;
  estornado: boolean;
  estornoDeId: string | null;
  motivoEstorno: string | null;
  usuarioNome: string | null;
  createdAt: string | null;
}

export interface FinanceiroModeloRecorrente {
  id: string;
  titulo: string;
  categoriaId: string;
  categoriaNome: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  valor: number;
  recorrencia: RecurrenceType;
  diaVencimento: number | null;
  proximaCompetencia: string | null;
  formaPagamentoPrevista: PaymentMethod | null;
  ativa: boolean;
  ultimaGeracaoEm: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FinanceiroAnexo {
  id: string;
  movimentoId: string;
  nomeArquivo: string;
  caminho: string;
  mimeType: string | null;
  tamanhoBytes: number | null;
  createdAt: string | null;
  usuarioNome: string | null;
}

export interface FinanceiroOperacaoResultado {
  id: string | null;
  movimentoId: string | null;
  status: FinanceiroStatus | null;
  valorRealizado: number | null;
  valorAberto: number | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function field(row: UnknownRecord, ...names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  return undefined;
}

function asDirecao(value: unknown): FinanceiroDirecao {
  return value === 'SAIDA' ? 'SAIDA' : 'ENTRADA';
}

function asStatus(value: unknown): FinanceiroStatus {
  if (value === 'PAGO' || value === 'PARCIAL' || value === 'CANCELADO' || value === 'REVISAR') {
    return value;
  }
  return 'PENDENTE';
}

function asTipoConta(value: unknown): FinanceiroTipoConta {
  if (value === 'BANCO' || value === 'PIX' || value === 'CARTEIRA' || value === 'OUTRA') return value;
  return 'CAIXA';
}

function asOrigem(value: unknown): FinanceiroOrigem {
  const allowed: FinanceiroOrigem[] = [
    'NOTA_SERVICO',
    'FECHAMENTO',
    'CONTA_PAGAR',
    'RECEBIVEL_MANUAL',
    'MOVIMENTO_MANUAL',
    'SALDO_INICIAL',
    'APORTE',
    'REEMBOLSO',
    'AJUSTE',
    'TRANSFERENCIA',
    'ESTORNO',
  ];
  return typeof value === 'string' && allowed.includes(value as FinanceiroOrigem)
    ? value as FinanceiroOrigem
    : 'MOVIMENTO_MANUAL';
}

function asRecurrence(value: unknown): RecurrenceType {
  const allowed: RecurrenceType[] = [
    'NENHUMA',
    'SEMANAL',
    'QUINZENAL',
    'MENSAL',
    'BIMESTRAL',
    'TRIMESTRAL',
    'SEMESTRAL',
    'ANUAL',
  ];
  return typeof value === 'string' && allowed.includes(value as RecurrenceType)
    ? value as RecurrenceType
    : 'MENSAL';
}

export function adaptFinanceiroConta(value: unknown): FinanceiroConta | null {
  if (!isRecord(value)) return null;
  const id = asString(field(value, 'id', 'id_financeiro_contas', 'id_financeiro_conta'));
  if (!id) return null;
  return {
    id,
    nome: asString(field(value, 'nome'), 'Conta financeira'),
    tipo: asTipoConta(field(value, 'tipo')),
    saldoInicial: asNumber(field(value, 'saldo_inicial', 'saldoInicial')),
    saldoInicialConfirmado: asBoolean(field(
      value,
      'saldo_inicial_confirmado',
      'saldoInicialConfirmado',
    )),
    dataCorte: asNullableString(field(value, 'data_corte', 'dataCorte')),
    ativa: asBoolean(field(value, 'ativa', 'ativo'), true),
    padrao: asBoolean(field(value, 'padrao', 'is_padrao')),
    createdAt: asNullableString(field(value, 'created_at', 'createdAt')),
    updatedAt: asNullableString(field(value, 'updated_at', 'updatedAt')),
  };
}

export function adaptCategoriaEntrada(value: unknown): CategoriaEntrada | null {
  if (!isRecord(value)) return null;
  const id = asString(field(value, 'id', 'id_categorias_entradas', 'id_categoria_entrada'));
  if (!id) return null;
  return {
    id,
    nome: asString(field(value, 'nome'), 'Sem categoria'),
    cor: asNullableString(field(value, 'cor')),
    icone: asNullableString(field(value, 'icone')),
    impactaDre: asBoolean(field(value, 'impacta_dre', 'impactaDre'), true),
    ativa: asBoolean(field(value, 'ativa', 'ativo'), true),
  };
}

export function adaptFinanceiroResumo(value: unknown): FinanceiroResumo {
  const row = isRecord(value) ? value : {};
  return {
    saldoInicialInformado: asBoolean(field(row, 'saldo_inicial_informado', 'saldoInicialInformado')),
    saldoAnterior: asNumber(field(row, 'saldo_anterior', 'saldoAnterior')),
    entradasRecebidas: asNumber(field(row, 'entradas_recebidas', 'entradasRecebidas')),
    saidasPagas: asNumber(field(row, 'saidas_pagas', 'saidasPagas')),
    saldoAtual: asNumber(field(row, 'saldo_atual', 'saldoAtual')),
    aReceber: asNumber(field(row, 'a_receber', 'aReceber')),
    aPagar: asNumber(field(row, 'a_pagar', 'aPagar')),
    saldoProjetado: asNumber(field(row, 'saldo_projetado', 'saldoProjetado')),
    resultadoPeriodo: asNumber(field(row, 'resultado_periodo', 'resultadoPeriodo')),
    faturamentoCompetencia: asNumber(field(row, 'faturamento_competencia', 'faturamentoCompetencia')),
    despesasCompetencia: asNumber(field(row, 'despesas_competencia', 'despesasCompetencia')),
    resultadoCompetencia: asNumber(field(row, 'resultado_competencia', 'resultadoCompetencia')),
  };
}

export function adaptFinanceiroLancamento(value: unknown): FinanceiroLancamento | null {
  if (!isRecord(value)) return null;
  const id = asString(field(value, 'id', 'id_lancamento', 'id_origem'));
  if (!id) return null;
  return {
    id,
    direcao: asDirecao(field(value, 'direcao')),
    origem: asOrigem(field(value, 'origem')),
    origemId: asNullableString(field(value, 'origem_id', 'origemId')),
    origemNumero: asNullableString(field(value, 'origem_numero', 'origemNumero')),
    pessoa: asNullableString(field(value, 'pessoa', 'cliente_fornecedor')),
    descricao: asString(field(value, 'descricao', 'titulo'), 'Lançamento'),
    categoriaId: asNullableString(field(value, 'categoria_id', 'categoriaId')),
    categoriaNome: asNullableString(field(value, 'categoria_nome', 'categoriaNome')),
    vencimento: asNullableString(field(value, 'vencimento', 'data_vencimento')),
    competencia: asNullableString(field(value, 'competencia', 'data_competencia')),
    dataEfetiva: asNullableString(field(value, 'data_efetiva', 'dataEfetiva')),
    contaId: asNullableString(field(value, 'conta_id', 'contaId')),
    contaNome: asNullableString(field(value, 'conta_nome', 'contaNome')),
    formaPagamento: toPaymentMethod(field(value, 'forma_pagamento', 'formaPagamento')) ?? null,
    previsto: asNumber(field(value, 'previsto', 'valor_previsto')),
    realizado: asNumber(field(value, 'realizado', 'valor_realizado')),
    aberto: asNumber(field(value, 'aberto', 'valor_aberto')),
    status: asStatus(field(value, 'status')),
    revisar: asBoolean(field(value, 'revisar')),
    createdAt: asNullableString(field(value, 'created_at', 'createdAt')),
  };
}

export function adaptFinanceiroMovimento(value: unknown): FinanceiroMovimento | null {
  if (!isRecord(value)) return null;
  const id = asString(field(value, 'id', 'id_financeiro_movimentos', 'id_movimento'));
  const dataEfetiva = asString(field(value, 'data_efetiva', 'dataEfetiva'));
  const contaId = asString(field(value, 'conta_id', 'fk_conta_financeira', 'contaId'));
  if (!id || !dataEfetiva || !contaId) return null;
  return {
    id,
    direcao: asDirecao(field(value, 'direcao')),
    origem: asOrigem(field(value, 'origem')),
    origemId: asNullableString(field(value, 'origem_id', 'origemId')),
    descricao: asString(field(value, 'descricao'), 'Movimento financeiro'),
    valor: asNumber(field(value, 'valor')),
    dataEfetiva,
    contaId,
    contaNome: asNullableString(field(value, 'conta_nome', 'contaNome')),
    formaPagamento: toPaymentMethod(field(value, 'forma_pagamento', 'formaPagamento')) ?? null,
    saldoAcumulado: asNullableNumber(field(value, 'saldo_acumulado', 'saldoAcumulado')),
    estornado: asBoolean(field(value, 'estornado')),
    estornoDeId: asNullableString(field(value, 'estorno_de_id', 'estornoDeId')),
    motivoEstorno: asNullableString(field(value, 'motivo_estorno', 'motivoEstorno')),
    usuarioNome: asNullableString(field(value, 'usuario_nome', 'usuarioNome')),
    createdAt: asNullableString(field(value, 'created_at', 'createdAt')),
  };
}

export function adaptFinanceiroModeloRecorrente(value: unknown): FinanceiroModeloRecorrente | null {
  if (!isRecord(value)) return null;
  const id = asString(field(value, 'id', 'id_financeiro_modelos_recorrentes', 'id_modelo'));
  const categoriaId = asString(field(value, 'categoria_id', 'fk_categorias', 'categoriaId'));
  if (!id || !categoriaId) return null;
  return {
    id,
    titulo: asString(field(value, 'titulo'), 'Gasto fixo'),
    categoriaId,
    categoriaNome: asNullableString(field(value, 'categoria_nome', 'categoriaNome')),
    fornecedorId: asNullableString(field(value, 'fornecedor_id', 'fk_fornecedores', 'fornecedorId')),
    fornecedorNome: asNullableString(field(value, 'fornecedor_nome', 'fornecedorNome')),
    valor: asNumber(field(value, 'valor')),
    recorrencia: asRecurrence(field(value, 'recorrencia')),
    diaVencimento: asNullableNumber(field(value, 'dia_vencimento', 'diaVencimento')),
    proximaCompetencia: asNullableString(field(value, 'proxima_competencia', 'proximaCompetencia')),
    formaPagamentoPrevista:
      toPaymentMethod(field(value, 'forma_pagamento_prevista', 'formaPagamentoPrevista')) ?? null,
    ativa: asBoolean(field(value, 'ativa', 'ativo'), true),
    ultimaGeracaoEm: asNullableString(field(value, 'ultima_geracao_em', 'ultimaGeracaoEm')),
    createdAt: asNullableString(field(value, 'created_at', 'createdAt')),
    updatedAt: asNullableString(field(value, 'updated_at', 'updatedAt')),
  };
}

export function adaptFinanceiroAnexo(value: unknown): FinanceiroAnexo | null {
  if (!isRecord(value)) return null;
  const id = asString(field(value, 'id', 'id_financeiro_anexos', 'id_anexo'));
  const movimentoId = asString(field(value, 'movimento_id', 'fk_financeiro_movimentos', 'movimentoId'));
  const caminho = asString(field(value, 'caminho', 'url', 'storage_path'));
  if (!id || !movimentoId || !caminho) return null;
  return {
    id,
    movimentoId,
    nomeArquivo: asString(field(value, 'nome_arquivo', 'nomeArquivo'), 'comprovante'),
    caminho,
    mimeType: asNullableString(field(value, 'mime_type', 'mimeType')),
    tamanhoBytes: asNullableNumber(field(value, 'tamanho_bytes', 'tamanhoBytes')),
    createdAt: asNullableString(field(value, 'created_at', 'createdAt')),
    usuarioNome: asNullableString(field(value, 'usuario_nome', 'usuarioNome')),
  };
}

function adaptList<T>(value: unknown, adapter: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(adapter).filter((item): item is T => item !== null);
}

const FINANCEIRO_PAGE_SIZE = 500;
const FINANCEIRO_PAGE_CONCURRENCY = 4;

async function getAllFinanceiroPages<T extends { id: string }>(
  fetchPage: (pagination: { p_limite: number; p_offset: number }) => Promise<{
    dados: T[];
    total: number;
  }>,
) {
  const firstPage = await fetchPage({
    p_limite: FINANCEIRO_PAGE_SIZE,
    p_offset: 0,
  });
  const pageCount = Math.ceil(Math.max(firstPage.total, firstPage.dados.length) / FINANCEIRO_PAGE_SIZE);
  const pages: T[][] = [firstPage.dados];

  for (let pageIndex = 1; pageIndex < pageCount; pageIndex += FINANCEIRO_PAGE_CONCURRENCY) {
    const indexes = Array.from(
      { length: Math.min(FINANCEIRO_PAGE_CONCURRENCY, pageCount - pageIndex) },
      (_, index) => pageIndex + index,
    );
    const batch = await Promise.all(indexes.map((index) => fetchPage({
      p_limite: FINANCEIRO_PAGE_SIZE,
      p_offset: index * FINANCEIRO_PAGE_SIZE,
    })));
    pages.push(...batch.map((page) => page.dados));
  }

  const seenIds = new Set<string>();
  const dados = pages.flat().filter((item) => {
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });

  return {
    dados,
    total: firstPage.total,
  };
}

function adaptOperacaoResultado(envelope: RPCEnvelope<unknown>): FinanceiroOperacaoResultado {
  const row = isRecord(envelope.dados) ? envelope.dados : envelope;
  return {
    id: asNullableString(field(
      row,
      'id',
      'id_movimento',
      'id_financeiro_movimentos',
      'id_recebivel',
      'id_conta',
      'id_categoria',
      'id_modelo',
    )),
    movimentoId: asNullableString(field(row, 'movimento_id', 'id_movimento')),
    status: field(row, 'status') === undefined ? null : asStatus(field(row, 'status')),
    valorRealizado: asNullableNumber(field(row, 'valor_realizado', 'valorRealizado')),
    valorAberto: asNullableNumber(field(row, 'valor_aberto', 'valorAberto')),
  };
}

export async function getFinanceiroResumo(params: FinanceiroPeriodoParams) {
  const env = await callRPC<unknown>('get_financeiro_resumo', { ...params });
  return adaptFinanceiroResumo(extractDados(env, 'get_financeiro_resumo'));
}

export async function getFinanceiroLancamentos(params: FinanceiroLancamentosParams) {
  const env = await callRPC<unknown[]>('get_financeiro_lancamentos', { ...params });
  return {
    dados: adaptList(env.dados, adaptFinanceiroLancamento),
    total: env.total ?? 0,
  };
}

export async function getAllFinanceiroLancamentos(
  params: Omit<FinanceiroLancamentosParams, 'p_limite' | 'p_offset'>,
) {
  return getAllFinanceiroPages((pagination) => getFinanceiroLancamentos({
    ...params,
    ...pagination,
  }));
}

export async function getFinanceiroExtrato(params: FinanceiroExtratoParams) {
  const env = await callRPC<unknown[]>('get_financeiro_extrato', params);
  return {
    dados: adaptList(env.dados, adaptFinanceiroMovimento),
    total: env.total ?? 0,
  };
}

export async function getAllFinanceiroExtrato(
  params: Omit<FinanceiroExtratoParams, 'p_limite' | 'p_offset'>,
) {
  return getAllFinanceiroPages((pagination) => getFinanceiroExtrato({
    ...params,
    ...pagination,
  }));
}

export async function getFinanceiroContas(params?: { p_incluir_inativas?: boolean }) {
  const env = await callRPC<unknown[]>('get_financeiro_contas', params);
  return adaptList(env.dados, adaptFinanceiroConta);
}

export async function getCategoriasEntradas(params?: { p_incluir_inativas?: boolean }) {
  const env = await callRPC<unknown[]>('get_categorias_entradas', params);
  return adaptList(env.dados, adaptCategoriaEntrada);
}

export async function getFinanceiroModelosRecorrentes(params?: FinanceiroModelosRecorrentesParams) {
  const env = await callRPC<unknown[]>(
    'get_financeiro_modelos_recorrentes',
    params ? { ...params } : undefined,
  );
  return {
    dados: adaptList(env.dados, adaptFinanceiroModeloRecorrente),
    total: env.total ?? 0,
  };
}

export async function getAllFinanceiroModelosRecorrentes(
  params?: Omit<FinanceiroModelosRecorrentesParams, 'p_limite' | 'p_offset'>,
) {
  return getAllFinanceiroPages((pagination) => getFinanceiroModelosRecorrentes({
    ...params,
    ...pagination,
  }));
}

export async function getFinanceiroAnexos(movimentoId: string) {
  const env = await callRPC<unknown[]>('get_financeiro_anexos', {
    p_fk_financeiro_movimentos: movimentoId,
  });
  return adaptList(env.dados, adaptFinanceiroAnexo);
}

interface MovimentoBaseInput {
  valor: number;
  dataEfetiva: string;
  contaId: string;
  formaPagamento?: PaymentMethod | null;
  observacoes?: string | null;
  idempotencyKey: string;
}

export async function registrarRecebimentoNota(input: MovimentoBaseInput & { notaId: string }) {
  const env = await callRPC('registrar_recebimento_nota', {
    p_id_notas_servico: input.notaId,
    p_valor: input.valor,
    p_data_efetiva: input.dataEfetiva,
    p_fk_conta_financeira: input.contaId,
    p_forma_pagamento: input.formaPagamento ?? null,
    p_observacoes: input.observacoes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function registrarRecebimentoFechamento(input: MovimentoBaseInput & {
  fechamentoId: string;
}) {
  const env = await callRPC('registrar_recebimento_fechamento', {
    p_id_fechamentos: input.fechamentoId,
    p_valor: input.valor,
    p_data_efetiva: input.dataEfetiva,
    p_fk_conta_financeira: input.contaId,
    p_forma_pagamento: input.formaPagamento ?? null,
    p_observacoes: input.observacoes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function registrarPagamentoConta(input: MovimentoBaseInput & { contaPagarId: string }) {
  const env = await callRPC('registrar_pagamento_conta', {
    p_id_contas_pagar: input.contaPagarId,
    p_valor: input.valor,
    p_data_efetiva: input.dataEfetiva,
    p_fk_conta_financeira: input.contaId,
    p_forma_pagamento: input.formaPagamento ?? null,
    p_observacoes: input.observacoes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export interface CriarRecebivelManualInput {
  descricao: string;
  valor: number;
  vencimento: string;
  competencia?: string | null;
  categoriaId: string;
  clienteId?: string | null;
  clienteNome?: string | null;
  impactaDre?: boolean;
  observacoes?: string | null;
  idempotencyKey: string;
}

export async function criarRecebivelManual(input: CriarRecebivelManualInput) {
  const env = await callRPC('criar_recebivel_manual', {
    p_descricao: input.descricao,
    p_valor: input.valor,
    p_vencimento: input.vencimento,
    p_competencia: input.competencia ?? null,
    p_fk_categoria_entrada: input.categoriaId,
    p_fk_clientes: input.clienteId ?? null,
    p_cliente_nome: input.clienteNome ?? null,
    p_impacta_dre: input.impactaDre ?? true,
    p_observacoes: input.observacoes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export interface CriarMovimentoManualInput extends MovimentoBaseInput {
  direcao: FinanceiroDirecao;
  origem: Extract<
    FinanceiroOrigem,
    'RECEBIVEL_MANUAL' | 'MOVIMENTO_MANUAL' | 'APORTE' | 'REEMBOLSO' | 'AJUSTE'
  >;
  origemId?: string | null;
  descricao: string;
  categoriaEntradaId?: string | null;
  categoriaSaidaId?: string | null;
  impactaDre?: boolean;
}

export async function criarMovimentoManual(input: CriarMovimentoManualInput) {
  const env = await callRPC('criar_movimento_manual', {
    p_direcao: input.direcao,
    p_origem: input.origem,
    p_origem_id: input.origemId ?? null,
    p_descricao: input.descricao,
    p_valor: input.valor,
    p_data_efetiva: input.dataEfetiva,
    p_fk_conta_financeira: input.contaId,
    p_forma_pagamento: input.formaPagamento ?? null,
    p_fk_categoria_entrada: input.categoriaEntradaId ?? null,
    p_fk_categoria_saida: input.categoriaSaidaId ?? null,
    p_impacta_dre: input.impactaDre ?? false,
    p_observacoes: input.observacoes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function registrarRecebimentoManual(input: MovimentoBaseInput & {
  recebivelManualId: string;
  descricao?: string | null;
}) {
  const env = await callRPC('criar_movimento_manual', {
    p_direcao: 'ENTRADA',
    p_origem: 'RECEBIVEL_MANUAL',
    p_origem_id: input.recebivelManualId,
    p_descricao: input.descricao ?? 'Recebimento de receita manual',
    p_valor: input.valor,
    p_data_efetiva: input.dataEfetiva,
    p_fk_conta_financeira: input.contaId,
    p_forma_pagamento: input.formaPagamento ?? null,
    p_fk_categoria_entrada: null,
    p_fk_categoria_saida: null,
    p_impacta_dre: false,
    p_observacoes: input.observacoes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function estornarMovimentoFinanceiro(input: {
  movimentoId: string;
  motivo: string;
  dataEfetiva: string;
  idempotencyKey: string;
}) {
  const env = await callRPC('estornar_movimento_financeiro', {
    p_id_financeiro_movimentos: input.movimentoId,
    p_motivo: input.motivo,
    p_data_efetiva: input.dataEfetiva,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function estornarRecebimentoNota(input: {
  notaId: string;
  motivo: string;
  dataEfetiva: string;
  idempotencyKey: string;
}) {
  const env = await callRPC('estornar_recebimento_nota', {
    p_id_notas_servico: input.notaId,
    p_motivo: input.motivo,
    p_data_efetiva: input.dataEfetiva,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function estornarRecebimentoFechamento(input: {
  fechamentoId: string;
  motivo: string;
  dataEfetiva: string;
  idempotencyKey: string;
}) {
  const env = await callRPC('estornar_recebimento_fechamento', {
    p_id_fechamentos: input.fechamentoId,
    p_motivo: input.motivo,
    p_data_efetiva: input.dataEfetiva,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function transferirContasFinanceiras(input: {
  contaOrigemId: string;
  contaDestinoId: string;
  valor: number;
  dataEfetiva: string;
  descricao?: string | null;
  idempotencyKey: string;
}) {
  const env = await callRPC('transferir_contas_financeiras', {
    p_fk_conta_origem: input.contaOrigemId,
    p_fk_conta_destino: input.contaDestinoId,
    p_valor: input.valor,
    p_data_efetiva: input.dataEfetiva,
    p_descricao: input.descricao ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  return adaptOperacaoResultado(env);
}

export async function salvarContaFinanceira(input: {
  id?: string;
  nome: string;
  tipo: FinanceiroTipoConta;
  saldoInicial?: number | null;
  dataCorte?: string | null;
  padrao?: boolean;
  ativa?: boolean;
}) {
  const env = await callRPC('salvar_conta_financeira', {
    p_id_financeiro_conta: input.id ?? null,
    p_nome: input.nome,
    p_tipo: input.tipo,
    p_saldo_inicial: input.saldoInicial ?? null,
    p_data_corte: input.dataCorte ?? null,
    p_padrao: input.padrao ?? false,
    p_ativa: input.ativa ?? true,
  });
  return adaptOperacaoResultado(env);
}

export async function salvarCategoriaEntrada(input: {
  id?: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
  impactaDre?: boolean;
  ativa?: boolean;
}) {
  const env = await callRPC('salvar_categoria_entrada', {
    p_id_categoria_entrada: input.id ?? null,
    p_nome: input.nome,
    p_cor: input.cor ?? null,
    p_icone: input.icone ?? null,
    p_impacta_dre: input.impactaDre ?? true,
    p_ativa: input.ativa ?? true,
  });
  return adaptOperacaoResultado(env);
}

export async function salvarModeloRecorrente(input: {
  id?: string;
  titulo: string;
  categoriaId: string;
  fornecedorId?: string | null;
  fornecedorNome?: string | null;
  valor: number;
  recorrencia: Exclude<RecurrenceType, 'NENHUMA'>;
  diaVencimento: number;
  competenciaInicial: string;
  formaPagamentoPrevista?: PaymentMethod | null;
  observacoes?: string | null;
  ativa?: boolean;
}) {
  const env = await callRPC('salvar_modelo_recorrente', {
    p_id_modelo_recorrente: input.id ?? null,
    p_titulo: input.titulo,
    p_fk_categorias: input.categoriaId,
    p_fk_fornecedores: input.fornecedorId ?? null,
    p_nome_fornecedor: input.fornecedorNome ?? null,
    p_valor: input.valor,
    p_recorrencia: input.recorrencia,
    p_dia_vencimento: input.diaVencimento,
    p_competencia_inicial: input.competenciaInicial,
    p_forma_pagamento_prevista: input.formaPagamentoPrevista ?? null,
    p_observacoes: input.observacoes ?? null,
    p_ativa: input.ativa ?? true,
  });
  return adaptOperacaoResultado(env);
}

export async function inativarModeloRecorrente(modeloId: string) {
  const env = await callRPC('inativar_modelo_recorrente', {
    p_id_modelo_recorrente: modeloId,
  });
  return adaptOperacaoResultado(env);
}

export async function gerarContasRecorrentes(input?: {
  ate?: string;
  horizonteDias?: number;
}) {
  const env = await callRPC('gerar_contas_recorrentes', {
    p_ate: input?.ate ?? null,
    p_horizonte_dias: input?.horizonteDias ?? 90,
  });
  const row = isRecord(env.dados) ? env.dados : env;
  return {
    geradas: asNumber(field(row, 'geradas', 'total_geradas')),
    ignoradas: asNumber(field(row, 'ignoradas', 'total_ignoradas')),
  };
}

export async function insertFinanceiroAnexo(input: {
  movimentoId: string;
  nomeArquivo: string;
  caminho: string;
  mimeType?: string | null;
  tamanhoBytes?: number | null;
}) {
  const env = await callRPC('insert_financeiro_anexo', {
    p_fk_financeiro_movimentos: input.movimentoId,
    p_nome_arquivo: input.nomeArquivo,
    p_caminho: input.caminho,
    p_mime_type: input.mimeType ?? null,
    p_tamanho_bytes: input.tamanhoBytes ?? null,
  });
  return adaptOperacaoResultado(env);
}

export async function uploadFinanceiroComprovante(input: {
  movimentoId: string;
  file: File;
}) {
  if (readActiveSupportContext()) {
    throw new Error('[uploadFinanceiroComprovante] Uploads financeiros são bloqueados em modo suporte.');
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    throw new Error('[uploadFinanceiroComprovante] Sessão sem usuário autenticado.');
  }
  const filename = sanitizeStorageFilename(input.file.name, 'comprovante');
  const path = `${user.id}/${input.movimentoId}/${Date.now()}-${filename}`;
  const { error } = await supabase.storage.from(FINANCEIRO_BUCKET).upload(path, input.file, {
    contentType: input.file.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) {
    throw new Error(`[uploadFinanceiroComprovante] ${error.message}`);
  }
  return path;
}

export function extractFinanceiroStoragePath(pathOrUrl: string) {
  const value = pathOrUrl.trim();
  if (!value || value.startsWith('blob:')) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');

  try {
    const url = new URL(value);
    const markers = [
      `/storage/v1/object/public/${FINANCEIRO_BUCKET}/`,
      `/storage/v1/object/sign/${FINANCEIRO_BUCKET}/`,
      `/storage/v1/object/authenticated/${FINANCEIRO_BUCKET}/`,
    ];
    const marker = markers.find((candidate) => url.pathname.includes(candidate));
    if (!marker) return null;
    return decodeURIComponent(url.pathname.split(marker)[1] ?? '').replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}

async function getFinanceiroSignedUrlViaFunction(input: {
  pathOrUrl: string;
  anexoId?: string;
  expiresIn: number;
  supportContext: ReturnType<typeof readActiveSupportContext>;
}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente para abrir o comprovante.');
  }

  const { data, error } = await supabase.functions.invoke<{ signedUrl?: string; error?: string }>(
    'financeiro-anexo-url',
    {
      body: {
        pathOrUrl: input.pathOrUrl,
        attachmentId: input.anexoId,
        support: input.supportContext ?? undefined,
        expiresIn: input.expiresIn,
      },
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Não foi possível assinar o comprovante financeiro.',
    );
  }
  if (!data?.signedUrl) {
    throw new Error(data?.error ?? 'Não foi possível assinar o comprovante financeiro.');
  }
  return data.signedUrl;
}

export async function getFinanceiroAnexoSignedUrl(
  pathOrUrl: string,
  options: { anexoId?: string; expiresIn?: number } = {},
) {
  const path = extractFinanceiroStoragePath(pathOrUrl);
  if (!path) {
    throw new Error('[getFinanceiroAnexoSignedUrl] Comprovante sem caminho de Storage válido.');
  }
  const expiresIn = options.expiresIn ?? DEFAULT_SIGNED_URL_TTL;
  const supportContext = readActiveSupportContext();
  if (supportContext) {
    const signedUrl = await getFinanceiroSignedUrlViaFunction({
      pathOrUrl: path,
      anexoId: options.anexoId,
      expiresIn,
      supportContext,
    });
    assertActiveSupportScopeUnchanged(supportContext);
    return signedUrl;
  }

  const { data, error } = await supabase.storage
    .from(FINANCEIRO_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (!error && data?.signedUrl) return data.signedUrl;

  return getFinanceiroSignedUrlViaFunction({
    pathOrUrl: path,
    anexoId: options.anexoId,
    expiresIn,
    supportContext: null,
  });
}
