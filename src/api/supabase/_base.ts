import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/monitoring';

/** Formato padrão retornado por todos os RPCs do schema RetificaPremium. */
export interface RPCEnvelope<T = unknown> {
  status: number;
  mensagem: string;
  total?: number;
  dados?: T;
  [key: string]: unknown;
}

/**
 * Chama um RPC do Supabase e retorna o envelope tipado.
 * Lança ApiError se o Supabase retornar erro de rede/auth,
 * ou se o RPC retornar status !== 200.
 */
export async function callRPC<T = unknown>(
  rpcName: string,
  params?: Record<string, unknown>,
): Promise<RPCEnvelope<T>> {
  const { data, error } = await supabase.schema('RetificaPremium').rpc(rpcName, params ?? {});

  if (error) {
    const err = new Error(`[${rpcName}] ${error.message}`);
    logError(err, rpcName);
    throw err;
  }

  const envelope = data as RPCEnvelope<T>;

  if (!envelope || envelope.status === undefined) {
    const err = new Error(`[${rpcName}] Resposta inesperada do servidor.`);
    logError(err, rpcName);
    throw err;
  }

  if (envelope.status !== 200) {
    const err = new Error(`[${rpcName}] ${envelope.mensagem ?? 'Erro desconhecido.'}`);
    logError(err, rpcName);
    throw err;
  }

  return envelope;
}

/**
 * Helper: extrai o campo `dados` tipado de um envelope.
 * Lança se `dados` estiver ausente.
 */
export function extractDados<T>(envelope: RPCEnvelope<T>, rpcName: string): T {
  if (envelope.dados === undefined || envelope.dados === null) {
    throw new Error(`[${rpcName}] Campo 'dados' ausente na resposta.`);
  }
  return envelope.dados;
}
