import { callRPC } from './_base';

export interface SugestaoEmail {
  id_sugestoes_email: string;
  assunto: string;
  nome_remetente: string;
  email_remetente: string;
  recebido_em: string;
  titulo_sugerido: string;
  valor_sugerido: number;
  vencimento_sugerido: string;
  fornecedor_sugerido: string;
  forma_pagamento_sugerida: string;
  confianca: number;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED';
  trecho_email: string | null;
  created_at: string;
  categoria_sugerida: { id: string; nome: string; cor: string; icone: string } | null;
}

export async function getSugestoesEmail(p_status?: 'PENDING' | 'ACCEPTED' | 'DISMISSED') {
  const env = await callRPC<SugestaoEmail[]>('get_sugestoes_email', { p_status });
  return env.dados ?? [];
}

export async function insertSugestaoEmail(params: {
  p_assunto: string;
  p_nome_remetente: string;
  p_email_remetente: string;
  p_recebido_em: string;
  p_titulo_sugerido: string;
  p_valor_sugerido: number;
  p_vencimento_sugerido: string;
  p_fornecedor_sugerido: string;
  p_forma_pagamento_sugerida: string;
  p_confianca: number;
  p_fk_categorias_sugerida?: string;
  p_trecho_email?: string;
}) {
  const env = await callRPC('insert_sugestao_email', params);
  return env.id_sugestoes_email as string;
}

export async function aceitarSugestaoEmail(idSugestoesEmail: string) {
  const env = await callRPC('aceitar_sugestao_email', { p_id_sugestoes_email: idSugestoesEmail });
  return env.id_contas_pagar as string;
}

export async function ignorarSugestaoEmail(idSugestoesEmail: string) {
  await callRPC('ignorar_sugestao_email', { p_id_sugestoes_email: idSugestoesEmail });
}
