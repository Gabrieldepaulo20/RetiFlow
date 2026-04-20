import { callRPC } from './_base';

export interface Categoria {
  id_categorias: string;
  nome: string;
  cor: string;
  icone: string;
  ativo: boolean;
  created_at: string;
}

export async function getCategorias(p_ativo?: boolean) {
  const env = await callRPC<Categoria[]>('get_categorias_conta_pagar', { p_ativo });
  return env.dados ?? [];
}

export async function insertCategoria(params: {
  p_nome: string;
  p_cor?: string;
  p_icone?: string;
}) {
  const env = await callRPC('insert_categoria_conta_pagar', params);
  return env.id_categorias as string;
}

export async function updateCategoria(
  idCategorias: string,
  dados: Partial<{ p_nome: string; p_cor: string; p_icone: string; p_ativo: boolean }>,
) {
  await callRPC('update_categoria_conta_pagar', { p_id_categorias: idCategorias, ...dados });
}
