import { callRPC, callVoidRPC } from './_base';

export interface LogAtividade {
  id_log: number;
  created_at: string;
  acao: string;
  tabela_nome: string;
  entidade_id: string;
  descricao: string;
  usuario: { id: string; nome: string } | null;
}

export async function getLogs(params?: {
  p_fk_usuarios?: string;
  p_tabela_nome?: string;
  p_acao?: string;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<LogAtividade[]>('get_logs', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function insertLog(params: {
  p_acao: string;
  p_tabela_nome: string;
  p_entidade_id: string;
  p_descricao: string;
  p_fk_usuarios?: string;
}) {
  // `insert_log` é `returns void` no backend (sem envelope {status, mensagem, dados}),
  // por isso usa callVoidRPC em vez de callRPC — mas ainda passa pelo mesmo
  // remapeamento/bloqueio de modo suporte central em `_base.ts`.
  await callVoidRPC('insert_log', params);
}
