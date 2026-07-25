import { createClient } from 'npm:@supabase/supabase-js@2';

type JsonRecord = Record<string, unknown>;
function createServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type ServiceClient = ReturnType<typeof createServiceClient>;

interface QueueItem {
  id_marketing_offline_conversions: string;
  click_id_type: 'gclid' | 'gbraid' | 'wbraid';
  click_id: string;
  conversion_date_time: string;
  conversion_value: number | string;
  currency_code: string;
  order_id: string;
  attempts: number;
}

interface GoogleAdsCredentials {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId: string;
  customerId: string;
  conversionActionId: string;
  apiVersion: string;
}

interface GoogleAdsFailure {
  index: number;
  code: string;
  message: string;
}

const RETRY_LIMIT = 5;

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

function getCredentials(): GoogleAdsCredentials {
  const credentials = {
    developerToken: Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')?.trim() ?? '',
    clientId: Deno.env.get('GOOGLE_ADS_CLIENT_ID')?.trim() ?? '',
    clientSecret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')?.trim() ?? '',
    refreshToken: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN')?.trim() ?? '',
    loginCustomerId: normalizeCustomerId(Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') ?? ''),
    customerId: normalizeCustomerId(Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') ?? ''),
    conversionActionId: (Deno.env.get('GOOGLE_ADS_CLIENT_REGISTERED_CONVERSION_ACTION_ID') ?? '')
      .replace(/\D/g, ''),
    apiVersion: Deno.env.get('GOOGLE_ADS_API_VERSION')?.trim() || 'v24',
  };

  if (Object.entries(credentials).some(([key, value]) => key !== 'apiVersion' && !value)) {
    throw new Error('Configuração server-side do Google Ads incompleta.');
  }
  if (
    !/^\d{10}$/.test(credentials.loginCustomerId)
    || !/^\d{10}$/.test(credentials.customerId)
    || !/^\d+$/.test(credentials.conversionActionId)
    || !/^v\d+$/.test(credentials.apiVersion)
  ) {
    throw new Error('Identificador server-side do Google Ads inválido.');
  }

  return credentials;
}

async function getAccessToken(credentials: GoogleAdsCredentials) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  const accessToken = asString(payload.access_token, 4096);
  if (!response.ok || !accessToken) {
    throw new Error('Não foi possível autenticar o envio de conversões ao Google Ads.');
  }
  return accessToken;
}

export function formatGoogleAdsDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Data da conversão inválida.');
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00:00');
}

export function retryAt(attempts: number, now = Date.now()) {
  const delayMinutes = Math.min(360, 5 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now + delayMinutes * 60_000).toISOString();
}

function readFailureIndex(error: JsonRecord) {
  const location = isRecord(error.location) ? error.location : null;
  const elements = location && Array.isArray(location.fieldPathElements)
    ? location.fieldPathElements
    : [];
  for (const element of elements) {
    if (!isRecord(element)) continue;
    const index = Number(element.index);
    if (Number.isInteger(index) && index >= 0) return index;
  }
  return -1;
}

function readFailureCode(error: JsonRecord) {
  if (!isRecord(error.errorCode)) return 'GOOGLE_ADS_PARTIAL_FAILURE';
  const entry = Object.entries(error.errorCode)
    .find(([, value]) => typeof value === 'string' && value);
  return entry ? `${entry[0]}:${entry[1]}` : 'GOOGLE_ADS_PARTIAL_FAILURE';
}

export function parseGoogleAdsFailures(payload: unknown): GoogleAdsFailure[] {
  if (!isRecord(payload) || !isRecord(payload.partialFailureError)) return [];
  const details = Array.isArray(payload.partialFailureError.details)
    ? payload.partialFailureError.details
    : [];
  const failures: GoogleAdsFailure[] = [];

  for (const detail of details) {
    if (!isRecord(detail) || !Array.isArray(detail.errors)) continue;
    for (const error of detail.errors) {
      if (!isRecord(error)) continue;
      failures.push({
        index: readFailureIndex(error),
        code: readFailureCode(error),
        message: asString(error.message, 500) || 'Conversão rejeitada pelo Google Ads.',
      });
    }
  }

  if (failures.length === 0) {
    failures.push({
      index: -1,
      code: `GOOGLE_ADS_PARTIAL_FAILURE:${asString(payload.partialFailureError.code, 40) || 'UNKNOWN'}`,
      message: asString(payload.partialFailureError.message, 500)
        || 'Uma ou mais conversões foram rejeitadas pelo Google Ads.',
    });
  }
  return failures;
}

function buildClickConversion(item: QueueItem, credentials: GoogleAdsCredentials) {
  return {
    conversionAction:
      `customers/${credentials.customerId}/conversionActions/${credentials.conversionActionId}`,
    conversionDateTime: formatGoogleAdsDateTime(item.conversion_date_time),
    conversionValue: Number(item.conversion_value),
    currencyCode: item.currency_code || 'BRL',
    orderId: item.order_id,
    [item.click_id_type]: item.click_id,
  };
}

