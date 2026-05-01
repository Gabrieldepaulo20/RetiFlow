import { createClient } from 'npm:@supabase/supabase-js@2';

function redirectWithStatus(status: 'connected' | 'error', message?: string) {
  const configuredOrigin = Deno.env.get('APP_ORIGIN') ?? Deno.env.get('APP_BASE_URL') ?? Deno.env.get('AUTH_REDIRECT_TO');
  let appOrigin = 'http://localhost:5173';
  if (configuredOrigin) {
    try {
      appOrigin = new URL(configuredOrigin).origin;
    } catch {
      appOrigin = 'http://localhost:5173';
    }
  }
  const url = new URL('/contas-a-pagar', appOrigin);
  url.searchParams.set('view', 'sugestoes');
  url.searchParams.set('gmail', status);
  if (message) url.searchParams.set('message', message.slice(0, 120));
  return Response.redirect(url.toString(), 302);
}

function resolveRedirectUri() {
  const configured = Deno.env.get('GOOGLE_REDIRECT_URI')?.trim();
  if (configured) return configured;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '');
  if (!supabaseUrl) return '';
  return `${supabaseUrl}/functions/v1/gmail-oauth-callback`;
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

async function encryptionKey() {
  const secret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY') ?? '';
  if (secret.length < 24) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY ausente ou fraca.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt']);
}

async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return `${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const oauthError = url.searchParams.get('error');
  if (oauthError) return redirectWithStatus('error', oauthError);
  if (!code || !state) return redirectWithStatus('error', 'callback_invalido');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  const redirectUri = resolveRedirectUri();
  if (!supabaseUrl || !serviceKey) {
    return redirectWithStatus('error', 'configuracao_supabase');
  }
  if (!clientId || !clientSecret || !redirectUri) {
    return redirectWithStatus('error', 'configuracao_google');
  }

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: stateRow, error: stateError } = await service
    .schema('RetificaPremium')
    .from('Gmail_OAuth_States')
    .select('*')
    .eq('state', state)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (stateError || !stateRow) return redirectWithStatus('error', 'state_expirado');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) return redirectWithStatus('error', 'token_google');
  const tokenData = await tokenResponse.json() as { access_token?: string; refresh_token?: string };
  if (!tokenData.access_token || !tokenData.refresh_token) return redirectWithStatus('error', 'sem_refresh_token');

  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileResponse.ok) return redirectWithStatus('error', 'perfil_gmail');
  const profile = await profileResponse.json() as { emailAddress?: string };
  const email = (profile.emailAddress ?? '').trim().toLowerCase();
  if (!email) return redirectWithStatus('error', 'email_gmail');

  let encrypted: string;
  try {
    encrypted = await encryptToken(tokenData.refresh_token);
  } catch {
    return redirectWithStatus('error', 'criptografia_token');
  }
  const { error: upsertError } = await service
    .schema('RetificaPremium')
    .from('Gmail_Connections')
    .upsert({
      fk_auth_user: stateRow.fk_auth_user,
      email,
      refresh_token_cipher: encrypted,
      status: 'CONNECTED',
      sync_enabled: true,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fk_auth_user,email' });

  if (upsertError) return redirectWithStatus('error', 'salvar_conexao');

  await service
    .schema('RetificaPremium')
    .from('Gmail_OAuth_States')
    .update({ used_at: new Date().toISOString() })
    .eq('id_gmail_oauth_states', stateRow.id_gmail_oauth_states);

  return redirectWithStatus('connected');
});
