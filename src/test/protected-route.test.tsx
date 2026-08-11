import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import type { User, UserRole } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

// Campos do AuthContext que não variam por teste; mantém os mocks alinhados ao tipo real.
const authBase = {
  realUser: null,
  operationalUser: null,
  supportTargetUser: null,
  supportSession: null,
  isSupportImpersonating: false,
  isSupportSessionValidating: false,
  supportSessionIssue: null,
  startSupportImpersonation: vi.fn(),
  endSupportImpersonation: vi.fn(),
  retrySupportImpersonation: vi.fn(),
  completeMfaLogin: vi.fn(),
  // false → força revalidação (necessário para testes que esperam o spinner)
  isProfileFresh: vi.fn().mockReturnValue(false),
};

const baseUser: User = {
  id: 'user-2',
  name: 'Paula Martins',
  email: 'financeiro@retifica.com',
  role: 'FINANCEIRO',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const adminUser: User = {
  id: 'user-1',
  name: 'Admin Master',
  email: 'admin@retifica.com',
  role: 'ADMIN',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const megaMasterUser: User = {
  id: 'user-mega-master',
  name: 'Gabriel William',
  email: 'gabrielwilliam208@gmail.com',
  role: 'ADMIN',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderProtectedRoute(options?: { allowedRoles?: UserRole[] }) {
  return render(
    <MemoryRouter
      initialEntries={['/fechamento']}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/acesso-negado" element={<div>access-denied</div>} />
        <Route element={<ProtectedRoute moduleKey="closing" allowedRoles={options?.allowedRoles} />}>
          <Route path="/fechamento" element={<div>closing-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderAdminRoute() {
  return render(
    <MemoryRouter
      initialEntries={['/admin']}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/admin/login" element={<div>admin-login-page</div>} />
        <Route path="/dashboard" element={<div>dashboard-page</div>} />
        <Route path="/acesso-negado" element={<div>access-denied</div>} />
        <Route
          element={(
            <ProtectedRoute
              moduleKey="admin"
              allowedRoles={['ADMIN']}
              redirectTo="/dashboard"
            />
          )}
        >
          <Route path="/admin" element={<div>admin-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderGrowthRoute() {
  return render(
    <MemoryRouter
      initialEntries={['/crescimento']}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/acesso-negado" element={<div>access-denied</div>} />
        <Route element={<ProtectedRoute moduleKey="marketing" />}>
          <Route path="/crescimento" element={<div>growth-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
  });

  it('redirects unauthenticated users to login', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'development',
      user: null,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  it('waits for auth hydration before redirecting on page refresh', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'real',
      user: null,
      session: null,
      isAuthLoading: true,
      profileError: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('Restaurando sessão')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
  });

  it('keeps protected data closed while a stored support session is validated', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      realUser: adminUser,
      authMode: 'real',
      user: adminUser,
      session: null,
      isSupportSessionValidating: true,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    renderProtectedRoute();

    expect(screen.getByText('Validando modo suporte')).toBeInTheDocument();
    expect(screen.queryByText('closing-page')).not.toBeInTheDocument();
    expect(screen.queryByText('access-denied')).not.toBeInTheDocument();
  });

  it('blocks tenant and Mega Master data until an interrupted support session is retried or explicitly exited', () => {
    const retrySupportImpersonation = vi.fn();
    mockedUseAuth.mockReturnValue({
      ...authBase,
      realUser: adminUser,
      authMode: 'real',
      user: adminUser,
      session: null,
      isSupportSessionValidating: true,
      supportSessionIssue: 'A sessão de suporte foi interrompida no servidor.',
      retrySupportImpersonation,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    renderProtectedRoute();

    expect(screen.getByText('Modo suporte pausado')).toBeInTheDocument();
    expect(screen.queryByText('closing-page')).not.toBeInTheDocument();
    expect(screen.queryByText('access-denied')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar reconectar' }));
    expect(retrySupportImpersonation).toHaveBeenCalledTimes(1);
  });

  it('redirects authenticated users without module access to the denied page', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => false),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('access-denied')).toBeInTheDocument();
  });

  it('redirects authenticated users when their role is not allowed', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: false,
    });

    renderProtectedRoute({ allowedRoles: ['ADMIN'] });

    expect(screen.getByText('access-denied')).toBeInTheDocument();
  });

  it('renders the protected content when the user has access', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('closing-page')).toBeInTheDocument();
  });

  it('renders the basic Growth route for a non Mega Master with module access', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      realUser: adminUser,
      operationalUser: adminUser,
      authMode: 'development',
      user: adminUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    renderGrowthRoute();

    expect(screen.getByText('growth-page')).toBeInTheDocument();
    expect(screen.queryByText('access-denied')).not.toBeInTheDocument();
  });

  it('renders the full Growth route for the configured Mega Master', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      realUser: megaMasterUser,
      operationalUser: megaMasterUser,
      authMode: 'development',
      user: megaMasterUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    renderGrowthRoute();

    expect(screen.getByText('growth-page')).toBeInTheDocument();
    expect(screen.queryByText('access-denied')).not.toBeInTheDocument();
  });

  it('keeps the user on a neutral reconnecting state when profile loading is transient', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'real',
      user: null,
      session: null,
      isAuthLoading: false,
      profileError: 'Não foi possível carregar seu perfil. Verifique sua conexão e tente novamente.',
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('Reconectando sessão')).toBeInTheDocument();
    expect(screen.queryByText('Falha ao carregar perfil')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.queryByText('access-denied')).not.toBeInTheDocument();
  });

  it('renders admin content immediately and refreshes stale access in the background', async () => {
    const refreshProfile = vi.fn().mockResolvedValue(true);
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'real',
      user: adminUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile,
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    renderAdminRoute();

    expect(screen.getByText('admin-page')).toBeInTheDocument();
    expect(screen.queryByText('Verificando acesso')).not.toBeInTheDocument();
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('admin-page')).toBeInTheDocument();
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  it('keeps the configured Mega Master unblocked while server access is refreshed', async () => {
    const refreshProfile = vi.fn().mockResolvedValue(true);
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'real',
      user: megaMasterUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile,
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    renderAdminRoute();

    expect(screen.getByText('admin-page')).toBeInTheDocument();
    expect(screen.queryByText('Verificando acesso')).not.toBeInTheDocument();
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('admin-page')).toBeInTheDocument();
    expect(screen.queryByText('admin-login-page')).not.toBeInTheDocument();
  });

  it('blocks non-admin from admin route and redirects to dashboard', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: false,
    });

    renderAdminRoute();

    expect(screen.getByText('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByText('admin-page')).not.toBeInTheDocument();
  });

  it('redirects direct Admin navigation to the operational dashboard during support', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      realUser: adminUser,
      operationalUser: baseUser,
      supportTargetUser: baseUser,
      supportSession: {
        id: 'support-session',
        actorUser: adminUser,
        targetUser: baseUser,
        reason: 'Atendimento operacional autorizado',
        startedAt: '2026-07-30T12:00:00.000Z',
        expiresAt: null,
      },
      isSupportImpersonating: true,
      authMode: 'development',
      user: adminUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(() => false),
      isAdmin: true,
    });

    renderAdminRoute();

    expect(screen.getByText('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByText('access-denied')).not.toBeInTheDocument();
  });

  it('shows loading screen for admin route during auth hydration', () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      authMode: 'real',
      user: null,
      session: null,
      isAuthLoading: true,
      profileError: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      refreshProfile: vi.fn().mockResolvedValue(true),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderAdminRoute();

    expect(screen.getByText('Restaurando sessão')).toBeInTheDocument();
    expect(screen.queryByText('admin-login-page')).not.toBeInTheDocument();
    expect(screen.queryByText('admin-page')).not.toBeInTheDocument();
  });
});
