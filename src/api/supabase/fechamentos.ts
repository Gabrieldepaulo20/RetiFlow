import { callRPC, type RPCEnvelope } from './_base';
import { supabase } from '@/lib/supabase';
import { readActiveSupportContext } from '@/services/auth/supportContext';
import type { ResolvedDocumentCustomization } from '@/services/domain/documentCustomization';

const FECHAMENTOS_BUCKET = 'fechamentos';
const DEFAULT_FECHAMENTO_PDF_SIGNED_URL_TTL = 60 * 60;

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface FechamentoItem {
  /** UUID da linha original da O.S.; usado para auditoria do desconto. */
  id?: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_original?: number;
  desconto_porcentagem: number;
  subtotal_original?: number;
  subtotal: number;
}

export interface FechamentoNota {
  id: string;
  os: string;
  veiculo: string;
  placa: string | null;
  itens: FechamentoItem[];
  /** Valor integral da O.S. antes de considerar recebimentos anteriores. */
  valor_total_os?: number;
  /** Parte recebida antes deste fechamento. */
  valor_recebido?: number;
  /** Saldo da O.S. que pode entrar neste fechamento. */
  saldo_aberto?: number;
  total_original: number;
  desconto_nota: number;
  total_com_desconto: number;
}

/** Parcela da O.S. já recebida fora do fechamento (informativa: não soma novamente no total a pagar). */
export interface FechamentoRecebida {
  id: string;
  os: string;
  veiculo: string;
  placa: string | null;
  /** Compatibilidade contábil: representa somente o valor já recebido. */
  total: number;
  valor_recebido?: number;
  total_os?: number;
  saldo_aberto?: number;
  pago_em: string | null;
}

export interface FechamentoRecebimentoInicial {
  valor: number;
  data_efetiva: string;
  conta_id: string;
  forma_pagamento: string | null;
  observacoes: string | null;
  chave_idempotencia: string;
}

export interface FechamentoCompetencia {
  modo: 'MENSAL' | 'PERSONALIZADO';
  inicio: string;
  fim: string;
}

export interface FechamentoDadosJson {
  gerado_em: string;
  periodo: string;
  cliente: { id: string; nome: string };
  notas: FechamentoNota[];
  total_original: number;
  total_com_desconto: number;
  /** Intervalo imutável validado no servidor contra o prazo de cada O.S. */
  competencia?: FechamentoCompetencia | null;
  /** Partes já recebidas no período (mostradas no documento, fora do total a pagar). */
  recebidas?: FechamentoRecebida[];
  /** Soma das parcelas já recebidas no período. */
  total_ja_recebido?: number;
  /** Intenção imutável usada para reconciliar retries da geração atômica. */
  recebimento_inicial?: FechamentoRecebimentoInicial | null;
}

export interface FechamentoListItem {
  id_fechamentos: string;
  mes: string;
  ano: number;
  periodo: string;
  label: string;
  valor_total: number;
  /** Pagamento do fechamento (B2B): pendente até o cliente quitar o lote. */
  status_pagamento?: 'PENDENTE' | 'PARCIAL' | 'PAGO';
  valor_recebido?: number | string | null;
  valorRecebido?: number;
  pago_em?: string | null;
  pago_com?: string | null;
  versao: number;
  total_regeneracoes: number;
  total_edicoes: number;
  total_downloads: number;
  created_at: string;
  updated_at: string | null;
  cliente: { id: string; nome: string } | null;
  dados_json: FechamentoDadosJson | null;
  pdf_url: string | null;
  fk_template_documento?: string | null;
  documento_tema_snapshot?: Record<string, unknown> | null;
  documento_config_snapshot?: Record<string, unknown> | null;
}

export interface FechamentoAbertoClienteItem {
  id: string;
  periodo: string;
  label: string;
  valorTotal: number;
  valorRecebido: number;
  saldo: number;
  status: 'PENDENTE' | 'PARCIAL';
  createdAt: string | null;
}

export interface FechamentosAbertosCliente {
  clienteId: string;
  quantidade: number;
  saldoTotal: number;
  fechamentos: FechamentoAbertoClienteItem[];
}

