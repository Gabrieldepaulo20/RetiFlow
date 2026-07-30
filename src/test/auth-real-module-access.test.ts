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

  it('allows the basic Growth view only when the company has the marketing module enabled', async () => {
    const { canUserAccessModule } = await loadRealAuthRedirectModule();
    const nonMegaAdmin: SystemUser = {
      ...makeMegaMaster({ marketing: true }),
      id: 'regular-admin',
      email: 'admin@retifica.com',
    };
    const financeUser = makeClient({ marketing: true });
    const financeUserWithoutGrowth = makeClient({ marketing: false });

    expect(canUserAccessModule(nonMegaAdmin, 'marketing')).toBe(true);
    expect(canUserAccessModule(financeUser, 'marketing')).toBe(true);
    expect(canUserAccessModule(financeUserWithoutGrowth, 'marketing')).toBe(false);
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
      expiresAt: null,
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
    })).toBe(false);
    expect(canUserAccessModuleInContext({
      actorUser: megaMaster,
      operationalUser: restrictedClient,
      supportSession,
      moduleKey: 'settings',
    })).toBe(false);
  });

  it('applies the support UI policy after a Master session has been validated by AuthContext', async () => {
    const { canUserAccessModuleInContext } = await loadRealAuthRedirectModule();
    const guilherme: SystemUser = {
      ...makeMegaMaster({ admin: true, dashboard: true, notes: false }),
      id: 'guilherme-master',
      name: 'Guilherme Henrique',
      email: 'guilhermehenriquedepaulo2@gmail.com',
    };
    const retificaPremium: SystemUser = {
      ...makeClient({ dashboard: true, notes: false, admin: false }),
      id: 'retifica-premium',
      name: 'Retífica Premium',
      email: 'retificapremium5@gmail.com',
    };
    const supportSession = {
      id: 'support-guilherme-retifica',
      actorUser: guilherme,
      targetUser: retificaPremium,
      reason: 'Atendimento operacional autorizado',
      startedAt: '2026-07-30T12:00:00.000Z',
      expiresAt: null,
    };

    expect(canUserAccessModuleInContext({
      actorUser: guilherme,
      operationalUser: retificaPremium,
      supportSession,
      moduleKey: 'notes',
    })).toBe(true);
    expect(canUserAccessModuleInContext({
      actorUser: guilherme,
      operationalUser: retificaPremium,
      supportSession,
      moduleKey: 'admin',
    })).toBe(false);
  });

  it('rejects a support context when the operational target differs from the audited session', async () => {
    const { canUserAccessModuleInContext } = await loadRealAuthRedirectModule();
    const guilherme: SystemUser = {
      ...makeMegaMaster({ admin: true, notes: true }),
      id: 'guilherme-master',
      email: 'guilhermehenriquedepaulo2@gmail.com',
    };
    const retificaPremium = {
      ...makeClient({ notes: false }),
      id: 'retifica-premium',
      email: 'retificapremium5@gmail.com',
    };
    const anotherCompany = {
      ...makeClient({ notes: true }),
      id: 'another-company',
      email: 'outra@empresa.com',
    };

    expect(canUserAccessModuleInContext({
      actorUser: guilherme,
      operationalUser: anotherCompany,
      supportSession: {
        id: 'support-guilherme-retifica',
        actorUser: guilherme,
        targetUser: retificaPremium,
        reason: 'Atendimento operacional autorizado',
        startedAt: '2026-07-30T12:00:00.000Z',
        expiresAt: null,
      },
      moduleKey: 'notes',
    })).toBe(false);
  });

  it('rejects a support context from an actor without active Admin access even when the target module is enabled', async () => {
    const { canUserAccessModuleInContext } = await loadRealAuthRedirectModule();
    const nonAdminActor = {
      ...makeClient({ notes: true, admin: false }),
      id: 'non-admin-actor',
      email: 'operacao@empresa.com',
    };
    const target = {
      ...makeClient({ notes: true }),
      id: 'retifica-premium',
      email: 'retificapremium5@gmail.com',
    };

    expect(canUserAccessModuleInContext({
      actorUser: nonAdminActor,
      operationalUser: target,
      supportSession: {
        id: 'forged-support-session',
        actorUser: nonAdminActor,
        targetUser: target,
        reason: 'Contexto não autorizado para o operador',
        startedAt: '2026-07-30T12:00:00.000Z',
        expiresAt: null,
      },
      moduleKey: 'notes',
    })).toBe(false);
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
        expiresAt: null,
      },
      moduleKey: 'notes',
    })).toBe(false);
  });
});
