import { callRPC } from './_base';

export interface Fatura {
  id_faturas: string;
  tipo: 'NFE' | 'NFSE' | 'RECIBO';
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  competencia: string | null;
  data_emissao: string;
  valor: number;
  descricao: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  status: 'REGISTRADA' | 'ENVIADA' | 'CANCELADA';
  nfeio_id: string | null;
  nfeio_status: string | null;
  nfeio_emitido_em: string | null;
  created_at: string;
  cliente: { id: string; nome: string };
  nota_servico: { id: string; os: string } | null;
}

export async function getFaturas(params?: {
  p_fk_clientes?: string;
  p_fk_notas_servico?: string;
  p_tipo?: string;
  p_status?: string;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<Fatura[]>('get_faturas', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function getFaturaDetalhes(idFaturas: string) {
  const env = await callRPC('get_fatura_detalhes', { p_id_faturas: idFaturas });
  return env.dados as Fatura;
}

export async function insertFatura(params: {
  p_fk_clientes: string;
  p_tipo: string;
  p_data_emissao: string;
  p_valor: number;
  p_fk_notas_servico?: string;
  p_numero?: string;
  p_serie?: string;
  p_chave_acesso?: string;
  p_competencia?: string;
  p_descricao?: string;
  p_cnpj_emitente?: string;
  p_pdf_url?: string;
  p_xml_url?: string;
}) {
  const env = await callRPC('insert_fatura', params);
  return env.id_faturas as string;
}

export async function updateFatura(
  idFaturas: string,
  dados: Partial<{
    p_numero: string; p_serie: string; p_chave_acesso: string;
    p_pdf_url: string; p_xml_url: string; p_status: string;
    p_nfeio_id: string; p_nfeio_status: string; p_nfeio_emitido_em: string;
  }>,
) {
  await callRPC('update_fatura', { p_id_faturas: idFaturas, ...dados });
}

export async function cancelarFatura(idFaturas: string) {
  await callRPC('cancelar_fatura', { p_id_faturas: idFaturas });
}
