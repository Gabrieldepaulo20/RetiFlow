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

function normalizeMessage(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function escapeHtml(value: string) {
  return value.replace(/[<>&"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
  }[char]!));
}

function formatDateTime(value = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(value);
}

function formatEmailAddress(email: string, displayName?: string) {
  const safeName = (displayName ?? '').replace(/["\r\n]/g, '').trim();
  return safeName ? `"${safeName}" <${email}>` : email;
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

async function signingKey(secret: string, date: string, region: string) {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 'ses');
  return hmac(kService, 'aws4_request');
}

function amzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function sendSesEmail(params: {
  subject: string;
  text: string;
  html: string;
  request: Request;
}) {
  const region = Deno.env.get('AWS_REGION') ?? Deno.env.get('AWS_SES_REGION') ?? 'us-east-1';
  const accessKey = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const secretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';
  const from = Deno.env.get('SUPPORT_FROM_EMAIL') ?? '';
  const fromName = Deno.env.get('SUPPORT_FROM_NAME') ?? 'Sistema Retiflow';
  const to = Deno.env.get('SUPPORT_TO_EMAIL') ?? 'gabrielwilliam208@gmail.com';
  const replyTo = Deno.env.get('SUPPORT_REPLY_TO_EMAIL') ?? to;

  if (!accessKey || !secretKey || !from || !to) {
    throw new Error('SES não configurado. Configure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SUPPORT_FROM_EMAIL e SUPPORT_TO_EMAIL.');
  }

  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const body = JSON.stringify({
    FromEmailAddress: formatEmailAddress(from, fromName),
    ReplyToAddresses: [replyTo],
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: params.text, Charset: 'UTF-8' },
          Html: { Data: params.html, Charset: 'UTF-8' },
        },
      },
    },
  });

  const { amzDate, dateStamp } = amzDates();
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hex(await hmac(await signingKey(secretKey, dateStamp, region), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`SES retornou ${response.status}: ${await response.text()}`);
  }

  return { to };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405, request);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500, request);
  }

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request);

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request);
  }

  const payload = await request.json().catch(() => ({}));
  const message = normalizeMessage(payload.message);
  if (message.length < 10) {
    return jsonResponse({ error: 'Descreva o chamado com pelo menos 10 caracteres.' }, 400, request);
  }

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await service
    .schema('RetificaPremium')
    .from('Chamados_Suporte')
    .select('id_chamados_suporte', { count: 'exact', head: true })
    .eq('fk_auth_user', userData.user.id)
    .gte('created_at', since);

  if ((count ?? 0) >= 3) {
    return jsonResponse({ error: 'Muitos chamados em sequência. Aguarde alguns minutos antes de enviar novamente.' }, 429, request);
  }

  const userName = String(userData.user.user_metadata?.name ?? userData.user.email);
  const supportTo = Deno.env.get('SUPPORT_TO_EMAIL') ?? 'gabrielwilliam208@gmail.com';
  const safeUserName = escapeHtml(userName);
  const safeUserEmail = escapeHtml(userData.user.email);
  const safeMessage = escapeHtml(message);
  const createdAtLabel = formatDateTime();
  const { data: inserted, error: insertError } = await service
    .schema('RetificaPremium')
    .from('Chamados_Suporte')
    .insert({
      fk_auth_user: userData.user.id,
      user_email: userData.user.email,
      user_name: userName,
      mensagem: message,
      status: 'PENDING',
      email_to: supportTo,
      metadata: {
        userAgent: request.headers.get('User-Agent'),
        origin: request.headers.get('Origin'),
      },
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    return jsonResponse({ error: `Falha ao salvar chamado: ${insertError?.message ?? 'sem retorno'}` }, 500, request);
  }

  try {
    await sendSesEmail({
      request,
      subject: `Novo chamado Retiflow - ${userName}`,
      text: [
        'Novo chamado no Retiflow',
        '',
        `Usuário: ${userName}`,
        `E-mail: ${userData.user.email}`,
        `Enviado em: ${createdAtLabel}`,
        '',
        'Mensagem:',
        message,
        '',
        'Responda este e-mail para falar diretamente com o responsável.',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="pt-BR">
          <body style="margin:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#17202a;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f8;padding:28px 12px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dfe7ec;box-shadow:0 18px 45px rgba(15,23,42,.10);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#0f6f7e,#1f9bb1);padding:26px 30px;color:#ffffff;">
                        <div style="font-size:12px;letter-spacing:2.5px;text-transform:uppercase;opacity:.82;font-weight:700;">Retiflow</div>
                        <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;font-weight:800;">Novo chamado recebido</h1>
                        <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:.92;">Um cliente enviou uma mensagem pelo sistema.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:26px 30px 8px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="padding:14px 16px;background:#f7fafb;border:1px solid #e2e8ee;border-radius:16px;">
                              <div style="font-size:12px;color:#6b7787;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">Solicitante</div>
                              <div style="font-size:18px;font-weight:800;color:#17202a;">${safeUserName}</div>
                              <div style="font-size:14px;color:#5f6b7a;margin-top:4px;">${safeUserEmail}</div>
                              <div style="font-size:12px;color:#7a8796;margin-top:10px;">Enviado em ${createdAtLabel}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 30px 8px;">
                        <div style="font-size:12px;color:#6b7787;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">Mensagem</div>
                        <div style="white-space:pre-wrap;font-size:16px;line-height:1.7;background:#ffffff;border-left:5px solid #1f9bb1;padding:16px 18px;border-radius:12px;color:#1f2937;box-shadow:inset 0 0 0 1px #e5edf2;">${safeMessage}</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 30px 30px;">
                        <a href="mailto:${safeUserEmail}?subject=Re:%20Chamado%20Retiflow" style="display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;border-radius:14px;padding:13px 18px;font-size:14px;font-weight:800;">Responder cliente</a>
                        <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#7a8796;">Este e-mail foi enviado automaticamente pelo Retiflow. Ao responder, a mensagem vai para o e-mail do solicitante.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });
  } catch (error) {
    const emailError = error instanceof Error ? error.message : 'Falha desconhecida ao enviar e-mail.';
    await service
      .schema('RetificaPremium')
      .from('Chamados_Suporte')
      .delete()
      .eq('id_chamados_suporte', inserted.id_chamados_suporte);

    return jsonResponse({
      error: 'Não foi possível enviar o e-mail do chamado. Nada foi salvo.',
      details: emailError,
    }, 502, request);
  }

  const { data: updated } = await service
    .schema('RetificaPremium')
    .from('Chamados_Suporte')
    .update({
      status: 'EMAIL_SENT',
      email_sent_at: new Date().toISOString(),
      email_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id_chamados_suporte', inserted.id_chamados_suporte)
    .select('*')
    .single();

  return jsonResponse({
    mensagem: 'Chamado salvo e e-mail enviado.',
    emailStatus: 'sent',
    ticket: updated ?? inserted,
  }, 200, request);
});
