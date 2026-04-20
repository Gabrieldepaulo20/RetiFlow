import { callRPC } from './_base';

export interface NotaServico {
  id_notas_servico: string;
  os: string;
  prazo: string;
  defeito: string;
  observacoes: string | null;
  total: number;
  total_servicos: number;
  total_produtos: number;
  created_at: string;
  finalizado_em: string | null;
  cliente: { id: string; nome: string };
  veiculo: { id: string; modelo: string; placa: string; km: number };
  status: { id: number; nome: string; index: number; tipo_status: string };
}

export interface NotaCompra {
  id_notas_compra: string;
  oc: string;
  observacoes: string | null;
  created_at: string;
  status: { id: number; nome: string; index: number; tipo_status: string };
  nota_servico: { id: string; os: string };
}

export interface StatusNota {
  id_status_notas: number;
  nome: string;
  index: number;
  tipo_nota: 'Serviço' | 'Compra';
  tipo_status: 'ativo' | 'fechado';
}

export interface NovaNotaPayload {
  tipo_nota: 'Serviço' | 'Compra';
  numero_nota: string;
  prazo?: string;
  defeito?: string;
  fk_clientes?: string;
  fk_notas_servico?: string;
  observacoes?: string;
  total_servicos?: number;
  total_produtos?: number;
  total?: number;
  veiculo?: {
    modelo: string;
    placa: string;
    km: number;
    motor: string;
  };
  itens?: Array<{
    descricao: string;
    quantidade: number;
    valor: number;
    desconto?: number;
    detalhes?: string;
  }>;
}

export async function getNotasServico(params?: {
  p_fk_clientes?: string;
  p_fk_status?: number;
  p_busca?: string;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<NotaServico[]>('get_notas_servico', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function getNotaServicoDetalhes(idNota: string) {
  const env = await callRPC('get_nota_servico_detalhes', { p_id_nota_servico: idNota });
  return env as unknown as Record<string, unknown>;
}

export async function getNotasCompra(params?: {
  p_fk_notas_servico?: string;
  p_fk_status?: number;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<NotaCompra[]>('get_notas_compra', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function getNotaCompraDetalhes(idNota: string) {
  const env = await callRPC('get_nota_compra_detalhes', { p_id_nota_compra: idNota });
  return env as unknown as Record<string, unknown>;
}

export async function getStatusNotas(params?: {
  p_tipo_nota?: 'Serviço' | 'Compra';
  p_tipo_status?: 'ativo' | 'fechado';
}) {
  const env = await callRPC<StatusNota[]>('get_status_notas', params);
  return env.dados ?? [];
}

export async function novaNota(payload: NovaNotaPayload) {
  const env = await callRPC('nova_nota', { p_payload: payload });
  return { id_nota: env.id_nota as string, tipo_nota: env.tipo_nota as string };
}

export async function updateNotaServico(payload: { id_notas_servico: string } & Record<string, unknown>) {
  await callRPC('update_nota_servico', { p_payload: payload });
}
