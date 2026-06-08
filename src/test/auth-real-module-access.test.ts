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
});
