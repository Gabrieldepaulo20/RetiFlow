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

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const configured = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (configured.length === 0 || configured.includes('*')) {
    return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': '*' };
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

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500, request);

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
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('maxResults', '10');
    listUrl.searchParams.set('q', 'newer_than:45d (boleto OR fatura OR "nota fiscal" OR vencimento OR pagamento)');

    const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listResponse.ok) throw new Error(`Falha ao listar Gmail (${listResponse.status}).`);
    const list = await listResponse.json() as { messages?: Array<{ id: string }> };

    for (const item of list.messages ?? []) {
      scanned += 1;
      const { data: existing } = await service
        .schema('RetificaPremium')
        .from('Gmail_Scanned_Messages')
        .select('id_gmail_scanned_messages')
        .eq('fk_auth_user', userData.user.id)
        .eq('gmail_message_id', item.id)
        .maybeSingle();

      if (existing) {
        skipped += 1;
        continue;
      }

      const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!detailResponse.ok) {
        errors.push(`Mensagem ${item.id}: erro ${detailResponse.status}`);
        continue;
      }

      const detail = await detailResponse.json() as {
        snippet?: string;
        internalDate?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };
      const headers = detail.payload?.headers ?? [];
      const subject = header(headers, 'Subject');
      const from = parseFrom(header(headers, 'From'));
      const received = detail.internalDate
        ? new Date(Number(detail.internalDate)).toISOString()
        : new Date(header(headers, 'Date') || Date.now()).toISOString();
      const text = `${subject}\n${from.name}\n${detail.snippet ?? ''}`;
      const amount = extractMoney(text);
      const dueDate = extractDate(text);

      if (!amount || !dueDate) {
        skipped += 1;
        await service.schema('RetificaPremium').from('Gmail_Scanned_Messages').insert({
          fk_auth_user: userData.user.id,
          gmail_message_id: item.id,
          message_hash: await sha256Hex(text),
          assunto: subject,
          email_remetente: from.email,
          recebido_em: received,
        });
        continue;
      }

      const { data: suggestion, error: suggestionError } = await service
        .schema('RetificaPremium')
        .from('Sugestoes_Email')
        .insert({
          fk_auth_user: userData.user.id,
          assunto: subject || buildTitle(subject, from.name),
          nome_remetente: from.name,
          email_remetente: from.email,
          recebido_em: received,
          titulo_sugerido: buildTitle(subject, from.name),
          valor_sugerido: amount,
          vencimento_sugerido: dueDate,
          fornecedor_sugerido: from.name,
          forma_pagamento_sugerida: 'BOLETO',
          confianca: 72,
          status: 'PENDING',
          trecho_email: detail.snippet ?? null,
        })
        .select('id_sugestoes_email')
        .single();

      if (suggestionError || !suggestion) {
        errors.push(`Mensagem ${item.id}: ${suggestionError?.message ?? 'falha ao criar sugestão'}`);
        continue;
      }

      await service.schema('RetificaPremium').from('Gmail_Scanned_Messages').insert({
        fk_auth_user: userData.user.id,
        gmail_message_id: item.id,
        message_hash: await sha256Hex(text),
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
        last_error: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
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
