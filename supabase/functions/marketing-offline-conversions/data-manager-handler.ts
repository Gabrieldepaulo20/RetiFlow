import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildDataManagerIngestRequest,
  classifyDiagnosticPolling,
  classifyDataManagerFailure,
  classifyDataManagerIngestSuccess,
  diagnosticPollAt,
  resolveDataManagerDiagnosticTransition,
  retryAt,
  summarizeDataManagerDiagnostics,
  type DataManagerQueueItem,
  type OfflineConversionKind,
} from '../_shared/google-data-manager.ts';

type JsonRecord = Record<string, unknown>;

function createServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

interface DataManagerCredentials {
  projectId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId: string;
  operatingCustomerId: string;
  validateOnly: boolean;
  actionIds: Partial<Record<OfflineConversionKind, string>>;
}

interface StoredQueueItem extends DataManagerQueueItem {
  google_result?: unknown;
  processing_started_at?: string | null;
  next_attempt_at?: string | null;
}

const DATA_MANAGER_INGEST_URL = 'https://datamanager.googleapis.com/v1/events:ingest';
const DATA_MANAGER_STATUS_URL = 'https://datamanager.googleapis.com/v1/requestStatus:retrieve';
const DATA_MANAGER_PROVIDER = 'google_data_manager_v1';
const RETRY_LIMIT = 5;
const DIAGNOSTICS_DEADLINE_MS = 24 * 60 * 60_000;
const VALIDATED_ONLY_HOLD_UNTIL = '2999-12-31T23:59:59.000Z';
const REQUEST_VALIDATION_ONLY_CODE = 'DATA_MANAGER_REQUEST_VALIDATION_ONLY';
const OAUTH_TIMEOUT_MS = 10_000;
const DATA_MANAGER_REQUEST_TIMEOUT_MS = 20_000;
const SUPPORTED_KINDS = new Set<OfflineConversionKind>([
  'client_registered',
  'cabecote_recebido_avaliacao',
  'orcamento_emitido',
  'os_aprovada',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizeCustomerId(value: string) {
  return value.replace(/\D/g, '');
}

function envFlag(name: string, fallback: boolean) {
  const value = Deno.env.get(name)?.trim().toLowerCase();
  if (!value) return fallback;
  return value === 'true' || value === '1';
}

function getCredentials(): DataManagerCredentials {
  const credentials: DataManagerCredentials = {
    projectId: Deno.env.get('GOOGLE_DATA_MANAGER_PROJECT_ID')?.trim() ?? '',
    clientId: Deno.env.get('GOOGLE_DATA_MANAGER_CLIENT_ID')?.trim() ?? '',
    clientSecret: Deno.env.get('GOOGLE_DATA_MANAGER_CLIENT_SECRET')?.trim() ?? '',
    refreshToken: Deno.env.get('GOOGLE_DATA_MANAGER_REFRESH_TOKEN')?.trim() ?? '',
    loginCustomerId: normalizeCustomerId(
      Deno.env.get('GOOGLE_DATA_MANAGER_LOGIN_CUSTOMER_ID') ?? '',
    ),
    operatingCustomerId: normalizeCustomerId(
      Deno.env.get('GOOGLE_DATA_MANAGER_OPERATING_CUSTOMER_ID') ?? '',
    ),
    validateOnly: envFlag('GOOGLE_DATA_MANAGER_VALIDATE_ONLY', true),
    actionIds: {
      client_registered: (
        Deno.env.get('GOOGLE_DATA_MANAGER_CLIENT_REGISTERED_ACTION_ID')
        ?? ''
      ).replace(/\D/g, ''),
      cabecote_recebido_avaliacao: (
        Deno.env.get('GOOGLE_DATA_MANAGER_CABECOTE_RECEBIDO_AVALIACAO_ACTION_ID') ?? ''
      ).replace(/\D/g, ''),
      orcamento_emitido: (
        Deno.env.get('GOOGLE_DATA_MANAGER_ORCAMENTO_EMITIDO_ACTION_ID') ?? ''
      ).replace(/\D/g, ''),
      os_aprovada: (
        Deno.env.get('GOOGLE_DATA_MANAGER_OS_APROVADA_ACTION_ID') ?? ''
      ).replace(/\D/g, ''),
    },
  };

  if (
    !credentials.projectId
    || !credentials.clientId
    || !credentials.clientSecret
    || !credentials.refreshToken
    || !/^\d{10}$/.test(credentials.loginCustomerId)
    || !/^\d{10}$/.test(credentials.operatingCustomerId)
  ) {
    throw new Error('DATA_MANAGER_CONFIGURATION_INCOMPLETE');
  }
  return credentials;
}

async function getAccessToken(credentials: DataManagerCredentials) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  const accessToken = asString(payload.access_token, 4096);
  if (!response.ok || !accessToken) throw new Error('DATA_MANAGER_AUTHENTICATION_FAILED');
  return accessToken;
}

function googleApiStatus(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) return '';
  return asString(payload.error.status, 80).toUpperCase();
}

