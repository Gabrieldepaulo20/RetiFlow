export type DocumentType =
  | 'entry_note'
  | 'exit_note'
  | 'closing_report'
  | 'service_order'
  | 'receipt'
  | 'quote'
  | 'report';

export type DocumentTemplateStatus = 'draft' | 'active' | 'archived';
export type DocumentLayoutStyle = 'classic' | 'modern' | 'compact' | 'premium' | 'minimal' | 'colorful';
export type DocumentDensity = 'compact' | 'normal' | 'detailed';
export type DocumentTableStyle = 'classic' | 'striped' | 'lined' | 'minimal';
export type DocumentTotalStyle = 'boxed' | 'highlight' | 'minimal';

const DOCUMENT_LAYOUT_STYLES = ['classic', 'modern', 'compact', 'premium', 'minimal', 'colorful'] as const;
const DOCUMENT_DENSITIES = ['compact', 'normal', 'detailed'] as const;
const DOCUMENT_LOGO_SIZES = ['small', 'medium', 'large'] as const;
const DOCUMENT_ALIGNMENTS = ['left', 'center', 'right'] as const;
const DOCUMENT_HEADER_STYLES = ['split', 'solid', 'minimal'] as const;
const DOCUMENT_TABLE_STYLES = ['classic', 'striped', 'lined', 'minimal'] as const;
const DOCUMENT_TOTAL_STYLES = ['boxed', 'highlight', 'minimal'] as const;

export interface CompanyDocumentSettings {
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
  whatsapp: string;
  email: string;
  site: string;
  instagram: string;
  horarioAtendimento: string;
  mensagemAtendimento: string;
  observacaoDocumentos: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  updatedAt: string | null;
}

export interface DocumentThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headerBackgroundColor: string;
  headerTextColor: string;
  borderColor: string;
  layoutStyle?: DocumentLayoutStyle;
  tableStyle?: DocumentTableStyle;
  totalStyle?: DocumentTotalStyle;
}

export interface DocumentTemplateConfig {
  title: string;
  subtitle: string;
  description: string;
  introText: string;
  finalText: string;
  defaultObservation: string;
  termsText: string;
  footerText: string;
  thankYouText: string;
  layoutStyle: DocumentLayoutStyle;
  density: DocumentDensity;
  showLogo: boolean;
  logoSize: 'small' | 'medium' | 'large';
  logoAlignment: 'left' | 'center' | 'right';
  showCompanyData: boolean;
  showFooter: boolean;
  headerStyle: 'split' | 'solid' | 'minimal';
  tableStyle: DocumentTableStyle;
  totalStyle: DocumentTotalStyle;
  theme: DocumentThemeConfig;
}

export interface DocumentTemplateRecord {
  id: string;
  fkUsuarios: string;
  documentType: DocumentType;
  name: string;
  status: DocumentTemplateStatus;
  version: number;
  config: PartialDocumentTemplateConfig;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
}

