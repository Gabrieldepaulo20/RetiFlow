import { callRPC, extractDados } from './_base';

export type OsTemplateMode = 'auto' | 'a5_duplo' | 'a4_vertical';
export type ClosingTemplateMode = 'moderno' | 'compacto';

export interface UserTemplateSettings {
  fkUsuarios: string;
  osModelo: OsTemplateMode;
  corDocumento: string;
  fechamentoModelo: ClosingTemplateMode;
  corFechamento: string;
  updatedAt: string | null;
}

interface UserTemplateSettingsRow {
  fk_usuarios: string;
  os_modelo: OsTemplateMode;
  cor_documento: string;
  fechamento_modelo: ClosingTemplateMode;
  cor_fechamento: string;
  updated_at: string | null;
}

export const DEFAULT_USER_TEMPLATE_SETTINGS: Omit<UserTemplateSettings, 'fkUsuarios' | 'updatedAt'> = {
  osModelo: 'auto',
  corDocumento: '#1a7a8a',
  fechamentoModelo: 'moderno',
  corFechamento: '#0f7f95',
};

const toSettings = (row: UserTemplateSettingsRow): UserTemplateSettings => ({
  fkUsuarios: row.fk_usuarios,
  osModelo: row.os_modelo,
  corDocumento: row.cor_documento,
  fechamentoModelo: row.fechamento_modelo,
  corFechamento: row.cor_fechamento,
  updatedAt: row.updated_at,
});

export async function getConfiguracaoModeloUsuario(idUsuarios?: string | null) {
  const env = await callRPC<UserTemplateSettingsRow>('get_configuracao_modelo_usuario', {
    p_fk_usuarios: idUsuarios ?? null,
  });
  return toSettings(extractDados(env, 'get_configuracao_modelo_usuario'));
}

export async function upsertConfiguracaoModeloUsuario(params: {
  idUsuarios?: string | null;
  osModelo: OsTemplateMode;
  corDocumento: string;
  fechamentoModelo: ClosingTemplateMode;
  corFechamento: string;
}) {
  const env = await callRPC<UserTemplateSettingsRow>('upsert_configuracao_modelo_usuario', {
    p_fk_usuarios: params.idUsuarios ?? null,
    p_os_modelo: params.osModelo,
    p_cor_documento: params.corDocumento,
    p_fechamento_modelo: params.fechamentoModelo,
    p_cor_fechamento: params.corFechamento,
  });
  return toSettings(extractDados(env, 'upsert_configuracao_modelo_usuario'));
}
