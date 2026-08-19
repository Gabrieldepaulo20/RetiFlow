import { sanitizeMarketingClickId } from './marketing-event-contract.ts';

export type OfflineConversionKind =
  | 'client_registered'
  | 'cabecote_recebido_avaliacao'
  | 'orcamento_emitido'
  | 'os_aprovada';

export type GoogleClickIdType = 'gclid' | 'gbraid' | 'wbraid';

export interface DataManagerQueueItem {
  id_marketing_offline_conversions: string;
  conversion_kind: OfflineConversionKind;
  click_id_type: GoogleClickIdType;
  click_id: string;
  conversion_date_time: string;
  conversion_value: number | string;
  currency_code: string;
  order_id: string;
  attempts: number;
}

export interface DataManagerDestinationConfig {
  loginCustomerId: string;
  operatingCustomerId: string;
  conversionActionId: string;
}

export interface DataManagerConsent {
  adUserData: 'CONSENT_GRANTED' | 'CONSENT_DENIED';
  adPersonalization: 'CONSENT_GRANTED' | 'CONSENT_DENIED';
}

export interface DataManagerUserDataInput {
  emails?: string[];
  phones?: string[];
}

type JsonRecord = Record<string, unknown>;

const TRANSIENT_API_STATUSES = new Set([
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'UNKNOWN',
  'ABORTED',
  'RESOURCE_EXHAUSTED',
]);

const PERMANENT_API_STATUSES = new Set([
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'FAILED_PRECONDITION',
  'UNAUTHENTICATED',
]);

const DUPLICATE_TRANSACTION_REASON = 'PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID';
const GOOGLE_CLICK_ID_TYPES = new Set<GoogleClickIdType>(['gclid', 'gbraid', 'wbraid']);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, max: number) {
  if (typeof value !== 'string') throw new Error(`${label} inválido.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} inválido.`);
  return normalized;
}

function normalizeCustomerId(value: string) {
  const normalized = value.replace(/\D/g, '');
  if (!/^\d{10}$/.test(normalized)) throw new Error('ID de conta do Google Ads inválido.');
  return normalized;
}

function normalizeActionId(value: string) {
  const normalized = value.replace(/\D/g, '');
  if (!/^\d+$/.test(normalized)) throw new Error('ID de ação de conversão inválido.');
  return normalized;
}

function normalizeTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error('Data da conversão inválida.');
  return timestamp.toISOString();
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase() || 'BRL';
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Moeda da conversão inválida.');
  return currency;
}

function normalizeConversionValue(value: number | string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Valor da conversão inválido.');
  return Math.round(amount * 100) / 100;
}

export function buildStableOfflineTransactionId(input: {
  ownerId: string;
  kind: OfflineConversionKind;
  entityId: string;
}) {
  const ownerId = requiredString(input.ownerId, 'Proprietário', 80);
  const entityId = requiredString(input.entityId, 'Entidade', 120);
  return `retiflow:${ownerId}:${input.kind}:${entityId}`;
}

