import { callRPC } from './_base';
import { supabase } from '@/lib/supabase';

export interface ContaPagar {
  id_contas_pagar: string;
  titulo: string;
  nome_fornecedor: string | null;
  numero_documento: string | null;
  data_vencimento: string;
  data_emissao: string | null;
  data_competencia: string | null;
  valor_original: number;
  juros: number;
  desconto: number;
  valor_final: number;
  valor_pago: number | null;
  status: 'PENDENTE' | 'PAGO' | 'PARCIAL' | 'CANCELADO' | 'AGENDADO';
  forma_pagamento_prevista: string | null;
  pago_em: string | null;
  pago_com: string | null;
  recorrencia: string;
  indice_recorrencia: number | null;
  total_parcelas: number | null;
  urgente: boolean;
  origem_lancamento: string;
  excluido_em: string | null;
  vencida: boolean;
  created_at: string;
  updated_at: string;
  categoria: { id: string; nome: string; cor: string; icone: string };
  fornecedor: { id: string; nome: string } | null;
}

export interface InsertContaPagarPayload {
  p_titulo: string;
  p_fk_categorias: string;
  p_data_vencimento: string;
  p_valor_original: number;
  p_fk_fornecedores?: string;
  p_nome_fornecedor?: string;
  p_numero_documento?: string;
  p_data_emissao?: string;
  p_juros?: number;
  p_desconto?: number;
  p_forma_pagamento_prevista?: string;
  p_origem_lancamento?: string;
  p_data_competencia?: string;
  p_recorrencia?: string;
  p_fk_conta_pai?: string;
  p_indice_recorrencia?: number;
  p_total_parcelas?: number;
  p_observacoes?: string;
  p_urgente?: boolean;
}

export async function getContasPagar(params?: {
  p_status?: string;
  p_fk_categorias?: string;
  p_fk_fornecedores?: string;
  p_busca?: string;
  p_apenas_urgentes?: boolean;
  p_apenas_vencidas?: boolean;
  p_incluir_excluidas?: boolean;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<ContaPagar[]>('get_contas_pagar', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function getContaPagarDetalhes(idContasPagar: string) {
  const env = await callRPC('get_conta_pagar_detalhes', { p_id_contas_pagar: idContasPagar });
  return env as unknown as Record<string, unknown>;
}

export async function insertContaPagar(payload: InsertContaPagarPayload) {
  const env = await callRPC('insert_conta_pagar', payload);
  return env.id_contas_pagar as string;
}

export async function updateContaPagar(
  idContasPagar: string,
  dados: Partial<InsertContaPagarPayload>,
) {
  await callRPC('update_conta_pagar', { p_id_contas_pagar: idContasPagar, ...dados });
}

export async function registrarPagamento(params: {
  p_id_contas_pagar: string;
  p_valor_pago: number;
  p_pago_com?: string;
  p_observacoes_pagamento?: string;
}) {
  const env = await callRPC('registrar_pagamento', params);
  return env.novo_status as string;
}

export async function cancelarContaPagar(idContasPagar: string) {
  await callRPC('cancelar_conta_pagar', { p_id_contas_pagar: idContasPagar });
}

export async function excluirContaPagar(idContasPagar: string) {
  await callRPC('excluir_conta_pagar', { p_id_contas_pagar: idContasPagar });
}

export async function insertAnexoContaPagar(params: {
  p_fk_contas_pagar: string;
  p_tipo: string;
  p_nome_arquivo: string;
  p_url: string;
}) {
  const env = await callRPC('insert_anexo_conta_pagar', params);
  return env.id_anexo as string;
}

export type AnalisarContaPagarResultado = {
  draft: {
    title: string;
    supplierName: string;
    categoryId: string;
    dueDate: string;
    issueDate?: string;
    originalAmount: number;
    paymentMethod: string;
    recurrence: string;
    docNumber?: string;
    observations?: string;
    isUrgent: boolean;
    suggestedStatus: 'PAGO' | 'PENDENTE' | 'AGENDADO' | 'INCERTO';
  };
  fields: Array<{ label: string; value: string; confidence: number }>;
  warnings: string[];
  highlights: string[];
};

export async function analisarContaPagarComIA(params: {
  file: File;
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const body = new FormData();
  body.append('file', params.file);
  body.append('categories', JSON.stringify(params.categories));
  body.append('suppliers', JSON.stringify(params.suppliers));

  const { data, error } = await supabase.functions.invoke<AnalisarContaPagarResultado>('analisar-conta-pagar', {
    body,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('A análise por IA não retornou dados.');
  }

  return data;
}
