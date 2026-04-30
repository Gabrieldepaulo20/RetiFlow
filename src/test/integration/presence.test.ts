import { beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();

describe.skipIf(!envStatus.configured)('Presença de usuários — integração real com Supabase', () => {
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
  });

  it('touch_usuario_presenca registra heartbeat do próprio usuário autenticado', async () => {
    const { client, userId: authUserId } = await signInAsTestUser();
    const envelope = await callRpc(client, 'touch_usuario_presenca', {
      p_current_route: '/dashboard',
    });

    expect(envelope.status).toBe(200);

    const service = createServiceClient();
    const { data: internalUser, error: userError } = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('id_usuarios')
      .eq('auth_id', authUserId)
      .maybeSingle();

    expect(userError).toBeNull();
    expect(internalUser?.id_usuarios).toBeTruthy();

    const { data: presence, error: presenceError } = await service
      .schema('RetificaPremium')
      .from('Usuarios_Presenca')
      .select('fk_usuarios, current_route, last_seen_at')
      .eq('fk_usuarios', internalUser!.id_usuarios)
      .maybeSingle();

    expect(presenceError).toBeNull();
    expect(presence).toMatchObject({
      fk_usuarios: internalUser!.id_usuarios,
      current_route: '/dashboard',
    });
    expect(new Date(presence!.last_seen_at as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

if (!envStatus.configured) {
  warnIntegrationSkipped('presence.test.ts');
}
