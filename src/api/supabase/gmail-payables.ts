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
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Configuração Supabase ausente no frontend.');
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && payload.error
      ? payload.error
      : `Falha ao chamar ${name}.`;
    throw new Error(message);
  }

  return payload as T;
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
