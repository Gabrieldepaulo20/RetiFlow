import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getConfiguredSuperAdminEmails,
  hasFullMarketingAccess,
  isAdminMaster,
  isConfiguredSuperAdminEmail,
  isOtherConfiguredSuperAdminEmail,
  isSuperAdmin,
} from '@/services/auth/superAdmin';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Master administrative access', () => {
  const master = {
    email: 'master@retifica.com',
    role: 'ADMIN' as const,
    isActive: true,
    moduleAccess: {
      admin: true,
      marketing: true,
    },
  };

  it('recognizes an active Master with the Admin module', () => {
    expect(isAdminMaster(master)).toBe(true);
  });

  it('allows a Master with Admin and Growth modules to load the full marketing dashboard', () => {
    expect(hasFullMarketingAccess(master)).toBe(true);
  });

  it('keeps full marketing access closed when the Growth module is disabled', () => {
    expect(hasFullMarketingAccess({
      ...master,
      moduleAccess: { ...master.moduleAccess, marketing: false },
    })).toBe(false);
  });
});

describe('super admin guard', () => {
  it('returns empty list when VITE_SUPER_ADMIN_EMAILS is not set', () => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', '');
    expect(getConfiguredSuperAdminEmails()).toEqual([]);
  });

  it('returns configured emails from env var', () => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', 'admin@example.com, outro@example.com');
    expect(getConfiguredSuperAdminEmails()).toEqual(['admin@example.com', 'outro@example.com']);
    expect(isConfiguredSuperAdminEmail(' ADMIN@example.com ')).toBe(true);
  });

  it('recognizes both configured Mega Masters and protects one from the other', () => {
    vi.stubEnv(
      'VITE_SUPER_ADMIN_EMAILS',
      'gabrielwilliam208@gmail.com,guilhermehenriquedepaulo2@gmail.com',
    );

    for (const email of [
      'gabrielwilliam208@gmail.com',
      'guilhermehenriquedepaulo2@gmail.com',
    ]) {
      expect(isSuperAdmin({
        email,
        role: 'ADMIN',
        isActive: true,
      })).toBe(true);
    }

    expect(isOtherConfiguredSuperAdminEmail(
      'gabrielwilliam208@gmail.com',
      'guilhermehenriquedepaulo2@gmail.com',
    )).toBe(true);
    expect(isOtherConfiguredSuperAdminEmail(
      'guilhermehenriquedepaulo2@gmail.com',
      'guilhermehenriquedepaulo2@gmail.com',
    )).toBe(false);
    expect(isOtherConfiguredSuperAdminEmail(
      'guilhermehenriquedepaulo2@gmail.com',
      'cliente@example.com',
    )).toBe(false);
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