function googleResult(item: StoredQueueItem) {
  return isRecord(item.google_result) ? item.google_result : {};
}

function asNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function validIso(value: unknown) {
  const text = asString(value, 80);
  return text && Number.isFinite(Date.parse(text)) ? text : '';
}

function diagnosticDeadlineAt(result: JsonRecord, acceptedAt: string) {
  const stored = validIso(result.diagnosticDeadlineAt);
  if (stored) return stored;
  return new Date(Date.parse(acceptedAt) + DIAGNOSTICS_DEADLINE_MS).toISOString();
}

function firstDiagnosticAt(result: JsonRecord, acceptedAt: string) {
  const stored = validIso(result.nextDiagnosticAt);
  if (stored) return stored;
  return diagnosticPollAt({
    pollAttempt: 0,
    now: Date.parse(acceptedAt),
    random: 0.5,
  });
}

function capAtDeadline(nextDiagnosticAt: string, deadlineAt: string) {
  return Date.parse(nextDiagnosticAt) > Date.parse(deadlineAt)
    ? deadlineAt
    : nextDiagnosticAt;
}

async function updateQueueItem(
  serviceClient: ServiceClient,
  item: Pick<StoredQueueItem, 'id_marketing_offline_conversions'>,
  update: JsonRecord,
) {
  const { error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Offline_Conversions')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id_marketing_offline_conversions', item.id_marketing_offline_conversions)
    .eq('status', 'processing');
  if (error) throw new Error('QUEUE_UPDATE_FAILED');
}

async function markFailure(
  serviceClient: ServiceClient,
  item: StoredQueueItem,
  input: {
    permanent: boolean;
    code: string;
    retryAfter?: string | null;
    result?: JsonRecord;
  },
) {
  const exhausted = item.attempts >= RETRY_LIMIT;
  const failed = input.permanent || exhausted;
  await updateQueueItem(serviceClient, item, {
    status: failed ? 'failed' : 'retry',
    next_attempt_at: failed
      ? new Date().toISOString()
      : retryAt({ attempts: item.attempts, retryAfter: input.retryAfter }),
    processing_started_at: null,
    google_error_code: input.code.slice(0, 160),
    google_error_message: failed
      ? 'Conversão enviada para quarentena técnica.'
      : 'Falha transitória; nova tentativa agendada.',
    ...(input.result ? { google_result: input.result } : {}),
  });
  return failed ? 'failed' as const : 'retry' as const;
}

async function holdRequestValidationOnly(
  serviceClient: ServiceClient,
  item: StoredQueueItem,
  result: JsonRecord,
) {
  const validatedAt = new Date().toISOString();
  await updateQueueItem(serviceClient, item, {
    status: 'retry',
    next_attempt_at: VALIDATED_ONLY_HOLD_UNTIL,
    processing_started_at: null,
    google_error_code: REQUEST_VALIDATION_ONLY_CODE,
    google_error_message: 'Request validation only; nenhum evento foi ingerido.',
    google_result: {
      ...result,
      state: 'request_validation_only',
      validateOnly: true,
      diagnosticsEligible: false,
      validatedAt,
    },
  });
  return 'validation_only' as const;
}

