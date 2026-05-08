import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    ['/', async () => screen.findByText('Entrar na área do cliente')],
    ['/login', async () => screen.findByText('Entrar na área do cliente')],
    ['/admin/login', async () => screen.findByText('Entrar como administrador')],
    ['/acesso-negado', async () => screen.findByRole('heading', { name: 'Acesso negado' })],
    ['/rota-inexistente', async () => screen.findByRole('heading', { name: 'Página não encontrada' })],
  ])('renders public route %s', async (path, findElement) => {
    renderAt(path);
    expect(await findElement()).toBeInTheDocument();
  });

  it('redirects the root route to the operational login for unauthenticated users', async () => {
    renderAt('/');
    expect(await screen.findByText('Entrar na área do cliente')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByText('Escolha o portal de acesso adequado para continuar.')).not.toBeInTheDocument();
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
    ['/fechamento', async () => screen.findByRole('heading', { name: 'Fechamento Mensal' })],
    ['/contas-a-pagar', async () => screen.findByRole('heading', { name: 'Contas a Pagar' })],
  ])('renders operational route %s', async (path, findElement) => {
    authenticateAs('FINANCEIRO');
    renderAt(path);
    expect(await findElement()).toBeInTheDocument();
  });

  it('keeps Dashboard indicators limited to real v1 modules', async () => {
    authenticateAs('FINANCEIRO');
    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/fonte dos indicadores/i)).toBeInTheDocument();
    expect(screen.queryByText(/NFs este mês/i)).not.toBeInTheDocument();
  });

  it.each([
    ['/contas-a-pagar/nova', 'modal=new', /Nova conta a pagar/i],
    ['/contas-a-pagar/importar', 'modal=import', /Importar contas/i],
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
    expect(screen.getByText(/rota solicitada:/i)).toBeInTheDocument();
    expect(screen.getByText('/configuracoes')).toBeInTheDocument();
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

  it('shows Settings as partially local when opened by admin', async () => {
    authenticateAs('ADMIN');
    renderAt('/admin/configuracoes');

    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    expect(screen.getByText(/ainda não persistem no backend/i)).toBeInTheDocument();
    expect(screen.getByText(/não deve ser considerado configuração real de produção/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /atualizar/i })).toBeDisabled();
    expect(screen.getAllByText(/prévia local/i).length).toBeGreaterThan(0);
    expect(window.localStorage.getItem('moduleConfig')).toBeNull();
  });

  it('does not expose fake settings persistence or password reset', async () => {
    authenticateAs('ADMIN');
    renderAt('/admin/configuracoes');

    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();

    const modulesTab = screen.getByRole('tab', { name: /módulos/i });
    fireEvent.keyDown(modulesTab, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(screen.getAllByText(/controle real por cliente\/usuário/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/apenas o Super Admin autorizado pode alterar módulos/i)).toBeInTheDocument();
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toBeDisabled();
    }

    const securityTab = screen.getByRole('tab', { name: /segurança/i });
    fireEvent.keyDown(securityTab, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(screen.getByText(/fluxo ainda indisponível/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /integração em implementação/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^alterar senha$/i })).not.toBeInTheDocument();

    const usersTab = screen.getByRole('tab', { name: /usuários/i });
    fireEvent.keyDown(usersTab, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(screen.getByText(/gestão real centralizada no admin/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /abrir usuários no admin/i })).toHaveAttribute('href', '/admin/usuarios');
    expect(screen.queryByText(/admin@retifica.com/i)).not.toBeInTheDocument();
  });

  it('redirects /admin/clientes to /admin/usuarios', async () => {
    authenticateAs('ADMIN');
    renderAt('/admin/clientes');
    await waitFor(() => expect(window.location.pathname).toBe('/admin/usuarios'));
    expect(await screen.findByRole('heading', { name: 'Usuários do Sistema' })).toBeInTheDocument();
  });
});
