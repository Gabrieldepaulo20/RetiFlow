import type { SystemUser } from '@/types';

function parseEmails(raw: string | undefined) {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getConfiguredSuperAdminEmails() {
  return parseEmails(import.meta.env.VITE_SUPER_ADMIN_EMAILS as string | undefined);
}

export function isConfiguredSuperAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return getConfiguredSuperAdminEmails().includes(email.trim().toLowerCase());
}

export function isSuperAdmin(user: Pick<SystemUser, 'email' | 'role' | 'isActive'> | null | undefined) {
  if (!user || user.role !== 'ADMIN' || !user.isActive) return false;
  return isConfiguredSuperAdminEmail(user.email);
}
