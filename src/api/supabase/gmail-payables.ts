import { callRPC } from './_base';
import { supabase } from '@/lib/supabase';

export type GmailConnectionStatus = {
  connected: boolean;
  email?: string;
  status?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  sync_enabled?: boolean;
  last_sync_at?: string | null;
  last_error?: string | null;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente.');
  }
  return data.session.access_token;
}

async function invokeAuthed<T>(name: string, body?: Record<string, unknown>) {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body ?? {},
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) throw new Error(error.message || `Falha ao chamar ${name}.`);
  return data as T;
}

export async function getGmailConnectionStatus() {
  const env = await callRPC<GmailConnectionStatus>('get_gmail_connection_status');
  return env.dados ?? { connected: false };
}

export async function startGmailOAuth() {
  return invokeAuthed<{ authUrl: string }>('gmail-oauth-start', {
    returnTo: `${window.location.origin}/contas-a-pagar?view=sugestoes`,
  });
}

export async function scanGmailPayables() {
  return invokeAuthed<{
    created: number;
    skipped: number;
    scanned: number;
    errors: string[];
  }>('gmail-scan-payables');
}
