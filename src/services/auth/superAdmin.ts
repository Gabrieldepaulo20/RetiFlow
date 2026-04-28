import type { SystemUser } from '@/types';

const FALLBACK_SUPER_ADMIN_EMAILS = ['gabrielwilliam208@gmail.com'];

function parseEmails(raw: string | undefined) {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getConfiguredSuperAdminEmails() {
  const configured = parseEmails(import.meta.env.VITE_SUPER_ADMIN_EMAILS as string | undefined);
  return configured.length > 0 ? configured : FALLBACK_SUPER_ADMIN_EMAILS;
}

export function isSuperAdmin(user: Pick<SystemUser, 'email' | 'role' | 'isActive'> | null | undefined) {
  if (!user || user.role !== 'ADMIN' || !user.isActive) return false;
  return getConfiguredSuperAdminEmails().includes(user.email.trim().toLowerCase());
}

