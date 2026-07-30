import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportImpersonationSession, SystemUser } from '@/types';

const mocks = vi.hoisted(() => ({
  authStateCallback: null as ((event: string, session: unknown) => void) | null,
  callAdminUsersFunction: vi.fn(),
  clearMarketingCache: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  queryClientClear: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  touchUserPresence: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    schema: vi.fn(() => ({
      rpc: mocks.rpc,
    })),
  },
}));

vi.mock('@/api/supabase/admin-users', () => ({
  callAdminUsersFunction: mocks.callAdminUsersFunction,
}));

vi.mock('@/api/supabase/presence', () => ({
  touchUserPresence: mocks.touchUserPresence,
}));

vi.mock('@/api/supabase/marketingCache', () => ({
  clearAllCachedMarketingResumo: mocks.clearMarketingCache,
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: {
    clear: mocks.queryClientClear,
  },
}));

const ACTOR: SystemUser = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Guilherme Henrique',
  email: 'guilhermehenriquedepaulo2@gmail.com',
  role: 'ADMIN',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  moduleAccess: {
    admin: true,
    dashboard: true,
  },
};

const TARGET: SystemUser = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Retífica Premium',
  email: 'retificapremium5@gmail.com',
  role: 'RECEPCAO',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  moduleAccess: {
    dashboard: true,
    notes: true,
  },
};

const CANDIDATE: SupportImpersonationSession = {
  id: '11111111-1111-4111-8111-111111111111',
  actorUser: ACTOR,
  targetUser: TARGET,
  reason: 'Candidato salvo antes da validação',
  startedAt: '2026-07-30T12:00:00.000Z',
  expiresAt: null,
};

const CANONICAL_SESSION: SupportImpersonationSession = {
  ...CANDIDATE,
  reason: 'Sessão canônica confirmada pelo servidor',
};

type AuthContextModule = typeof import('@/contexts/AuthContext');
type SupportContextModule = typeof import('@/services/auth/supportContext');

let AuthProvider: AuthContextModule['AuthProvider'];
let useAuth: AuthContextModule['useAuth'];
let supportContext: SupportContextModule;

function Probe() {
  const auth = useAuth();

  return (
    <div>
      <span data-testid="auth-loading">{String(auth.isAuthLoading)}</span>
      <span data-testid="support-validating">
        {String(auth.isSupportSessionValidating)}
      </span>
      <span data-testid="support-session">{auth.supportSession?.id ?? 'none'}</span>
      <span data-testid="support-reason">{auth.supportSession?.reason ?? 'none'}</span>
      <span data-testid="operational-user">{auth.operationalUser?.id ?? 'none'}</span>
    </div>
  );
}

function storeCandidate(candidate: SupportImpersonationSession = CANDIDATE) {
  window.sessionStorage.setItem(
    'support.impersonation',
    JSON.stringify(candidate),
  );
}

function configureAuthenticatedProfile() {
  mocks.rpc.mockResolvedValue({
    data: {
      status: 200,
      mensagem: 'Perfil carregado.',
      dados: {
        id_usuarios: ACTOR.id,
        nome: ACTOR.name,
        email: ACTOR.email,
        acesso: 'administrador',
        status: true,
        created_at: ACTOR.createdAt,
        modulos: {
          admin: true,
          dashboard: true,
        },
      },
    },
    error: null,
  });
}

async function mountWithStoredCandidate() {
  storeCandidate();
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

  expect(screen.getByTestId('support-session')).toHaveTextContent('none');
  expect(screen.getByTestId('support-validating')).toHaveTextContent('true');
  expect(supportContext.readActiveSupportContext()).toBeNull();

  await waitFor(() => {
    expect(mocks.authStateCallback).toBeTypeOf('function');
  });

  act(() => {
    mocks.authStateCallback?.('INITIAL_SESSION', {
      access_token: 'authenticated-test-token',
    });
  });
}

beforeAll(async () => {
  vi.stubEnv('VITE_AUTH_MODE', 'real');
  vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', 'gabrielwilliam208@gmail.com');

  const authModule = await import('@/contexts/AuthContext');
  AuthProvider = authModule.AuthProvider;
  useAuth = authModule.useAuth;
  supportContext = await import('@/services/auth/supportContext');
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  supportContext.setActiveSupportSession(null);

  mocks.authStateCallback = null;
  mocks.callAdminUsersFunction.mockReset();
  mocks.clearMarketingCache.mockReset();
  mocks.getSession.mockReset();
  mocks.onAuthStateChange.mockReset();
  mocks.queryClientClear.mockReset();
  mocks.rpc.mockReset();
  mocks.signOut.mockReset();
  mocks.touchUserPresence.mockReset();
  mocks.unsubscribe.mockReset();

  mocks.getSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'authenticated-test-token',
      },
    },
    error: null,
  });
  mocks.onAuthStateChange.mockImplementation(
    (callback: (event: string, session: unknown) => void) => {
      mocks.authStateCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: mocks.unsubscribe,
          },
        },
      };
    },
  );
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.touchUserPresence.mockResolvedValue(undefined);
  configureAuthenticatedProfile();
});

