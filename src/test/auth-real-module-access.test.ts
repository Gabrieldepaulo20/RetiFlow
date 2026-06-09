import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppModuleKey, SystemUser } from '@/types';

function makeMegaMaster(moduleAccess?: Partial<Record<AppModuleKey, boolean>>): SystemUser {
  return {
    id: 'mega-master',
    name: 'Gabriel William',
    email: 'gabrielwilliam208@gmail.com',
    role: 'ADMIN',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    moduleAccess,
  };
}

function makeClient(moduleAccess?: Partial<Record<AppModuleKey, boolean>>): SystemUser {
  return {
    id: 'client-user',
    name: 'Cliente Teste',
    email: 'cliente@retifica.com',
    role: 'FINANCEIRO',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    moduleAccess,
  };
}

async function loadRealAuthRedirectModule() {
  vi.resetModules();
  vi.stubEnv('VITE_AUTH_MODE', 'real');
  vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', 'gabrielwilliam208@gmail.com');
  return import('@/services/auth/defaultRedirect');
}

describe('real auth module access', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps Mega Master admin access but respects disabled operational modules', async () => {
    const { canUserAccessModule, getDefaultRedirect } = await loadRealAuthRedirectModule();
    const megaMaster = makeMegaMaster({
      admin: false,
      dashboard: true,
      marketing: false,
    });

    expect(canUserAccessModule(megaMaster, 'admin')).toBe(true);
    expect(canUserAccessModule(megaMaster, 'dashboard')).toBe(true);
    expect(canUserAccessModule(megaMaster, 'marketing')).toBe(false);
    expect(getDefaultRedirect(megaMaster, { operationalOnly: true })).toBe('/dashboard');
  });

  it('uses safe admin defaults for Mega Master modules that are not explicit in DB', async () => {
    const { canUserAccessModule } = await loadRealAuthRedirectModule();
    const megaMaster = makeMegaMaster({ admin: true });

    expect(canUserAccessModule(megaMaster, 'admin')).toBe(true);
    expect(canUserAccessModule(megaMaster, 'clients')).toBe(true);
  });

  it('lets Mega Master open operational modules during support even if target profile is restricted', async () => {
    const { canUserAccessModuleInContext } = await loadRealAuthRedirectModule();
    const megaMaster = makeMegaMaster({ admin: true, dashboard: true });
    const restrictedClient = makeClient({
      dashboard: true,
      notes: false,
      closing: false,
      payables: false,
      admin: false,
    });
    const supportSession = {
      id: 'support-1',
      actorUser: megaMaster,
      targetUser: restrictedClient,
      reason: 'Diagnóstico de acesso negado',
      startedAt: '2026-06-09T00:00:00.000Z',
      expiresAt: '2026-06-09T01:00:00.000Z',
    };

    expect(canUserAccessModuleInContext({
      actorUser: megaMaster,
      operationalUser: restrictedClient,
      supportSession,
      moduleKey: 'notes',
    })).toBe(true);
    expect(canUserAccessModuleInContext({
      actorUser: megaMaster,
      operationalUser: restrictedClient,
      supportSession,
      moduleKey: 'payables',
    })).toBe(true);
    expect(canUserAccessModuleInContext({
      actorUser: megaMaster,
      operationalUser: restrictedClient,
      supportSession,
      moduleKey: 'admin',
    })).toBe(true);
  });

  it('does not let a non Mega Master bypass target module restrictions with a forged support context', async () => {
    const { canUserAccessModuleInContext } = await loadRealAuthRedirectModule();
    const admin = makeClient({ admin: false, notes: true });
    const restrictedClient = makeClient({ notes: false });

    expect(canUserAccessModuleInContext({
      actorUser: admin,
      operationalUser: restrictedClient,
      supportSession: {
        id: 'support-forged',
        actorUser: admin,
        targetUser: restrictedClient,
        reason: 'forged',
        startedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2026-06-09T01:00:00.000Z',
      },
      moduleKey: 'notes',
    })).toBe(false);
  });
});
