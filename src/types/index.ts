export type UserRole = 'ADMIN' | 'FINANCEIRO' | 'PRODUCAO' | 'RECEPCAO';
export type AuthMode = 'development' | 'real';
export type AppModuleKey = 'dashboard' | 'clients' | 'notes' | 'kanban' | 'closing' | 'invoices' | 'payables' | 'settings' | 'admin';
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
  | 'payables.view'
  | 'payables.manage'
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
  moduleAccess?: Partial<Record<AppModuleKey, boolean>>;
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
  responsavel?: string;
  totalServices: number;
  totalProducts: number;
  totalAmount: number;
  pdfUrl?: string;
  pdfFormat?: PdfFormat;
  finalizedAt?: string;
  updatedAt: string;
  deadline?: string;
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

// ─── Contas a Pagar ──────────────────────────────────────────────────────────

export type PayableStatus =
  | 'PENDENTE'
  | 'PAGO'
  | 'PARCIAL'
  | 'CANCELADO'
  | 'AGENDADO';

/**
 * Status derivado — NÃO é armazenado.
 * Calculado em runtime: status === 'PENDENTE' && dueDate < hoje → 'VENCIDO'.
 */
export type PayableDisplayStatus = PayableStatus | 'VENCIDO';

export type PaymentMethod =
  | 'PIX'
  | 'BOLETO'
  | 'TRANSFERENCIA'
  | 'CARTAO_CREDITO'
  | 'CARTAO_DEBITO'
  | 'DINHEIRO'
  | 'CHEQUE'
  | 'DEBITO_AUTOMATICO';

export type RecurrenceType =
  | 'NENHUMA'
  | 'SEMANAL'
  | 'QUINZENAL'
  | 'MENSAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL';

/** Tipo do arquivo anexado a uma conta a pagar */
export type PayableAttachmentFileType =
  | 'BOLETO'
  | 'NOTA_FISCAL'
  | 'COMPROVANTE'
  | 'CONTRATO'
  | 'OUTRO';

export type PayableEntrySource =
  | 'MANUAL'
  | 'IA_IMPORT'
  | 'CAMERA_CAPTURE'
  | 'AUTO_SERIES'
  | 'EMAIL_IMPORT';

export type PayableExecutionStatus =
  | 'MANUAL'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'FAILED'
  | 'CANCELLED';

export type PayableReconciliationStatus =
  | 'PENDENTE'
  | 'CONCILIADO'
  | 'DIVERGENTE';

export type PayableHistoryAction =
  | 'CREATED'
  | 'UPDATED'
  | 'PAID'
  | 'PARTIAL_PAID'
  | 'CANCELLED'
  | 'DELETED'
  | 'ATTACHMENT_ADDED';

export interface AccountPayable {
  id: string;
  /** Descrição da despesa. Ex: "Água Março", "Boleto Distribuidora X" */
  title: string;
  /** ID do fornecedor cadastrado — opcional */
  supplierId?: string;
  /** Nome livre do fornecedor quando não há cadastro formal */
  supplierName?: string;
  /** ID da PayableCategory associada */
  categoryId: string;

  /** Número do documento (boleto, NF, guia tributária) */
  docNumber?: string;
  /** Data de emissão do documento (ISO string) */
  issueDate?: string;
  /** Data de vencimento (ISO string) — campo obrigatório */
  dueDate: string;

  /** Valor base da despesa (R$) */
  originalAmount: number;
  /** Juros adicionais em R$ — somados ao finalAmount */
  interest?: number;
  /** Desconto em R$ — subtraído do finalAmount */
  discount?: number;
  /**
   * Valor final calculado: originalAmount + (interest ?? 0) - (discount ?? 0).
   * Sempre >= 0. Calculado e persistido para facilitar consultas.
   */
  finalAmount: number;
  /** Valor efetivamente pago — pode ser menor que finalAmount em pagamento parcial */
  paidAmount?: number;

  status: PayableStatus;
  /** Forma de pagamento prevista ao cadastrar */
  paymentMethod?: PaymentMethod;
  /** Data do pagamento efetivo (ISO string) */
  paidAt?: string;
  /** Forma de pagamento real — pode diferir da prevista */
  paidWith?: PaymentMethod;
  /** Observações livres sobre o pagamento */
  paymentNotes?: string;
  /** Origem do lançamento para filtros e rastreabilidade */
  entrySource?: PayableEntrySource;
  /** Competência financeira para leitura mensal */
  competencyDate?: string;

  /** Planejamento para integração bancária futura */
  paymentExecutionStatus?: PayableExecutionStatus;
  paymentProvider?: string;
  paymentProviderReference?: string;
  scheduledFor?: string;
  receiptUrl?: string;
  failureReason?: string;
  reconciliationStatus?: PayableReconciliationStatus;

