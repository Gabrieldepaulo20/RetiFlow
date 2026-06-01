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
  resposta: string | null;
  respondido_em: string | null;
  respondido_por: string | null;
  lida_em: string | null;
}

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
let mockTickets: SupportTicket[] = [];

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
  if (!IS_REAL_AUTH) return mockTickets;
  const env = await callRPC<SupportTicket[]>('get_meus_chamados_suporte');
  return env.dados ?? [];
}

export async function markSupportTicketsRead() {
  if (!IS_REAL_AUTH) {
    const readAt = new Date().toISOString();
    mockTickets = mockTickets.map((ticket) => ticket.resposta && !ticket.lida_em ? { ...ticket, lida_em: readAt } : ticket);
    return;
  }
  await callRPC('marcar_chamados_suporte_lidos');
}

export async function submitSupportTicket(message: string) {
  if (!IS_REAL_AUTH) {
    const createdAt = new Date().toISOString();
    const ticket: SupportTicket = {
      id_chamados_suporte: crypto.randomUUID(),
      created_at: createdAt,
      mensagem: message,
      status: 'EMAIL_SENT',
      email_to: null,
      email_sent_at: createdAt,
      email_error: null,
      resposta: null,
      respondido_em: null,
      respondido_por: null,
      lida_em: null,
    };
    mockTickets = [ticket, ...mockTickets];
    return { ticket, emailStatus: 'sent' as const };
  }

  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<{
    ticket: SupportTicket;
    emailStatus: 'sent';
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
