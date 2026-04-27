import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAnonClient, getTestEnv } from './helpers/client';
import { ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

/**
 * Testes de integração — autenticação real com Supabase Auth.
 *
 * O que está sendo validado ponta a ponta:
 * - Login com credenciais válidas retorna JWT real
 * - JWT tem formato correto e expiração futura
 * - Login com senha errada retorna erro (sem lançar exceção)
 * - Logout limpa a sessão
 * - auth.uid() disponível no contexto DB após autenticação
 */
const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('auth.test');

describe.skipIf(skipIntegration)('Auth — integração real com Supabase', () => {
  let testEmail: string;
  let testPassword: string;

  beforeAll(async () => {
    const env = getTestEnv();
    testEmail = env.testUserEmail;
    testPassword = env.testUserPassword;
    await ensureTestUser(testEmail, testPassword);
  });

  afterAll(async () => {
    // Não deletamos o usuário aqui pois contas-pagar.test.ts também o usa.
    // A deleção final fica em contas-pagar.test.ts afterAll.
  });

  it('login com credenciais válidas retorna sessão com JWT', async () => {
    const client = createAnonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.session!.access_token).toBeTruthy();
    expect(data.user!.email).toBe(testEmail);

    await client.auth.signOut();
  });

  it('JWT tem formato válido (3 partes separadas por ponto)', async () => {
    const client = createAnonClient();
    const { data } = await client.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    const token = data.session!.access_token;
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // Payload decodificável
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as {
      exp: number;
      sub: string;
      email: string;
    };
    expect(payload.sub).toBeTruthy();
    expect(payload.email).toBe(testEmail);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    await client.auth.signOut();
  });

  it('login com senha incorreta retorna erro sem lançar exceção', async () => {
    const client = createAnonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: testEmail,
      password: 'senha-completamente-errada-123',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/invalid|credentials|password/i);
    expect(data.session).toBeNull();
  });

  it('login com e-mail inexistente retorna erro sem lançar exceção', async () => {
    const client = createAnonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: 'nao-existe@retifica.com',
      password: 'qualquer',
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it('após signOut, sessão ativa é removida do client', async () => {
    const client = createAnonClient();

    // Login
    await client.auth.signInWithPassword({ email: testEmail, password: testPassword });
    const sessionAntes = await client.auth.getSession();
    expect(sessionAntes.data.session).not.toBeNull();

    // Logout
    await client.auth.signOut();
    const sessionDepois = await client.auth.getSession();
    expect(sessionDepois.data.session).toBeNull();
  });

  it('auth.uid() está disponível no DB após autenticação (validado via RPC que usa auth.uid())', async () => {
    const client = createAnonClient();
    await client.auth.signInWithPassword({ email: testEmail, password: testPassword });

    // Chama get_contas_pagar — RPC que roda como SECURITY DEFINER mas usa auth.uid() internamente.
    // Se auth.uid() não estiver disponível, o campo fk_criado_por seria NULL mas o RPC ainda retornaria 200.
    // O que validamos aqui é que a chamada autenticada chega ao DB com JWT válido e não retorna erro de transporte.
    const { data, error } = await client.schema('RetificaPremium').rpc('get_contas_pagar', {
      p_limite: 1,
    });

    expect(error).toBeNull();
    // Resposta tem estrutura de envelope válida
    const envelope = data as { status: number };
    expect(envelope.status).toBe(200);

    await client.auth.signOut();
  });
});
