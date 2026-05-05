export const SESSION_INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const SESSION_EXPIRED_REASON_KEY = 'retiflow.session-expired-reason';

export function markSessionExpiredByInactivity() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_EXPIRED_REASON_KEY, 'inactivity');
}

export function consumeSessionExpiredReason() {
  if (typeof window === 'undefined') return null;
  const reason = window.sessionStorage.getItem(SESSION_EXPIRED_REASON_KEY);
  window.sessionStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
  return reason;
}
