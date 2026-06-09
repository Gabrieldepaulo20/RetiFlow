import type { FechamentoListItem } from '@/api/supabase/fechamentos';

const DRAFTS_STORAGE_PREFIX = 'retiflow:monthly-closing-drafts:v2';

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
