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

  it('get_chamados_suporte sem autenticação não executa a RPC', async () => {
    await expect(callRpc(createAnonClient(), 'get_chamados_suporte')).rejects.toThrow(/permission denied|not allowed/i);
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

  it('resposta inbound só é registrada pelo service role e fica visível até ser marcada como lida', async () => {
    const { client, userId } = await signInAsTestUser();
    const service = createServiceClient();
    const message = `${TEST_PREFIX} resposta inbound ${crypto.randomUUID()}`;
    const reply = 'Seu chamado foi analisado e corrigido.';
    const { data: ticket, error } = await service
      .schema('RetificaPremium')
      .from('Chamados_Suporte')
      .insert({
        fk_auth_user: userId,
        user_email: getTestEnv().testUserEmail,
        user_name: 'Usuário Teste',
        mensagem: message,
        status: 'EMAIL_SENT',
        email_to: 'gabrielwilliam208@gmail.com',
      })
      .select('id_chamados_suporte')
      .single();

    expect(error).toBeNull();

    await expect(callRpc(client, 'registrar_resposta_chamado', {
      p_id_chamados_suporte: ticket!.id_chamados_suporte,
      p_resposta: reply,
      p_respondido_por: 'suporte@example.com',
    })).rejects.toThrow(/permission denied|not allowed/i);

    const registered = await callRpc(service, 'registrar_resposta_chamado', {
      p_id_chamados_suporte: ticket!.id_chamados_suporte,
      p_resposta: reply,
      p_respondido_por: 'suporte@example.com',
    });
    expect(registered.status).toBe(200);

    const unread = await callRpc(client, 'get_meus_chamados_suporte');
    const unreadTicket = (unread.dados as Array<{ mensagem: string; resposta: string | null; lida_em: string | null }>)
      .find((item) => item.mensagem === message);
    expect(unreadTicket).toMatchObject({ resposta: reply, lida_em: null });

    const marked = await callRpc(client, 'marcar_chamados_suporte_lidos');
    expect(marked.status).toBe(200);

    const read = await callRpc(client, 'get_meus_chamados_suporte');
    const readTicket = (read.dados as Array<{ mensagem: string; resposta: string | null; lida_em: string | null }>)
      .find((item) => item.mensagem === message);
    expect(readTicket?.lida_em).toBeTruthy();

    await client.auth.signOut();
  });
});