async function scheduleDiagnosticsPoll(
  serviceClient: ServiceClient,
  item: StoredQueueItem,
  result: JsonRecord,
  input: {
    now: Date;
    deadlineAt: string;
    pollAttempt: number;
    code?: string | null;
    retryAfter?: string | null;
    checked: boolean;
  },
) {
  const nextDiagnosticAt = capAtDeadline(diagnosticPollAt({
    pollAttempt: input.pollAttempt,
    now: input.now.getTime(),
    retryAfter: input.retryAfter,
  }), input.deadlineAt);
  await updateQueueItem(serviceClient, item, {
    status: 'processing',
    processing_started_at: null,
    next_attempt_at: nextDiagnosticAt,
    google_error_code: input.code ?? null,
    google_error_message: input.code
      ? 'Diagnóstico transitório; o requestId foi preservado para nova consulta.'
      : 'Diagnóstico pendente; nova consulta agendada.',
    google_result: {
      ...result,
      state: 'awaiting_diagnostics',
      validateOnly: false,
      diagnosticPollAttempt: input.pollAttempt,
      nextDiagnosticAt,
      diagnosticDeadlineAt: input.deadlineAt,
      ...(input.checked ? { lastCheckedAt: input.now.toISOString() } : {}),
    },
  });
}

async function heartbeatUntilDiagnostics(
  serviceClient: ServiceClient,
  item: StoredQueueItem,
  result: JsonRecord,
  input: { now: Date; nextDiagnosticAt: string; deadlineAt: string },
) {
  await updateQueueItem(serviceClient, item, {
    status: 'processing',
    processing_started_at: null,
    next_attempt_at: input.nextDiagnosticAt,
    google_result: {
      ...result,
      state: 'awaiting_diagnostics',
      validateOnly: false,
      diagnosticsEligible: true,
      diagnosticPollAttempt: asNonNegativeInteger(result.diagnosticPollAttempt),
      nextDiagnosticAt: input.nextDiagnosticAt,
      diagnosticDeadlineAt: input.deadlineAt,
    },
  });
}

async function retrieveDiagnostics(
  credentials: DataManagerCredentials,
  accessToken: string,
  requestId: string,
) {
  const url = new URL(DATA_MANAGER_STATUS_URL);
  url.searchParams.set('requestId', requestId);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-user-project': credentials.projectId,
    },
    signal: AbortSignal.timeout(DATA_MANAGER_REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({})) as unknown;
  return { response, payload };
}

