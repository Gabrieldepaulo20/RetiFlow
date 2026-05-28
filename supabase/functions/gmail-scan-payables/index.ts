import { createClient } from 'npm:@supabase/supabase-js@2';

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

const scanVersion = 'ai-v2';
const supportedAttachmentTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const maxAttachmentBytes = 10 * 1024 * 1024;
const maxAttachmentsPerMessage = 3;

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

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY') ?? '';
  if (secret.length < 24) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY ausente ou fraca.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptToken(cipher: string) {
  const [ivRaw, payloadRaw] = cipher.split(':');
  if (!ivRaw || !payloadRaw) throw new Error('Refresh token inválido.');
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivRaw) },
    key,
    fromBase64(payloadRaw),
  );
  return new TextDecoder().decode(decrypted);
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  if (!clientId || !clientSecret) throw new Error('Credenciais Google OAuth não configuradas no servidor.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Falha ao renovar token Google (${response.status}).`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google não retornou access_token.');
  return data.access_token;
}

function header(headers: Array<{ name?: string; value?: string }>, name: string) {
  return headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseFrom(value: string) {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { name: value || 'Remetente Gmail', email: value || 'gmail@unknown.local' };
  return {
    name: match[1].replace(/^"|"$/g, '').trim() || match[2],
    email: match[2].trim().toLowerCase(),
  };
}

function extractMoney(text: string) {
  const match = text.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function extractDate(text: string) {
  const match = text.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00`;
}

function buildTitle(subject: string, senderName: string) {
  return (subject.replace(/\s+/g, ' ').trim() || `Conta de ${senderName || 'fornecedor'}`).slice(0, 120);
}

type GmailPayload = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPayload[];
};

type GmailAttachment = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

type PayableEmailAnalysis = {
  isPayable: boolean;
  title: string;
  amount: number | null;
  dueDate: string | null;
  supplierName: string;
  paymentMethod: 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'DINHEIRO' | 'CHEQUE' | 'DEBITO_AUTOMATICO';
  confidence: number;
  reason: string;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - normalized.length % 4) % 4);
  return atob(normalized + padding);
}

function fromBase64Url(value: string) {
  return Uint8Array.from(decodeBase64Url(value), (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPayloadText(payload?: GmailPayload): string {
  if (!payload) return '';
  const chunks: string[] = [];
  const data = payload.body?.data;
  if (data && (payload.mimeType === 'text/plain' || payload.mimeType === 'text/html')) {
    try {
      const decoded = decodeBase64Url(data);
      chunks.push(payload.mimeType === 'text/html' ? stripHtml(decoded) : decoded);
    } catch {
      // Ignore malformed body chunks and continue with other parts/snippet.
    }
  }
  for (const part of payload.parts ?? []) {
    const text = extractPayloadText(part);
    if (text) chunks.push(text);
  }
  return chunks.join('\n').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function collectAttachmentParts(payload?: GmailPayload, found: GmailPayload[] = []) {
  if (!payload) return found;
  const filename = payload.filename?.trim();
  const attachmentId = payload.body?.attachmentId;
  const mimeType = payload.mimeType ?? '';
  const size = payload.body?.size ?? 0;
  if (
    filename &&
    attachmentId &&
    supportedAttachmentTypes.has(mimeType) &&
    size > 0 &&
    size <= maxAttachmentBytes &&
    found.length < maxAttachmentsPerMessage
  ) {
    found.push(payload);
  }
  for (const part of payload.parts ?? []) collectAttachmentParts(part, found);
  return found;
}

async function getGmailAttachments(params: {
  accessToken: string;
  messageId: string;
  payload?: GmailPayload;
}) {
  const attachments: GmailAttachment[] = [];
  for (const part of collectAttachmentParts(params.payload)) {
    const attachmentId = part.body?.attachmentId;
    if (!attachmentId) continue;
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    if (!response.ok) continue;
    const data = await response.json() as { data?: string };
    if (!data.data) continue;
    attachments.push({
      filename: part.filename ?? `anexo-${attachments.length + 1}`,
      mimeType: part.mimeType ?? 'application/octet-stream',
      bytes: fromBase64Url(data.data),
    });
  }
  return attachments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getOutputText(response: unknown) {
  if (isRecord(response) && typeof response.output_text === 'string') return response.output_text;

  const chunks: string[] = [];
  const output = isRecord(response) && Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const contentItems = isRecord(item) && Array.isArray(item.content) ? item.content : [];
    for (const content of contentItems) {
      if (isRecord(content) && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('A IA não retornou JSON válido.');
    return JSON.parse(match[0]);
  }
}

function normalizePaymentMethod(value: unknown): PayableEmailAnalysis['paymentMethod'] {
  const method = String(value ?? 'BOLETO').toUpperCase();
  return ['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'CHEQUE', 'DEBITO_AUTOMATICO'].includes(method)
    ? method as PayableEmailAnalysis['paymentMethod']
    : 'BOLETO';
}

function normalizeAnalysis(raw: unknown, subject: string, senderName: string): PayableEmailAnalysis {
  const root = isRecord(raw) ? raw : {};
  const amount = extractMoney(String(root.amount ?? '')) ?? (typeof root.amount === 'number' ? root.amount : null);
  const dueDate = typeof root.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(root.dueDate)
    ? root.dueDate
    : extractDate(String(root.dueDate ?? ''));

  return {
    isPayable: Boolean(root.isPayable),
    title: String(root.title ?? buildTitle(subject, senderName)).replace(/\s+/g, ' ').trim().slice(0, 120),
    amount: typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : null,
    dueDate: dueDate ? `${dueDate.slice(0, 10)}T00:00:00` : null,
    supplierName: String(root.supplierName ?? (senderName || 'Fornecedor não identificado')).replace(/\s+/g, ' ').trim().slice(0, 120),
    paymentMethod: normalizePaymentMethod(root.paymentMethod),
    confidence: Math.max(0, Math.min(100, Number(root.confidence ?? 0))),
    reason: String(root.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

async function analyzePayableEmail(params: {
  apiKey: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  received: string;
  snippet: string;
  bodyText: string;
  attachments: GmailAttachment[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const emailText = [
    `Assunto: ${params.subject}`,
    `Remetente: ${params.senderName} <${params.senderEmail}>`,
    `Recebido em: ${params.received}`,
    `Trecho: ${params.snippet}`,
    `Anexos analisáveis: ${params.attachments.map((attachment) => `${attachment.filename} (${attachment.mimeType})`).join(', ') || 'nenhum'}`,
    '',
    'Corpo do e-mail:',
    params.bodyText.slice(0, 8000),
  ].join('\n');
  const prompt = [
    `Hoje é ${today}.`,
    'Você analisa e-mails brasileiros para sugerir contas a pagar no sistema de uma retífica.',
    'Retorne SOMENTE JSON válido, sem Markdown.',
    '',
    'Formato obrigatório:',
    '{ "isPayable": boolean, "title": string, "supplierName": string, "amount": number|null, "dueDate": "YYYY-MM-DD"|null, "paymentMethod": "PIX|BOLETO|TRANSFERENCIA|CARTAO_CREDITO|CARTAO_DEBITO|DINHEIRO|CHEQUE|DEBITO_AUTOMATICO", "confidence": number, "reason": string }',
    '',
    'Regras:',
    '- isPayable=true apenas para boleto, fatura, nota, mensalidade, cobrança, débito automático ou pagamento real que deva entrar em contas a pagar.',
    '- Promoções, propagandas, newsletter, venda de maquininha, desconto, campanha de marketing e avisos sem cobrança real devem ser isPayable=false.',
    '- Nunca invente valor ou vencimento. Se não estiver claro, use null.',
    '- Se houver PDF/imagem anexa, priorize o conteúdo do anexo sobre o texto do e-mail.',
    '- Em boletos, procure valor, vencimento, beneficiário/cedente, pagador e linha digitável.',
    '- Datas brasileiras aparecem como DD/MM/AAAA. Nunca interprete 10/06/2026 como 06 de outubro; isso é 10 de junho.',
    '- Se houver duas interpretações possíveis para uma data numérica, prefira o padrão brasileiro e uma data coerente com o recebimento do e-mail.',
    '- Para criar sugestão útil, valor e vencimento precisam estar claros no e-mail.',
    '- Use title simples para o usuário final, como "Boleto Viação Sertanezina" ou "Fatura Nubank Empresas".',
    '- confidence de 0 a 100 representa segurança da sugestão.',
    '',
    emailText,
  ].join('\n');

  const uploadedFileIds: string[] = [];
  try {
    const imageInputs = params.attachments
      .filter((attachment) => attachment.mimeType.startsWith('image/'))
      .map((attachment) => ({
        type: 'input_image',
        image_url: `data:${attachment.mimeType};base64,${toBase64(attachment.bytes)}`,
      }));

    for (const attachment of params.attachments) {
      if (attachment.mimeType.startsWith('image/')) continue;
      const file = new File([attachment.bytes], attachment.filename, { type: attachment.mimeType });
      uploadedFileIds.push((await uploadOpenAIFile(file, params.apiKey)).id);
    }

    const content = [
      { type: 'input_text', text: prompt },
      ...imageInputs,
      ...uploadedFileIds.map((file_id) => ({ type: 'input_file', file_id })),
    ];
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0,
        input: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falha na análise por IA (${response.status}): ${text.slice(0, 300)}`);
    }

    return normalizeAnalysis(parseJsonObject(getOutputText(await response.json())), params.subject, params.senderName);
  } finally {
    await Promise.all(uploadedFileIds.map((fileId) => deleteOpenAIFile(fileId, params.apiKey)));
  }
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uploadOpenAIFile(file: File, apiKey: string) {
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('file', file, file.name);

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Falha ao enviar anexo para IA (${response.status}).`);
  }

  return await response.json() as { id: string };
}

async function deleteOpenAIFile(fileId: string, apiKey: string) {
  await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => undefined);
}

async function recordScannedMessage(service: ReturnType<typeof createClient>, existingId: string | null, payload: Record<string, unknown>) {
  if (existingId) {
    await service
      .schema('RetificaPremium')
      .from('Gmail_Scanned_Messages')
      .update(payload)
      .eq('id_gmail_scanned_messages', existingId);
    return;
  }

  await service.schema('RetificaPremium').from('Gmail_Scanned_Messages').insert(payload);
}

async function listGmailMessageIds(accessToken: string, query: string, maxResults = 20) {
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('maxResults', String(maxResults));
  listUrl.searchParams.set('q', query);

  const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listResponse.ok) throw new Error(`Falha ao listar Gmail (${listResponse.status}).`);
  const list = await listResponse.json() as { messages?: Array<{ id: string }> };
  return (list.messages ?? []).map((item) => item.id);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500, request);
  if (!openAiKey) return jsonResponse({ error: 'OPENAI_API_KEY não configurada na Supabase Function.' }, 500, request);

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request);

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: connection, error: connectionError } = await service
    .schema('RetificaPremium')
    .from('Gmail_Connections')
    .select('*')
    .eq('fk_auth_user', userData.user.id)
    .eq('status', 'CONNECTED')
    .eq('sync_enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (connectionError || !connection) return jsonResponse({ error: 'Gmail ainda não conectado.' }, 400, request);

  const errors: string[] = [];
  let created = 0;
  let skipped = 0;
  let scanned = 0;

  try {
    const accessToken = await refreshAccessToken(await decryptToken(connection.refresh_token_cipher));
    const queries = [
      'newer_than:90d (boleto OR fatura OR "nota fiscal" OR vencimento OR pagamento)',
      'newer_than:90d has:attachment (boleto OR fatura OR "nota fiscal" OR vencimento OR pagamento OR cobrança OR mensalidade OR invoice)',
      'newer_than:45d filename:pdf',
    ];
    const messageIds = Array.from(new Set((await Promise.all(
      queries.map((query, index) => listGmailMessageIds(accessToken, query, index === 2 ? 15 : 25)),
    )).flat())).slice(0, 50);

    for (const messageId of messageIds) {
      scanned += 1;
      const { data: existing } = await service
        .schema('RetificaPremium')
        .from('Gmail_Scanned_Messages')
        .select('id_gmail_scanned_messages,fk_sugestoes_email,message_hash')
        .eq('fk_auth_user', userData.user.id)
        .eq('gmail_message_id', messageId)
        .maybeSingle();

      if (existing?.fk_sugestoes_email || String(existing?.message_hash ?? '').startsWith(`${scanVersion}:`)) {
        skipped += 1;
        continue;
      }

      const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!detailResponse.ok) {
        errors.push(`Mensagem ${messageId}: erro ${detailResponse.status}`);
        continue;
      }

      const detail = await detailResponse.json() as {
        snippet?: string;
        internalDate?: string;
        payload?: GmailPayload & { headers?: Array<{ name?: string; value?: string }> };
      };
      const headers = detail.payload?.headers ?? [];
      const subject = header(headers, 'Subject');
      const from = parseFrom(header(headers, 'From'));
      const received = detail.internalDate
        ? new Date(Number(detail.internalDate)).toISOString()
        : new Date(header(headers, 'Date') || Date.now()).toISOString();
      const bodyText = extractPayloadText(detail.payload);
      const attachments = await getGmailAttachments({ accessToken, messageId, payload: detail.payload });
      const text = `${subject}\n${from.name}\n${detail.snippet ?? ''}\n${bodyText}`;
      let analysis: PayableEmailAnalysis;
      try {
        analysis = await analyzePayableEmail({
          apiKey: openAiKey,
          subject,
          senderName: from.name,
          senderEmail: from.email,
          received,
          snippet: detail.snippet ?? '',
          bodyText,
          attachments,
        });
      } catch (error) {
        errors.push(`Mensagem ${messageId}: ${error instanceof Error ? error.message : 'falha na IA'}`);
        continue;
      }

      if (!analysis.isPayable || !analysis.amount || !analysis.dueDate || analysis.confidence < 55) {
        skipped += 1;
        await recordScannedMessage(service, existing?.id_gmail_scanned_messages ?? null, {
          fk_auth_user: userData.user.id,
          gmail_message_id: messageId,
          message_hash: `${scanVersion}:${await sha256Hex(`${text}\n${attachments.map((attachment) => attachment.filename).join('\n')}`)}`,
          assunto: subject,
          email_remetente: from.email,
          recebido_em: received,
          fk_sugestoes_email: null,
        });
        continue;
      }

      const { data: suggestion, error: suggestionError } = await service
        .schema('RetificaPremium')
        .from('Sugestoes_Email')
        .insert({
          fk_auth_user: userData.user.id,
          assunto: subject || analysis.title,
          nome_remetente: from.name,
          email_remetente: from.email,
          recebido_em: received,
          titulo_sugerido: analysis.title,
          valor_sugerido: analysis.amount,
          vencimento_sugerido: analysis.dueDate,
          fornecedor_sugerido: analysis.supplierName,
          forma_pagamento_sugerida: analysis.paymentMethod,
          confianca: analysis.confidence,
          status: 'PENDING',
          trecho_email: [analysis.reason, detail.snippet].filter(Boolean).join(' — ').slice(0, 500) || null,
        })
        .select('id_sugestoes_email')
        .single();

      if (suggestionError || !suggestion) {
        errors.push(`Mensagem ${messageId}: ${suggestionError?.message ?? 'falha ao criar sugestão'}`);
        continue;
      }

      await recordScannedMessage(service, existing?.id_gmail_scanned_messages ?? null, {
        fk_auth_user: userData.user.id,
        gmail_message_id: messageId,
        message_hash: `${scanVersion}:${await sha256Hex(`${text}\n${attachments.map((attachment) => attachment.filename).join('\n')}`)}`,
        assunto: subject,
        email_remetente: from.email,
        recebido_em: received,
        fk_sugestoes_email: suggestion.id_sugestoes_email,
      });
      created += 1;
    }

    await service
      .schema('RetificaPremium')
      .from('Gmail_Connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id_gmail_connections', connection.id_gmail_connections);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao buscar Gmail.';
    await service
      .schema('RetificaPremium')
      .from('Gmail_Connections')
      .update({ status: 'ERROR', last_error: message, updated_at: new Date().toISOString() })
      .eq('id_gmail_connections', connection.id_gmail_connections);
    return jsonResponse({ error: message }, 500, request);
  }

  return jsonResponse({ created, skipped, scanned, errors }, 200, request);
});
