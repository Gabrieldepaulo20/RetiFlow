import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createAnonClient, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';
import { deleteTestUser, ensureTestUser } from './helpers/seed';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('gmail-status.test');

async function cleanupConnection(authId: string) {
  const service = createServiceClient();
  const { error } = await service
    .schema('RetificaPremium')
    .from('Gmail_Connections')
    .delete()
    .eq('fk_auth_user', authId);

  if (error) throw new Error(`[gmail-status] Falha ao limpar conexão Gmail de teste: ${error.message}`);
}

describe.skipIf(skipIntegration)('Status Gmail — telemetria persistida da sincronização', () => {
  let authId = '';

  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    authId = await ensureTestUser(testUserEmail, testUserPassword);
    await cleanupConnection(authId);
  });

  afterAll(async () => {
    await cleanupConnection(authId);
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
  });

  it('retorna desconectado quando o usuário ainda não vinculou o Gmail', async () => {
    const { client } = await signInAsTestUser();
    const status = await callRpc(client, 'get_gmail_connection_status');

    expect(status.status).toBe(200);
    expect(status.dados).toEqual({ connected: false });

    await client.auth.signOut();
  });

  it('expõe somente o resumo seguro da última sincronização ao usuário autenticado', async () => {
    const service = createServiceClient();
    const { error } = await service
      .schema('RetificaPremium')
      .from('Gmail_Connections')
      .insert({
        fk_auth_user: authId,
        email: 'integration-gmail@example.com',
        refresh_token_cipher: '[INTEGRATION-TEST]',
        status: 'CONNECTED',
        sync_enabled: true,
        last_sync_at: '2026-06-02T10:00:00',
        last_scan_messages_count: 18,
        last_scan_attachments_count: 7,
        last_scan_suggestions_count: 4,
        last_scan_reconciled_count: 2,
        last_scan_skipped_count: 12,
        last_scan_errors_count: 1,
        auto_sync_enabled: false,
        auto_sync_interval_hours: 12,
      });

    if (error) throw new Error(`[gmail-status] Falha ao criar conexão Gmail de teste: ${error.message}`);

    const { client } = await signInAsTestUser();
    const status = await callRpc(client, 'get_gmail_connection_status');

    expect(status.status).toBe(200);
    expect(status.dados).toMatchObject({
      connected: true,
      email: 'integration-gmail@example.com',
      status: 'CONNECTED',
      sync_enabled: true,
      last_scan_messages_count: 18,
      last_scan_attachments_count: 7,
      last_scan_suggestions_count: 4,
      last_scan_reconciled_count: 2,
      last_scan_skipped_count: 12,
      last_scan_errors_count: 1,
      auto_sync_enabled: false,
      auto_sync_interval_hours: 12,
      next_auto_sync_at: null,
      last_auto_sync_at: null,
      auto_sync_failures: 0,
    });
    expect(status.dados).not.toHaveProperty('refresh_token_cipher');

    await client.auth.signOut();
  });

  it('persiste a busca automática somente para a conexão Gmail do usuário autenticado', async () => {
    const { client } = await signInAsTestUser();
    const enabled = await callRpc(client, 'update_gmail_auto_sync_settings', {
      p_enabled: true,
      p_interval_hours: 6,
    });

    expect(enabled.status).toBe(200);
    expect(enabled.dados).toMatchObject({
      connected: true,
      auto_sync_enabled: true,
      auto_sync_interval_hours: 6,
      auto_sync_failures: 0,
    });
    expect((enabled.dados as { next_auto_sync_at?: unknown }).next_auto_sync_at).toEqual(expect.any(String));

    const disabled = await callRpc(client, 'update_gmail_auto_sync_settings', {
      p_enabled: false,
      p_interval_hours: 12,
    });
    expect(disabled.dados).toMatchObject({
      auto_sync_enabled: false,
      auto_sync_interval_hours: 12,
      next_auto_sync_at: null,
    });

    await client.auth.signOut();
  });

  it('não permite consultar o status com anon key sem sessão', async () => {
    await expect(callRpc(createAnonClient(), 'get_gmail_connection_status'))
      .rejects
      .toThrow(/permission denied/i);
  });

  it('não permite alterar a busca automática com anon key sem sessão', async () => {
    await expect(callRpc(createAnonClient(), 'update_gmail_auto_sync_settings', {
      p_enabled: true,
      p_interval_hours: 6,
    }))
      .rejects
      .toThrow(/permission denied/i);
  });
});
