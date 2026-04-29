import { callRPC } from './_base';
import { supabase } from '@/lib/supabase';

export type SupportTicketStatus = 'PENDING' | 'EMAIL_SENT' | 'EMAIL_FAILED' | 'RESOLVED';

export interface SupportTicket {
  id_chamados_suporte: string;
  created_at: string;
  mensagem: string;
  status: SupportTicketStatus;
  email_to: string | null;
  email_sent_at: string | null;
  email_error: string | null;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente.');
  }
  return data.session.access_token;
}

function functionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function getSupportTickets() {
  const env = await callRPC<SupportTicket[]>('get_chamados_suporte');
  return env.dados ?? [];
}

export async function submitSupportTicket(message: string) {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<{
    ticket: SupportTicket;
    emailStatus: 'sent' | 'failed';
    mensagem?: string;
  }>('support-ticket', {
    body: { message },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    throw new Error(functionErrorMessage(error, 'Não foi possível enviar o chamado.'));
  }

  if (!data?.ticket) {
    throw new Error('Resposta inesperada ao enviar chamado.');
  }

  return data;
}
