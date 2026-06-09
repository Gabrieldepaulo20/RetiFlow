import type { SupportImpersonationSession } from '@/types';

export const SUPPORT_SESSION_STORAGE_KEY = 'support.impersonation';

export interface StoredSupportContext {
  sessionId: string;
  targetUserId: string;
}

export function readStoredSupportSession() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)
      ?? window.sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SupportImpersonationSession;
    if (!parsed?.id || !parsed?.actorUser?.id || !parsed?.targetUser?.id) return null;

    // A sessão de suporte só encerra quando o Mega Master clica em "Sair"
    // (ou troca de usuário real / perde permissão). Não expira por tempo e
    // persiste através de reloads.
    return parsed;
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
  window.localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(supportSession));
  window.sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
}

export function readStoredSupportContext(): StoredSupportContext | null {
  const supportSession = readStoredSupportSession();
  if (!supportSession) return null;

  return {
    sessionId: supportSession.id,
    targetUserId: supportSession.targetUser.id,
  };
}