async function reconcileAcceptedRequests(
  serviceClient: ServiceClient,
  credentials: DataManagerCredentials,
  accessToken: string,
) {
  const reconciliationNow = new Date().toISOString();
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Offline_Conversions')
    .select([
      'id_marketing_offline_conversions',
      'conversion_kind',
      'click_id_type',
      'click_id',
      'conversion_date_time',
      'conversion_value',
      'currency_code',
      'order_id',
      'attempts',
      'processing_started_at',
      'next_attempt_at',
      'google_result',
    ].join(','))
    .eq('status', 'processing')
    .lte('next_attempt_at', reconciliationNow)
    .order('next_attempt_at', { ascending: true })
    .limit(100);
  if (error) throw new Error('QUEUE_RECONCILIATION_READ_FAILED');

  const summary = {
    candidates: 0,
    checked: 0,
    deferred: 0,
    validationOnlyHeld: 0,
    processing: 0,
    uploaded: 0,
    retry: 0,
    failed: 0,
  };
  for (const rawItem of (data ?? []) as unknown as StoredQueueItem[]) {
    const previousResult = googleResult(rawItem);
    if (previousResult.provider !== DATA_MANAGER_PROVIDER) continue;
    summary.candidates += 1;

    if (previousResult.validateOnly === true) {
      await holdRequestValidationOnly(serviceClient, rawItem, previousResult);
      summary.validationOnlyHeld += 1;
      continue;
    }

    const requestId = asString(previousResult.requestId, 500);
    const acceptedAt = asString(previousResult.acceptedAt, 80);
    if (!requestId || !validIso(acceptedAt)) {
      await markFailure(serviceClient, rawItem, {
        permanent: true,
        code: 'DATA_MANAGER_DIAGNOSTICS_STATE_INVALID',
        result: { ...previousResult, state: 'diagnostics_state_invalid' },
      });
      summary.failed += 1;
      continue;
    }

    const now = new Date();
    const deadlineAt = diagnosticDeadlineAt(previousResult, acceptedAt);
    const nextDiagnosticAt = firstDiagnosticAt(previousResult, acceptedAt);
    const pollingState = classifyDiagnosticPolling({
      validateOnly: false,
      nextDiagnosticAt,
      diagnosticDeadlineAt: deadlineAt,
      now: now.getTime(),
    });

    if (pollingState === 'deadline') {
      await markFailure(serviceClient, rawItem, {
        permanent: true,
        code: 'DATA_MANAGER_DIAGNOSTICS_DEADLINE_EXCEEDED',
        result: {
          ...previousResult,
          state: 'diagnostics_deadline_exceeded',
          nextDiagnosticAt,
          diagnosticDeadlineAt: deadlineAt,
        },
      });
      summary.failed += 1;
      continue;
    }

    if (pollingState === 'wait') {
      await heartbeatUntilDiagnostics(serviceClient, rawItem, previousResult, {
        now,
        nextDiagnosticAt,
        deadlineAt,
      });
      summary.deferred += 1;
      summary.processing += 1;
      continue;
    }

    summary.checked += 1;
    const pollAttempt = asNonNegativeInteger(previousResult.diagnosticPollAttempt) + 1;

    let response: Response;
    let payload: unknown;
    try {
      ({ response, payload } = await retrieveDiagnostics(
        credentials,
        accessToken,
        requestId,
      ));
    } catch {
      await scheduleDiagnosticsPoll(serviceClient, rawItem, previousResult, {
        now,
        deadlineAt,
        pollAttempt,
        code: 'DATA_MANAGER_DIAGNOSTICS_NETWORK_ERROR',
        checked: true,
      });
      summary.processing += 1;
      continue;
    }

    if (!response.ok) {
      const failureClass = classifyDataManagerFailure({
        httpStatus: response.status,
        apiStatus: googleApiStatus(payload),
      });
      const code = `DATA_MANAGER_DIAGNOSTICS_${googleApiStatus(payload) || response.status}`;
      const transportTransition = resolveDataManagerDiagnosticTransition({
        transportFailure: failureClass,
      });
      if (transportTransition === 'awaiting_diagnostics') {
        await scheduleDiagnosticsPoll(serviceClient, rawItem, previousResult, {
          now,
          deadlineAt,
          pollAttempt,
          code,
          retryAfter: response.headers.get('Retry-After'),
          checked: true,
        });
        summary.processing += 1;
      } else {
        await markFailure(serviceClient, rawItem, {
          permanent: true,
          code,
          result: {
            ...previousResult,
            state: 'diagnostics_terminal_failure',
            lastCheckedAt: now.toISOString(),
            diagnosticPollAttempt: pollAttempt,
          },
        });
        summary.failed += 1;
      }
      continue;
    }

    const diagnostics = summarizeDataManagerDiagnostics(payload);
    const diagnosticTransition = resolveDataManagerDiagnosticTransition({ diagnostics });
    const nextResult = {
      ...previousResult,
      diagnosticStatus: diagnostics.statuses,
      diagnosticReasons: diagnostics.reasons,
      diagnosticRecordCount: diagnostics.recordCount,
      lastCheckedAt: now.toISOString(),
      diagnosticPollAttempt: pollAttempt,
      diagnosticDeadlineAt: deadlineAt,
    };

    if (diagnosticTransition === 'uploaded') {
      await updateQueueItem(serviceClient, rawItem, {
        status: 'uploaded',
        uploaded_at: now.toISOString(),
        processing_started_at: null,
        google_error_code: null,
        google_error_message: null,
        google_result: {
          ...nextResult,
          state: diagnostics.outcome === 'duplicate'
            ? 'duplicate_transaction_acknowledged'
            : 'diagnostics_success',
        },
      });
      summary.uploaded += 1;
      continue;
    }

    if (diagnosticTransition === 'awaiting_diagnostics') {
      await scheduleDiagnosticsPoll(serviceClient, rawItem, nextResult, {
        now,
        deadlineAt,
        pollAttempt,
        code: null,
        checked: true,
      });
      summary.processing += 1;
      continue;
    }

    await markFailure(serviceClient, rawItem, {
      permanent: true,
      code: diagnostics.outcome === 'inconsistent'
        ? 'DATA_MANAGER_DIAGNOSTICS_INCONSISTENT_RECORD_COUNT'
        : diagnostics.reasons[0] || 'DATA_MANAGER_DIAGNOSTICS_FAILED',
      result: {
        ...nextResult,
        state: diagnostics.outcome === 'inconsistent'
          ? 'diagnostics_inconsistent_record_count'
          : 'diagnostics_terminal_failure',
      },
    });
    summary.failed += 1;
  }
  return summary;
}

