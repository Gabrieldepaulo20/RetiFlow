import { describe, expect, it, vi, afterEach } from 'vitest';
import { isSuperAdmin, getConfiguredSuperAdminEmails } from '@/services/auth/superAdmin';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('super admin guard', () => {
  it('returns empty list when VITE_SUPER_ADMIN_EMAILS is not set', () => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', '');
    expect(getConfiguredSuperAdminEmails()).toEqual([]);
  });

  it('returns configured emails from env var', () => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', 'admin@example.com, outro@example.com');
    expect(getConfiguredSuperAdminEmails()).toEqual(['admin@example.com', 'outro@example.com']);
  });

  it('allows only active admin with authorized email in configured list', () => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', 'admin@example.com');
    expect(isSuperAdmin({
      email: 'admin@example.com',
      role: 'ADMIN',
      isActive: true,
    })).toBe(true);
  });

  it('rejects inactive, non-admin or email not in configured list', () => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', 'admin@example.com');
    expect(isSuperAdmin({
      email: 'admin@example.com',
      role: 'FINANCEIRO',
      isActive: true,
    })).toBe(false);
    expect(isSuperAdmin({
      email: 'admin@example.com',
      role: 'ADMIN',
      isActive: false,
    })).toBe(false);
    expect(isSuperAdmin({
      email: 'outro@example.com',
      role: 'ADMIN',
      isActive: true,
    })).toBe(false);
  });

  it('rejects everyone when env var is not configured', () => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', '');
    expect(isSuperAdmin({
      email: 'anyone@example.com',
      role: 'ADMIN',
      isActive: true,
    })).toBe(false);
  });
});
