import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAdminUsersFunction } from '@/api/supabase/admin-users';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  },
}));

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

describe('callAdminUsersFunction', () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'valid-token' } },
      error: null,
    });
  });

  it('throws when Supabase session is missing', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(callAdminUsersFunction({
      action: 'deactivate_user',
      userId: VALID_UUID,
    })).rejects.toThrow('Sessão Supabase não encontrada');
  });

  it('sends Authorization Bearer header with access token', async () => {
    mocks.invoke.mockResolvedValue({ data: { mensagem: 'Módulos atualizados.' }, error: null });
    await callAdminUsersFunction({
      action: 'set_modules',
      userId: VALID_UUID,
      modules: { dashboard: true },
    });
    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
    }));
  });

  it('returns result data on success', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        mensagem: 'Usuário criado/convidado com segurança.',
        id_usuarios: 'uuid-interno',
        auth_user_id: 'auth-uuid',
        action_link: 'https://app.example.com/invite?token=abc',
      },
      error: null,
    });
    const result = await callAdminUsersFunction({
      action: 'create_user',
      email: 'novo@example.com',
      name: 'Novo Usuário',
      role: 'RECEPCAO',
    });
    expect(result.id_usuarios).toBe('uuid-interno');
    expect(result.action_link).toBe('https://app.example.com/invite?token=abc');
  });

  it('propagates error message from 401 response body', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'FunctionsFetchError',
        context: new Response(
          JSON.stringify({ error: 'Autenticação obrigatória.' }),
          { status: 401 },
        ),
      },
    });
    await expect(callAdminUsersFunction({
      action: 'set_modules',
      userId: VALID_UUID,
      modules: {},
    })).rejects.toThrow('Autenticação obrigatória.');
  });

  it('propagates error message from 403 response body — non-super admin', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'FunctionsFetchError',
        context: new Response(
          JSON.stringify({ error: 'Ação restrita ao Super Admin autorizado.' }),
          { status: 403 },
        ),
      },
    });
    await expect(callAdminUsersFunction({
      action: 'deactivate_user',
      userId: VALID_UUID,
    })).rejects.toThrow('Ação restrita ao Super Admin autorizado.');
  });

  it('propagates error message from 400 response body — invalid payload', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'FunctionsFetchError',
        context: new Response(
          JSON.stringify({ error: 'Payload inválido.' }),
          { status: 400 },
        ),
      },
    });
    await expect(callAdminUsersFunction({
      action: 'set_modules',
      userId: VALID_UUID,
      modules: {},
    })).rejects.toThrow('Payload inválido.');
  });

  it('falls back to SDK error message when response body is not JSON', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Erro inesperado na função.',
        context: new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      },
    });
    await expect(callAdminUsersFunction({
      action: 'reactivate_user',
      userId: VALID_UUID,
    })).rejects.toThrow('Erro inesperado na função.');
  });

  it('returns empty object when function returns null data without error', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: null });
    const result = await callAdminUsersFunction({
      action: 'deactivate_user',
      userId: VALID_UUID,
    });
    expect(result).toEqual({});
  });
});
