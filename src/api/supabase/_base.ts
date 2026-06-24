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
  // Leituras
  get_clientes: 'get_clientes_contexto_suporte',
  get_cliente_detalhes: 'get_cliente_detalhes_contexto_suporte',
  get_notas_servico: 'get_notas_servico_contexto_suporte',
  get_nota_servico_detalhes: 'get_nota_servico_detalhes_contexto_suporte',
  get_servicos_resumo: 'get_servicos_resumo_contexto_suporte',
  get_contas_pagar: 'get_contas_pagar_contexto_suporte',
  get_conta_pagar_detalhes: 'get_conta_pagar_detalhes_contexto_suporte',
  get_fornecedores: 'get_fornecedores_contexto_suporte',
  get_fechamentos: 'get_fechamentos_contexto_suporte',
  get_sugestoes_email: 'get_sugestoes_email_contexto_suporte',
  get_gmail_connection_status: 'get_gmail_connection_status_contexto_suporte',
  // Escritas — Contas a Pagar
  aceitar_sugestao_email: 'aceitar_sugestao_email_contexto_suporte',
  reconciliar_sugestoes_email: 'reconciliar_sugestoes_email_contexto_suporte',
  cancelar_conta_pagar: 'cancelar_conta_pagar_contexto_suporte',
  excluir_conta_pagar: 'excluir_conta_pagar_contexto_suporte',
  ignorar_sugestao_email: 'ignorar_sugestao_email_contexto_suporte',
  inativar_fornecedor: 'inativar_fornecedor_contexto_suporte',
  insert_anexo_conta_pagar: 'insert_anexo_conta_pagar_contexto_suporte',
  insert_categoria_conta_pagar: 'insert_categoria_conta_pagar_contexto_suporte',
  insert_conta_pagar: 'insert_conta_pagar_contexto_suporte',
  insert_fornecedor: 'insert_fornecedor_contexto_suporte',
  registrar_pagamento: 'registrar_pagamento_contexto_suporte',
  update_gmail_auto_sync_settings: 'update_gmail_auto_sync_settings_contexto_suporte',
  update_anexo_conta_pagar_nome: 'update_anexo_conta_pagar_nome_contexto_suporte',
  update_categoria_conta_pagar: 'update_categoria_conta_pagar_contexto_suporte',
  update_conta_pagar: 'update_conta_pagar_contexto_suporte',
  update_fornecedor: 'update_fornecedor_contexto_suporte',
  // Escritas — Notas de Serviço
  nova_nota: 'nova_nota_contexto_suporte',
  update_nota_servico: 'update_nota_servico_contexto_suporte',
  // Escritas — Clientes
  novo_cliente: 'salvar_cliente_completo_contexto_suporte',
  salvar_cliente_completo: 'salvar_cliente_completo_contexto_suporte',
  update_cliente: 'update_cliente_contexto_suporte',
  inativar_cliente: 'inativar_cliente_contexto_suporte',
  reativar_cliente: 'reativar_cliente_contexto_suporte',
};

const SUPPORT_BLOCKED_WRITE_RPCS = new Set([
  // Faturas e fechamentos — sem variante de suporte
  'cancelar_fatura',
  'insert_fatura',
  'insert_fechamento',
  'insert_sugestao_email',
  'registrar_acao_fechamento',
  'marcar_fechamento_pago',
  'estornar_fechamento_pago',
  'update_fatura',
  'update_fechamento',
  // Configurações de empresa/documentos — não se aplica ao tenant em suporte
  'ativar_tema_documento',
  'publicar_modelo_documento',
  'restaurar_modelo_documento_padrao',
  'salvar_rascunho_modelo_documento',
  'salvar_tema_documento',
  'upsert_configuracao_empresa_cliente',
  // PDF interno — não necessário em suporte
  'update_nota_pdf_url',
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
