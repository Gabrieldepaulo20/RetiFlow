import { callRPC } from './_base';
import type { Client, DocType } from '@/types';

export interface ClienteListItem {
  id_clientes: string;
  nome: string;
  nome_fantasia: string | null;
  documento: string;
  tipo_documento: 'CPF' | 'CNPJ';
  status: boolean;
  observacao: string | null;
  created_at: string;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  estado: string | null;
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

export function supabaseToClient(item: ClienteListItem): Client {
  return {
    id:            item.id_clientes,
    name:          item.nome,
    tradeName:     item.nome_fantasia ?? undefined,
    docType:       item.tipo_documento as DocType,
    docNumber:     item.documento,
    phone:         item.telefone ?? '',
    email:         item.email ?? '',
    cep:           item.cep ?? undefined,
    address:       item.rua ?? '',
    addressNumber: item.numero ?? undefined,
    district:      item.bairro ?? undefined,
    city:          item.cidade ?? '',
    state:         item.uf ?? '',
    notes:         item.observacao ?? '',
    isActive:      item.status,
    createdAt:     item.created_at,
  };
}

export function clientToNovoClientePayload(client: Omit<Client, 'id' | 'createdAt'>): NovoClientePayload {
  const payload: NovoClientePayload = {
    nome:          client.name,
    documento:     client.docNumber,
    tipo_documento: client.docType as 'CPF' | 'CNPJ',
    status:        client.isActive,
    observacao:    client.notes || undefined,
    nome_fantasia: client.tradeName || undefined,
  };

  if (client.cep || client.address || client.city) {
    payload.endereco = {
      cep:    client.cep ?? '',
      uf:     client.state ?? '',
      estado: client.state ?? '',
      cidade: client.city ?? '',
      bairro: client.district ?? '',
      rua:    client.address ?? '',
      numero: client.addressNumber ?? '',
    };
  }

  const contatos: NonNullable<NovoClientePayload['contatos']> = [];
  if (client.phone) contatos.push({ contato: client.phone, tipo_contato: 'telefone' });
  if (client.email) contatos.push({ contato: client.email, tipo_contato: 'email' });
  if (contatos.length > 0) payload.contatos = contatos;

  return payload;
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

export async function getClienteDetalhes(idCliente: string) {
  const env = await callRPC<never>('get_cliente_detalhes', { p_id_cliente: idCliente });
  return env as unknown as Record<string, unknown>;
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
  const params: Record<string, unknown> = { p_id_clientes: idClientes };
  if (dados.nome !== undefined)           params.p_nome = dados.nome;
  if (dados.nome_fantasia !== undefined)  params.p_nome_fantasia = dados.nome_fantasia;
  if (dados.documento !== undefined)      params.p_documento = dados.documento;
  if (dados.tipo_documento !== undefined) params.p_tipo_documento = dados.tipo_documento;
  if (dados.status !== undefined)         params.p_status = dados.status;
  if (dados.observacao !== undefined)     params.p_observacao = dados.observacao;
  await callRPC('update_cliente', params);
}

export async function inativarCliente(idClientes: string) {
  await callRPC('inativar_cliente', { p_id_clientes: idClientes });
}

export async function reativarCliente(idClientes: string) {
  await callRPC('reativar_cliente', { p_id_clientes: idClientes });
}