export interface FinalizarFechamentoPagamentoInput {
  valor: number;
  dataEfetiva: string;
  contaId: string;
  formaPagamento: string | null;
  observacoes?: string | null;
  idempotencyKey: string;
}

export interface FinalizarFechamentoInput {
  id: string;
  clienteId: string;
  mes: string;
  ano: number;
  periodo: string;
  label: string;
  valorTotal: number;
  dadosJson: FechamentoDadosJson & { competencia: FechamentoCompetencia };
  idempotencyKey: string;
  pdfUrl?: string | null;
  customization?: ResolvedDocumentCustomization | null;
  pagamentoInicial?: FinalizarFechamentoPagamentoInput | null;
}

export interface FinalizarFechamentoResult {
  id: string;
  movimentoId: string | null;
  status: 'PENDENTE' | 'PARCIAL' | 'PAGO';
  valorRecebido: number;
  valorAberto: number;
  idempotentRetry: boolean;
}

export interface NotaDetalhesItem {
  id_rel: string;
  sku: number;
  descricao: string;
  detalhes: string | null;
  quantidade: number;
  preco_unitario: number;
  desconto_porcentagem: number;
  subtotal_item: number;
}

export interface NotaDetalhesResult {
  cabecalho: {
    id_nota: string;
    os_numero: string;
    total: number;
    total_servicos: number;
    cliente: { id: string; nome: string; documento: string };
    veiculo: { modelo: string; placa: string | null; km: number; motor: string };
    status: { nome: string };
  };
  itens_servico: NotaDetalhesItem[];
  financeiro_servicos: { total_bruto: number; total_liquido: number };
}

