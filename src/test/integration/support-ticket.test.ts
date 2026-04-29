import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createAnonClient, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';
import { deleteTestUser, ensureTestUser, TEST_PREFIX } from './helpers/seed';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('support-ticket.test');

async function cleanupSupportTickets() {
  const service = createServiceClient();
  await service
    .schema('RetificaPremium')
    .from('Chamados_Suporte')
    .delete()
    .like('mensagem', `${TEST_PREFIX}%`);
}

describe.skipIf(skipIntegration)('Chamados de suporte — integração real com Supabase', () => {
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
    await cleanupSupportTickets();
  });

  afterAll(async () => {
    await cleanupSupportTickets();
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
  });

  it('get_chamados_suporte sem autenticação retorna 401', async () => {
    const result = await callRpc(createAnonClient(), 'get_chamados_suporte');

    expect(result.status).toBe(401);
  });

  it('get_chamados_suporte lista apenas chamados do usuário autenticado', async () => {
    const { client, userId } = await signInAsTestUser();
    const service = createServiceClient();
    const message = `${TEST_PREFIX} chamado suporte ${crypto.randomUUID()}`;

    await service
      .schema('RetificaPremium')
      .from('Chamados_Suporte')
      .insert({
        fk_auth_user: userId,
        user_email: getTestEnv().testUserEmail,
        user_name: 'Usuário Teste',
        mensagem: message,
        status: 'PENDING',
        email_to: 'gabrielwilliam208@gmail.com',
      });

    const result = await callRpc(client, 'get_chamados_suporte');

    expect(result.status).toBe(200);
    expect((result.dados as Array<{ mensagem: string }>).some((ticket) => ticket.mensagem === message)).toBe(true);

    await client.auth.signOut();
  });
});
