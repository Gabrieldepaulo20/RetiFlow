import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnexoContaPagarUrl } from '@/api/supabase/contas-pagar';
import { SUPPORT_SESSION_STORAGE_KEY } from '@/services/auth/supportContext';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: mocks.from,
    },
    auth: {
      getSession: mocks.getSession,
    },
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

describe('payable attachment signed URL helper', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.createSignedUrl.mockReset();
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.from.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: null,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('uses direct Storage signing for the owning user', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/anexo.pdf' },
      error: null,
    });

    await expect(getAnexoContaPagarUrl('retifica-premium/anexo.pdf', {
      attachmentId: 'anexo-1',
    })).resolves.toBe('https://signed.example.com/anexo.pdf');

    expect(mocks.from).toHaveBeenCalledWith('contas-pagar');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('retifica-premium/anexo.pdf', 60 * 10);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('uses the audited Edge Function when support context is active', async () => {
    window.localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'abrir anexo',
      actorUser: { id: 'actor-id', email: 'gabrielwilliam208@gmail.com', name: 'Gabriel' },
      targetUser: { id: '22222222-2222-4222-8222-222222222222', email: 'retificapremium5@gmail.com', name: 'Retífica Premium' },
    }));
    mocks.invoke.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/suporte.pdf' },
      error: null,
    });

    await expect(getAnexoContaPagarUrl('retifica-premium/anexo.pdf', {
      attachmentId: 'anexo-1',
    })).resolves.toBe('https://signed.example.com/suporte.pdf');

    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith('payable-attachment-url', {
      body: {
        pathOrUrl: 'retifica-premium/anexo.pdf',
        attachmentId: 'anexo-1',
        support: {
          sessionId: '11111111-1111-4111-8111-111111111111',
          targetUserId: '22222222-2222-4222-8222-222222222222',
        },
      },
      headers: {
        Authorization: 'Bearer test-access-token',
      },
    });
  });

  it('falls back to the Edge Function when direct Storage signing fails', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Object not found or permission denied' },
    });
    mocks.invoke.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/fallback.pdf' },
      error: null,
    });

    await expect(getAnexoContaPagarUrl('retifica-premium/anexo.pdf', {
      attachmentId: 'anexo-1',
    })).resolves.toBe('https://signed.example.com/fallback.pdf');

    expect(mocks.invoke).toHaveBeenCalledWith('payable-attachment-url', {
      body: {
        pathOrUrl: 'retifica-premium/anexo.pdf',
        attachmentId: 'anexo-1',
        support: undefined,
      },
      headers: {
        Authorization: 'Bearer test-access-token',
      },
    });
  });
});
