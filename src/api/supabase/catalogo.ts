import { callRPC } from './_base';

/** Tipos de motor disponíveis — usado no dropdown de nova nota. */
export async function getTiposDeMotor(p_busca?: string) {
  const env = await callRPC<Array<{ id_tipos_de_motor: number; tipo: string }>>(
    'get_tipos_de_motor',
    { p_busca },
  );
  return env.dados ?? [];
}

/** Catálogo de serviços — usado no dropdown de itens da nota de serviço. */
export async function getServicosItens(p_busca?: string) {
  const env = await callRPC<Array<{ id_servicos_itens: number; nome: string }>>(
    'get_servicos_itens',
    { p_busca },
  );
  return env.dados ?? [];
}

/** Catálogo de peças/produtos — usado no dropdown de itens da nota de compra. */
export async function getPecasProdutos(p_busca?: string) {
  const env = await callRPC<Array<{ id_pecas_produtos: number; nome: string }>>(
    'get_pecas_produtos',
    { p_busca },
  );
  return env.dados ?? [];
}