async function uploadConversions(
  credentials: GoogleAdsCredentials,
  accessToken: string,
  queue: QueueItem[],
) {
  const response = await fetch(
    `https://googleads.googleapis.com/${credentials.apiVersion}/customers/${credentials.customerId}:uploadClickConversions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': credentials.developerToken,
        'login-customer-id': credentials.loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversions: queue.map((item) => buildClickConversion(item, credentials)),
        partialFailure: true,
        validateOnly: false,
      }),
    },
  );
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error)
      ? asString(payload.error.message, 500)
      : '';
    throw new Error(message || 'O Google Ads recusou o lote de conversões.');
  }
  return payload;
}

function safeFailureMessage(error: unknown) {
  return error instanceof Error
    ? asString(error.message, 500) || 'Falha não identificada.'
    : 'Falha não identificada.';
}

async function updateQueueItem(
  serviceClient: ServiceClient,
  item: QueueItem,
  update: JsonRecord,
) {
  const { error } = await serviceClient
    .schema('RetificaPremium')
    .from('Marketing_Offline_Conversions')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id_marketing_offline_conversions', item.id_marketing_offline_conversions)
    .eq('status', 'processing');
  if (error) throw new Error(`Falha ao atualizar fila de conversão: ${error.message}`);
}

async function markRetry(
  serviceClient: ServiceClient,
  item: QueueItem,
  code: string,
  message: string,
) {
  const failed = item.attempts >= RETRY_LIMIT;
  await updateQueueItem(serviceClient, item, {
    status: failed ? 'failed' : 'retry',
    next_attempt_at: failed ? new Date().toISOString() : retryAt(item.attempts),
    processing_started_at: null,
    google_error_code: code.slice(0, 160),
    google_error_message: message.slice(0, 500),
  });
}

async function processQueue(
  serviceClient: ServiceClient,
  credentials: GoogleAdsCredentials,
  accessToken: string,
) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .rpc('claim_marketing_offline_conversions', { p_limit: 50 });
  if (error) throw new Error(`Não foi possível reservar a fila de conversões: ${error.message}`);

  const queue = (data ?? []) as QueueItem[];
  if (queue.length === 0) return { claimed: 0, uploaded: 0, retry: 0, failed: 0 };

  try {
    const payload = await uploadConversions(credentials, accessToken, queue);
    const failures = parseGoogleAdsFailures(payload);
    const failureByIndex = new Map<number, GoogleAdsFailure>();
    failures.forEach((failure) => {
      if (failure.index >= 0) failureByIndex.set(failure.index, failure);
    });
    const globalFailure = failures.find((failure) => failure.index < 0);
    let uploaded = 0;
    let retry = 0;
    let failed = 0;

    for (const [index, item] of queue.entries()) {
      const failure = failureByIndex.get(index) ?? globalFailure;
      if (!failure || failure.code.includes('DUPLICATE_CLICK_CONVERSION')) {
        await updateQueueItem(serviceClient, item, {
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
          processing_started_at: null,
          google_error_code: null,
          google_error_message: null,
          google_result: {
            acknowledged: true,
            duplicateAcknowledged: Boolean(failure),
          },
        });
        uploaded += 1;
        continue;
      }

      await markRetry(serviceClient, item, failure.code, failure.message);
      if (item.attempts >= RETRY_LIMIT) failed += 1;
      else retry += 1;
    }

    return { claimed: queue.length, uploaded, retry, failed };
  } catch (error) {
    const message = safeFailureMessage(error);
    for (const item of queue) {
      await markRetry(serviceClient, item, 'GOOGLE_ADS_REQUEST_FAILED', message);
    }
    return {
      claimed: queue.length,
      uploaded: 0,
      retry: queue.filter((item) => item.attempts < RETRY_LIMIT).length,
      failed: queue.filter((item) => item.attempts >= RETRY_LIMIT).length,
    };
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Configuração interna indisponível.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);
  const providedSecret = request.headers.get('x-retiflow-cron-secret') ?? '';
  const { data: validSecret, error: secretError } = await serviceClient
    .schema('RetificaPremium')
    .rpc('validate_marketing_offline_conversion_cron_secret', { p_secret: providedSecret });
  if (secretError || validSecret !== true) {
    return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const credentials = getCredentials();
    const accessToken = await getAccessToken(credentials);
    const result = await processQueue(serviceClient, credentials, accessToken);
    console.log(JSON.stringify({ event: 'marketing_offline_conversions', ...result }));
    return new Response(JSON.stringify({ status: 200, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('marketing-offline-conversions failed', safeFailureMessage(error));
    return new Response(JSON.stringify({ error: 'Não foi possível processar as conversões agora.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
});
