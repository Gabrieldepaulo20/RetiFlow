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

export function isSuperAdmin(user: Pick<SystemUser, 'email' | 'role' | 'isActive'> | null | undefined) {
  if (!user || user.role !== 'ADMIN' || !user.isActive) return false;
  return getConfiguredSuperAdminEmails().includes(user.email.trim().toLowerCase());
}

