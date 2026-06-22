import { callRPC, type RPCEnvelope } from './_base';
import { supabase } from '@/lib/supabase';
import { readStoredSupportContext } from '@/services/auth/supportContext';
import type { ResolvedDocumentCustomization } from '@/services/domain/documentCustomization';

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
  return { dados: (env.dados ?? []) as FechamentoListItem[], total: env.total ?? 0 };
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
    .from('fechamentos')
    .upload(path, pdfBlob, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });

  if (error) {
    throw new Error(`[upload_fechamento_pdf] ${error.message}`);
  }

  return path;
}

export async function getFechamentoPDFSignedUrl(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl || pathOrUrl.startsWith('http') || pathOrUrl.startsWith('blob:')) {
    return pathOrUrl;
  }

  const { data, error } = await supabase.storage
    .from('fechamentos')
    .createSignedUrl(pathOrUrl, 60 * 60);

  if (error || !data?.signedUrl) {
    throw new Error(`[getFechamentoPDFSignedUrl] ${error?.message ?? 'Não foi possível gerar link seguro do PDF.'}`);
  }

  return data.signedUrl;
}
