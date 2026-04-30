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

  it('sends optional reset confirmation email only through the admin function payload', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        mensagem: 'E-mail de recuperação enviado para o usuário.',
        resetEmail: 'cliente@example.com',
        confirmationEmail: 'responsavel@example.com',
        confirmationSent: true,
      },
      error: null,
    });

    await expect(callAdminUsersFunction({
      action: 'reset_password',
      userId: VALID_UUID,
      confirmationEmail: 'responsavel@example.com',
    })).resolves.toMatchObject({
      resetEmail: 'cliente@example.com',
      confirmationSent: true,
    });

    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', expect.objectContaining({
      body: {
        action: 'reset_password',
        userId: VALID_UUID,
        confirmationEmail: 'responsavel@example.com',
      },
    }));
  });

  it('returns result data on success', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        mensagem: 'Usuário criado/convidado com segurança.',
        id_usuarios: 'uuid-interno',
        auth_user_id: 'auth-uuid',
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
    expect(result.action_link).toBeUndefined();
  });

  it('supports resending an invite through the admin function', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        mensagem: 'Convite reenviado por e-mail com segurança.',
        resetEmail: 'novo@example.com',
        auth_user_id: 'auth-uuid',
      },
      error: null,
    });

    await expect(callAdminUsersFunction({
      action: 'resend_invite',
      userId: VALID_UUID,
      email: 'novo@example.com',
    })).resolves.toMatchObject({
      resetEmail: 'novo@example.com',
      auth_user_id: 'auth-uuid',
    });

    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', expect.objectContaining({
      body: {
        action: 'resend_invite',
        userId: VALID_UUID,
        email: 'novo@example.com',
      },
    }));
  });

  it('loads user presence through the admin function', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        mensagem: 'Presença dos usuários carregada.',
        userPresence: [
          {
            userId: VALID_UUID,
            email: 'cliente@example.com',
            lastSeenAt: '2026-04-30T12:00:00.000Z',
            currentRoute: '/dashboard',
            isOnline: true,
          },
        ],
      },
      error: null,
    });

    await expect(callAdminUsersFunction({ action: 'get_user_presence' })).resolves.toMatchObject({
      userPresence: [
        {
          userId: VALID_UUID,
          isOnline: true,
          currentRoute: '/dashboard',
        },
      ],
    });

    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', expect.objectContaining({
      body: { action: 'get_user_presence' },
    }));
  });

  it('supports analyzing and deleting a user through the admin function', async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: {
        mensagem: 'Impacto da exclusão calculado.',
        deletionReport: {
          targetUserId: VALID_UUID,
          targetEmail: 'cliente@example.com',
          targetName: 'Cliente Teste',
          totalRecords: 3,
          warnings: ['Ação irreversível.'],
          steps: [
            { key: 'validate', label: 'Validar Mega Master', count: 1, status: 'pending' },
          ],
        },
      },
      error: null,
    });

    await expect(callAdminUsersFunction({
      action: 'analyze_delete_user',
      userId: VALID_UUID,
      confirmEmail: 'cliente@example.com',
    })).resolves.toMatchObject({
      deletionReport: {
        targetEmail: 'cliente@example.com',
        totalRecords: 3,
      },
    });

    expect(mocks.invoke).toHaveBeenLastCalledWith('admin-users', expect.objectContaining({
      body: {
        action: 'analyze_delete_user',
        userId: VALID_UUID,
        confirmEmail: 'cliente@example.com',
      },
    }));

    mocks.invoke.mockResolvedValueOnce({
      data: {
        mensagem: 'Usuário e vínculos comprovados excluídos com segurança.',
        deletionReport: {
          targetUserId: VALID_UUID,
          targetEmail: 'cliente@example.com',
          targetName: 'Cliente Teste',
          totalRecords: 0,
          warnings: [],
          steps: [
            { key: 'validate', label: 'Validar Mega Master', count: 1, status: 'done' },
          ],
        },
      },
      error: null,
    });

    await expect(callAdminUsersFunction({
      action: 'delete_user',
      userId: VALID_UUID,
      confirmEmail: 'cliente@example.com',
    })).resolves.toMatchObject({
      deletionReport: {
        targetEmail: 'cliente@example.com',
      },
    });
  });

  it('supports starting an audited support impersonation session', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        mensagem: 'Modo suporte iniciado.',
        supportSession: {
          id: 'session-1',
          reason: 'Cliente pediu ajuda com uma O.S.',
          startedAt: '2026-04-29T12:00:00.000Z',
          expiresAt: '2026-04-29T13:00:00.000Z',
          actorUser: {
            id: 'user-master',
            name: 'Gabriel Master',
            email: 'gabrielwilliam208@gmail.com',
            role: 'ADMIN',
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          targetUser: {
            id: VALID_UUID,
            name: 'Cliente Teste',
            email: 'cliente@example.com',
            role: 'RECEPCAO',
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            moduleAccess: { dashboard: true, clients: true },
          },
        },
      },
      error: null,
    });

    await expect(callAdminUsersFunction({
      action: 'start_support_impersonation',
      targetUserId: VALID_UUID,
      reason: 'Cliente pediu ajuda com uma O.S.',
    })).resolves.toMatchObject({
      supportSession: {
        targetUser: { email: 'cliente@example.com' },
      },
    });

    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', expect.objectContaining({
      body: {
        action: 'start_support_impersonation',
        targetUserId: VALID_UUID,
        reason: 'Cliente pediu ajuda com uma O.S.',
      },
    }));
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
