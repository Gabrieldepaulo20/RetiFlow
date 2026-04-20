import { callRPC } from './_base';

export interface Usuario {
  id_usuarios: string;
  nome: string;
  email: string;
  telefone: string;
  acesso: 'recepção' | 'produção' | 'financeiro' | 'administrador';
  status: boolean;
  created_at: string;
  ultimo_login: string | null;
}

export async function getUsuarios(params?: {
  p_busca?: string;
  p_acesso?: string;
  p_status?: boolean;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<Usuario[]>('get_usuarios', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function insertUsuario(params: {
  p_nome: string;
  p_email: string;
  p_telefone: string;
  p_acesso: string;
  p_status?: boolean;
}) {
  const env = await callRPC('insert_usuario', params);
  return env.id_usuarios as string;
}

export async function updateUsuario(
  idUsuarios: string,
  dados: Partial<{ p_nome: string; p_telefone: string; p_acesso: string; p_status: boolean }>,
) {
  await callRPC('update_usuario', { p_id_usuarios: idUsuarios, ...dados });
}

export async function inativarUsuario(idUsuarios: string) {
  await callRPC('inativar_usuario', { p_id_usuarios: idUsuarios });
}

export async function reativarUsuario(idUsuarios: string) {
  await callRPC('reativar_usuario', { p_id_usuarios: idUsuarios });
}

export async function upsertModulo(
  idUsuarios: string,
  modulos: Partial<{
    p_dashboard: boolean; p_clientes: boolean; p_notas_de_entrada: boolean;
    p_kanban: boolean; p_fechamento: boolean; p_nota_fiscal: boolean;
    p_configuracoes: boolean; p_contas_a_pagar: boolean; p_admin: boolean;
  }>,
) {
  await callRPC('upsert_modulo', { p_fk_usuarios: idUsuarios, ...modulos });
}
