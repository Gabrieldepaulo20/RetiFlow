import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import type { AuthSession } from '@/types';

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

function authenticateAs(role: 'ADMIN' | 'FINANCEIRO') {
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(createSession(role)));
}

describe('App routes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(SYSTEM_USERS_STORAGE_KEY);
    window.history.pushState({}, '', '/');
  });

  it.each([
    ['/login', async () => screen.findByText('Entrar na área do cliente')],
    ['/admin/login', async () => screen.findByText('Entrar como administrador')],
    ['/acesso-negado', async () => screen.findByRole('heading', { name: 'Acesso negado' })],
    ['/rota-inexistente', async () => screen.findByText('Oops! Page not found')],
  ])('renders public route %s', async (path, findElement) => {
    renderAt(path);
    expect(await findElement()).toBeInTheDocument();
  });

  it('redirects / to /login', async () => {
    renderAt('/');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await screen.findByText('Entrar na área do cliente')).toBeInTheDocument();
  });

  it.each([
    ['/dashboard', async () => screen.findByRole('heading', { name: 'Dashboard' })],
    ['/clientes', async () => screen.findByRole('heading', { name: 'Clientes' })],
    ['/clientes/novo', async () => screen.findByRole('heading', { name: 'Novo Cliente' })],
    ['/clientes/c1', async () => screen.findByRole('heading', { name: 'Auto Peças Silva Ltda' })],
    ['/notas-entrada', async () => screen.findByRole('heading', { name: 'Notas de Entrada' })],
    ['/notas-entrada/nova', async () => screen.findByRole('heading', { name: 'Nova Ordem de Serviço' })],
    ['/notas-entrada/n1/editar', async () => screen.findByRole('heading', { name: 'Editar OS-1' })],
    ['/notas-entrada/n1', async () => screen.findByRole('heading', { name: 'OS-1' })],
    ['/kanban', async () => screen.findByRole('heading', { name: 'Produção' })],
    ['/fechamento', async () => screen.findByRole('heading', { name: 'Fechamento' })],
    ['/nota-fiscal', async () => screen.findByRole('heading', { name: 'Notas Fiscais' })],
    ['/contas-a-pagar', async () => screen.findByRole('heading', { name: 'Contas a Pagar' })],
  ])('renders operational route %s', async (path, findElement) => {
    authenticateAs('FINANCEIRO');
    renderAt(path);
    expect(await findElement()).toBeInTheDocument();
  });

  it.each([
    ['/contas-a-pagar/nova', 'modal=new', /Nova conta a pagar/i],
    ['/contas-a-pagar/importar', 'modal=import', /Importar conta com IA/i],
  ])('redirects payable compatibility route %s', async (path, search, modalTitle) => {
    authenticateAs('FINANCEIRO');
    renderAt(path);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/contas-a-pagar');
      expect(window.location.search).toContain(search);
    });
    expect(await screen.findByRole('heading', { name: modalTitle })).toBeInTheDocument();
  });

  it('blocks /configuracoes for financeiro when the module is disabled for that role', async () => {
    authenticateAs('FINANCEIRO');
    renderAt('/configuracoes');
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
    expect(screen.getByText(/origem: \/configuracoes/i)).toBeInTheDocument();
  });

  it.each([
    ['/admin', async () => screen.findByRole('heading', { name: 'Painel Administrativo' })],
    ['/admin/usuarios', async () => screen.findByRole('heading', { name: 'Usuários do Sistema' })],
    ['/admin/configuracoes', async () => screen.findByRole('heading', { name: 'Configurações' })],
  ])('renders admin route %s', async (path, findElement) => {
    authenticateAs('ADMIN');
    renderAt(path);
    expect(await findElement()).toBeInTheDocument();
  });

  it('redirects /admin/clientes to /admin/usuarios', async () => {
    authenticateAs('ADMIN');
    renderAt('/admin/clientes');
    await waitFor(() => expect(window.location.pathname).toBe('/admin/usuarios'));
    expect(await screen.findByRole('heading', { name: 'Usuários do Sistema' })).toBeInTheDocument();
  });
});
