import type { FechamentoListItem } from '@/api/supabase/fechamentos';

// v3 separa o total original da O.S. dos descontos negociados por item.
// Rascunhos v2 não carregam a base imutável de cada linha e não podem ser
// convertidos com segurança sem consultar novamente o banco.
const DRAFTS_STORAGE_PREFIX = 'retiflow:monthly-closing-drafts:v3';

export function getMonthlyClosingDraftsStorageKey(scopeUserId: string | null | undefined) {
  if (!scopeUserId) return null;
  return `${DRAFTS_STORAGE_PREFIX}:${scopeUserId}`;
}

export function filterFechamentosForClientScope(
  fechamentos: FechamentoListItem[],
  scopedClientIds: Iterable<string>,
) {
  const allowedClientIds = new Set(scopedClientIds);
  if (allowedClientIds.size === 0) return [];

  return fechamentos.filter((fechamento) => {
    const clienteId = fechamento.cliente?.id;
    return Boolean(clienteId && allowedClientIds.has(clienteId));
  });
}

export function canLoadMonthlyClosings(params: {
  realAuth: boolean;
  scopeUserId: string | null | undefined;
  supportContextActive: boolean;
  scopedClientIds: Iterable<string>;
}) {
  if (!params.realAuth || !params.scopeUserId) return false;
  if (params.supportContextActive) return true;
  return new Set(params.scopedClientIds).size > 0;
}

/**
 * Em suporte, a resposta já veio de uma RPC que valida sessão/alvo e restringe
 * os fechamentos pelo dono do cliente. Fora dele, mantemos a segunda barreira
 * local e falhamos fechado enquanto o escopo de clientes não estiver pronto.
 */
export function scopeMonthlyClosings(
  fechamentos: FechamentoListItem[],
  scopedClientIds: Iterable<string>,
  supportContextActive: boolean,
) {
  return supportContextActive
    ? fechamentos
    : filterFechamentosForClientScope(fechamentos, scopedClientIds);
}
