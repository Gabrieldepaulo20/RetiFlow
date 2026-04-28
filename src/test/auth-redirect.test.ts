import { beforeEach, describe, expect, it } from 'vitest';
import { canUserAccessModule, getDefaultRedirect } from '@/services/auth/defaultRedirect';
import type { AppModuleKey, SystemUser } from '@/types';

function makeUser(
  role: SystemUser['role'],
  moduleAccess?: Partial<Record<AppModuleKey, boolean>>,
): SystemUser {
  return {
    id: `user-${role}`,
    name: role,
    email: `${role.toLowerCase()}@retiflow.test`,
    role,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    moduleAccess,
  };
}

describe('auth default redirect', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps admin users able to enter the admin area even if moduleAccess.admin is false', () => {
    expect(getDefaultRedirect(makeUser('ADMIN', { admin: false }))).toBe('/admin');
  });

  it('redirects operational users to the first enabled module when dashboard is disabled', () => {
    expect(getDefaultRedirect(makeUser('FINANCEIRO', {
      dashboard: false,
      payables: true,
    }))).toBe('/contas-a-pagar');
  });

  it('uses the next allowed operational module for recepcao when dashboard is disabled', () => {
    expect(getDefaultRedirect(makeUser('RECEPCAO', {
      dashboard: false,
      clients: true,
    }))).toBe('/clientes');
  });

  it('respects explicit enabled modules and ignores disabled ones', () => {
    expect(getDefaultRedirect(makeUser('PRODUCAO', {
      dashboard: false,
      kanban: false,
      notes: true,
    }))).toBe('/notas-entrada');
  });

  it('falls back to role defaults when real module access is fully disabled by invalid config', () => {
    const user = makeUser('FINANCEIRO', {
      dashboard: false,
      payables: false,
      closing: false,
      clients: false,
      notes: false,
      kanban: false,
    });

    expect(getDefaultRedirect(user)).toBe('/dashboard');
    expect(canUserAccessModule(user, 'dashboard')).toBe(true);
  });
});
