import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/monitoring';
import { callRPC } from './_base';

export interface PerfilUsuario {
  id_usuarios: string;
  auth_id: string;
  nome: string;
  email: string;
  telefone: string;
  acesso: 'recepção' | 'produção' | 'financeiro' | 'administrador';
  status: boolean;
  ultimo_login: string | null;
  modulos: {
    dashboard: boolean;
    clientes: boolean;
    notas_de_entrada: boolean;
    kanban: boolean;
    fechamento: boolean;
    nota_fiscal: boolean;
    configuracoes: boolean;
    contas_a_pagar: boolean;
    admin: boolean;
  };
}

/** Autentica via Supabase Auth e retorna a sessão. */
export async function autenticar(email: string, senha: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message);
  return data;
}

/** Encerra a sessão do usuário atual. */
export async function sair() {
  const { error } = await supabase.auth.signOut();
  if (error) logError(error, 'auth.sair');
}

/** Resolve o perfil completo do usuário logado a partir do JWT. */
export async function getPerfil(): Promise<PerfilUsuario> {
  const envelope = await callRPC<PerfilUsuario>('get_usuario_por_auth_id');
  const dados = envelope.dados;
  if (!dados) throw new Error('[auth] Perfil não encontrado.');
  return dados;
}

/** Retorna a sessão ativa ou null. */
export async function getSessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
