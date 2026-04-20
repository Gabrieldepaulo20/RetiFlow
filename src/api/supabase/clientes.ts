import { callRPC } from './_base';

export interface ClienteListItem {
  id_clientes: string;
  nome: string;
  nome_fantasia: string | null;
  documento: string;
  tipo_documento: 'CPF' | 'CNPJ';
  status: boolean;
  observacao: string | null;
  telefone: string | null;
  email: string | null;
  created_at: string;
}

export interface ClienteDetalhes {
  resumo_cabecalho: { total: number; em_aberto: number };
  aba_cadastro: {
    perfil: {
      id_clientes: string;
      nome: string;
      nome_fantasia: string | null;
      documento: string;
      tipo_documento: 'CPF' | 'CNPJ';
      status: boolean;
      observacao: string | null;
    };
    endereco: {
      cep: string; rua: string; numero: string;
      bairro: string; cidade: string; uf: string;
    } | null;
    contatos: Array<{ tipo: string; valor: string }>;
  };
  aba_historico: Array<{
    id_nota: string; identificador: string; tipo_nota: string;
    data: string; veiculo_modelo: string | null;
    status_nome: string; status_tipo: string; valor_total: number;
  }>;
}

export interface NovoClientePayload {
  nome: string;
  documento: string;
  tipo_documento: 'CPF' | 'CNPJ';
  status?: boolean;
  observacao?: string;
  nome_fantasia?: string;
  endereco?: {
    cep: string; uf: string; estado: string; cidade: string;
    bairro: string; rua: string; numero: string;
  };
  contatos?: Array<{ contato: string; tipo_contato: 'email' | 'telefone' | 'outro' }>;
}

export async function getClientes(params?: {
  p_busca?: string;
  p_status?: boolean;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<ClienteListItem[]>('get_clientes', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export async function getClienteDetalhes(idCliente: string): Promise<ClienteDetalhes> {
  const env = await callRPC<never>('get_cliente_detalhes', { p_id_cliente: idCliente });
  return env as unknown as ClienteDetalhes;
}

export async function novoCliente(payload: NovoClientePayload) {
  const env = await callRPC('novo_cliente', { p_payload: payload });
  return env.id_cliente as string;
}

export async function salvarClienteCompleto(payload: NovoClientePayload & { id_clientes?: string }) {
  const env = await callRPC('salvar_cliente_completo', { p_payload: payload });
  return env.id_cliente as string;
}

export async function updateCliente(
  idClientes: string,
  dados: Partial<{ nome: string; documento: string; tipo_documento: string; status: boolean; observacao: string; nome_fantasia: string }>,
) {
  await callRPC('update_cliente', { p_id_clientes: idClientes, ...dados });
}

export async function inativarCliente(idClientes: string) {
  await callRPC('inativar_cliente', { p_id_clientes: idClientes });
}

export async function reativarCliente(idClientes: string) {
  await callRPC('reativar_cliente', { p_id_clientes: idClientes });
}
