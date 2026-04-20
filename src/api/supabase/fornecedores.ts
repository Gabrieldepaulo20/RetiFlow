import { callRPC } from './_base';

export interface Fornecedor {
  id_fornecedores: string;
  nome: string;
  nome_fantasia: string | null;
  tipo_documento: 'CPF' | 'CNPJ' | null;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
  created_at: string;
}

export async function getFornecedores(params?: {
  p_busca?: string;
  p_ativo?: boolean;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<Fornecedor[]>('get_fornecedores', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function insertFornecedor(params: {
  p_nome: string;
  p_nome_fantasia?: string;
  p_tipo_documento?: string;
  p_documento?: string;
  p_telefone?: string;
  p_email?: string;
}) {
  const env = await callRPC('insert_fornecedor', params);
  return env.id_fornecedores as string;
}

export async function updateFornecedor(
  idFornecedores: string,
  dados: Partial<{
    p_nome: string; p_nome_fantasia: string; p_tipo_documento: string;
    p_documento: string; p_telefone: string; p_email: string; p_ativo: boolean;
  }>,
) {
  await callRPC('update_fornecedor', { p_id_fornecedores: idFornecedores, ...dados });
}

export async function inativarFornecedor(idFornecedores: string) {
  await callRPC('inativar_fornecedor', { p_id_fornecedores: idFornecedores });
}
