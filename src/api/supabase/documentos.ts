import { callRPC, extractDados } from './_base';
import {
  buildFallbackResolvedCustomization,
  buildFallbackCompanySettings,
  isDocumentType,
  normalizeDocumentTemplateConfig,
  type CompanyDocumentSettings,
  type DocumentTemplateRecord,
  type DocumentThemeRecord,
  type DocumentType,
  type PartialDocumentTemplateConfig,
  type ResolvedDocumentCustomization,
  type SettingsAuditRecord,
} from '@/services/domain/documentCustomization';

type JsonRecord = Record<string, unknown>;

interface DocumentTemplateRow {
  id_templates_documentos_usuario: string;
  fk_usuarios: string;
  document_type: string;
  name: string;
  status: string;
  version: number;
  config_json: JsonRecord | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

interface DocumentThemeRow {
  id_temas_documentos_usuario: string;
  fk_usuarios: string;
  name: string;
  config_json: JsonRecord | null;
  applies_to_json: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SettingsAuditRow {
  id_logs_configuracoes_usuario: string;
  fk_usuarios: string;
  fk_actor_usuarios: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: JsonRecord | null;
  after_json: JsonRecord | null;
  created_at: string;
}

interface CompanySettingsRow {
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
  whatsapp: string;
  email: string;
  site: string;
  instagram: string;
  horario_atendimento: string;
  mensagem_atendimento: string;
  observacao_documentos: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  updated_at: string | null;
}

interface ResolvedDocumentRow {
  fk_usuarios: string;
  document_type: string;
  company: CompanySettingsRow;
  template: DocumentTemplateRow | null;
  theme: DocumentThemeRow | null;
  resolved_config: JsonRecord | null;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function toDocumentType(value: string | null | undefined, fallback: DocumentType): DocumentType {
  return value && isDocumentType(value) ? value : fallback;
}

export function toCompanyDocumentSettings(row: CompanySettingsRow | null | undefined): CompanyDocumentSettings {
  if (!row) return buildFallbackCompanySettings();
  return {
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
    whatsapp: row.whatsapp,
    email: row.email,
    site: row.site,
    instagram: row.instagram,
    horarioAtendimento: row.horario_atendimento,
    mensagemAtendimento: row.mensagem_atendimento,
    observacaoDocumentos: row.observacao_documentos,
    brandPrimaryColor: row.brand_primary_color,
    brandSecondaryColor: row.brand_secondary_color,
    updatedAt: row.updated_at,
  };
}

function toTemplateRecord(row: DocumentTemplateRow, fallbackDocumentType: DocumentType): DocumentTemplateRecord {
  const documentType = toDocumentType(row.document_type, fallbackDocumentType);
  return {
    id: row.id_templates_documentos_usuario,
    fkUsuarios: row.fk_usuarios,
    documentType,
    name: row.name,
    status: row.status === 'active' || row.status === 'archived' ? row.status : 'draft',
    version: row.version,
    config: isRecord(row.config_json) ? row.config_json : {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
  };
}

function toThemeRecord(row: DocumentThemeRow): DocumentThemeRecord {
  return {
    id: row.id_temas_documentos_usuario,
    fkUsuarios: row.fk_usuarios,
    name: row.name,
    config: isRecord(row.config_json) ? row.config_json : {},
    appliesTo: Array.isArray(row.applies_to_json)
      ? row.applies_to_json.filter(isDocumentType)
      : [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAuditRecord(row: SettingsAuditRow): SettingsAuditRecord {
  return {
    id: row.id_logs_configuracoes_usuario,
    fkUsuarios: row.fk_usuarios,
    actorUserId: row.fk_actor_usuarios,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before_json,
    after: row.after_json,
    createdAt: row.created_at,
  };
}

function toResolvedCustomization(row: ResolvedDocumentRow, fallbackDocumentType: DocumentType): ResolvedDocumentCustomization {
  const documentType = toDocumentType(row.document_type, fallbackDocumentType);
  const company = toCompanyDocumentSettings(row.company);
  const template = row.template ? toTemplateRecord(row.template, documentType) : null;
  const theme = row.theme ? toThemeRecord(row.theme) : null;

  return {
    fkUsuarios: row.fk_usuarios,
    documentType,
    company,
    template,
    theme,
    resolvedConfig: normalizeDocumentTemplateConfig(documentType, row.resolved_config ?? undefined),
  };
}

export async function getModelosDocumentosUsuario(idUsuarios?: string | null) {
  const env = await callRPC<DocumentTemplateRow[]>('get_modelos_documentos_usuario', {
    p_fk_usuarios: idUsuarios ?? null,
  });
  return (env.dados ?? []).map((row) => toTemplateRecord(row, 'entry_note'));
}

export async function salvarRascunhoModeloDocumento(params: {
  idUsuarios?: string | null;
  documentType: DocumentType;
  name: string;
  config: PartialDocumentTemplateConfig;
}) {
  const env = await callRPC<DocumentTemplateRow>('salvar_rascunho_modelo_documento', {
    p_fk_usuarios: params.idUsuarios ?? null,
    p_document_type: params.documentType,
    p_name: params.name,
    p_config_json: params.config,
  });
  return toTemplateRecord(extractDados(env, 'salvar_rascunho_modelo_documento'), params.documentType);
}

export async function publicarModeloDocumento(templateId: string) {
  const env = await callRPC<DocumentTemplateRow>('publicar_modelo_documento', {
    p_id_template: templateId,
  });
  return toTemplateRecord(extractDados(env, 'publicar_modelo_documento'), 'entry_note');
}

export async function restaurarModeloDocumentoPadrao(params: {
  idUsuarios?: string | null;
  documentType: DocumentType;
}) {
  const env = await callRPC<DocumentTemplateRow>('restaurar_modelo_documento_padrao', {
    p_fk_usuarios: params.idUsuarios ?? null,
    p_document_type: params.documentType,
  });
  return toTemplateRecord(extractDados(env, 'restaurar_modelo_documento_padrao'), params.documentType);
}

export async function getTemasDocumentosUsuario(idUsuarios?: string | null) {
  const env = await callRPC<DocumentThemeRow[]>('get_temas_documentos_usuario', {
    p_fk_usuarios: idUsuarios ?? null,
  });
  return (env.dados ?? []).map(toThemeRecord);
}

export async function salvarTemaDocumento(params: {
  idUsuarios?: string | null;
  themeId?: string | null;
  name: string;
  config: DocumentThemeRecord['config'];
  appliesTo: DocumentType[];
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
}) {
  const env = await callRPC<DocumentThemeRow>('salvar_tema_documento', {
    p_fk_usuarios: params.idUsuarios ?? null,
    p_id_tema: params.themeId ?? null,
    p_name: params.name,
    p_config_json: params.config,
    p_applies_to_json: params.appliesTo,
    p_starts_at: params.startsAt ?? null,
    p_ends_at: params.endsAt ?? null,
    p_is_active: params.isActive,
  });
  return toThemeRecord(extractDados(env, 'salvar_tema_documento'));
}

export async function ativarTemaDocumento(themeId: string, isActive: boolean) {
  const env = await callRPC<DocumentThemeRow>('ativar_tema_documento', {
    p_id_tema: themeId,
    p_is_active: isActive,
  });
  return toThemeRecord(extractDados(env, 'ativar_tema_documento'));
}

export async function resolverConfiguracaoDocumento(params: {
  idUsuarios?: string | null;
  documentType: DocumentType;
  generatedAt?: string | null;
}) {
  const env = await callRPC<ResolvedDocumentRow>('resolver_configuracao_documento', {
    p_fk_usuarios: params.idUsuarios ?? null,
    p_document_type: params.documentType,
    p_generated_at: params.generatedAt ?? null,
  });
  return toResolvedCustomization(extractDados(env, 'resolver_configuracao_documento'), params.documentType);
}

export async function getHistoricoConfiguracoesUsuario(params?: {
  idUsuarios?: string | null;
  limit?: number;
}) {
  const env = await callRPC<SettingsAuditRow[]>('get_historico_configuracoes_usuario', {
    p_fk_usuarios: params?.idUsuarios ?? null,
    p_limite: params?.limit ?? 50,
  });
  return (env.dados ?? []).map(toAuditRecord);
}

export function buildDocumentFallback(documentType: DocumentType, idUsuarios?: string | null) {
  return buildFallbackResolvedCustomization(documentType, idUsuarios ?? 'current');
}