async function rearmValidatedOnlyRows(serviceClient: ServiceClient) {
  const now = new Date().toISOString();
  const { error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Offline_Conversions')
    .update({
      next_attempt_at: now,
      google_error_code: null,
      google_error_message: null,
      updated_at: now,
    })
    .eq('status', 'retry')
    .in('google_error_code', [
      REQUEST_VALIDATION_ONLY_CODE,
      'DATA_MANAGER_VALIDATE_ONLY_COMPLETE',
    ]);
  if (error) throw new Error('QUEUE_REARM_FAILED');
}

async function claimAndHydrateQueue(serviceClient: ServiceClient) {
  const { data: claimed, error: claimError } = await serviceClient
    .schema('RetificaPremium')
    .rpc('claim_marketing_offline_conversions', { p_limit: 50 });
  if (claimError) throw new Error('QUEUE_CLAIM_FAILED');
  const claimedRows = (claimed ?? []) as unknown as StoredQueueItem[];
  if (claimedRows.length === 0) return [];

  const ids = claimedRows.map((item) => item.id_marketing_offline_conversions);
  const { data: hydrated, error: hydrateError } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Offline_Conversions')
    .select([
      'id_marketing_offline_conversions',
      'conversion_kind',
      'click_id_type',
      'click_id',
      'conversion_date_time',
      'conversion_value',
      'currency_code',
      'order_id',
      'attempts',
      'google_result',
      'processing_started_at',
    ].join(','))
    .in('id_marketing_offline_conversions', ids);
  if (hydrateError) throw new Error('QUEUE_HYDRATION_FAILED');
  const byId = new Map(
    ((hydrated ?? []) as unknown as StoredQueueItem[])
      .map((item) => [item.id_marketing_offline_conversions, item]),
  );
  return claimedRows.map((claimedItem) => ({
    ...claimedItem,
    ...byId.get(claimedItem.id_marketing_offline_conversions),
    conversion_kind: (
      byId.get(claimedItem.id_marketing_offline_conversions)?.conversion_kind
      ?? 'client_registered'
    ),
  }));
}

async function ingestQueueItem(
  serviceClient: ServiceClient,
  credentials: DataManagerCredentials,
  accessToken: string,
  item: StoredQueueItem,
) {
  if (!SUPPORTED_KINDS.has(item.conversion_kind)) {
    return await markFailure(serviceClient, item, {
      permanent: true,
      code: 'UNSUPPORTED_CONVERSION_KIND',
    });
  }
  const conversionActionId = credentials.actionIds[item.conversion_kind];
  if (!conversionActionId) {
    return await markFailure(serviceClient, item, {
      permanent: true,
      code: 'MISSING_CONVERSION_ACTION_ID',
    });
  }

  let requestBody: Awaited<ReturnType<typeof buildDataManagerIngestRequest>>;
  try {
    requestBody = await buildDataManagerIngestRequest({
      item,
      destination: {
        loginCustomerId: credentials.loginCustomerId,
        operatingCustomerId: credentials.operatingCustomerId,
        conversionActionId,
      },
      validateOnly: credentials.validateOnly,
      // Dados pessoais ficam desabilitados até base legal/consentimento e fonte
      // de dados fornecidos pelo usuário serem aprovados explicitamente.
      allowUserData: false,
    });
  } catch {
    return await markFailure(serviceClient, item, {
      permanent: true,
      code: 'INVALID_QUEUE_CONVERSION',
    });
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(DATA_MANAGER_INGEST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': credentials.projectId,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(DATA_MANAGER_REQUEST_TIMEOUT_MS),
    });
    payload = await response.json().catch(() => ({})) as unknown;
  } catch {
    return await markFailure(serviceClient, item, {
      permanent: false,
      code: 'DATA_MANAGER_NETWORK_ERROR',
    });
  }

  if (!response.ok) {
    const apiStatus = googleApiStatus(payload);
    return await markFailure(serviceClient, item, {
      permanent: classifyDataManagerFailure({
        httpStatus: response.status,
        apiStatus,
      }) === 'permanent',
      code: `DATA_MANAGER_INGEST_${apiStatus || response.status}`,
      retryAfter: response.headers.get('Retry-After'),
    });
  }

  const requestId = isRecord(payload) ? asString(payload.requestId, 500) : '';
  const ingestDisposition = classifyDataManagerIngestSuccess({
    validateOnly: credentials.validateOnly,
    requestId,
  });
  if (ingestDisposition === 'request_validation_only') {
    return await holdRequestValidationOnly(serviceClient, item, {
      provider: DATA_MANAGER_PROVIDER,
      state: 'request_validation_only',
      validateOnly: true,
      diagnosticsEligible: false,
      conversionKind: item.conversion_kind,
      ...(requestId ? { requestId } : {}),
    });
  }

  if (ingestDisposition === 'missing_request_id') {
    return await markFailure(serviceClient, item, {
      permanent: false,
      code: 'DATA_MANAGER_REQUEST_ID_MISSING',
    });
  }

  const acceptedAt = new Date().toISOString();
  const diagnosticDeadline = new Date(
    Date.parse(acceptedAt) + DIAGNOSTICS_DEADLINE_MS,
  ).toISOString();
  const nextDiagnosticAt = diagnosticPollAt({
    pollAttempt: 0,
    now: Date.parse(acceptedAt),
  });
  await updateQueueItem(serviceClient, item, {
    status: 'processing',
    processing_started_at: null,
    next_attempt_at: nextDiagnosticAt,
    google_error_code: null,
    google_error_message: null,
    google_result: {
      provider: DATA_MANAGER_PROVIDER,
      state: 'awaiting_diagnostics',
      requestId,
      acceptedAt,
      validateOnly: false,
      diagnosticsEligible: true,
      conversionKind: item.conversion_kind,
      diagnosticPollAttempt: 0,
      nextDiagnosticAt,
      diagnosticDeadlineAt: diagnosticDeadline,
    },
  });
  return 'accepted' as const;
}

