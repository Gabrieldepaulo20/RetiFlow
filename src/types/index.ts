export type UserRole = 'ADMIN' | 'FINANCEIRO' | 'PRODUCAO' | 'RECEPCAO';
export type AuthMode = 'development' | 'real';
export type AppModuleKey = 'dashboard' | 'clients' | 'notes' | 'kanban' | 'closing' | 'invoices' | 'settings' | 'admin';
export type Permission =
  | 'dashboard.view'
  | 'clients.view'
  | 'clients.manage'
  | 'notes.view'
  | 'notes.manage'
  | 'notes.status.manage'
  | 'notes.attachments.view'
  | 'kanban.view'
  | 'kanban.manage'
  | 'closing.view'
  | 'invoices.view'
  | 'settings.view'
  | 'admin.access';

export type NoteType = 'SERVICO' | 'COMPRA';

export type NoteStatus = 'ABERTO' | 'EM_ANALISE' | 'ORCAMENTO' | 'APROVADO' | 'EM_EXECUCAO' | 'AGUARDANDO_COMPRA' | 'PRONTO' | 'ENTREGUE' | 'FINALIZADO' | 'CANCELADO' | 'DESCARTADO' | 'SEM_CONSERTO';

export type DocType = 'CPF' | 'CNPJ';
export type AttachmentType = 'PHOTO' | 'PDF' | 'XML' | 'OTHER';
export type InvoiceType = 'NFE' | 'NFSE' | 'RECIBO';
export type InvoiceStatus = 'REGISTRADA' | 'ENVIADA' | 'CANCELADA';
export type PdfFormat = 'A4' | 'A5';

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  phone?: string;
}

export type User = SystemUser;

export interface AuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
}