  /** Tipo de recorrência. 'NENHUMA' = sem recorrência */
  recurrence: RecurrenceType;
  /** ID da primeira conta da série (recorrência ou parcelamento) */
  recurrenceParentId?: string;
  /** Posição desta ocorrência na série (ex: 2 para "parcela 2/6") */
  recurrenceIndex?: number;
  /** Total de ocorrências na série */
  totalInstallments?: number;

  /** Observações livres sobre a conta */
  observations?: string;
  /** Sinalizador de urgência operacional — realce visual na listagem */
  isUrgent: boolean;

  /** Timestamp de exclusão lógica (ausente = conta ativa) */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

export interface PayableCategory {
  id: string;
  name: string;
  /** Classes Tailwind de cor. Ex: "bg-blue-100 text-blue-800" */
  color: string;
  /** Nome do ícone Lucide (string). Ex: "Wrench", "Zap" */
  icon: string;
  isActive: boolean;
  createdAt: string;
}

export interface PayableSupplier {
  id: string;
  name: string;
  tradeName?: string;
  docType?: DocType;
  docNumber?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PayableAttachment {
  id: string;
  payableId: string;
  type: PayableAttachmentFileType;
  filename: string;
  url: string;
  createdAt: string;
  createdByUserId: string;
}

export interface PayableHistory {
  id: string;
  payableId: string;
  action: PayableHistoryAction;
  /** Texto legível do evento. Ex: "Status alterado de Pendente para Pago" */
  description: string;
  /** Campos alterados — presente apenas em action === 'UPDATED' */
  fieldChanges?: Array<{
    field: string;
    oldValue: string;
    newValue: string;
  }>;
  userId: string;
  createdAt: string;
}

// ─── Labels e cores — Contas a Pagar ────────────────────────────────────────

export const PAYABLE_STATUS_LABELS: Record<PayableDisplayStatus, string> = {
  PENDENTE:  'Pendente',
  VENCIDO:   'Vencido',
  PAGO:      'Pago',
  PARCIAL:   'Parcial',
  CANCELADO: 'Cancelado',
  AGENDADO:  'Agendado',
};

/** Segue o padrão de STATUS_COLORS do sistema — classes Tailwind semânticas */
export const PAYABLE_STATUS_COLORS: Record<PayableDisplayStatus, string> = {
  PENDENTE:  'bg-warning text-warning-foreground',
  VENCIDO:   'bg-destructive text-destructive-foreground',
  PAGO:      'bg-success text-success-foreground',
  PARCIAL:   'bg-orange-100 text-orange-800',
  CANCELADO: 'bg-zinc-200 text-zinc-700',
  AGENDADO:  'bg-info text-info-foreground',
};

export const PAYABLE_ENTRY_SOURCE_LABELS: Record<PayableEntrySource, string> = {
  MANUAL: 'Manual',
  IA_IMPORT: 'Importada por IA',
  CAMERA_CAPTURE: 'Foto / câmera',
  AUTO_SERIES: 'Gerada em série',
  EMAIL_IMPORT: 'Importada de e-mail',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX:               'PIX',
  BOLETO:            'Boleto',
  TRANSFERENCIA:     'Transferência',
  CARTAO_CREDITO:    'Cartão de Crédito',
  CARTAO_DEBITO:     'Cartão de Débito',
  DINHEIRO:          'Dinheiro',
  CHEQUE:            'Cheque',
  DEBITO_AUTOMATICO: 'Débito Automático',
};

export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  NENHUMA:    'Sem recorrência',
  SEMANAL:    'Semanal',
  QUINZENAL:  'Quinzenal',
  MENSAL:     'Mensal',
  BIMESTRAL:  'Bimestral',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL:  'Semestral',
  ANUAL:      'Anual',
};

export const PAYABLE_HISTORY_ACTION_LABELS: Record<PayableHistoryAction, string> = {
  CREATED:          'Conta criada',
  UPDATED:          'Conta editada',
  PAID:             'Pagamento registrado',
  PARTIAL_PAID:     'Pagamento parcial registrado',
  CANCELLED:        'Conta cancelada',
  DELETED:          'Conta excluída',
  ATTACHMENT_ADDED: 'Anexo adicionado',
};

// ─── Sugestões de E-mail ─────────────────────────────────────────────────────

export type EmailSuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';

export interface EmailSuggestion {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  suggestedTitle: string;
  suggestedAmount: number;
  suggestedDueDate: string;
  suggestedCategoryId: string;
  suggestedSupplierName: string;
  suggestedPaymentMethod: PaymentMethod;
  confidence: number;
  status: EmailSuggestionStatus;
  emailSnippet?: string;
  createdAt: string;
}
