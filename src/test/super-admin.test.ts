import { describe, expect, it } from 'vitest';
import { isSuperAdmin, getConfiguredSuperAdminEmails } from '@/services/auth/superAdmin';

describe('super admin guard', () => {
  it('uses the configured/fallback Super Admin email', () => {
    expect(getConfiguredSuperAdminEmails()).toContain('gabrielwilliam208@gmail.com');
  });

  it('allows only active admin with authorized email', () => {
    expect(isSuperAdmin({
      email: 'gabrielwilliam208@gmail.com',
      role: 'ADMIN',
      isActive: true,
    })).toBe(true);
  });

  it('rejects inactive, non-admin or different email users', () => {
    expect(isSuperAdmin({
      email: 'gabrielwilliam208@gmail.com',
      role: 'FINANCEIRO',
      isActive: true,
    })).toBe(false);
    expect(isSuperAdmin({
      email: 'gabrielwilliam208@gmail.com',
      role: 'ADMIN',
      isActive: false,
    })).toBe(false);
    expect(isSuperAdmin({
      email: 'outro-admin@example.com',
      role: 'ADMIN',
      isActive: true,
    })).toBe(false);
  });
});