async function processQueue(
  serviceClient: ServiceClient,
  credentials: DataManagerCredentials,
  accessToken: string,
) {
  const reconciliation = await reconcileAcceptedRequests(
    serviceClient,
    credentials,
    accessToken,
  );
  if (!credentials.validateOnly) await rearmValidatedOnlyRows(serviceClient);
  const queue = await claimAndHydrateQueue(serviceClient);
  const result = {
    claimed: queue.length,
    acceptedForDiagnostics: 0,
    requestValidationOnly: 0,
    retry: 0,
    failed: 0,
    reconciliation,
  };
  for (const item of queue) {
    const state = await ingestQueueItem(serviceClient, credentials, accessToken, item);
    if (state === 'accepted') result.acceptedForDiagnostics += 1;
    else if (state === 'validation_only') result.requestValidationOnly += 1;
    else result[state] += 1;
  }
  return result;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function handleDataManagerOfflineConversions(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Configuração interna indisponível.' }, 503);
  }

  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);
  const providedSecret = request.headers.get('x-retiflow-cron-secret') ?? '';
  const { data: validSecret, error: secretError } = await serviceClient
    .schema('RetificaPremium')
    .rpc('validate_marketing_offline_conversion_cron_secret', { p_secret: providedSecret });
  if (secretError || validSecret !== true) {
    return jsonResponse({ error: 'Não autorizado.' }, 401);
  }

  if (!envFlag('GOOGLE_DATA_MANAGER_ENABLED', false)) {
    return jsonResponse({
      status: 503,
      state: 'inactive',
      enabled: false,
      validateOnly: true,
      message: 'Data Manager preparado, mas desabilitado até configuração aprovada.',
    }, 503);
  }

  try {
    const credentials = getCredentials();
    const accessToken = await getAccessToken(credentials);
    const result = await processQueue(serviceClient, credentials, accessToken);
    console.log(JSON.stringify({
      event: 'marketing_offline_data_manager',
      validateOnly: credentials.validateOnly,
      claimed: result.claimed,
      acceptedForDiagnostics: result.acceptedForDiagnostics,
      requestValidationOnly: result.requestValidationOnly,
      retry: result.retry,
      failed: result.failed,
      diagnosticsChecked: result.reconciliation.checked,
      diagnosticsUploaded: result.reconciliation.uploaded,
    }));
    return jsonResponse({
      status: 200,
      provider: DATA_MANAGER_PROVIDER,
      validateOnly: credentials.validateOnly,
      ...result,
    }, 200);
  } catch {
    console.error(JSON.stringify({
      event: 'marketing_offline_data_manager_failed',
      code: 'UNHANDLED_PROCESSING_ERROR',
    }));
    return jsonResponse({ error: 'Não foi possível processar as conversões agora.' }, 503);
  }
}
