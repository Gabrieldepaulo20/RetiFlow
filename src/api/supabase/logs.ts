import { callRPC } from './_base';
import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/monitoring';

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
  const { error } = await supabase.schema('RetificaPremium').rpc('insert_log', params);

  if (error) {
    const err = new Error(`[insert_log] ${error.message}`);
    logError(err, 'insert_log');
    throw err;
  }
}