export function normalizeGoogleEmail(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1) return null;
  let local = normalized.slice(0, separator);
  let domain = normalized.slice(separator + 1);
  if (!/^[^@]+$/.test(local) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+', 1)[0].replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

export function normalizeGooglePhone(value: string) {
  const normalized = value.trim().replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildHashedGoogleUserData(
  input: DataManagerUserDataInput | undefined,
  options: {
    allowUserData: boolean;
    consent?: DataManagerConsent;
  },
) {
  if (
    !input
    || !options.allowUserData
    || options.consent?.adUserData !== 'CONSENT_GRANTED'
  ) return null;

  const emails = [...new Set((input.emails ?? []).map(normalizeGoogleEmail).filter(Boolean))]
    .slice(0, 10) as string[];
  const phones = [...new Set((input.phones ?? []).map(normalizeGooglePhone).filter(Boolean))]
    .slice(0, Math.max(0, 10 - emails.length)) as string[];
  const identifiers = await Promise.all([
    ...emails.map(async (email) => ({ emailAddress: await sha256Hex(email) })),
    ...phones.map(async (phone) => ({ phoneNumber: await sha256Hex(phone) })),
  ]);
  return identifiers.length > 0 ? { userIdentifiers: identifiers } : null;
}

export async function buildDataManagerIngestRequest(input: {
  item: DataManagerQueueItem;
  destination: DataManagerDestinationConfig;
  validateOnly: boolean;
  allowUserData?: boolean;
  userData?: DataManagerUserDataInput;
  consent?: DataManagerConsent;
}) {
  const { item } = input;
  const destinationReference = `retiflow_${item.conversion_kind}`;
  const clickId = sanitizeMarketingClickId(item.click_id);
  if (!clickId) throw new Error('Identificador de anúncio inválido.');
  if (!GOOGLE_CLICK_ID_TYPES.has(item.click_id_type)) {
    throw new Error('Tipo do identificador de anúncio inválido.');
  }
  const transactionId = requiredString(item.order_id, 'Transaction ID', 256);
  const hashedUserData = await buildHashedGoogleUserData(input.userData, {
    allowUserData: input.allowUserData === true,
    consent: input.consent,
  });
  const event: JsonRecord = {
    destinationReferences: [destinationReference],
    transactionId,
    eventTimestamp: normalizeTimestamp(item.conversion_date_time),
    conversionValue: normalizeConversionValue(item.conversion_value),
    currency: normalizeCurrency(item.currency_code),
    // Os marcos nascem no fluxo web do Retiflow. WEB é a opção conservadora
    // do enum oficial; IN_STORE implicaria uma transação presencial em loja.
    eventSource: 'WEB',
    adIdentifiers: { [item.click_id_type]: clickId },
  };
  if (input.consent) event.consent = input.consent;
  if (hashedUserData) event.userData = hashedUserData;

  return {
    destinations: [{
      reference: destinationReference,
      loginAccount: {
        accountType: 'GOOGLE_ADS',
        accountId: normalizeCustomerId(input.destination.loginCustomerId),
      },
      operatingAccount: {
        accountType: 'GOOGLE_ADS',
        accountId: normalizeCustomerId(input.destination.operatingCustomerId),
      },
      productDestinationId: normalizeActionId(input.destination.conversionActionId),
    }],
    events: [event],
    validateOnly: input.validateOnly,
    ...(hashedUserData ? { encoding: 'HEX' } : {}),
  };
}

export function classifyDataManagerFailure(input: {
  httpStatus?: number;
  apiStatus?: string | null;
  networkError?: boolean;
}) {
  if (input.networkError) return 'retry' as const;
  const apiStatus = input.apiStatus?.trim().toUpperCase() ?? '';
  if (TRANSIENT_API_STATUSES.has(apiStatus)) return 'retry' as const;
  if (PERMANENT_API_STATUSES.has(apiStatus)) return 'permanent' as const;
  const status = Number(input.httpStatus ?? 0);
  if (status === 408 || status === 429 || status >= 500) return 'retry' as const;
  return 'permanent' as const;
}

export function classifyDataManagerIngestSuccess(input: {
  validateOnly: boolean;
  requestId?: unknown;
}) {
  if (input.validateOnly) return 'request_validation_only' as const;
  if (typeof input.requestId === 'string' && input.requestId.trim()) {
    return 'awaiting_diagnostics' as const;
  }
  return 'missing_request_id' as const;
}

export function parseRetryAfter(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export function retryAt(input: {
  attempts: number;
  retryAfter?: string | null;
  now?: number;
  random?: number;
}) {
  const now = input.now ?? Date.now();
  const attempts = Math.max(1, Math.trunc(input.attempts));
  const exponential = Math.min(6 * 60 * 60_000, 5 * 60_000 * (2 ** (attempts - 1)));
  const random = Math.max(0, Math.min(1, input.random ?? Math.random()));
  const jittered = Math.round(exponential * (0.75 + random * 0.5));
  const retryAfter = parseRetryAfter(input.retryAfter, now) ?? 0;
  return new Date(now + Math.max(jittered, retryAfter)).toISOString();
}

export const DATA_MANAGER_DIAGNOSTIC_INITIAL_DELAY_MS = 30 * 60_000;
export const DATA_MANAGER_DIAGNOSTIC_BACKOFF_MULTIPLIER = 1.3;
export const DATA_MANAGER_DIAGNOSTIC_MAX_DELAY_MS = 60 * 60_000;

export function diagnosticPollAt(input: {
  pollAttempt: number;
  now?: number;
  random?: number;
  retryAfter?: string | null;
}) {
  const now = input.now ?? Date.now();
  const pollAttempt = Math.max(0, Math.trunc(input.pollAttempt));
  const exponential = Math.min(
    DATA_MANAGER_DIAGNOSTIC_MAX_DELAY_MS,
    DATA_MANAGER_DIAGNOSTIC_INITIAL_DELAY_MS
      * (DATA_MANAGER_DIAGNOSTIC_BACKOFF_MULTIPLIER ** pollAttempt),
  );
  const random = Math.max(0, Math.min(1, input.random ?? Math.random()));
  const jittered = Math.min(
    DATA_MANAGER_DIAGNOSTIC_MAX_DELAY_MS,
    Math.round(exponential * (0.9 + random * 0.2)),
  );
  const retryAfter = Math.min(
    DATA_MANAGER_DIAGNOSTIC_MAX_DELAY_MS,
    parseRetryAfter(input.retryAfter, now) ?? 0,
  );
  return new Date(now + Math.max(jittered, retryAfter)).toISOString();
}

export function classifyDiagnosticPolling(input: {
  validateOnly: boolean;
  nextDiagnosticAt?: unknown;
  diagnosticDeadlineAt?: unknown;
  now?: number;
}) {
  if (input.validateOnly) return 'request_validation_only' as const;
  const now = input.now ?? Date.now();
  const deadline = typeof input.diagnosticDeadlineAt === 'string'
    ? Date.parse(input.diagnosticDeadlineAt)
    : Number.NaN;
  if (Number.isFinite(deadline) && now >= deadline) return 'deadline' as const;
  const nextDiagnosticAt = typeof input.nextDiagnosticAt === 'string'
    ? Date.parse(input.nextDiagnosticAt)
    : Number.NaN;
  if (Number.isFinite(nextDiagnosticAt) && now < nextDiagnosticAt) return 'wait' as const;
  return 'poll' as const;
}

export interface DataManagerDiagnosticSummary {
  outcome: 'success' | 'processing' | 'duplicate' | 'inconsistent' | 'failed' | 'unknown';
  statuses: string[];
  reasons: string[];
  recordCount: number;
}

export function summarizeDataManagerDiagnostics(payload: unknown): DataManagerDiagnosticSummary {
  if (!isRecord(payload) || !Array.isArray(payload.requestStatusPerDestination)) {
    return { outcome: 'unknown', statuses: [], reasons: [], recordCount: 0 };
  }

  const statuses: string[] = [];
  const reasons: string[] = [];
  let recordCount = 0;
  for (const item of payload.requestStatusPerDestination) {
    if (!isRecord(item)) continue;
    if (typeof item.requestStatus === 'string') statuses.push(item.requestStatus);
    if (isRecord(item.eventsIngestionStatus)) {
      recordCount += Number(item.eventsIngestionStatus.recordCount ?? 0) || 0;
    }
    const errorInfo = isRecord(item.errorInfo) ? item.errorInfo : null;
    const errorCounts = errorInfo && Array.isArray(errorInfo.errorCounts)
      ? errorInfo.errorCounts
      : [];
    for (const error of errorCounts) {
      if (isRecord(error) && typeof error.reason === 'string') reasons.push(error.reason);
    }
  }

  const uniqueStatuses = [...new Set(statuses)];
  const uniqueReasons = [...new Set(reasons)];
  if (uniqueStatuses.length === 0) {
    return { outcome: 'unknown', statuses: [], reasons: uniqueReasons, recordCount };
  }
  if (uniqueReasons.length > 0 && uniqueReasons.every((reason) => reason === DUPLICATE_TRANSACTION_REASON)) {
    return { outcome: 'duplicate', statuses: uniqueStatuses, reasons: uniqueReasons, recordCount };
  }
  if (uniqueStatuses.some((status) => (
    status === 'FAILED'
    || status === 'FAILURE'
    || status === 'PARTIAL_SUCCESS'
  ))) {
    return { outcome: 'failed', statuses: uniqueStatuses, reasons: uniqueReasons, recordCount };
  }
  if (uniqueStatuses.every((status) => status === 'SUCCESS')) {
    return {
      outcome: recordCount === 1 ? 'success' : 'inconsistent',
      statuses: uniqueStatuses,
      reasons: uniqueReasons,
      recordCount,
    };
  }
  if (uniqueStatuses.some((status) => status === 'PROCESSING' || status === 'REQUEST_STATUS_UNKNOWN')) {
    return { outcome: 'processing', statuses: uniqueStatuses, reasons: uniqueReasons, recordCount };
  }
  return { outcome: 'unknown', statuses: uniqueStatuses, reasons: uniqueReasons, recordCount };
}

export type DataManagerQueueTransition = 'uploaded' | 'awaiting_diagnostics' | 'failed';

export function resolveDataManagerDiagnosticTransition(input: {
  diagnostics?: DataManagerDiagnosticSummary;
  transportFailure?: 'retry' | 'permanent';
}): DataManagerQueueTransition {
  if (input.transportFailure) {
    return input.transportFailure === 'retry' ? 'awaiting_diagnostics' : 'failed';
  }
  switch (input.diagnostics?.outcome) {
    case 'success':
    case 'duplicate':
      return 'uploaded';
    case 'processing':
    case 'unknown':
      return 'awaiting_diagnostics';
    case 'inconsistent':
    case 'failed':
    default:
      return 'failed';
  }
}