export interface DocumentThemeRecord {
  id: string;
  fkUsuarios: string;
  name: string;
  config: Partial<DocumentThemeConfig>;
  appliesTo: DocumentType[];
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsAuditRecord {
  id: string;
  fkUsuarios: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface ResolvedDocumentCustomization {
  fkUsuarios: string;
  documentType: DocumentType;
  company: CompanyDocumentSettings;
  template: DocumentTemplateRecord | null;
  theme: DocumentThemeRecord | null;
  resolvedConfig: DocumentTemplateConfig;
}

export type PartialDocumentTemplateConfig = Partial<Omit<DocumentTemplateConfig, 'theme'>> & {
  theme?: Partial<DocumentThemeConfig>;
};

export const DOCUMENT_TYPE_OPTIONS: Array<{ value: DocumentType; label: string; shortLabel: string }> = [
  { value: 'entry_note', label: 'Nota de entrada / O.S.', shortLabel: 'O.S.' },
  { value: 'closing_report', label: 'Fechamento', shortLabel: 'Fechamento' },
  { value: 'receipt', label: 'Recibo', shortLabel: 'Recibo' },
  { value: 'quote', label: 'Orçamento', shortLabel: 'Orçamento' },
  { value: 'report', label: 'Relatório', shortLabel: 'Relatório' },
];

export const ACTIVE_DOCUMENT_TYPES: DocumentType[] = ['entry_note', 'closing_report'];

export const TEMPLATE_VARIABLES = [
  { key: 'company_name', label: 'Nome da empresa', fallback: 'Retífica Premium' },
  { key: 'company_phone', label: 'Telefone da empresa', fallback: '(16) 3524-4661' },
  { key: 'company_whatsapp', label: 'WhatsApp da empresa', fallback: '(16) 3524-4661' },
  { key: 'customer_name', label: 'Cliente', fallback: 'João da Silva' },
  { key: 'vehicle_plate', label: 'Placa', fallback: 'ABC1D23' },
  { key: 'service_order_number', label: 'Número da O.S.', fallback: 'OS-99' },
  { key: 'entry_note_number', label: 'Nota de entrada', fallback: 'OS-99' },
  { key: 'closing_number', label: 'Fechamento', fallback: 'FECH-2026-06' },
  { key: 'current_date', label: 'Data atual', fallback: '10/06/2026' },
  { key: 'total_amount', label: 'Valor total', fallback: 'R$ 1.250,00' },
] as const;

export type TemplateVariableKey = typeof TEMPLATE_VARIABLES[number]['key'];

export const TEMPLATE_VARIABLE_KEYS = TEMPLATE_VARIABLES.map((variable) => variable.key) as TemplateVariableKey[];

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const UNSAFE_TEMPLATE_PATTERN = /<script|javascript:|on[a-z]+\s*=|<\/?[a-z][^>]*>/i;
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const TEMPLATE_CONFIG_KEYS = new Set([
  'title',
  'subtitle',
  'description',
  'introText',
  'finalText',
  'defaultObservation',
  'termsText',
  'footerText',
  'thankYouText',
  'layoutStyle',
  'density',
  'showLogo',
  'logoSize',
  'logoAlignment',
  'showCompanyData',
  'showFooter',
  'headerStyle',
  'tableStyle',
  'totalStyle',
  'theme',
]);
const TEMPLATE_THEME_KEYS = new Set([
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'headerBackgroundColor',
  'headerTextColor',
  'borderColor',
  'layoutStyle',
  'tableStyle',
  'totalStyle',
]);

const DEFAULT_THEME: DocumentThemeConfig = {
  primaryColor: '#1a7a8a',
  secondaryColor: '#0f7f95',
  accentColor: '#f4b740',
  headerBackgroundColor: '#1a7a8a',
  headerTextColor: '#ffffff',
  borderColor: '#d6e3e8',
  layoutStyle: 'classic',
  tableStyle: 'classic',
  totalStyle: 'boxed',
};

export const DOCUMENT_THEME_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  config: DocumentThemeConfig;
  seasonal?: boolean;
  startMonthDay?: string;
  endMonthDay?: string;
}> = [
  {
    id: 'system',
    name: 'Padrão do sistema',
    description: 'Azul técnico, limpo e estável para uso diário.',
    config: DEFAULT_THEME,
  },
  {
    id: 'classic',
    name: 'Clássico',
    description: 'Contraste discreto e tabelas tradicionais.',
    config: { ...DEFAULT_THEME, primaryColor: '#2f4858', secondaryColor: '#52616b', accentColor: '#9aa5ad', headerBackgroundColor: '#2f4858' },
  },
  {
    id: 'modern',
    name: 'Moderno',
    description: 'Cabeçalho forte, bordas leves e leitura rápida.',
    config: { ...DEFAULT_THEME, primaryColor: '#0f7f95', secondaryColor: '#12343b', accentColor: '#38bdf8', headerBackgroundColor: '#0f7f95', tableStyle: 'striped', totalStyle: 'highlight', layoutStyle: 'modern' },
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Tons profundos com destaque dourado.',
    config: { ...DEFAULT_THEME, primaryColor: '#243447', secondaryColor: '#111827', accentColor: '#d6a84f', headerBackgroundColor: '#243447', layoutStyle: 'premium' },
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    description: 'Menos cor, mais espaço e impressão econômica.',
    config: { ...DEFAULT_THEME, primaryColor: '#475569', secondaryColor: '#0f172a', accentColor: '#94a3b8', headerBackgroundColor: '#f8fafc', headerTextColor: '#0f172a', tableStyle: 'minimal', totalStyle: 'minimal', layoutStyle: 'minimal' },
  },
  {
    id: 'setembro-amarelo',
    name: 'Setembro Amarelo',
    description: 'Tema sazonal amarelo com contraste escuro.',
    seasonal: true,
    startMonthDay: '09-01',
    endMonthDay: '09-30',
    config: { ...DEFAULT_THEME, primaryColor: '#f5c542', secondaryColor: '#2b2b2b', accentColor: '#fff4c2', headerBackgroundColor: '#f5c542', headerTextColor: '#2b2b2b', borderColor: '#e7b931' },
  },
  {
    id: 'outubro-rosa',
    name: 'Outubro Rosa',
    description: 'Rosa suave para campanhas de conscientização.',
    seasonal: true,
    startMonthDay: '10-01',
    endMonthDay: '10-31',
    config: { ...DEFAULT_THEME, primaryColor: '#d94684', secondaryColor: '#831843', accentColor: '#fbcfe8', headerBackgroundColor: '#d94684', borderColor: '#f9a8d4' },
  },
  {
    id: 'novembro-azul',
    name: 'Novembro Azul',
    description: 'Azul vivo com leitura firme para documentos.',
    seasonal: true,
    startMonthDay: '11-01',
    endMonthDay: '11-30',
    config: { ...DEFAULT_THEME, primaryColor: '#2563eb', secondaryColor: '#172554', accentColor: '#bfdbfe', headerBackgroundColor: '#2563eb', borderColor: '#93c5fd' },
  },
  {
    id: 'natal',
    name: 'Natal',
    description: 'Verde escuro com destaque vermelho discreto.',
    seasonal: true,
    startMonthDay: '12-01',
    endMonthDay: '12-31',
    config: { ...DEFAULT_THEME, primaryColor: '#166534', secondaryColor: '#7f1d1d', accentColor: '#dc2626', headerBackgroundColor: '#166534', borderColor: '#bbf7d0' },
  },
  {
    id: 'ano-novo',
    name: 'Ano Novo',
    description: 'Claro, limpo e com acento azul para virada de ciclo.',
    seasonal: true,
    startMonthDay: '01-01',
    endMonthDay: '01-10',
    config: { ...DEFAULT_THEME, primaryColor: '#0ea5e9', secondaryColor: '#334155', accentColor: '#f8fafc', headerBackgroundColor: '#0ea5e9', borderColor: '#bae6fd' },
  },
];

export function isDocumentType(value: string): value is DocumentType {
  return DOCUMENT_TYPE_OPTIONS.some((option) => option.value === value)
    || value === 'exit_note'
    || value === 'service_order';
}

export function getDocumentTypeLabel(documentType: DocumentType) {
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.label ?? documentType;
}

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function normalizeHexColor(value: string | null | undefined, fallback = '#1a7a8a') {
  const trimmed = value?.trim() ?? '';
  return isHexColor(trimmed) ? trimmed : fallback;
}

export function containsUnsafeTemplateContent(value: string | null | undefined) {
  return UNSAFE_TEMPLATE_PATTERN.test(value ?? '');
}

export function sanitizeDocumentText(value: string | null | undefined, maxLength = 500) {
  const withoutControlChars = Array.from(value ?? '')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');

  return withoutControlChars
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function extractTemplateVariables(value: string | null | undefined) {
  const variables = new Set<string>();
  const source = value ?? '';
  for (const match of source.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    if (match[1]) variables.add(match[1]);
  }
  return Array.from(variables);
}

export function getInvalidTemplateVariables(value: string | null | undefined) {
  return extractTemplateVariables(value).filter((variable) => !TEMPLATE_VARIABLE_KEYS.includes(variable as TemplateVariableKey));
}

export function renderTemplateText(
  value: string,
  variables: Partial<Record<TemplateVariableKey, string | number | null | undefined>>,
) {
  return value.replace(TEMPLATE_VARIABLE_PATTERN, (_, key: string) => {
    if (!TEMPLATE_VARIABLE_KEYS.includes(key as TemplateVariableKey)) return '';
    const variable = TEMPLATE_VARIABLES.find((candidate) => candidate.key === key);
    const replacement = variables[key as TemplateVariableKey];
    if (replacement === null || replacement === undefined || String(replacement).trim() === '') {
      return variable?.fallback ?? '';
    }
    return String(replacement);
  });
}

export function getDefaultDocumentTemplateConfig(documentType: DocumentType): DocumentTemplateConfig {
  if (documentType === 'closing_report') {
    return {
      title: 'Fechamento',
      subtitle: 'Resumo dos serviços executados e valores do período.',
      description: 'Confira todos os serviços antes de confirmar o fechamento.',
      introText: 'Resumo dos serviços executados e valores do período.',
      finalText: '',
      defaultObservation: 'Documento gerado automaticamente pelo sistema.',
      termsText: '',
      footerText: 'Obrigado pela preferência.',
      thankYouText: '',
      layoutStyle: 'modern',
      density: 'normal',
      showLogo: true,
      logoSize: 'medium',
      logoAlignment: 'left',
      showCompanyData: true,
      showFooter: true,
      headerStyle: 'solid',
      tableStyle: 'striped',
      totalStyle: 'highlight',
      theme: { ...DEFAULT_THEME, primaryColor: '#0f7f95', headerBackgroundColor: '#0f7f95' },
    };
  }

  return {
    title: 'Nota de Entrada',
    subtitle: 'Ordem de Serviço',
    description: 'Recebemos os itens abaixo para análise e execução dos serviços.',
    introText: 'Recebemos os itens abaixo para análise e execução dos serviços.',
    finalText: '',
    defaultObservation: 'A desmontagem será realizada mediante autorização.',
    termsText: 'Declaro estar ciente das condições de serviço.',
    footerText: 'Obrigado pela preferência.',
    thankYouText: 'Agradecemos a confiança.',
    layoutStyle: 'classic',
    density: 'normal',
    showLogo: true,
    logoSize: 'medium',
    logoAlignment: 'left',
    showCompanyData: true,
    showFooter: true,
    headerStyle: 'split',
    tableStyle: 'classic',
    totalStyle: 'boxed',
    theme: { ...DEFAULT_THEME },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(value: unknown, fallback: string, maxLength = 500) {
  return typeof value === 'string' ? sanitizeDocumentText(value, maxLength) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizeDocumentTemplateConfig(
  documentType: DocumentType,
  input?: PartialDocumentTemplateConfig | Record<string, unknown> | null,
): DocumentTemplateConfig {
  const defaults = getDefaultDocumentTemplateConfig(documentType);
  const source = isRecord(input) ? input : {};
  const themeSource = isRecord(source.theme) ? source.theme : {};

  return {
    title: pickString(source.title, defaults.title, 80),
    subtitle: pickString(source.subtitle, defaults.subtitle, 140),
    description: pickString(source.description, defaults.description, 240),
    introText: pickString(source.introText, defaults.introText, 500),
    finalText: pickString(source.finalText, defaults.finalText, 500),
    defaultObservation: pickString(source.defaultObservation, defaults.defaultObservation, 700),
    termsText: pickString(source.termsText, defaults.termsText, 900),
    footerText: pickString(source.footerText, defaults.footerText, 500),
    thankYouText: pickString(source.thankYouText, defaults.thankYouText, 260),
    layoutStyle: pickEnum(source.layoutStyle, DOCUMENT_LAYOUT_STYLES, defaults.layoutStyle),
    density: pickEnum(source.density, DOCUMENT_DENSITIES, defaults.density),
    showLogo: pickBoolean(source.showLogo, defaults.showLogo),
    logoSize: pickEnum(source.logoSize, DOCUMENT_LOGO_SIZES, defaults.logoSize),
    logoAlignment: pickEnum(source.logoAlignment, DOCUMENT_ALIGNMENTS, defaults.logoAlignment),
    showCompanyData: pickBoolean(source.showCompanyData, defaults.showCompanyData),
    showFooter: pickBoolean(source.showFooter, defaults.showFooter),
    headerStyle: pickEnum(source.headerStyle, DOCUMENT_HEADER_STYLES, defaults.headerStyle),
    tableStyle: pickEnum(source.tableStyle, DOCUMENT_TABLE_STYLES, defaults.tableStyle),
    totalStyle: pickEnum(source.totalStyle, DOCUMENT_TOTAL_STYLES, defaults.totalStyle),
    theme: {
      primaryColor: normalizeHexColor(themeSource.primaryColor as string | undefined, defaults.theme.primaryColor),
      secondaryColor: normalizeHexColor(themeSource.secondaryColor as string | undefined, defaults.theme.secondaryColor),
      accentColor: normalizeHexColor(themeSource.accentColor as string | undefined, defaults.theme.accentColor),
      headerBackgroundColor: normalizeHexColor(themeSource.headerBackgroundColor as string | undefined, defaults.theme.headerBackgroundColor),
      headerTextColor: normalizeHexColor(themeSource.headerTextColor as string | undefined, defaults.theme.headerTextColor),
      borderColor: normalizeHexColor(themeSource.borderColor as string | undefined, defaults.theme.borderColor),
      layoutStyle: pickEnum(themeSource.layoutStyle, DOCUMENT_LAYOUT_STYLES, defaults.theme.layoutStyle ?? defaults.layoutStyle),
      tableStyle: pickEnum(themeSource.tableStyle, DOCUMENT_TABLE_STYLES, defaults.theme.tableStyle ?? defaults.tableStyle),
      totalStyle: pickEnum(themeSource.totalStyle, DOCUMENT_TOTAL_STYLES, defaults.theme.totalStyle ?? defaults.totalStyle),
    },
  };
}

export function validateDocumentTemplateConfig(config: PartialDocumentTemplateConfig | Record<string, unknown>) {
  const serialized = JSON.stringify(config);
  const errors: string[] = [];

  if (serialized.length > 12000) {
    errors.push('A configuração ultrapassa o limite de tamanho.');
  }

  if (containsUnsafeTemplateContent(serialized)) {
    errors.push('Não use HTML, JavaScript ou atributos de script nos textos.');
  }

  for (const key of Object.keys(config)) {
    if (!TEMPLATE_CONFIG_KEYS.has(key)) {
      errors.push(`Campo não permitido no modelo: ${key}.`);
    }
  }

  for (const value of Object.values(config)) {
    if (typeof value !== 'string') continue;
    const invalid = getInvalidTemplateVariables(value);
    if (invalid.length > 0) {
      errors.push(`Variável inválida: ${invalid.join(', ')}`);
    }
  }

  if (isRecord(config.theme)) {
    for (const [key, value] of Object.entries(config.theme)) {
      if (!TEMPLATE_THEME_KEYS.has(key)) {
        errors.push(`Campo não permitido no tema: ${key}.`);
      }
      if (key.toLowerCase().includes('color') && typeof value === 'string' && !isHexColor(value)) {
        errors.push(`Cor inválida em ${key}.`);
      }
    }
  } else if ('theme' in config && config.theme !== undefined && config.theme !== null) {
    errors.push('Tema do documento deve ser um objeto.');
  }

  return { ok: errors.length === 0, errors };
}

export function buildFallbackCompanySettings(fkUsuarios = 'current'): CompanyDocumentSettings {
  return {
    fkUsuarios,
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
    whatsapp: '',
    email: 'gabrielwilliam208@gmail.com',
    site: '',
    instagram: '',
    horarioAtendimento: '',
    mensagemAtendimento: '',
    observacaoDocumentos: '',
    brandPrimaryColor: '#1a7a8a',
    brandSecondaryColor: '#0f7f95',
    updatedAt: null,
  };
}

export function buildFallbackResolvedCustomization(
  documentType: DocumentType,
  fkUsuarios = 'current',
): ResolvedDocumentCustomization {
  const company = buildFallbackCompanySettings(fkUsuarios);
  return {
    fkUsuarios,
    documentType,
    company,
    template: null,
    theme: null,
    resolvedConfig: normalizeDocumentTemplateConfig(documentType, {
      theme: {
        primaryColor: company.brandPrimaryColor,
        secondaryColor: company.brandSecondaryColor,
        accentColor: company.brandPrimaryColor,
        headerBackgroundColor: company.brandPrimaryColor,
      },
    }),
  };
}

export function getDocumentAccentColor(customization: ResolvedDocumentCustomization | null | undefined, fallback = '#1a7a8a') {
  return normalizeHexColor(customization?.resolvedConfig.theme.primaryColor, fallback);
}
