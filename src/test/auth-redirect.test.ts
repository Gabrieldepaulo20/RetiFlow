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

  it('uses explicit DB module access for admin routes', () => {
    expect(getDefaultRedirect(makeUser('ADMIN', { admin: false, dashboard: true }))).toBe('/dashboard');
    expect(canUserAccessModule(makeUser('ADMIN', { admin: false, dashboard: true }), 'admin')).toBe(false);
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

  it('allows explicit module grants independent of the static role defaults', () => {
    const user = makeUser('RECEPCAO', {
      dashboard: false,
      clients: false,
      notes: false,
      kanban: false,
      payables: true,
    });

    expect(canUserAccessModule(user, 'payables')).toBe(true);
    expect(getDefaultRedirect(user)).toBe('/contas-a-pagar');
  });

  it('blocks users when explicit DB module access disables every available module', () => {
    const user = makeUser('FINANCEIRO', {
      dashboard: false,
      payables: false,
      closing: false,
      clients: false,
      notes: false,
      kanban: false,
    });

    expect(getDefaultRedirect(user)).toBe('/acesso-negado');
    expect(canUserAccessModule(user, 'dashboard')).toBe(false);
  });
});
