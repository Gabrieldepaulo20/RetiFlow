import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import type { User, UserRole } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

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

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
  });

  it('redirects unauthenticated users to login', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: null,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  it('waits for auth hydration before redirecting on page refresh', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'real',
      user: null,
      session: null,
      isAuthLoading: true,
      profileError: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('Restaurando sessão')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
  });

  it('redirects authenticated users without module access to the denied page', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => false),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('access-denied')).toBeInTheDocument();
  });

  it('redirects authenticated users when their role is not allowed', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: false,
    });

    renderProtectedRoute({ allowedRoles: ['ADMIN'] });

    expect(screen.getByText('access-denied')).toBeInTheDocument();
  });

  it('renders the protected content when the user has access', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('closing-page')).toBeInTheDocument();
  });

  it('shows a retry screen when profile loading fails — not login or access-denied', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'real',
      user: null,
      session: null,
      isAuthLoading: false,
      profileError: 'Não foi possível carregar seu perfil. Verifique sua conexão e tente novamente.',
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('Falha ao carregar perfil')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.queryByText('access-denied')).not.toBeInTheDocument();
  });

  it('renders admin content for authenticated admin user', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'real',
      user: adminUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    renderAdminRoute();

    expect(screen.getByText('admin-page')).toBeInTheDocument();
    expect(screen.queryByText('admin-login-page')).not.toBeInTheDocument();
  });

  it('blocks non-admin from admin route and redirects to dashboard', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: false,
    });

    renderAdminRoute();

    expect(screen.getByText('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByText('admin-page')).not.toBeInTheDocument();
  });

  it('shows loading screen for admin route during auth hydration', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'real',
      user: null,
      session: null,
      isAuthLoading: true,
      profileError: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
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
