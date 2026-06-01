import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  extractMimeHeader,
  extractReplyText,
  extractTicketId,
  isTrustedSnsUrl,
  verifySnsSignature,
  type SnsMessage,
} from './lib.ts';

const localDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const configured = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    const allowed = !origin || localDevOrigins.has(origin);
    return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? (origin || 'null') : 'null' };
  }

  if (configured.includes('*')) {
    const allowed = localDevOrigins.has(origin);
    return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? origin : 'null' };
  }

  const allowed = configured.includes(origin) || localDevOrigins.has(origin);
  return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? origin : 'null' };
}

function jsonResponse(body: unknown, status: number, request: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signingKey(secret: string, date: string, region: string, service: string) {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function amzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodeS3Path(value: string) {
  return `/${value.split('/').map((item) => encodeURIComponent(item)).join('/')}`;
}

async function fetchS3Mime(bucket: string, objectKey: string) {
  const region = Deno.env.get('AWS_REGION') ?? Deno.env.get('AWS_SES_REGION') ?? 'us-east-1';
  const accessKey = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const secretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';
  const sessionToken = Deno.env.get('AWS_SESSION_TOKEN') ?? '';
  if (!bucket || !objectKey || !accessKey || !secretKey) {
    throw new Error('Configuração S3 ausente.');
  }

  const service = 's3';
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const path = encodeS3Path(objectKey);
  const { amzDate, dateStamp } = amzDates();
  const payloadHash = await sha256Hex('');
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    ...(sessionToken ? [`x-amz-security-token:${sessionToken}`] : []),
    '',
  ].join('\n');
  const signedHeaders = [
    'host',
    'x-amz-content-sha256',
    'x-amz-date',
    ...(sessionToken ? ['x-amz-security-token'] : []),
  ].join(';');
  const canonicalRequest = ['GET', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hex(await hmac(await signingKey(secretKey, dateStamp, region, service), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${path}`, {
    headers: {
      Authorization: authorization,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
      ...(sessionToken ? { 'X-Amz-Security-Token': sessionToken } : {}),
    },
  });

  if (!response.ok) throw new Error(`S3 retornou ${response.status}.`);
  return response.text();
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error('Payload JSON inválido.');
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function headerRecipients(rawMime: string) {
  return [
    extractMimeHeader(rawMime, 'to'),
    extractMimeHeader(rawMime, 'delivered-to'),
    extractMimeHeader(rawMime, 'x-original-to'),
  ].filter(Boolean);
}

async function getRawMime(sesPayload: Record<string, unknown>) {
  const mail = (sesPayload.mail ?? {}) as Record<string, unknown>;
  const receipt = (sesPayload.receipt ?? {}) as Record<string, unknown>;
  const action = (receipt.action ?? {}) as Record<string, unknown>;
  const content = sesPayload.content;
  if (typeof content === 'string' && content.trim()) {
    return action.encoding === 'Base64'
      ? new TextDecoder().decode(Uint8Array.from(atob(content), (char) => char.charCodeAt(0)))
      : content;
  }

  if (action.type === 'S3') {
    const bucketName = String(action.bucketName ?? Deno.env.get('SES_INBOUND_BUCKET') ?? '');
    const objectKey = String(action.objectKey ?? '');
    return fetchS3Mime(bucketName, objectKey);
  }

  const fallbackBucket = (Deno.env.get('SES_INBOUND_BUCKET') ?? '').trim();
  const messageId = String(mail.messageId ?? '').trim();
  if (fallbackBucket && messageId) {
    const prefix = Deno.env.get('SES_INBOUND_OBJECT_PREFIX') ?? '';
    return fetchS3Mime(fallbackBucket, `${prefix}${messageId}`);
  }

  throw new Error('E-mail inbound sem conteúdo MIME.');
}

async function handleNotification(message: SnsMessage) {
  const inboundDomain = (Deno.env.get('SES_INBOUND_DOMAIN') ?? '').trim().toLowerCase();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!inboundDomain || !supabaseUrl || !serviceKey) throw new Error('Configuração inbound ausente.');

  const sesPayload = parseJson(message.Message);
  const mail = (sesPayload.mail ?? {}) as Record<string, unknown>;
  const rawMime = await getRawMime(sesPayload);
  const recipients = [...stringArray(mail.destination), ...headerRecipients(rawMime)];
  const ticketId = extractTicketId(recipients, inboundDomain);
  if (!ticketId) return { processed: false, reason: 'Destinatário sem ID de chamado.' };

  const reply = extractReplyText(rawMime);
  if (!reply) return { processed: false, reason: 'Resposta vazia.' };

  const sender = extractMimeHeader(rawMime, 'from') || String(mail.source ?? 'suporte');
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await service
    .schema('RetificaPremium')
    .rpc('registrar_resposta_chamado', {
      p_id_chamados_suporte: ticketId,
      p_resposta: reply,
      p_respondido_por: sender.slice(0, 160),
    });

  if (error) throw new Error('Falha ao registrar resposta.');
  const result = data as { status?: number; mensagem?: string } | null;
  if (!result || result.status !== 200) throw new Error(result?.mensagem ?? 'Falha ao registrar resposta.');

  return { processed: true };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  try {
    const expectedTopicArn = (Deno.env.get('SES_INBOUND_TOPIC_ARN') ?? '').trim();
    if (!expectedTopicArn) return jsonResponse({ error: 'Webhook inbound não configurado.' }, 503, request);

    const message = await request.json() as SnsMessage;
    if (!message?.Type || !message.TopicArn || message.TopicArn !== expectedTopicArn) {
      return jsonResponse({ error: 'Notificação não autorizada.' }, 401, request);
    }
    if (!await verifySnsSignature(message)) {
      return jsonResponse({ error: 'Notificação não autorizada.' }, 401, request);
    }

    if (message.Type === 'SubscriptionConfirmation') {
      if (!message.SubscribeURL || !isTrustedSnsUrl(message.SubscribeURL)) {
        return jsonResponse({ error: 'Confirmação inválida.' }, 401, request);
      }
      const response = await fetch(message.SubscribeURL);
      if (!response.ok) throw new Error('Não foi possível confirmar a inscrição SNS.');
      return jsonResponse({ confirmed: true }, 200, request);
    }

    if (message.Type !== 'Notification') {
      return jsonResponse({ ignored: true }, 200, request);
    }

    return jsonResponse(await handleNotification(message), 200, request);
  } catch (error) {
    console.error('[support-inbound]', error);
    return jsonResponse({ error: 'Não foi possível processar a resposta de suporte.' }, 500, request);
  }
});