export interface AuthSession {
  user: SystemUser;
  mode: AuthMode;
  tokens: AuthTokens;
  authenticatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface Customer {
  id: string;
  name: string;
  tradeName?: string;
  docType: DocType;
  docNumber: string;
  phone: string;
  email: string;
  cep?: string;
  address: string;
  addressNumber?: string;
  district?: string;
  city: string;
  state: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
}

export type Client = Customer;

export interface IntakeNote {
  id: string;
  number: string;
  clientId: string;
  createdAt: string;
  createdByUserId: string;
  status: NoteStatus;
  type: NoteType;
  parentNoteId?: string;
  previousStatus?: NoteStatus;
  engineType: string;
  vehicleModel: string;
  plate?: string;
  km?: number;
  complaint: string;
  observations: string;
  totalServices: number;
  totalProducts: number;
  totalAmount: number;
  pdfUrl?: string;
  pdfFormat?: PdfFormat;
  finalizedAt?: string;
  updatedAt: string;
}

export interface IntakeService {
  id: string;
  noteId: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface IntakeProduct {
  id: string;
  noteId: string;
  name: string;
  sku?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Attachment {
  id: string;
  noteId?: string;
  clientId?: string;
  type: AttachmentType;
  filename: string;
  url: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  noteId?: string;
  clientId: string;
  type: InvoiceType;
  /** Número da NF (ex: "000001234") */
  number?: string;
  /** Série da NF (ex: "001") */
  series?: string;
  /** Chave de acesso de 44 dígitos (NF-e) */
  accessKey?: string;
  /** Competência no formato YYYY-MM (para NFS-e) */
  competencia?: string;
  issueDate: string;
  amount: number;
  /** Descrição resumida dos serviços/produtos */
  description?: string;
  /** CNPJ do emitente */
  cnpjEmitter?: string;
  /** Inscrição municipal do emitente */
  municipalReg?: string;
  /** Inscrição estadual do emitente */
  stateReg?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  status: InvoiceStatus;
  /** ID no NFE.io após emissão via API */
  nfeIoId?: string;
  /** Status retornado pelo NFE.io */
  nfeIoStatus?: string;
  /** Timestamp de emissão confirmado pelo NFE.io */
  nfeIoEmittedAt?: string;
}

export interface ActivityLog {
  id: string;
  noteId?: string;
  message: string;
  userId: string;
  createdAt: string;
}

export type RoleModuleConfig = Record<UserRole, Partial<Record<AppModuleKey, boolean>>>;
export type UserModuleOverrides = Record<string, Partial<Record<AppModuleKey, boolean>>>;

/** Fluxo principal (colunas do Kanban na ordem) */
export const NOTE_STATUS_ORDER: NoteStatus[] = [
  'ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'AGUARDANDO_COMPRA', 'PRONTO', 'ENTREGUE', 'FINALIZADO',
  'CANCELADO', 'DESCARTADO', 'SEM_CONSERTO'
];

/** Estágios finais — não permitem transição de saída */
export const FINAL_STATUSES: ReadonlySet<NoteStatus> = new Set([
  'FINALIZADO', 'CANCELADO', 'DESCARTADO', 'SEM_CONSERTO'
]);

/** Transições permitidas a partir de cada estágio */
export const ALLOWED_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  ABERTO:            ['EM_ANALISE', 'DESCARTADO'],
  EM_ANALISE:        ['ORCAMENTO', 'DESCARTADO'],
  ORCAMENTO:         ['APROVADO', 'CANCELADO', 'DESCARTADO', 'AGUARDANDO_COMPRA'],
  APROVADO:          ['EM_EXECUCAO', 'DESCARTADO', 'AGUARDANDO_COMPRA'],
  EM_EXECUCAO:       ['PRONTO', 'SEM_CONSERTO', 'DESCARTADO', 'AGUARDANDO_COMPRA'],
  AGUARDANDO_COMPRA: [],
  PRONTO:            ['ENTREGUE', 'DESCARTADO'],
  ENTREGUE:          ['FINALIZADO', 'DESCARTADO'],
  FINALIZADO:        [],
  CANCELADO:         [],
  DESCARTADO:        [],
  SEM_CONSERTO:      [],
};

export const STATUS_LABELS: Record<NoteStatus, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em Análise',
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_EXECUCAO: 'Em Execução',
  AGUARDANDO_COMPRA: 'Aguardando Compra',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
  DESCARTADO: 'Descartado',
  SEM_CONSERTO: 'Sem Conserto',
};

export const STATUS_COLORS: Record<NoteStatus, string> = {
  ABERTO: 'bg-info text-info-foreground',
  EM_ANALISE: 'bg-warning text-warning-foreground',
  ORCAMENTO: 'bg-orange-100 text-orange-800',
  APROVADO: 'bg-primary text-primary-foreground',
  EM_EXECUCAO: 'bg-accent text-accent-foreground',
  AGUARDANDO_COMPRA: 'bg-yellow-100 text-yellow-800',
  PRONTO: 'bg-success text-success-foreground',
  ENTREGUE: 'bg-secondary text-secondary-foreground',
  FINALIZADO: 'bg-muted text-muted-foreground',
  CANCELADO: 'bg-destructive text-destructive-foreground',
  DESCARTADO: 'bg-zinc-200 text-zinc-700',
  SEM_CONSERTO: 'bg-rose-100 text-rose-800',
};

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  SERVICO: 'Serviço',
  COMPRA: 'Compra',
};

// ─── Monthly Closing Domain ────────────────────────────────────────────────

export interface ClosingService {
  name: string;
  price: number;
  quantity: number;
  discount: number;
  discountType: 'percent' | 'value';
}

export interface ClosingNote {
  id: string;
  number: string;
  total: number;
  services: ClosingService[];
}

export type ClosingLogType =
  | 'generated'
  | 'edited'
  | 'regenerated'
  | 'downloaded'
  | 'previewed'
  | 'shared'
  | 'printed'
  | 'emailed';

export interface ClosingLogEntry {
  id: string;
  type: ClosingLogType;
  message: string;
  createdAt: string;
}

export interface ClosingRecord {
  id: string;
  label: string;
  period: string;
  clientId: string;
  clientName: string;
  notes: ClosingNote[];
  total: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  regenerationCount: number;
  editCount: number;
  downloadCount: number;
  logs: ClosingLogEntry[];
}