/* ── API Functions ──────────────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeFechamentoItem(value: unknown): FechamentoItem | null {
  if (!isRecord(value)) return null;
  const descontoPorcentagem = asNumber(value.desconto_porcentagem);
  const subtotal = asNumber(value.subtotal);
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : undefined,
    descricao: asString(value.descricao, 'Serviço realizado'),
    quantidade: asNumber(value.quantidade),
    preco_unitario: asNumber(value.preco_unitario),
    desconto_original: asNumber(value.desconto_original, descontoPorcentagem),
    desconto_porcentagem: descontoPorcentagem,
    subtotal_original: asNumber(value.subtotal_original, subtotal),
    subtotal,
  };
}

function normalizeFechamentoNota(value: unknown): FechamentoNota | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id, '');
  if (!id) return null;
  const itens = Array.isArray(value.itens)
    ? value.itens.map(normalizeFechamentoItem).filter((item): item is FechamentoItem => item !== null)
    : [];
  const totalOriginal = Math.max(0, asNumber(value.total_original));
  const valorRecebido = Math.max(0, asNumber(value.valor_recebido));
  const valorTotalOs = Math.max(
    totalOriginal + valorRecebido,
    asNumber(value.valor_total_os, totalOriginal + valorRecebido),
  );
  const saldoAberto = Math.max(0, asNumber(value.saldo_aberto, totalOriginal));
  return {
    id,
    os: asString(value.os, 'O.S. sem número'),
    veiculo: asString(value.veiculo, 'Veículo não informado'),
    placa: typeof value.placa === 'string' && value.placa.trim() ? value.placa : null,
    itens,
    valor_total_os: valorTotalOs,
    valor_recebido: Math.min(valorTotalOs, valorRecebido),
    saldo_aberto: Math.min(valorTotalOs, saldoAberto),
    total_original: totalOriginal,
    desconto_nota: asNumber(value.desconto_nota),
    total_com_desconto: asNumber(value.total_com_desconto),
  };
}

function normalizeFechamentoRecebida(value: unknown): FechamentoRecebida | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id, '');
  if (!id) return null;
  const valorRecebido = Math.max(0, asNumber(value.valor_recebido, asNumber(value.total)));
  const saldoAberto = Math.max(0, asNumber(value.saldo_aberto));
  const totalOs = Math.max(
    valorRecebido + saldoAberto,
    asNumber(value.total_os, valorRecebido + saldoAberto),
  );
  return {
    id,
    os: asString(value.os, 'O.S. sem número'),
    veiculo: asString(value.veiculo, 'Veículo não informado'),
    placa: typeof value.placa === 'string' && value.placa.trim() ? value.placa : null,
    total: Math.min(totalOs, valorRecebido),
    valor_recebido: Math.min(totalOs, valorRecebido),
    total_os: totalOs,
    saldo_aberto: Math.min(totalOs, saldoAberto),
    pago_em: typeof value.pago_em === 'string' ? value.pago_em : null,
  };
}

function normalizeFechamentoRecebimentoInicial(
  value: unknown,
): FechamentoRecebimentoInicial | null {
  if (!isRecord(value)) return null;
  const contaId = asString(value.conta_id, '');
  const dataEfetiva = asString(value.data_efetiva, '');
  const chaveIdempotencia = asString(value.chave_idempotencia, '');
  if (!contaId || !dataEfetiva || !chaveIdempotencia) return null;
  return {
    valor: Math.max(0, asNumber(value.valor)),
    data_efetiva: dataEfetiva,
    conta_id: contaId,
    forma_pagamento: typeof value.forma_pagamento === 'string'
      ? value.forma_pagamento
      : null,
    observacoes: typeof value.observacoes === 'string' ? value.observacoes : null,
    chave_idempotencia: chaveIdempotencia,
  };
}

function normalizeFechamentoCompetencia(value: unknown): FechamentoCompetencia | null {
  if (!isRecord(value)) return null;
  const modo = value.modo === 'MENSAL' || value.modo === 'PERSONALIZADO'
    ? value.modo
    : null;
  const inicio = asString(value.inicio, '');
  const fim = asString(value.fim, '');
  if (!modo || !/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    return null;
  }
  return { modo, inicio, fim };
}

export function normalizeFechamentoDadosJson(value: unknown): FechamentoDadosJson | null {
  if (!isRecord(value)) return null;

  const notas = Array.isArray(value.notas)
    ? value.notas.map(normalizeFechamentoNota).filter((nota): nota is FechamentoNota => nota !== null)
    : [];
  const recebidas = Array.isArray(value.recebidas)
    ? value.recebidas.map(normalizeFechamentoRecebida).filter((nota): nota is FechamentoRecebida => nota !== null)
    : [];
  const cliente = isRecord(value.cliente) ? value.cliente : {};
  const totalOriginal = asNumber(value.total_original, notas.reduce((sum, nota) => sum + nota.total_original, 0));
  const totalComDesconto = asNumber(
    value.total_com_desconto,
    notas.reduce((sum, nota) => sum + nota.total_com_desconto, 0),
  );

  return {
    gerado_em: asString(value.gerado_em, new Date().toISOString()),
    periodo: asString(value.periodo, 'Período não informado'),
    cliente: {
      id: asString(cliente.id, ''),
      nome: asString(cliente.nome, 'Cliente'),
    },
    notas,
    total_original: totalOriginal,
    total_com_desconto: totalComDesconto,
    competencia: normalizeFechamentoCompetencia(value.competencia),
    recebidas,
    total_ja_recebido: asNumber(
      value.total_ja_recebido,
      recebidas.reduce((sum, nota) => sum + nota.total, 0),
    ),
    recebimento_inicial: normalizeFechamentoRecebimentoInicial(value.recebimento_inicial),
  };
}

function rpcMessage(rpcName: string, message: string) {
  const prefix = `[${rpcName}]`;
  return message.startsWith(prefix) ? message : `${prefix} ${message}`;
}

async function callMutationRPC(rpcName: string, params: Record<string, unknown>) {
  if (readActiveSupportContext()) {
    throw new Error(
      `[${rpcName}] Ações de escrita em modo suporte estão bloqueadas até a auditoria backend por ação estar ativa.`,
    );
  }

  const { data, error } = await supabase.schema('RetificaPremium').rpc(rpcName, params);

  if (error) {
    throw new Error(rpcMessage(rpcName, error.message));
  }

  // Algumas RPCs legadas de fechamento são mutations que podem retornar void/null.
  // Mantemos essa exceção isolada aqui para não afrouxar o contrato padrão de callRPC().
  if (data === null || data === undefined) return;
  if (typeof data !== 'object') return;

  const envelope = data as Partial<RPCEnvelope>;
  if (envelope.status === undefined) return;
  if (envelope.status !== 200) {
    throw new Error(rpcMessage(rpcName, envelope.mensagem ?? 'Erro desconhecido.'));
  }
}

export async function getFechamentos(params?: {
  p_fk_clientes?: string;
  p_periodo?: string;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC('get_fechamentos', params);
  const dados = ((env.dados ?? []) as FechamentoListItem[]).map((item) => ({
    ...item,
    status_pagamento:
      item.status_pagamento === 'PAGO'
        ? 'PAGO' as const
        : item.status_pagamento === 'PARCIAL'
          ? 'PARCIAL' as const
          : 'PENDENTE' as const,
    valor_recebido: asNumber(item.valor_recebido ?? item.valorRecebido, 0),
    valorRecebido: asNumber(item.valor_recebido ?? item.valorRecebido, 0),
    dados_json: normalizeFechamentoDadosJson(item.dados_json),
  }));
  return { dados, total: env.total ?? 0 };
}

export async function getAllFechamentos(params?: {
  p_fk_clientes?: string;
  p_periodo?: string;
  pageSize?: number;
}): Promise<FechamentoListItem[]> {
  const pageSize = Math.min(500, Math.max(1, Math.trunc(params?.pageSize ?? 200)));
  const all: FechamentoListItem[] = [];
  let offset = 0;

  while (true) {
    const page = await getFechamentos({
      ...(params?.p_fk_clientes ? { p_fk_clientes: params.p_fk_clientes } : {}),
      ...(params?.p_periodo ? { p_periodo: params.p_periodo } : {}),
      p_limite: pageSize,
      p_offset: offset,
    });
    all.push(...page.dados);
    if (
      page.dados.length === 0
      || (page.total > 0 ? all.length >= page.total : page.dados.length < pageSize)
    ) break;
    offset += page.dados.length;
  }

  return all;
}

export async function getFechamentosAbertosCliente(
  clienteId: string,
): Promise<FechamentosAbertosCliente> {
  const env = await callRPC<unknown>('get_fechamentos_abertos_cliente', {
    p_fk_clientes: clienteId,
  });
  const row = isRecord(env.dados) ? env.dados : {};
  const rawItems = Array.isArray(row.fechamentos) ? row.fechamentos : [];
  const fechamentos = rawItems.flatMap((value): FechamentoAbertoClienteItem[] => {
    if (!isRecord(value)) return [];
    const id = asString(value.id ?? value.id_fechamentos, '');
    if (!id) return [];
    return [{
      id,
      periodo: asString(value.periodo, 'Período não informado'),
      label: asString(value.label, 'Fechamento'),
      valorTotal: Math.max(0, asNumber(value.valor_total ?? value.valorTotal)),
      valorRecebido: Math.max(0, asNumber(value.valor_recebido ?? value.valorRecebido)),
      saldo: Math.max(0, asNumber(value.saldo ?? value.valor_aberto ?? value.valorAberto)),
      status: value.status_pagamento === 'PARCIAL' || value.status === 'PARCIAL'
        ? 'PARCIAL'
        : 'PENDENTE',
      createdAt: typeof (value.created_at ?? value.createdAt) === 'string'
        ? String(value.created_at ?? value.createdAt)
        : null,
    }];
  });
  return {
    clienteId: asString(row.cliente_id ?? row.clienteId, clienteId),
    quantidade: Math.max(0, Math.trunc(asNumber(row.quantidade, fechamentos.length))),
    saldoTotal: Math.max(
      0,
      asNumber(row.saldo_total ?? row.saldoTotal, fechamentos.reduce((sum, item) => sum + item.saldo, 0)),
    ),
    fechamentos,
  };
}

export async function finalizarFechamento(
  input: FinalizarFechamentoInput,
): Promise<FinalizarFechamentoResult> {
  const snapshots = buildFechamentoDocumentSnapshotParams(input.customization);
  const pagamento = input.pagamentoInicial;
  const env = await callRPC<unknown>('finalizar_fechamento', {
    p_id_fechamentos: input.id,
    p_fk_clientes: input.clienteId,
    p_mes: input.mes,
    p_ano: input.ano,
    p_periodo: input.periodo,
    p_label: input.label,
    p_valor_total: input.valorTotal,
    p_dados_json: input.dadosJson,
    p_pdf_url: input.pdfUrl ?? null,
    p_chave_idempotencia: input.idempotencyKey,
    ...snapshots,
    p_recebimento_valor: pagamento?.valor ?? null,
    p_recebimento_data: pagamento?.dataEfetiva ?? null,
    p_recebimento_conta: pagamento?.contaId ?? null,
    p_recebimento_forma: pagamento?.formaPagamento ?? null,
    p_recebimento_observacoes: pagamento?.observacoes ?? null,
    p_recebimento_idempotencia: pagamento?.idempotencyKey ?? null,
  });
  const row = isRecord(env.dados) ? env.dados : env;
  const id = asString(row.id_fechamentos ?? row.id, '');
  if (!id) throw new Error('[finalizar_fechamento] Resposta sem identificador do fechamento.');
  const status = row.status === 'PAGO'
    ? 'PAGO'
    : row.status === 'PARCIAL'
      ? 'PARCIAL'
      : 'PENDENTE';
  return {
    id,
    movimentoId: typeof (row.movimento_id ?? row.id_movimento) === 'string'
      ? String(row.movimento_id ?? row.id_movimento)
      : null,
    status,
    valorRecebido: Math.max(0, asNumber(row.valor_recebido ?? row.valor_realizado)),
    valorAberto: Math.max(0, asNumber(row.valor_aberto, input.valorTotal)),
    idempotentRetry: row.idempotent_retry === true,
  };
}

export async function atualizarFechamentoPdf(
  idFechamento: string,
  pdfUrl: string,
  options: { expectedValorRecebido: number },
) {
  const expected = options.expectedValorRecebido;
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('[atualizarFechamentoPdf] Valor recebido esperado inválido.');
  }
  await callMutationRPC('atualizar_pdf_fechamento_seguro', {
    p_id_fechamentos: idFechamento,
    p_pdf_url: pdfUrl,
    p_valor_recebido_esperado: expected,
  });
}

function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function buildFechamentoDocumentSnapshotParams(customization?: ResolvedDocumentCustomization | null): {
  p_fk_template_documento: string | null;
  p_documento_tema_snapshot: Record<string, unknown> | null;
  p_documento_config_snapshot: Record<string, unknown> | null;
} {
  return {
    p_fk_template_documento: customization?.template?.id ?? null,
    p_documento_tema_snapshot: asJsonRecord(customization?.theme?.config),
    p_documento_config_snapshot: asJsonRecord(customization?.resolvedConfig),
  };
}

export async function registrarAcaoFechamento(params: {
  p_id_fechamentos: string;
  p_tipo: string;
  p_mensagem?: string;
}) {
  await callMutationRPC('registrar_acao_fechamento', params);
}

export async function getNotaDetalhesParaFechamento(idNota: string): Promise<NotaDetalhesResult | null> {
  try {
    const env = await callRPC('get_nota_servico_detalhes', { p_id_nota_servico: idNota });
    if ((env as Record<string, unknown>).status !== 200) return null;
    return env as unknown as NotaDetalhesResult;
  } catch {
    return null;
  }
}

export async function uploadFechamentoPDF(
  idFechamento: string,
  pdfBlob: Blob,
  options?: { versionCents?: number },
): Promise<string> {
  if (readActiveSupportContext()) {
    throw new Error('[uploadFechamentoPDF] Uploads em modo suporte estão bloqueados.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('[uploadFechamentoPDF] Sessão sem usuário autenticado.');
  const versionCents = options?.versionCents;
  if (
    versionCents !== undefined
    && (!Number.isSafeInteger(versionCents) || versionCents < 0)
  ) {
    throw new Error('[uploadFechamentoPDF] Versão financeira inválida.');
  }
  const versionSuffix = versionCents === undefined ? '' : `-${versionCents}`;
  const path = `${user.id}/${idFechamento}${versionSuffix}.pdf`;
  const { error } = await supabase.storage
    .from(FECHAMENTOS_BUCKET)
    .upload(path, pdfBlob, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });

  if (error) {
    throw new Error(`[upload_fechamento_pdf] ${error.message}`);
  }

  return path;
}

function extractFechamentoStoragePath(pathOrUrl: string | null | undefined): string | null {
  const value = pathOrUrl?.trim();
  if (!value || value.startsWith('blob:')) return null;

  const normalizePath = (path: string) => {
    const decoded = decodeURIComponent(path)
      .replace(/^\/+/, '')
      .replace(/^object\/(?:public|sign)\/fechamentos\//, '');

    return decoded || null;
  };

  if (!/^https?:\/\//i.test(value)) {
    return normalizePath(value);
  }

  try {
    const url = new URL(value);
    const publicMarker = `/storage/v1/object/public/${FECHAMENTOS_BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${FECHAMENTOS_BUCKET}/`;
    const marker = url.pathname.includes(publicMarker)
      ? publicMarker
      : url.pathname.includes(signedMarker)
        ? signedMarker
        : null;

    if (!marker) return null;

    const [, storagePath = ''] = url.pathname.split(marker);
    return normalizePath(storagePath);
  } catch {
    return null;
  }
}

async function getFunctionErrorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : 'Erro ao chamar função de PDF.';
  const context = typeof error === 'object' && error !== null && 'context' in error
    ? (error as { context?: unknown }).context
    : null;

  if (context instanceof Response) {
    try {
      const text = await context.clone().text();
      const parsed = JSON.parse(text) as { message?: string; error?: string; code?: string };
      message = parsed.message ?? parsed.error ?? message;
      if (parsed.code) message = `${parsed.code}: ${message}`;
    } catch {
      // Mantém a mensagem original do SDK quando o corpo não é JSON.
    }
  }

  return message;
}

async function getFechamentoPDFSignedUrlViaFunction(params: {
  pathOrUrl: string;
  fechamentoId?: string;
  supportContext?: ReturnType<typeof readActiveSupportContext>;
  expiresIn?: number;
  downloadFilename?: string | boolean;
}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente para abrir o PDF.');
  }

  const body: Record<string, unknown> = {
    pathOrUrl: params.pathOrUrl,
    closingId: params.fechamentoId,
    support: params.supportContext ?? undefined,
    expiresIn: params.expiresIn,
  };
  if (params.downloadFilename) {
    body.downloadFilename = params.downloadFilename;
  }

  const { data, error } = await supabase.functions.invoke<{ signedUrl?: string; error?: string }>('closing-pdf-url', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }
  if (!data?.signedUrl) {
    throw new Error(data?.error ?? 'Não foi possível gerar link seguro do PDF.');
  }

  return data.signedUrl;
}

export async function getFechamentoPDFSignedUrl(
  pathOrUrl: string,
  options: { fechamentoId?: string; expiresIn?: number; downloadFilename?: string | boolean } = {},
): Promise<string> {
  if (!pathOrUrl || pathOrUrl.startsWith('blob:')) {
    return pathOrUrl;
  }

  const path = extractFechamentoStoragePath(pathOrUrl);
  if (!path) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    throw new Error('[getFechamentoPDFSignedUrl] PDF sem caminho de Storage válido.');
  }

  const expiresIn = options.expiresIn ?? DEFAULT_FECHAMENTO_PDF_SIGNED_URL_TTL;
  const supportContext = readActiveSupportContext();
  if (supportContext) {
    return getFechamentoPDFSignedUrlViaFunction({
      pathOrUrl: path,
      fechamentoId: options.fechamentoId,
      supportContext,
      expiresIn,
      downloadFilename: options.downloadFilename,
    });
  }

  const signOptions = options.downloadFilename
    ? { download: options.downloadFilename }
    : undefined;
  const { data, error } = signOptions
    ? await supabase.storage.from(FECHAMENTOS_BUCKET).createSignedUrl(path, expiresIn, signOptions)
    : await supabase.storage.from(FECHAMENTOS_BUCKET).createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    return getFechamentoPDFSignedUrlViaFunction({
      pathOrUrl: path,
      fechamentoId: options.fechamentoId,
      expiresIn,
      downloadFilename: options.downloadFilename,
    });
  }

  return data.signedUrl;
}
