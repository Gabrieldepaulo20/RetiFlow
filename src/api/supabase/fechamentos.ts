import { callRPC, type RPCEnvelope } from './_base';
import { supabase } from '@/lib/supabase';

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
  placa: string;
  itens: FechamentoItem[];
  total_original: number;
  desconto_nota: number;
  total_com_desconto: number;
}

export interface FechamentoDadosJson {
  gerado_em: string;
  periodo: string;
  cliente: { id: string; nome: string };
  notas: FechamentoNota[];
  total_original: number;
  total_com_desconto: number;
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
  versao: number;
  total_regeneracoes: number;
  total_edicoes: number;
  total_downloads: number;
  created_at: string;
  updated_at: string | null;
  cliente: { id: string; nome: string } | null;
  dados_json: FechamentoDadosJson | null;
  pdf_url: string | null;
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
    veiculo: { modelo: string; placa: string; km: number; motor: string };
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
  const { data, error } = await supabase.schema('RetificaPremium').rpc(rpcName, params);

  if (error) {
    throw new Error(rpcMessage(rpcName, error.message));
  }

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
  }>,
) {
  await callMutationRPC('update_fechamento', { p_id_fechamentos: idFechamentos, ...dados });
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
): Promise<string> {
  const path = `${idFechamento}.pdf`;
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
