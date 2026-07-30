import { createClient } from 'npm:@supabase/supabase-js@2';
import { classifyGmailApiFailure } from '../_shared/gmail-api-errors.ts';

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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - normalized.length % 4) % 4);
  return atob(normalized + padding);
}

function getEmailFromIdToken(idToken?: string) {
  if (!idToken) return '';

  try {
    const [, payload] = idToken.split('.');
    if (!payload) return '';
    const parsed = JSON.parse(decodeBase64Url(payload)) as { email?: string; email_verified?: boolean };
    if (parsed.email_verified === false) return '';
    return (parsed.email ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
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

type OAuthStateRow = {
  id_gmail_oauth_states: string;
  fk_auth_user: string;
  flow_kind?: 'legacy' | 'self' | 'support';
  fk_actor_usuarios?: string | null;
  fk_target_usuarios?: string | null;
  fk_sessao_suporte?: string | null;
};

async function validateSupportOAuthState(
  service: ReturnType<typeof createClient>,
  stateRow: OAuthStateRow,
) {
  const contextValues = [
    stateRow.fk_actor_usuarios,
    stateRow.fk_target_usuarios,
    stateRow.fk_sessao_suporte,
  ];
  const hasSupportContext = contextValues.every(Boolean);
  if (stateRow.flow_kind === 'self') {
    return contextValues.every((value) => !value);
  }
  if (stateRow.flow_kind !== 'support' || !hasSupportContext) return false;

  const { data: sessionIsValid, error: sessionError } = await service
    .schema('RetificaPremium')
    .rpc('sessao_suporte_valida', {
      p_sessao_suporte: stateRow.fk_sessao_suporte,
      p_actor_usuario_id: stateRow.fk_actor_usuarios,
      p_target_usuario_id: stateRow.fk_target_usuarios,
    });

  if (sessionError || sessionIsValid !== true) return false;

  const { data: target, error: targetError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('auth_id,status')
    .eq('id_usuarios', stateRow.fk_target_usuarios)
    .maybeSingle();

  return Boolean(
    !targetError
    && target?.status === true
    && target.auth_id === stateRow.fk_auth_user,
  );
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
    .update({ used_at: new Date().toISOString() })
    .eq('state', state)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .single();

  if (stateError || !stateRow) return redirectWithStatus('error', 'state_expirado');
  if (!await validateSupportOAuthState(service, stateRow as OAuthStateRow)) {
    return redirectWithStatus('error', 'suporte_encerrado');
  }

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
  const tokenData = await tokenResponse.json() as { access_token?: string; refresh_token?: string; id_token?: string };
  if (!tokenData.access_token || !tokenData.refresh_token) return redirectWithStatus('error', 'sem_refresh_token');

  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileResponse.ok) {
    const failure = await classifyGmailApiFailure(profileResponse, 'profile');
    return redirectWithStatus('error', failure.code);
  }

  const profile = await profileResponse.json() as { emailAddress?: string };
  let email = (profile.emailAddress ?? '').trim().toLowerCase();
  email ||= getEmailFromIdToken(tokenData.id_token);
  if (!email) {
    const { data: authUser } = await service.auth.admin.getUserById(stateRow.fk_auth_user);
    email = (authUser.user?.email ?? '').trim().toLowerCase();
  }
  if (!email) return redirectWithStatus('error', 'email_gmail');

  let encrypted: string;
  try {
    encrypted = await encryptToken(tokenData.refresh_token);
  } catch {
    return redirectWithStatus('error', 'criptografia_token');
  }

  const hasSupportContext = Boolean(
    stateRow.fk_actor_usuarios
    && stateRow.fk_target_usuarios
    && stateRow.fk_sessao_suporte,
  );

  if (hasSupportContext) {
    // A RPC revalida a sessão, salva o token e grava a auditoria no mesmo commit.
    const { error: supportSaveError } = await service
      .schema('RetificaPremium')
      .rpc('salvar_conexao_gmail_suporte', {
        p_oauth_state_id: stateRow.id_gmail_oauth_states,
        p_email: email,
        p_refresh_token_cipher: encrypted,
      });

    if (supportSaveError) return redirectWithStatus('error', 'suporte_encerrado');
  } else {
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
  }

  return redirectWithStatus('connected');
});
