import { callRPC, extractDados } from './_base';
import type { CompanyDocumentSettings } from '@/services/domain/documentCustomization';
import { buildFallbackCompanySettings } from '@/services/domain/documentCustomization';

export type UserCompanySettings = CompanyDocumentSettings;

interface UserCompanySettingsRow {
  fk_usuarios: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_estadual: string;
  inscricao_municipal: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  whatsapp?: string | null;
  email: string;
  site: string;
  instagram?: string | null;
  horario_atendimento?: string | null;
  mensagem_atendimento?: string | null;
  observacao_documentos?: string | null;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  updated_at: string | null;
}

const fallbackCompanySettings = buildFallbackCompanySettings();

export const DEFAULT_USER_COMPANY_SETTINGS: Omit<UserCompanySettings, 'fkUsuarios' | 'updatedAt'> = {
  razaoSocial: fallbackCompanySettings.razaoSocial,
  nomeFantasia: fallbackCompanySettings.nomeFantasia,
  cnpj: fallbackCompanySettings.cnpj,
  inscricaoEstadual: fallbackCompanySettings.inscricaoEstadual,
  inscricaoMunicipal: fallbackCompanySettings.inscricaoMunicipal,
  endereco: fallbackCompanySettings.endereco,
  cidade: fallbackCompanySettings.cidade,
  estado: fallbackCompanySettings.estado,
  cep: fallbackCompanySettings.cep,
  telefone: fallbackCompanySettings.telefone,
  whatsapp: fallbackCompanySettings.whatsapp,
  email: fallbackCompanySettings.email,
  site: fallbackCompanySettings.site,
  instagram: fallbackCompanySettings.instagram,
  horarioAtendimento: fallbackCompanySettings.horarioAtendimento,
  mensagemAtendimento: fallbackCompanySettings.mensagemAtendimento,
  observacaoDocumentos: fallbackCompanySettings.observacaoDocumentos,
  brandPrimaryColor: fallbackCompanySettings.brandPrimaryColor,
  brandSecondaryColor: fallbackCompanySettings.brandSecondaryColor,
};

const toCompanySettings = (row: UserCompanySettingsRow): UserCompanySettings => ({
  fkUsuarios: row.fk_usuarios,
  razaoSocial: row.razao_social,
  nomeFantasia: row.nome_fantasia,
  cnpj: row.cnpj,
  inscricaoEstadual: row.inscricao_estadual,
  inscricaoMunicipal: row.inscricao_municipal,
  endereco: row.endereco,
  cidade: row.cidade,
  estado: row.estado,
  cep: row.cep,
  telefone: row.telefone,
  whatsapp: row.whatsapp ?? '',
  email: row.email,
  site: row.site,
  instagram: row.instagram ?? '',
  horarioAtendimento: row.horario_atendimento ?? '',
  mensagemAtendimento: row.mensagem_atendimento ?? '',
  observacaoDocumentos: row.observacao_documentos ?? '',
  brandPrimaryColor: row.brand_primary_color ?? '#1a7a8a',
  brandSecondaryColor: row.brand_secondary_color ?? '#0f7f95',
  updatedAt: row.updated_at,
});

export async function getConfiguracaoEmpresaUsuario(idUsuarios?: string | null) {
  const env = await callRPC<UserCompanySettingsRow>('get_configuracao_empresa_usuario', {
    p_fk_usuarios: idUsuarios ?? null,
  });
  return toCompanySettings(extractDados(env, 'get_configuracao_empresa_usuario'));
}

export async function getConfiguracaoEmpresaCliente(idUsuarios?: string | null) {
  const env = await callRPC<UserCompanySettingsRow>('get_configuracao_empresa_cliente', {
    p_fk_usuarios: idUsuarios ?? null,
  });
  return toCompanySettings(extractDados(env, 'get_configuracao_empresa_cliente'));
}

export async function upsertConfiguracaoEmpresaUsuario(params: {
  idUsuarios?: string | null;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  site?: string;
}) {
  const env = await callRPC<UserCompanySettingsRow>('upsert_configuracao_empresa_usuario', {
    p_fk_usuarios: params.idUsuarios ?? null,
    p_razao_social: params.razaoSocial,
    p_nome_fantasia: params.nomeFantasia,
    p_cnpj: params.cnpj,
    p_inscricao_estadual: params.inscricaoEstadual ?? '',
    p_inscricao_municipal: params.inscricaoMunicipal ?? '',
    p_endereco: params.endereco ?? '',
    p_cidade: params.cidade ?? '',
    p_estado: params.estado ?? '',
    p_cep: params.cep ?? '',
    p_telefone: params.telefone ?? '',
    p_email: params.email ?? '',
    p_site: params.site ?? '',
  });
  return toCompanySettings(extractDados(env, 'upsert_configuracao_empresa_usuario'));
}

export interface SafeCompanySettingsPayload {
  idUsuarios?: string | null;
  nomeFantasia?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  site?: string;
  instagram?: string;
  horarioAtendimento?: string;
  mensagemAtendimento?: string;
  observacaoDocumentos?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
}

export async function upsertConfiguracaoEmpresaCliente(params: SafeCompanySettingsPayload) {
  const payload = {
    ...(params.nomeFantasia !== undefined ? { nome_fantasia: params.nomeFantasia } : {}),
    ...(params.endereco !== undefined ? { endereco: params.endereco } : {}),
    ...(params.cidade !== undefined ? { cidade: params.cidade } : {}),
    ...(params.estado !== undefined ? { estado: params.estado } : {}),
    ...(params.cep !== undefined ? { cep: params.cep } : {}),
    ...(params.telefone !== undefined ? { telefone: params.telefone } : {}),
    ...(params.whatsapp !== undefined ? { whatsapp: params.whatsapp } : {}),
    ...(params.email !== undefined ? { email: params.email } : {}),
    ...(params.site !== undefined ? { site: params.site } : {}),
    ...(params.instagram !== undefined ? { instagram: params.instagram } : {}),
    ...(params.horarioAtendimento !== undefined ? { horario_atendimento: params.horarioAtendimento } : {}),
    ...(params.mensagemAtendimento !== undefined ? { mensagem_atendimento: params.mensagemAtendimento } : {}),
    ...(params.observacaoDocumentos !== undefined ? { observacao_documentos: params.observacaoDocumentos } : {}),
    ...(params.brandPrimaryColor !== undefined ? { brand_primary_color: params.brandPrimaryColor } : {}),
    ...(params.brandSecondaryColor !== undefined ? { brand_secondary_color: params.brandSecondaryColor } : {}),
  };

  const env = await callRPC<UserCompanySettingsRow>('upsert_configuracao_empresa_cliente', {
    p_fk_usuarios: params.idUsuarios ?? null,
    p_payload: payload,
  });
  return toCompanySettings(extractDados(env, 'upsert_configuracao_empresa_cliente'));
}
