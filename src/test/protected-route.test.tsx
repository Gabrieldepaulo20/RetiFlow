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

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
  });

  it('redirects unauthenticated users to login', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: null,
      session: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  it('redirects authenticated users without module access to the denied page', () => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: baseUser,
      session: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
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
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
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
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: false,
    });

    renderProtectedRoute();

    expect(screen.getByText('closing-page')).toBeInTheDocument();
  });
});
