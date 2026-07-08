import { callRPC, type RPCEnvelope } from './_base';
import { supabase } from '@/lib/supabase';
import { readStoredSupportContext } from '@/services/auth/supportContext';
import type { ResolvedDocumentCustomization } from '@/services/domain/documentCustomization';

const FECHAMENTOS_BUCKET = 'fechamentos';
const DEFAULT_FECHAMENTO_PDF_SIGNED_URL_TTL = 60 * 60;

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface FechamentoItem {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_porcentagem: number;
  subtotal: number;
}

export interface FechamentoNota {
  id: string;
  os: string;
  veiculo: string;
  placa: string | null;
  itens: FechamentoItem[];
  /**
   * Total BRUTO da nota de entrada no momento da geração — pristine, ignora
   * qualquer desconto do rascunho (por item ou por O.S.). Usado só para detectar
   * divergência (alteração manual da nota DEPOIS do fechamento). Opcional para
   * compatibilidade com fechamentos antigos que não gravaram este campo.
   */
  total_nota?: number;
  total_original: number;
  desconto_nota: number;
  total_com_desconto: number;
}

/** O.S. do período que já foi recebida fora do fechamento (informativa: não soma no total a pagar). */
export interface FechamentoRecebida {
  id: string;
  os: string;
  veiculo: string;
  placa: string | null;
  total: number;
  pago_em: string | null;
}

export interface FechamentoDadosJson {
  gerado_em: string;
  periodo: string;
  cliente: { id: string; nome: string };
  notas: FechamentoNota[];
  total_original: number;
  total_com_desconto: number;
  /** O.S. já recebidas no período (mostradas no documento, fora do total a pagar). */
  recebidas?: FechamentoRecebida[];
  /** Soma das O.S. já recebidas no período. */
  total_ja_recebido?: number;
  divergente?: boolean;
  divergencias?: Array<{
    os: string;
    total_original: number;
    total_atual: number;
    alterado_em: string;
  }>;
}

export interface FechamentoListItem {
  id_fechamentos: string;
  mes: string;
  ano: number;
  periodo: string;
  label: string;
  valor_total: number;
  /** Pagamento do fechamento (B2B): pendente até o cliente quitar o lote. */
  status_pagamento?: 'PENDENTE' | 'PAGO';
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
  return {
    descricao: asString(value.descricao, 'Serviço realizado'),
    quantidade: asNumber(value.quantidade),
    preco_unitario: asNumber(value.preco_unitario),
    desconto_porcentagem: asNumber(value.desconto_porcentagem),
    subtotal: asNumber(value.subtotal),
  };
}

function normalizeFechamentoNota(value: unknown): FechamentoNota | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id, '');
  if (!id) return null;
  const itens = Array.isArray(value.itens)
    ? value.itens.map(normalizeFechamentoItem).filter((item): item is FechamentoItem => item !== null)
    : [];
  return {
    id,
    os: asString(value.os, 'O.S. sem número'),
    veiculo: asString(value.veiculo, 'Veículo não informado'),
    placa: typeof value.placa === 'string' && value.placa.trim() ? value.placa : null,
    itens,
    ...(value.total_nota !== undefined ? { total_nota: asNumber(value.total_nota) } : {}),
    total_original: asNumber(value.total_original),
    desconto_nota: asNumber(value.desconto_nota),
    total_com_desconto: asNumber(value.total_com_desconto),
  };
}

function normalizeFechamentoRecebida(value: unknown): FechamentoRecebida | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id, '');
  if (!id) return null;
  return {
    id,
    os: asString(value.os, 'O.S. sem número'),
    veiculo: asString(value.veiculo, 'Veículo não informado'),
    placa: typeof value.placa === 'string' && value.placa.trim() ? value.placa : null,
    total: asNumber(value.total),
    pago_em: typeof value.pago_em === 'string' ? value.pago_em : null,
  };
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
    recebidas,
    total_ja_recebido: asNumber(
      value.total_ja_recebido,
      recebidas.reduce((sum, nota) => sum + nota.total, 0),
    ),
    divergente: value.divergente === true,
    divergencias: Array.isArray(value.divergencias) ? value.divergencias as FechamentoDadosJson['divergencias'] : [],
  };
}

function rpcMessage(rpcName: string, message: string) {
  const prefix = `[${rpcName}]`;
  return message.startsWith(prefix) ? message : `${prefix} ${message}`;
}

async function callMutationRPC(rpcName: string, params: Record<string, unknown>) {
  if (readStoredSupportContext()) {
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
    dados_json: normalizeFechamentoDadosJson(item.dados_json),
  }));
  return { dados, total: env.total ?? 0 };
}

export async function insertFechamento(params: {
  p_fk_clientes: string;
  p_mes: string;
  p_ano: number;
  p_periodo: string;
  p_label: string;
  p_valor_total: number;
}) {
  const env = await callRPC('insert_fechamento', params);
  return env.id_fechamentos as string;
}

export async function updateFechamento(
  idFechamentos: string,
  dados: Partial<{
    p_label: string;
    p_valor_total: number;
    p_dados_json: FechamentoDadosJson;
    p_pdf_url: string;
    p_fk_template_documento: string | null;
    p_documento_tema_snapshot: Record<string, unknown> | null;
    p_documento_config_snapshot: Record<string, unknown> | null;
  }>,
) {
  await callMutationRPC('update_fechamento', { p_id_fechamentos: idFechamentos, ...dados });
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

/** Marca o fechamento como pago e cascateia o recebimento para as O.S. pendentes dele. */
export async function marcarFechamentoPago(
  idFechamentos: string,
  params: { pagoEm: string; pagoCom?: string | null },
) {
  await callMutationRPC('marcar_fechamento_pago', {
    p_id_fechamentos: idFechamentos,
    p_pago_em: params.pagoEm,
    p_pago_com: params.pagoCom ?? null,
  });
}

/** Estorna o pagamento do fechamento e reverte as O.S. pagas por esta cascata. */
export async function estornarFechamentoPago(idFechamentos: string) {
  await callMutationRPC('estornar_fechamento_pago', { p_id_fechamentos: idFechamentos });
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
): Promise<string> {
  if (readStoredSupportContext()) {
    throw new Error('[uploadFechamentoPDF] Uploads em modo suporte estão bloqueados.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('[uploadFechamentoPDF] Sessão sem usuário autenticado.');
  const path = `${user.id}/${idFechamento}.pdf`;
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
  supportContext?: ReturnType<typeof readStoredSupportContext>;
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
  const supportContext = readStoredSupportContext();
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
