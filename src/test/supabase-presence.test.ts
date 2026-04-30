import { beforeEach, describe, expect, it, vi } from 'vitest';
import { touchUserPresence } from '@/api/supabase/presence';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
}));

vi.mock('@/api/supabase/_base', () => ({
  callRPC: mocks.callRPC,
}));

describe('Supabase user presence wrapper', () => {
  beforeEach(() => {
    mocks.callRPC.mockReset();
    mocks.callRPC.mockResolvedValue({ status: 200, mensagem: 'ok' });
  });

  it('sends a compact heartbeat with the current route', async () => {
    await touchUserPresence('/clientes');

    expect(mocks.callRPC).toHaveBeenCalledWith('touch_usuario_presenca', {
      p_current_route: '/clientes',
    });
  });

  it('limits overly long route values before calling the RPC', async () => {
    await touchUserPresence(`/${'a'.repeat(220)}`);

    const payload = mocks.callRPC.mock.calls[0][1];
    expect(payload.p_current_route).toHaveLength(160);
  });
});
