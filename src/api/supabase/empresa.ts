import { callRPC, extractDados } from './_base';

export interface UserCompanySettings {
  fkUsuarios: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  email: string;
  site: string;
  updatedAt: string | null;
}

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
  email: string;
  site: string;
  updated_at: string | null;
}

export const DEFAULT_USER_COMPANY_SETTINGS: Omit<UserCompanySettings, 'fkUsuarios' | 'updatedAt'> = {
  razaoSocial: '59.540.218 GABRIEL WILLIAM DE PAULO',
  nomeFantasia: 'GAWI',
  cnpj: '59.540.218/0001-81',
  inscricaoEstadual: '',
  inscricaoMunicipal: '',
  endereco: '',
  cidade: '',
  estado: '',
  cep: '',
  telefone: '(16) 98840-5275',
  email: 'gabrielwilliam208@gmail.com',
  site: '',
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
  email: row.email,
  site: row.site,
  updatedAt: row.updated_at,
});

export async function getConfiguracaoEmpresaUsuario(idUsuarios?: string | null) {
  const env = await callRPC<UserCompanySettingsRow>('get_configuracao_empresa_usuario', {
    p_fk_usuarios: idUsuarios ?? null,
  });
  return toCompanySettings(extractDados(env, 'get_configuracao_empresa_usuario'));
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
