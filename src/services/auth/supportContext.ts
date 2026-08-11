import type { SupportImpersonationSession } from '@/types';

export const SUPPORT_SESSION_STORAGE_KEY = 'support.impersonation';

export interface StoredSupportContext {
  sessionId: string;
  targetUserId: string;
}

export type ActiveSupportScopeSnapshot = StoredSupportContext | null;

/**
 * A gravação foi confirmada pelo backend, mas a aba trocou/encerrou o contexto
 * antes de atualizar o estado local. Consumidores devem tratar este caso como
 * sucesso confirmado e interromper apenas os passos posteriores.
 */
export class SupportScopeChangedAfterCommitError extends Error {
  constructor(action: string) {
    super(
      `${action} foi salvo, mas o contexto de suporte mudou durante a resposta. Reabra a empresa correta para atualizar os dados.`,
    );
    this.name = 'SupportScopeChangedAfterCommitError';
  }
}

let activeSupportSession: SupportImpersonationSession | null = null;

function parseSupportSession(raw: string | null) {
  if (!raw) return null;

  const parsed = JSON.parse(raw) as SupportImpersonationSession;
  if (!parsed?.id || !parsed?.actorUser?.id || !parsed?.targetUser?.id) return null;
  return parsed;
}

export function readStoredSupportSession() {
  if (typeof window === 'undefined') return null;

  try {
    const tabSession = parseSupportSession(
      window.sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY),
    );
    const legacySession = parseSupportSession(
      window.localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY),
    );
    // O formato legado nunca pode sobreviver à primeira leitura desta aba.
    // Removemos antes de retornar inclusive quando já existe candidato válido
    // no sessionStorage, evitando que outra aba migre uma sessão antiga.
    window.localStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    if (tabSession) return tabSession;

    // Migração única do formato antigo em localStorage. O candidato passa a ser
    // isolado por aba e ainda precisa ser validado no servidor pelo AuthContext.
    if (legacySession) {
      window.sessionStorage.setItem(
        SUPPORT_SESSION_STORAGE_KEY,
        JSON.stringify(legacySession),
      );
    }
    return legacySession;
  } catch {
    window.localStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    return null;
  }
}

export function writeStoredSupportSession(supportSession: SupportImpersonationSession | null) {
  if (typeof window === 'undefined') return;
  if (!supportSession) {
    window.localStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(supportSession));
  window.localStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
}

/**
 * Ativa o contexto usado pelas APIs desta aba. Storage nunca é autoridade:
 * somente o AuthContext chama esta função após validação do backend.
 */
export function setActiveSupportSession(
  supportSession: SupportImpersonationSession | null,
) {
  activeSupportSession = supportSession;
}

export function readActiveSupportContext(): StoredSupportContext | null {
  const supportSession = activeSupportSession;
  if (!supportSession) return null;

  return {
    sessionId: supportSession.id,
    targetUserId: supportSession.targetUser.id,
  };
}

/**
 * Captura a autoridade ativa no início de uma operação com múltiplas chamadas.
 * Cada etapa assíncrona deve confirmar o snapshot antes de continuar, para que
 * revogação/saída/troca de alvo nunca faça a cadeia cair no usuário autenticado.
 */
export function captureActiveSupportScope(): ActiveSupportScopeSnapshot {
  const supportContext = readActiveSupportContext();
  return supportContext ? { ...supportContext } : null;
}

export function assertActiveSupportScopeUnchanged(
  expected: ActiveSupportScopeSnapshot,
): void {
  const current = readActiveSupportContext();
  const unchanged = expected
    ? current?.sessionId === expected.sessionId
      && current.targetUserId === expected.targetUserId
    : current === null;

  if (!unchanged) {
    throw new Error(
      'O contexto de acesso mudou durante a operação. A ação foi interrompida; recarregue os dados e tente novamente.',
    );
  }
}
