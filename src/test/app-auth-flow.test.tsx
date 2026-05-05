import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { AuthSession } from '@/types';

const AUTH_SESSION_STORAGE_KEY = 'auth.session';
const SYSTEM_USERS_STORAGE_KEY = 'systemUsers';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

function createSession(role: 'ADMIN' | 'FINANCEIRO'): AuthSession {
  const users = {
    ADMIN: {
      id: 'user-1',
      name: 'Admin Master',
      email: 'admin@retifica.com',
      role: 'ADMIN' as const,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    FINANCEIRO: {
      id: 'user-2',
      name: 'Paula Martins',
      email: 'financeiro@retifica.com',
      role: 'FINANCEIRO' as const,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  } as const;

  return {
    user: users[role],
    mode: 'development',
    authenticatedAt: '2026-03-29T12:00:00.000Z',
    tokens: {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    },
  };
}

describe('App auth flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(SYSTEM_USERS_STORAGE_KEY);
    window.history.pushState({}, '', '/');
  });

  it('redirects the root route to the operational login', async () => {
    renderAt('/');

    expect(await screen.findByText('Entrar na área do cliente')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByText('Escolha o portal de acesso adequado para continuar.')).not.toBeInTheDocument();
  });

  it('logs an operational user in and redirects to the dashboard', async () => {
    renderAt('/login');

    fireEvent.change(await screen.findByPlaceholderText('seu@email.com'), {
      target: { value: 'financeiro@retifica.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'demo123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    }, { timeout: 4000 });
    expect(await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/no escopo atual/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Escopo do Dashboard/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kanban' })).toBeInTheDocument();
  });

  it('logs an admin in through the admin login and redirects to the admin dashboard', async () => {
    renderAt('/admin/login');

    fireEvent.change(await screen.findByPlaceholderText('seu@email.com'), {
      target: { value: 'admin@retifica.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'demo123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/admin');
    }, { timeout: 4000 });
    expect(await screen.findByRole('heading', { name: 'Painel Administrativo' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('Visão geral da plataforma e análise de uso')).toBeInTheDocument();
  });

  it('lets an admin use the operational login as a master test user', async () => {
    renderAt('/login');

    fireEvent.change(await screen.findByPlaceholderText('seu@email.com'), {
      target: { value: 'admin@retifica.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'demo123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    }, { timeout: 4000 });
    expect(await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('Painel Administrativo')).not.toBeInTheDocument();
  });

  it('allows admin users to open the operational kanban when needed', async () => {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(createSession('ADMIN')));

    renderAt('/kanban');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/kanban');
    });
    expect(await screen.findByRole('heading', { name: 'Produção' })).toBeInTheDocument();
    expect(screen.getByText(/Arraste os cards para mover entre etapas/i)).toBeInTheDocument();
  });
});
