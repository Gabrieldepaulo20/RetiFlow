import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getIntegrationEnv } from './env';

export function getTestEnv() {
  return getIntegrationEnv();
}

/** Client com anon key e sem sessão — representa chamada NÃO autenticada. */
export function createAnonClient() {
  const { url, anonKey } = getTestEnv();
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

/** Client com service role — bypassa RLS. Usar apenas em helpers de seed/cleanup. */
export function createServiceClient() {
  const { url, serviceKey } = getTestEnv();
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Autentica como usuário real e retorna o client com sessão ativa. */
export async function signInAsTestUser(): Promise<{
  client: SupabaseClient;
  accessToken: string;
  userId: string;
}> {
  const { url, anonKey, testUserEmail, testUserPassword } = getTestEnv();
  const client = createClient(url, anonKey, { auth: { persistSession: false } });

  const { data, error } = await client.auth.signInWithPassword({
    email: testUserEmail,
    password: testUserPassword,
  });

  if (error || !data.session) {
    throw new Error(`[signInAsTestUser] Falha no login: ${error?.message ?? 'sem sessão'}`);
  }

  return {
    client,
    accessToken: data.session.access_token,
    userId: data.user!.id,
  };
}

/**
 * Chama RPC no schema RetificaPremium e retorna o envelope bruto.
 * Lança Error apenas em caso de erro de transporte (rede/auth Supabase).
 * Erros de negócio (status 400/401/404) são retornados no envelope para assertions.
 */
export async function callRpc(
  client: SupabaseClient,
  rpcName: string,
  params: Record<string, unknown> = {},
): Promise<{ status: number; mensagem?: string; code?: string; [key: string]: unknown }> {
  const { data, error } = await client.schema('RetificaPremium').rpc(rpcName, params);
  if (error) throw new Error(`[${rpcName}] Erro de transporte: ${error.message}`);
  return data as { status: number; mensagem?: string; code?: string };
}