afterEach(() => {
  cleanup();
  supportContext.setActiveSupportSession(null);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('AuthProvider support-session authority', () => {
  it('keeps the stored candidate inactive and activates only the exact canonical response', async () => {
    mocks.callAdminUsersFunction.mockResolvedValue({
      mensagem: 'Sessão de suporte validada.',
      supportSession: CANONICAL_SESSION,
    });

    await mountWithStoredCandidate();

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('support-validating')).toHaveTextContent('false');
      expect(screen.getByTestId('support-session')).toHaveTextContent(CANDIDATE.id);
    });

    expect(screen.getByTestId('support-reason')).toHaveTextContent(
      CANONICAL_SESSION.reason,
    );
    expect(screen.getByTestId('operational-user')).toHaveTextContent(TARGET.id);
    expect(mocks.callAdminUsersFunction).toHaveBeenCalledWith({
      action: 'validate_support_impersonation',
      sessionId: CANDIDATE.id,
      targetUserId: TARGET.id,
    });
    expect(supportContext.readActiveSupportContext()).toEqual({
      sessionId: CANDIDATE.id,
      targetUserId: TARGET.id,
    });
    expect(JSON.parse(
      window.sessionStorage.getItem('support.impersonation') ?? 'null',
    )).toMatchObject({
      id: CANONICAL_SESSION.id,
      reason: CANONICAL_SESSION.reason,
      actorUser: { id: ACTOR.id },
      targetUser: { id: TARGET.id },
    });
  });

  it.each([
    {
      name: 'null',
      response: {
        mensagem: 'Sessão inválida ou encerrada.',
        supportSession: null,
      },
    },
    {
      name: 'target mismatch',
      response: {
        mensagem: 'Resposta inconsistente.',
        supportSession: {
          ...CANONICAL_SESSION,
          targetUser: {
            ...TARGET,
            id: '44444444-4444-4444-8444-444444444444',
          },
        },
      },
    },
    {
      name: 'actor mismatch',
      response: {
        mensagem: 'Resposta inconsistente.',
        supportSession: {
          ...CANONICAL_SESSION,
          actorUser: {
            ...ACTOR,
            id: '55555555-5555-4555-8555-555555555555',
          },
        },
      },
    },
  ])('clears the candidate when validation returns $name', async ({ response }) => {
    mocks.callAdminUsersFunction.mockResolvedValue(response);

    await mountWithStoredCandidate();

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('support-validating')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('support-session')).toHaveTextContent('none');
    expect(screen.getByTestId('operational-user')).toHaveTextContent(ACTOR.id);
    expect(supportContext.readActiveSupportContext()).toBeNull();
    expect(window.sessionStorage.getItem('support.impersonation')).toBeNull();
  });

  it('clears the candidate when server validation fails', async () => {
    mocks.callAdminUsersFunction.mockRejectedValue(
      new Error('Falha de rede durante a validação'),
    );

    await mountWithStoredCandidate();

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('support-validating')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('support-session')).toHaveTextContent('none');
    expect(supportContext.readActiveSupportContext()).toBeNull();
    expect(window.sessionStorage.getItem('support.impersonation')).toBeNull();
  });

  it('revalidates an active session on focus and clears it when the server revokes it', async () => {
    mocks.callAdminUsersFunction
      .mockResolvedValueOnce({
        mensagem: 'Sessão de suporte validada.',
        supportSession: CANONICAL_SESSION,
      })
      .mockResolvedValueOnce({
        mensagem: 'Sessão inválida ou encerrada.',
        supportSession: null,
      });

    await mountWithStoredCandidate();

    await waitFor(() => {
      expect(screen.getByTestId('support-session')).toHaveTextContent(CANDIDATE.id);
    });
    expect(mocks.callAdminUsersFunction).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(mocks.callAdminUsersFunction).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('support-session')).toHaveTextContent('none');
    });

    expect(supportContext.readActiveSupportContext()).toBeNull();
    expect(window.sessionStorage.getItem('support.impersonation')).toBeNull();
  });
});
