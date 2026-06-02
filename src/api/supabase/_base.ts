import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/monitoring';
import { readStoredSupportContext } from '@/services/auth/supportContext';

/** Formato padrão retornado por todos os RPCs do schema RetificaPremium. */
export interface RPCEnvelope<T = unknown> {
  status: number;
  mensagem: string;
  total?: number;
  dados?: T;
  [key: string]: unknown;
}

const SUPPORT_CONTEXT_RPC_MAP: Record<string, string> = {
  get_clientes: 'get_clientes_contexto_suporte',
  get_cliente_detalhes: 'get_cliente_detalhes_contexto_suporte',
  get_notas_servico: 'get_notas_servico_contexto_suporte',
  get_nota_servico_detalhes: 'get_nota_servico_detalhes_contexto_suporte',
  get_contas_pagar: 'get_contas_pagar_contexto_suporte',
  get_conta_pagar_detalhes: 'get_conta_pagar_detalhes_contexto_suporte',
  get_fornecedores: 'get_fornecedores_contexto_suporte',
};

const SUPPORT_BLOCKED_WRITE_RPCS = new Set([
  'aceitar_sugestao_email',
  'cancelar_conta_pagar',
  'cancelar_fatura',
  'excluir_conta_pagar',
  'ignorar_sugestao_email',
  'inativar_cliente',
  'inativar_fornecedor',
  'insert_anexo_conta_pagar',
  'insert_categoria_conta_pagar',
  'insert_conta_pagar',
  'insert_fatura',
  'insert_fechamento',
  'insert_fornecedor',
  'insert_sugestao_email',
  'nova_nota',
  'novo_cliente',
  'reativar_cliente',
  'registrar_pagamento',
  'salvar_cliente_completo',
  'update_anexo_conta_pagar_nome',
  'update_categoria_conta_pagar',
  'update_cliente',
  'update_conta_pagar',
  'update_fatura',
  'update_fornecedor',
  'update_nota_pdf_url',
  'update_nota_servico',
]);

function withSupportContext(rpcName: string, params: Record<string, unknown>) {
  const supportContext = readStoredSupportContext();

  if (supportContext && SUPPORT_BLOCKED_WRITE_RPCS.has(rpcName)) {
    throw new Error(
      `[${rpcName}] Ações de escrita em modo suporte estão bloqueadas até a auditoria backend por ação estar ativa.`,
    );
  }

  const supportRpcName = SUPPORT_CONTEXT_RPC_MAP[rpcName];
  if (!supportContext || !supportRpcName) {
    return { rpcName, params };
  }

  return {
    rpcName: supportRpcName,
    params: {
      ...params,
      p_contexto_usuario_id: supportContext.targetUserId,
      p_sessao_suporte: supportContext.sessionId,
    },
  };
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
  const contextualCall = withSupportContext(rpcName, params ?? {});
  const { data, error } = await supabase.schema('RetificaPremium').rpc(contextualCall.rpcName, contextualCall.params);

  if (error) {
    const err = new Error(`[${contextualCall.rpcName}] ${error.message}`);
    logError(err, contextualCall.rpcName);
    throw err;
  }

  const envelope = data as RPCEnvelope<T>;

  if (!envelope || envelope.status === undefined) {
    const err = new Error(`[${contextualCall.rpcName}] Resposta inesperada do servidor.`);
    logError(err, contextualCall.rpcName);
    throw err;
  }

  if (envelope.status !== 200) {
    const err = new Error(`[${contextualCall.rpcName}] ${envelope.mensagem ?? 'Erro desconhecido.'}`);
    logError(err, contextualCall.rpcName);
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
