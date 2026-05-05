import { createClient } from 'npm:@supabase/supabase-js@2';

type AppModuleKey =
  | 'dashboard'
  | 'clients'
  | 'notes'
  | 'kanban'
  | 'closing'
  | 'payables'
  | 'invoices'
  | 'settings'
  | 'admin';

type UserRole = 'ADMIN' | 'FINANCEIRO' | 'PRODUCAO' | 'RECEPCAO';

type ModuleAccess = Partial<Record<AppModuleKey, boolean>>;

type DeletionStep = {
  key: string;
  label: string;
  count?: number;
  status: 'pending' | 'running' | 'done' | 'skipped';
};

type DeletionReport = {
  targetUserId: string;
  targetEmail: string;
  targetName: string;
  steps: DeletionStep[];
  totalRecords: number;
  warnings: string[];
};

type UserPresence = {
  userId: string;
  email: string;
  lastSeenAt: string;
  currentRoute?: string | null;
  isOnline: boolean;
};

const MASTER_MODULE_ACCESS: Required<ModuleAccess> = {
  dashboard: true,
  clients: true,
  notes: true,
  kanban: true,
  closing: true,
  payables: true,
  invoices: false,
  settings: true,
  admin: true,
};

type ActionPayload =
  | {
      action: 'create_user' | 'create_admin';
      email: string;
      name: string;
      phone?: string;
      role: UserRole;
      modules?: ModuleAccess;
    }
  | {
      action: 'reset_password' | 'resend_invite' | 'deactivate_user' | 'reactivate_user';
      userId: string;
      email?: string;
      confirmationEmail?: string;
    }
  | {
      action: 'analyze_delete_user' | 'delete_user';
      userId: string;
      confirmEmail: string;
    }
  | {
      action: 'set_modules';
      userId: string;
      modules: ModuleAccess;
    }
  | {
      action: 'promote_to_admin';
      userId: string;
    }
  | {
      action: 'start_support_impersonation';
      targetUserId: string;
      reason: string;
    }
  | {
      action: 'end_support_impersonation';
      sessionId: string;
    }
  | {
      action: 'get_user_presence';
    };

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

const roleToAccess: Record<UserRole, string> = {
  ADMIN: 'administrador',
  FINANCEIRO: 'financeiro',
  PRODUCAO: 'produção',
  RECEPCAO: 'recepção',
};

function accessToRole(access: string): UserRole {
  const normalized = access.trim().toLowerCase();
  if (normalized === 'administrador') return 'ADMIN';
  if (normalized === 'financeiro') return 'FINANCEIRO';
  if (normalized === 'produção' || normalized === 'producao') return 'PRODUCAO';
  return 'RECEPCAO';
}

const moduleToRpcParam: Record<AppModuleKey, string> = {
  dashboard: 'p_dashboard',
  clients: 'p_clientes',
  notes: 'p_notas_de_entrada',
  kanban: 'p_kanban',
  closing: 'p_fechamento',
  payables: 'p_contas_a_pagar',
  invoices: 'p_nota_fiscal',
  settings: 'p_configuracoes',
  admin: 'p_admin',
};

function getConfiguredOrigins() {
  const raw = Deno.env.get('CORS_ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function getSuperAdminEmails() {
  const raw = Deno.env.get('SUPER_ADMIN_EMAILS') ?? Deno.env.get('SUPER_ADMIN_EMAIL') ?? '';
  return new Set(raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function isMegaMasterEmail(email: string, superAdminEmails: Set<string>) {
  return superAdminEmails.has(email.trim().toLowerCase());
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const configuredOrigins = getConfiguredOrigins();

  if (configuredOrigins.length === 0 || configuredOrigins.includes('*')) {
    return { allowed: true, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': '*' } };
  }

  if (!origin) {
    return { allowed: true, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': configuredOrigins[0] } };
  }

  const allowed = configuredOrigins.includes(origin) || localDevOrigins.has(origin);
  return {
    allowed,
    headers: {
      ...baseCorsHeaders,
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
    },
  };
}

function jsonResponse(body: unknown, status: number, request: Request) {
  const { headers } = getCorsHeaders(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function assertString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Campo obrigatório ausente: ${fieldName}.`);
  }
  return value.trim().slice(0, maxLength);
}

function assertEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('E-mail inválido.');
  }
  return email;
}

function optionalEmail(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return assertEmail(value);
}

function assertUserId(value: unknown) {
  const id = assertString(value, 'userId', 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Identificador de usuário inválido.');
  }
  return id;
}

function assertSessionId(value: unknown) {
  const id = assertString(value, 'sessionId', 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Identificador de sessão inválido.');
  }
  return id;
}

function assertReason(value: unknown) {
  const reason = assertString(value, 'reason', 500);
  if (reason.length < 8) {
    throw new Error('Informe um motivo com pelo menos 8 caracteres.');
  }
  return reason;
}

function assertRole(value: unknown): UserRole {
  if (value === 'ADMIN' || value === 'FINANCEIRO' || value === 'PRODUCAO' || value === 'RECEPCAO') {
    return value;
  }
  throw new Error('Perfil de acesso inválido.');
}

function normalizeModules(value: unknown): ModuleAccess {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<ModuleAccess>((accumulator, [key, enabled]) => {
    if (key in moduleToRpcParam && typeof enabled === 'boolean') {
      accumulator[key as AppModuleKey] = enabled;
    }
    return accumulator;
  }, {});
}

function escapeHtml(value: string) {
  return value.replace(/[<>&"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
  }[char]!));
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
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const region = Deno.env.get('AWS_REGION') ?? Deno.env.get('AWS_SES_REGION') ?? 'us-east-1';
  const accessKey = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const secretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';
  const from = Deno.env.get('ADMIN_FROM_EMAIL') ?? Deno.env.get('SUPPORT_FROM_EMAIL') ?? '';
  const fromName = Deno.env.get('ADMIN_FROM_NAME') ?? 'Sistema Retiflow';

  if (!accessKey || !secretKey || !from) {
    throw new Error('SES não configurado para e-mails administrativos.');
  }

  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const body = JSON.stringify({
    FromEmailAddress: formatEmailAddress(from, fromName),
    Destination: { ToAddresses: [params.to] },
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
}

async function sendResetConfirmationEmail(params: {
  to: string;
  targetEmail: string;
  targetName: string;
  requesterEmail: string;
}) {
  const safeTargetName = escapeHtml(params.targetName);
  const safeTargetEmail = escapeHtml(params.targetEmail);
  const safeRequesterEmail = escapeHtml(params.requesterEmail);
  const subject = `Retiflow - reset de senha solicitado para ${params.targetName}`;
  const text = [
    'Reset de senha solicitado no Retiflow',
    '',
    `Usuário: ${params.targetName}`,
    `E-mail da conta: ${params.targetEmail}`,
    `Solicitado por: ${params.requesterEmail}`,
    '',
    'Por segurança, o link de redefinição foi enviado somente para o e-mail da conta do usuário.',
  ].join('\n');
  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#17202a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f8;padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dfe7ec;">
                <tr>
                  <td style="background:#0f6f7e;padding:24px 28px;color:#ffffff;">
                    <div style="font-size:20px;font-weight:800;">Reset de senha solicitado</div>
                    <div style="font-size:13px;opacity:.9;margin-top:6px;">Confirmação administrativa Retiflow</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:26px 28px;">
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">O reset de senha foi solicitado para:</p>
                    <div style="background:#f4f7f8;border:1px solid #e2eaef;border-radius:14px;padding:16px;margin-bottom:18px;">
                      <div style="font-size:16px;font-weight:700;">${safeTargetName}</div>
                      <div style="font-size:14px;color:#52657a;margin-top:4px;">${safeTargetEmail}</div>
                    </div>
                    <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#334155;">Solicitado por: <strong>${safeRequesterEmail}</strong></p>
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Por segurança, o link de redefinição foi enviado somente para o e-mail principal da conta do usuário.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  await sendSesEmail({ to: params.to, subject, text, html });
}

async function sendInviteEmail(params: {
  to: string;
  targetName: string;
  actionLink: string;
  requesterEmail: string;
}) {
  const safeTargetName = escapeHtml(params.targetName);
  const safeActionLink = escapeHtml(params.actionLink);
  const safeRequesterEmail = escapeHtml(params.requesterEmail);
  const subject = 'Seu acesso seguro ao Retiflow';
  const text = [
    `Olá, ${params.targetName}.`,
    '',
    'Você recebeu um convite para acessar o Retiflow.',
    'Crie uma senha forte e, depois do primeiro acesso, ative MFA em Configurações > Segurança.',
    `Link do convite: ${params.actionLink}`,
    '',
    `Convite enviado por: ${params.requesterEmail}`,
    '',
    'Se você não esperava este convite, ignore esta mensagem e avise o responsável pelo sistema.',
  ].join('\n');
  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;background:#eef5f6;font-family:Arial,Helvetica,sans-serif;color:#17202a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5f6;padding:30px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #d6e5ea;box-shadow:0 18px 50px rgba(15,111,126,.16);">
                <tr>
                  <td style="background:linear-gradient(135deg,#0b5966,#1594a8);padding:30px 32px;color:#ffffff;">
                    <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.82;">Retiflow</div>
                    <div style="font-size:25px;font-weight:800;margin-top:8px;">Seu acesso seguro chegou</div>
                    <div style="font-size:14px;opacity:.92;margin-top:7px;">Crie sua senha e entre no sistema com proteção reforçada.</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 32px;">
                    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Olá, <strong>${safeTargetName}</strong>.</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#334155;">Você recebeu um convite para acessar o Retiflow. Clique no botão abaixo para criar sua senha. O link é temporário e deve ser usado apenas por você.</p>
                    <p style="margin:0 0 24px;">
                      <a href="${safeActionLink}" style="display:inline-block;background:#0f6f7e;color:#ffffff;text-decoration:none;font-weight:800;border-radius:16px;padding:15px 24px;">Criar minha senha</a>
                    </p>
                    <div style="background:#f4fafb;border:1px solid #d8edf1;border-radius:16px;padding:16px 18px;margin-bottom:18px;">
                      <div style="font-size:13px;font-weight:800;color:#0f6f7e;margin-bottom:8px;">Requisitos recomendados</div>
                      <div style="font-size:13px;line-height:1.7;color:#475569;">Use pelo menos 10 caracteres, com letras maiúsculas e minúsculas, número e símbolo. Depois do primeiro acesso, ative MFA em Configurações &gt; Segurança.</div>
                    </div>
                    <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">Se o botão não funcionar, copie e cole este link no navegador:</p>
                    <p style="word-break:break-all;margin:0 0 18px;font-size:12px;line-height:1.6;color:#475569;">${safeActionLink}</p>
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Convite enviado por ${safeRequesterEmail}. Se você não esperava este convite, ignore esta mensagem e avise o responsável pelo sistema.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  await sendSesEmail({ to: params.to, subject, text, html });
}

async function sendPasswordRecoveryEmail(params: {
  to: string;
  targetName: string;
  actionLink: string;
  requesterEmail: string;
}) {
  const safeTargetName = escapeHtml(params.targetName);
  const safeActionLink = escapeHtml(params.actionLink);
  const safeRequesterEmail = escapeHtml(params.requesterEmail);
  const subject = 'Redefina sua senha do Retiflow';
  const text = [
    `Olá, ${params.targetName}.`,
    '',
    'Foi solicitado um reset de senha para sua conta Retiflow.',
    'Use o link abaixo para criar uma nova senha forte.',
    `Link de recuperação: ${params.actionLink}`,
    '',
    `Solicitado por: ${params.requesterEmail}`,
    '',
    'Se você não solicitou essa recuperação, ignore esta mensagem e avise o responsável pelo sistema.',
  ].join('\n');
  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;background:#eef5f6;font-family:Arial,Helvetica,sans-serif;color:#17202a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5f6;padding:30px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #d6e5ea;box-shadow:0 18px 50px rgba(15,111,126,.16);">
                <tr>
                  <td style="background:linear-gradient(135deg,#233142,#0f6f7e);padding:30px 32px;color:#ffffff;">
                    <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.82;">Segurança Retiflow</div>
                    <div style="font-size:25px;font-weight:800;margin-top:8px;">Redefinição de senha</div>
                    <div style="font-size:14px;opacity:.92;margin-top:7px;">Crie uma nova senha para recuperar seu acesso.</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 32px;">
                    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Olá, <strong>${safeTargetName}</strong>.</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#334155;">Recebemos uma solicitação administrativa para redefinir sua senha. Clique no botão abaixo para criar uma nova senha forte.</p>
                    <p style="margin:0 0 24px;">
                      <a href="${safeActionLink}" style="display:inline-block;background:#0f6f7e;color:#ffffff;text-decoration:none;font-weight:800;border-radius:16px;padding:15px 24px;">Redefinir senha</a>
                    </p>
                    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:16px 18px;margin-bottom:18px;">
                      <div style="font-size:13px;font-weight:800;color:#9a3412;margin-bottom:8px;">Atenção de segurança</div>
                      <div style="font-size:13px;line-height:1.7;color:#7c2d12;">O link é temporário. Use pelo menos 10 caracteres com letras maiúsculas e minúsculas, número e símbolo. Nunca compartilhe este link.</div>
                    </div>
                    <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">Se o botão não funcionar, copie e cole este link no navegador:</p>
                    <p style="word-break:break-all;margin:0 0 18px;font-size:12px;line-height:1.6;color:#475569;">${safeActionLink}</p>
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Solicitado por ${safeRequesterEmail}. Se você não esperava esta recuperação, ignore esta mensagem e avise o responsável pelo sistema.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  await sendSesEmail({ to: params.to, subject, text, html });
}

function modulesToRpcPayload(modules: ModuleAccess) {
  return Object.entries(modules).reduce<Record<string, boolean>>((accumulator, [key, enabled]) => {
    const rpcParam = moduleToRpcParam[key as AppModuleKey];
    if (rpcParam && typeof enabled === 'boolean') {
      accumulator[rpcParam] = enabled;
    }
    return accumulator;
  }, {});
}

function normalizeInitialUserModules(role: UserRole, modules: ModuleAccess): ModuleAccess {
  const normalized = normalizeModules(modules);
  normalized.invoices = false;

  if (role !== 'ADMIN') {
    normalized.admin = false;
  }

  return normalized;
}

async function getRequester(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { ok: false as const, response: jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { ok: false as const, response: jsonResponse({ error: 'Configuração Supabase ausente na Function.' }, 500, request) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authUserData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authUserData.user?.email) {
    return { ok: false as const, response: jsonResponse({ error: 'Usuário autenticado obrigatório.' }, 401, request) };
  }

  const superAdminEmails = getSuperAdminEmails();
  if (superAdminEmails.size === 0) {
    return { ok: false as const, response: jsonResponse({ error: 'Allowlist de Super Admin não configurada no servidor.' }, 500, request) };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const requesterEmail = authUserData.user.email.trim().toLowerCase();
  const requesterIsMegaMaster = isMegaMasterEmail(requesterEmail, superAdminEmails);

  const { data: profiles, error: profileError } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, status, acesso, email')
    .eq('email', requesterEmail)
    .limit(1);

  if (profileError) {
    return { ok: false as const, response: jsonResponse({ error: 'Não foi possível validar o perfil interno do Super Admin.' }, 500, request) };
  }

  const profile = profiles?.[0] as { id_usuarios?: string; status?: boolean; acesso?: string; email?: string } | undefined;
  if (!profile || profile.status === false || profile.acesso !== 'administrador') {
    return { ok: false as const, response: jsonResponse({ error: 'Ação restrita a administradores ativos.' }, 403, request) };
  }

  if (!requesterIsMegaMaster) {
    const { data: moduleRow, error: moduleError } = await serviceClient
      .schema('RetificaPremium')
      .from('Modulos')
      .select('admin')
      .eq('fk_usuarios', profile.id_usuarios)
      .maybeSingle();

    if (moduleError) {
      return { ok: false as const, response: jsonResponse({ error: 'Não foi possível validar o módulo Admin do solicitante.' }, 500, request) };
    }

    if (!moduleRow || moduleRow.admin !== true) {
      return { ok: false as const, response: jsonResponse({ error: 'Módulo Admin não está explicitamente habilitado para este usuário.' }, 403, request) };
    }
  }

  return {
    ok: true as const,
    serviceClient,
    requesterEmail,
    requesterIsMegaMaster,
    superAdminEmails,
  };
}

async function findAuthUserByEmail(serviceClient: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Falha ao procurar usuário Auth: ${error.message}`);
  return data.users.find((user) => user.email?.trim().toLowerCase() === email) ?? null;
}

async function ensureAuthInvite(
  serviceClient: ReturnType<typeof createClient>,
  params: {
    email: string;
    name: string;
    requesterEmail: string;
  },
) {
  const { email, name, requesterEmail } = params;
  const existing = await findAuthUserByEmail(serviceClient, email);
  if (existing) return { userId: existing.id, emailSent: false };

  const redirectTo = Deno.env.get('AUTH_REDIRECT_TO') || Deno.env.get('APP_BASE_URL') || undefined;
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { name },
      redirectTo,
    },
  });

  if (error || !data.user?.id || !data.properties?.action_link) {
    throw new Error(`Falha ao gerar convite seguro: ${error?.message ?? 'link ausente'}`);
  }

  await sendInviteEmail({
    to: email,
    targetName: name,
    actionLink: data.properties.action_link,
    requesterEmail,
  });

  return {
    userId: data.user.id,
    emailSent: true,
  };
}

async function resendAuthInvite(
  serviceClient: ReturnType<typeof createClient>,
  params: {
    email: string;
    name: string;
    requesterEmail: string;
  },
) {
  const existing = await findAuthUserByEmail(serviceClient, params.email);
  if (existing && (existing as { email_confirmed_at?: string | null }).email_confirmed_at) {
    throw new Error('Este usuário já aceitou o convite. Use reset de senha caso ele tenha perdido o acesso.');
  }

  const redirectTo = Deno.env.get('AUTH_REDIRECT_TO') || Deno.env.get('APP_BASE_URL') || undefined;
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'invite',
    email: params.email,
    options: {
      data: { name: params.name },
      redirectTo,
    },
  });

  if (error || !data.properties?.action_link || !data.user?.id) {
    throw new Error(`Falha ao gerar novo convite: ${error?.message ?? 'link ausente'}`);
  }

  await sendInviteEmail({
    to: params.email,
    targetName: params.name,
    actionLink: data.properties.action_link,
    requesterEmail: params.requesterEmail,
  });

  return {
    authUserId: data.user.id,
  };
}

async function findInternalUserId(
  serviceClient: ReturnType<typeof createClient>,
  authUserId: string,
  email: string,
) {
  const { data: byAuthId, error: byAuthIdError } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (byAuthIdError) throw new Error(`Falha ao procurar perfil por Auth ID: ${byAuthIdError.message}`);
  if (byAuthId?.id_usuarios) return byAuthId.id_usuarios as string;

  const { data: byEmail, error: byEmailError } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('email', email)
    .maybeSingle();

  if (byEmailError) throw new Error(`Falha ao procurar perfil por e-mail: ${byEmailError.message}`);
  return byEmail?.id_usuarios ? byEmail.id_usuarios as string : null;
}

async function upsertInternalUser(
  serviceClient: ReturnType<typeof createClient>,
  params: {
    authUserId: string;
    email: string;
    name: string;
    phone?: string;
    role: UserRole;
    status?: boolean;
  },
) {
  const payload = {
    nome: params.name,
    email: params.email,
    telefone: params.phone ?? '',
    acesso: roleToAccess[params.role],
    status: params.status ?? true,
    auth_id: params.authUserId,
  };

  const existingUserId = await findInternalUserId(serviceClient, params.authUserId, params.email);
  if (existingUserId) {
    const { error } = await serviceClient
      .schema('RetificaPremium')
      .from('Usuarios')
      .update(payload)
      .eq('id_usuarios', existingUserId);

    if (error) throw new Error(`Falha ao atualizar perfil interno: ${error.message}`);
    return existingUserId;
  }

  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .insert(payload)
    .select('id_usuarios')
    .single();

  if (error) throw new Error(`Falha ao criar perfil interno: ${error.message}`);
  if (!data?.id_usuarios) throw new Error('Falha ao criar perfil interno.');
  return data.id_usuarios as string;
}

async function setModules(serviceClient: ReturnType<typeof createClient>, userId: string, modules: ModuleAccess) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .rpc('upsert_modulo', {
      p_fk_usuarios: userId,
      ...modulesToRpcPayload(modules),
    });

  if (error) throw new Error(`Falha ao salvar módulos: ${error.message}`);
  if (data && typeof data === 'object' && 'status' in data && data.status !== 200) {
    throw new Error(data.mensagem ?? 'Falha ao salvar módulos.');
  }
}

async function promoteUserToAdmin(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const targetUser = await getInternalModuleUser(serviceClient, userId);

  if (targetUser.status === false) {
    throw new Error('Reative o usuário antes de promovê-lo para Master.');
  }

  const { error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .update({ acesso: roleToAccess.ADMIN })
    .eq('id_usuarios', userId);

  if (error) throw new Error(`Falha ao promover usuário para Master: ${error.message}`);
  await setModules(serviceClient, userId, MASTER_MODULE_ACCESS);
  return targetUser;
}

async function callStatusRpc(serviceClient: ReturnType<typeof createClient>, rpcName: string, userId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .rpc(rpcName, { p_id_usuarios: userId });

  if (error) throw new Error(`[${rpcName}] ${error.message}`);
  if (data && typeof data === 'object' && 'status' in data && data.status !== 200) {
    throw new Error(data.mensagem ?? `[${rpcName}] Falha ao atualizar usuário.`);
  }
}

async function getInternalResetUser(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, telefone, acesso, status')
    .eq('id_usuarios', userId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar usuário: ${error.message}`);
  if (!data?.email) throw new Error('Usuário não encontrado.');
  if (data.status === false) throw new Error('Usuário inativo. Reative o usuário antes de resetar a senha.');
  return data as {
    id_usuarios: string;
    nome: string | null;
    email: string;
    telefone: string | null;
    acesso: string;
    status: boolean;
  };
}

async function getInternalDeleteUser(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, auth_id, status, acesso')
    .eq('id_usuarios', userId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar usuário: ${error.message}`);
  if (!data?.email) throw new Error('Usuário não encontrado.');
  return data as {
    id_usuarios: string;
    nome: string | null;
    email: string;
    auth_id: string | null;
    status: boolean;
    acesso: string;
  };
}

async function countByColumn(
  serviceClient: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string,
) {
  const { count, error } = await serviceClient
    .schema('RetificaPremium')
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value);

  if (error) throw new Error(`Falha ao contar ${table}: ${error.message}`);
  return count ?? 0;
}

async function countSupportSessions(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { count, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Sessoes_Suporte')
    .select('*', { count: 'exact', head: true })
    .or(`fk_actor_usuarios.eq.${userId},fk_target_usuarios.eq.${userId}`);

  if (error) throw new Error(`Falha ao contar sessões de suporte: ${error.message}`);
  return count ?? 0;
}

async function listPayablesOwnedByUser(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Contas_Pagar')
    .select('id_contas_pagar')
    .eq('fk_criado_por', userId);

  if (error) throw new Error(`Falha ao listar contas do usuário: ${error.message}`);
  return (data ?? []).map((row) => row.id_contas_pagar as string);
}

async function countPayableAttachments(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  payableIds: string[],
) {
  const directCount = await countByColumn(serviceClient, 'Contas_Pagar_Anexos', 'fk_criado_por', userId);
  if (payableIds.length === 0) return directCount;

  const { count, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Contas_Pagar_Anexos')
    .select('*', { count: 'exact', head: true })
    .in('fk_contas_pagar', payableIds);

  if (error) throw new Error(`Falha ao contar anexos de contas: ${error.message}`);
  return Math.max(directCount, count ?? 0);
}

async function countPayableHistory(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  payableIds: string[],
) {
  const directCount = await countByColumn(serviceClient, 'Contas_Pagar_Historico', 'fk_usuarios', userId);
  if (payableIds.length === 0) return directCount;

  const { count, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Contas_Pagar_Historico')
    .select('*', { count: 'exact', head: true })
    .in('fk_contas_pagar', payableIds);

  if (error) throw new Error(`Falha ao contar histórico de contas: ${error.message}`);
  return Math.max(directCount, count ?? 0);
}

async function listPayableAttachmentPaths(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  payableIds: string[],
) {
  const paths = new Set<string>();
  const addRows = (rows: Array<{ url?: string | null }> | null) => {
    for (const row of rows ?? []) {
      const value = row.url?.trim();
      if (value && !/^https?:\/\//i.test(value) && !value.startsWith('blob:') && !value.startsWith('local-upload://')) {
        paths.add(value);
      }
    }
  };

  const direct = await serviceClient
    .schema('RetificaPremium')
    .from('Contas_Pagar_Anexos')
    .select('url')
    .eq('fk_criado_por', userId);
  if (direct.error) throw new Error(`Falha ao listar anexos do usuário: ${direct.error.message}`);
  addRows(direct.data as Array<{ url?: string | null }> | null);

  if (payableIds.length > 0) {
    const byPayable = await serviceClient
      .schema('RetificaPremium')
      .from('Contas_Pagar_Anexos')
      .select('url')
      .in('fk_contas_pagar', payableIds);
    if (byPayable.error) throw new Error(`Falha ao listar anexos das contas: ${byPayable.error.message}`);
    addRows(byPayable.data as Array<{ url?: string | null }> | null);
  }

  return Array.from(paths);
}

async function buildDeletionReport(
  serviceClient: ReturnType<typeof createClient>,
  targetUser: {
    id_usuarios: string;
    nome: string | null;
    email: string;
    auth_id?: string | null;
  },
): Promise<DeletionReport> {
  const payableIds = await listPayablesOwnedByUser(serviceClient, targetUser.id_usuarios);
  const payableAttachmentPaths = await listPayableAttachmentPaths(serviceClient, targetUser.id_usuarios, payableIds);

  const stepInputs: Array<Omit<DeletionStep, 'status'>> = [
    { key: 'validate', label: 'Validar Mega Master e proteção do usuário', count: 1 },
    { key: 'support-sessions', label: 'Remover sessões de suporte vinculadas', count: await countSupportSessions(serviceClient, targetUser.id_usuarios) },
    { key: 'gmail', label: 'Remover conexões, estados e mensagens do Gmail', count:
      (targetUser.auth_id ? await countByColumn(serviceClient, 'Gmail_Scanned_Messages', 'fk_auth_user', targetUser.auth_id) : 0)
      + (targetUser.auth_id ? await countByColumn(serviceClient, 'Gmail_OAuth_States', 'fk_auth_user', targetUser.auth_id) : 0)
      + (targetUser.auth_id ? await countByColumn(serviceClient, 'Gmail_Connections', 'fk_auth_user', targetUser.auth_id) : 0) },
    { key: 'support-tickets', label: 'Remover chamados de suporte do usuário', count: targetUser.auth_id ? await countByColumn(serviceClient, 'Chamados_Suporte', 'fk_auth_user', targetUser.auth_id) : 0 },
    { key: 'settings', label: 'Remover configurações de empresa e modelos', count:
      await countByColumn(serviceClient, 'Configuracoes_Empresa_Usuario', 'fk_usuarios', targetUser.id_usuarios)
      + await countByColumn(serviceClient, 'Configuracoes_Modelos_Usuario', 'fk_usuarios', targetUser.id_usuarios) },
    { key: 'payables', label: 'Remover contas a pagar e histórico vinculados', count:
      payableIds.length
      + await countPayableHistory(serviceClient, targetUser.id_usuarios, payableIds)
      + await countPayableAttachments(serviceClient, targetUser.id_usuarios, payableIds) },
    { key: 'logs', label: 'Remover logs vinculados ao usuário', count: await countByColumn(serviceClient, 'Logs', 'fk_usuarios', targetUser.id_usuarios) },
    { key: 'modules', label: 'Remover permissões de módulos', count: await countByColumn(serviceClient, 'Modulos', 'fk_usuarios', targetUser.id_usuarios) },
    { key: 'storage', label: 'Remover anexos privados do Storage', count: payableAttachmentPaths.length },
    { key: 'internal-user', label: 'Remover perfil interno', count: 1 },
    { key: 'auth-user', label: 'Remover usuário do Supabase Auth', count: targetUser.auth_id ? 1 : 0 },
  ];

  const totalRecords = stepInputs.reduce((sum, step) => sum + (step.count ?? 0), 0);
  return {
    targetUserId: targetUser.id_usuarios,
    targetEmail: targetUser.email,
    targetName: targetUser.nome ?? targetUser.email,
    steps: stepInputs.map((step) => ({ ...step, status: step.count === 0 ? 'skipped' : 'pending' })),
    totalRecords,
    warnings: [
      'Clientes, O.S. e fechamentos sem vínculo direto de usuário não são removidos para evitar apagar dados compartilhados por engano.',
      'A ação remove o usuário do Supabase Auth e não pode ser desfeita pelo sistema.',
    ],
  };
}

async function deleteWhere(
  serviceClient: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string,
) {
  const { error } = await serviceClient
    .schema('RetificaPremium')
    .from(table)
    .delete()
    .eq(column, value);
  if (error) throw new Error(`Falha ao apagar ${table}: ${error.message}`);
}

async function deleteUserCascade(
  serviceClient: ReturnType<typeof createClient>,
  targetUser: {
    id_usuarios: string;
    nome: string | null;
    email: string;
    auth_id?: string | null;
  },
) {
  const payableIds = await listPayablesOwnedByUser(serviceClient, targetUser.id_usuarios);
  const attachmentPaths = await listPayableAttachmentPaths(serviceClient, targetUser.id_usuarios, payableIds);

  if (attachmentPaths.length > 0) {
    const { error } = await serviceClient.storage.from('contas-pagar').remove(attachmentPaths);
    if (error) throw new Error(`Falha ao remover anexos do Storage: ${error.message}`);
  }

  const supportSessionsDelete = await serviceClient
    .schema('RetificaPremium')
    .from('Sessoes_Suporte')
    .delete()
    .or(`fk_actor_usuarios.eq.${targetUser.id_usuarios},fk_target_usuarios.eq.${targetUser.id_usuarios}`);
  if (supportSessionsDelete.error) {
    throw new Error(`Falha ao apagar sessões de suporte: ${supportSessionsDelete.error.message}`);
  }

  if (targetUser.auth_id) {
    await deleteWhere(serviceClient, 'Gmail_Scanned_Messages', 'fk_auth_user', targetUser.auth_id);
    await deleteWhere(serviceClient, 'Gmail_OAuth_States', 'fk_auth_user', targetUser.auth_id);
    await deleteWhere(serviceClient, 'Gmail_Connections', 'fk_auth_user', targetUser.auth_id);
    await deleteWhere(serviceClient, 'Chamados_Suporte', 'fk_auth_user', targetUser.auth_id);
  }

  await deleteWhere(serviceClient, 'Configuracoes_Empresa_Usuario', 'fk_usuarios', targetUser.id_usuarios);
  await deleteWhere(serviceClient, 'Configuracoes_Modelos_Usuario', 'fk_usuarios', targetUser.id_usuarios);

  if (payableIds.length > 0) {
    const attachmentsDelete = await serviceClient
      .schema('RetificaPremium')
      .from('Contas_Pagar_Anexos')
      .delete()
      .in('fk_contas_pagar', payableIds);
    if (attachmentsDelete.error) {
      throw new Error(`Falha ao apagar anexos das contas: ${attachmentsDelete.error.message}`);
    }

    const historyDelete = await serviceClient
      .schema('RetificaPremium')
      .from('Contas_Pagar_Historico')
      .delete()
      .in('fk_contas_pagar', payableIds);
    if (historyDelete.error) {
      throw new Error(`Falha ao apagar histórico das contas: ${historyDelete.error.message}`);
    }
  }
  await deleteWhere(serviceClient, 'Contas_Pagar_Anexos', 'fk_criado_por', targetUser.id_usuarios);
  await deleteWhere(serviceClient, 'Contas_Pagar_Historico', 'fk_usuarios', targetUser.id_usuarios);
  await deleteWhere(serviceClient, 'Contas_Pagar', 'fk_criado_por', targetUser.id_usuarios);
  await deleteWhere(serviceClient, 'Logs', 'fk_usuarios', targetUser.id_usuarios);
  await deleteWhere(serviceClient, 'Modulos', 'fk_usuarios', targetUser.id_usuarios);
  await deleteWhere(serviceClient, 'Usuarios', 'id_usuarios', targetUser.id_usuarios);

  if (targetUser.auth_id) {
    const { error } = await serviceClient.auth.admin.deleteUser(targetUser.auth_id);
    if (error) throw new Error(`Falha ao apagar usuário Auth: ${error.message}`);
  }
}

async function getInternalModuleUser(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, email, acesso, status')
    .eq('id_usuarios', userId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar usuário: ${error.message}`);
  if (!data?.email) throw new Error('Usuário não encontrado.');
  return data as { id_usuarios: string; email: string; acesso: string; status: boolean };
}

async function getSupportTargetUser(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, telefone, acesso, status, created_at')
    .eq('id_usuarios', userId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar cliente/usuário: ${error.message}`);
  if (!data?.email) throw new Error('Cliente/usuário não encontrado.');
  if (data.status === false) throw new Error('Cliente/usuário inativo não pode ser acessado em modo suporte.');

  const { data: moduleRow, error: moduleError } = await serviceClient
    .schema('RetificaPremium')
    .from('Modulos')
    .select('dashboard, clientes, notas_de_entrada, kanban, fechamento, contas_a_pagar, nota_fiscal, configuracoes, admin')
    .eq('fk_usuarios', userId)
    .maybeSingle();

  if (moduleError) throw new Error(`Falha ao carregar módulos do usuário: ${moduleError.message}`);

  const access = String(data.acesso ?? '').toLowerCase();
  const role: UserRole =
    access === 'administrador' ? 'ADMIN'
    : access === 'financeiro' ? 'FINANCEIRO'
    : access === 'produção' || access === 'producao' ? 'PRODUCAO'
    : 'RECEPCAO';

  const moduleAccess: ModuleAccess = moduleRow
    ? {
        dashboard: moduleRow.dashboard === true,
        clients: moduleRow.clientes === true,
        notes: moduleRow.notas_de_entrada === true,
        kanban: moduleRow.kanban === true,
        closing: moduleRow.fechamento === true,
        payables: moduleRow.contas_a_pagar === true,
        invoices: moduleRow.nota_fiscal === true,
        settings: moduleRow.configuracoes === true,
        admin: false,
      }
    : {};

  return {
    id: data.id_usuarios as string,
    name: (data.nome as string | null) || data.email as string,
    email: data.email as string,
    phone: (data.telefone as string | null) || undefined,
    role,
    isActive: data.status !== false,
    createdAt: (data.created_at as string | null) || new Date().toISOString(),
    moduleAccess,
  };
}

async function getRequesterInternalUser(serviceClient: ReturnType<typeof createClient>, requesterEmail: string) {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('email', requesterEmail)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar usuário solicitante: ${error.message}`);
  if (!data?.id_usuarios) throw new Error('Usuário solicitante não encontrado.');
  return getSupportTargetUser(serviceClient, data.id_usuarios as string);
}

async function startSupportImpersonation(
  requester: {
    serviceClient: ReturnType<typeof createClient>;
    requesterEmail: string;
    requesterIsMegaMaster: boolean;
  },
  targetUserId: string,
  reason: string,
) {
  if (!requester.requesterIsMegaMaster) {
    throw new Error('Somente o Mega Master autorizado pode iniciar modo suporte.');
  }

  const actorUser = await getRequesterInternalUser(requester.serviceClient, requester.requesterEmail);
  const targetUser = await getSupportTargetUser(requester.serviceClient, targetUserId);

  if (actorUser.id === targetUser.id) {
    throw new Error('Não é necessário iniciar modo suporte para o próprio usuário.');
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data, error } = await requester.serviceClient
    .schema('RetificaPremium')
    .from('Sessoes_Suporte')
    .insert({
      fk_actor_usuarios: actorUser.id,
      fk_target_usuarios: targetUser.id,
      actor_email: actorUser.email,
      target_email: targetUser.email,
      motivo: reason,
      expires_at: expiresAt,
    })
    .select('id_sessao_suporte, started_at, expires_at')
    .single();

  if (error) throw new Error(`Falha ao registrar sessão de suporte: ${error.message}`);

  return {
    id: data.id_sessao_suporte as string,
    actorUser,
    targetUser,
    reason,
    startedAt: data.started_at as string,
    expiresAt: data.expires_at as string,
  };
}

async function endSupportImpersonation(
  requester: {
    serviceClient: ReturnType<typeof createClient>;
    requesterEmail: string;
    requesterIsMegaMaster: boolean;
  },
  sessionId: string,
) {
  if (!requester.requesterIsMegaMaster) {
    throw new Error('Somente o Mega Master autorizado pode encerrar modo suporte.');
  }

  const actorUser = await getRequesterInternalUser(requester.serviceClient, requester.requesterEmail);
  const { error } = await requester.serviceClient
    .schema('RetificaPremium')
    .from('Sessoes_Suporte')
    .update({ ended_at: new Date().toISOString() })
    .eq('id_sessao_suporte', sessionId)
    .eq('fk_actor_usuarios', actorUser.id)
    .is('ended_at', null);

  if (error) throw new Error(`Falha ao encerrar sessão de suporte: ${error.message}`);
}

async function getUserPresence(serviceClient: ReturnType<typeof createClient>): Promise<UserPresence[]> {
  const { data, error } = await serviceClient
    .schema('RetificaPremium')
    .from('Usuarios_Presenca')
    .select('fk_usuarios, email, last_seen_at, current_route')
    .order('last_seen_at', { ascending: false });

  if (error) throw new Error(`Falha ao carregar presença dos usuários: ${error.message}`);

  const onlineCutoff = Date.now() - 90_000;
  return (data ?? []).map((row) => {
    const lastSeenAt = String(row.last_seen_at);
    return {
      userId: String(row.fk_usuarios),
      email: String(row.email ?? ''),
      lastSeenAt,
      currentRoute: typeof row.current_route === 'string' ? row.current_route : null,
      isOnline: new Date(lastSeenAt).getTime() >= onlineCutoff,
    };
  });
}

function isProtectedMegaMasterTarget(
  requester: { requesterIsMegaMaster: boolean; superAdminEmails: Set<string> },
  targetEmail: string,
) {
  return !requester.requesterIsMegaMaster && isMegaMasterEmail(targetEmail, requester.superAdminEmails);
}

Deno.serve(async (request) => {
  const cors = getCorsHeaders(request);
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: 'Origem não autorizada.' }), {
      status: 403,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors.headers });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405, request);
  }

  const requester = await getRequester(request);
  if (!requester.ok) return requester.response;

  try {
    const payload = await request.json() as ActionPayload;
    if (!isRecord(payload) || typeof payload.action !== 'string') {
      return jsonResponse({ error: 'Payload inválido.' }, 400, request);
    }

    if (payload.action === 'create_user' || payload.action === 'create_admin') {
      const email = assertEmail(payload.email);
      const name = assertString(payload.name, 'name', 120);
      const phone = typeof payload.phone === 'string' ? payload.phone.trim().slice(0, 30) : '';
      const role = payload.action === 'create_admin' ? 'ADMIN' : assertRole(payload.role);
      const modules = payload.action === 'create_admin'
        ? MASTER_MODULE_ACCESS
        : normalizeInitialUserModules(role, payload.modules ?? {});

      if (payload.action === 'create_admin' && !requester.requesterIsMegaMaster) {
        return jsonResponse({ error: 'Somente o Mega Master pode criar outro usuário Master.' }, 403, request);
      }

      if (payload.role === 'ADMIN' && payload.action !== 'create_admin') {
        return jsonResponse({ error: 'Use create_admin para criar administradores.' }, 400, request);
      }

      if (role !== 'ADMIN' && modules.admin === true) {
        return jsonResponse({ error: 'Usuário cliente/operacional não pode receber módulo Admin.' }, 400, request);
      }

      const auth = await ensureAuthInvite(requester.serviceClient, {
        email,
        name,
        requesterEmail: requester.requesterEmail,
      });
      const internalUserId = await upsertInternalUser(requester.serviceClient, {
        authUserId: auth.userId,
        email,
        name,
        phone,
        role,
        status: true,
      });

      if (Object.keys(modules).length > 0) {
        await setModules(requester.serviceClient, internalUserId, modules);
      }

      return jsonResponse({
        mensagem: auth.emailSent
          ? 'Convite enviado por e-mail com segurança.'
          : 'Usuário já existia no Supabase Auth; perfil interno atualizado.',
        id_usuarios: internalUserId,
        auth_user_id: auth.userId,
      }, 200, request);
    }

    if (payload.action === 'resend_invite') {
      const userId = assertUserId(payload.userId);
      const targetUser = await getInternalResetUser(requester.serviceClient, userId);
      const email = assertEmail(targetUser.email);

      if (isProtectedMegaMasterTarget(requester, email)) {
        return jsonResponse({ error: 'Usuário Master não pode reenviar convite do Mega Master.' }, 403, request);
      }

      const name = targetUser.nome ?? email;
      const invite = await resendAuthInvite(requester.serviceClient, {
        email,
        name,
        requesterEmail: requester.requesterEmail,
      });

      await upsertInternalUser(requester.serviceClient, {
        authUserId: invite.authUserId,
        email,
        name,
        phone: targetUser.telefone ?? '',
        role: accessToRole(targetUser.acesso),
        status: targetUser.status,
      });

      return jsonResponse({
        mensagem: 'Convite reenviado por e-mail com segurança.',
        resetEmail: email,
        auth_user_id: invite.authUserId,
      }, 200, request);
    }

    if (payload.action === 'reset_password') {
      const userId = assertUserId(payload.userId);
      const targetUser = await getInternalResetUser(requester.serviceClient, userId);
      const email = assertEmail(targetUser.email);

      if (isProtectedMegaMasterTarget(requester, email)) {
        return jsonResponse({ error: 'Usuário Master não pode resetar senha do Mega Master.' }, 403, request);
      }

      const confirmationEmail = optionalEmail(payload.confirmationEmail);
      const redirectTo = Deno.env.get('AUTH_REDIRECT_TO') || Deno.env.get('APP_BASE_URL') || undefined;

      const { data, error } = await requester.serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });

      if (error || !data.properties?.action_link) {
        throw new Error(`Falha ao gerar recuperação de senha: ${error?.message ?? 'link ausente'}`);
      }

      await sendPasswordRecoveryEmail({
        to: email,
        targetName: targetUser.nome ?? email,
        actionLink: data.properties.action_link,
        requesterEmail: requester.requesterEmail,
      });

      let confirmationSent = false;
      let confirmationWarning: string | null = null;
      if (confirmationEmail) {
        try {
          await sendResetConfirmationEmail({
            to: confirmationEmail,
            targetEmail: email,
            targetName: targetUser.nome ?? email,
            requesterEmail: requester.requesterEmail,
          });
          confirmationSent = true;
        } catch (confirmationError) {
          confirmationWarning = confirmationError instanceof Error
            ? confirmationError.message
            : 'Falha ao enviar confirmação administrativa.';
        }
      }

      return jsonResponse({
        mensagem: confirmationSent
          ? 'E-mail de recuperação enviado ao usuário e confirmação enviada.'
          : 'E-mail de recuperação enviado para o usuário.',
        resetEmail: email,
        confirmationEmail,
        confirmationSent,
        confirmationWarning,
      }, 200, request);
    }

    if (payload.action === 'set_modules') {
      const userId = assertUserId(payload.userId);
      const modules = normalizeModules(payload.modules);
      const targetUser = await getInternalModuleUser(requester.serviceClient, userId);

      if (isProtectedMegaMasterTarget(requester, targetUser.email)) {
        return jsonResponse({ error: 'Usuário Master não pode alterar módulos do Mega Master.' }, 403, request);
      }

      if (modules.admin === true && targetUser.acesso !== 'administrador') {
        return jsonResponse({ error: 'O módulo Admin só pode ser ligado para usuários administradores.' }, 400, request);
      }

      if (modules.admin === false && targetUser.email.trim().toLowerCase() === requester.requesterEmail) {
        return jsonResponse({ error: 'Você não pode remover seu próprio acesso administrativo.' }, 400, request);
      }

      await setModules(requester.serviceClient, userId, modules);
      return jsonResponse({ mensagem: 'Módulos atualizados.' }, 200, request);
    }

    if (payload.action === 'promote_to_admin') {
      const userId = assertUserId(payload.userId);

      if (!requester.requesterIsMegaMaster) {
        return jsonResponse({ error: 'Somente o Mega Master pode transformar um usuário em Master/Admin.' }, 403, request);
      }

      const targetUser = await getInternalModuleUser(requester.serviceClient, userId);
      if (isMegaMasterEmail(targetUser.email, requester.superAdminEmails)) {
        return jsonResponse({ error: 'O Mega Master já é protegido e não precisa ser promovido.' }, 400, request);
      }
      if (targetUser.email.trim().toLowerCase() === requester.requesterEmail) {
        return jsonResponse({ error: 'Você não precisa promover o próprio usuário.' }, 400, request);
      }

      await promoteUserToAdmin(requester.serviceClient, userId);
      return jsonResponse({
        mensagem: 'Usuário promovido para Master/Admin com módulos administrativos seguros.',
      }, 200, request);
    }

    if (payload.action === 'start_support_impersonation') {
      const targetUserId = assertUserId(payload.targetUserId);
      const reason = assertReason(payload.reason);
      const supportSession = await startSupportImpersonation(requester, targetUserId, reason);
      return jsonResponse({
        mensagem: 'Modo suporte iniciado.',
        supportSession,
      }, 200, request);
    }

    if (payload.action === 'end_support_impersonation') {
      const sessionId = assertSessionId(payload.sessionId);
      await endSupportImpersonation(requester, sessionId);
      return jsonResponse({ mensagem: 'Modo suporte encerrado.' }, 200, request);
    }

    if (payload.action === 'get_user_presence') {
      if (!requester.requesterIsMegaMaster) {
        return jsonResponse({ error: 'Somente o Mega Master autorizado pode ver presença em tempo real.' }, 403, request);
      }

      const userPresence = await getUserPresence(requester.serviceClient);
      return jsonResponse({
        mensagem: 'Presença dos usuários carregada.',
        userPresence,
      }, 200, request);
    }

    if (payload.action === 'analyze_delete_user' || payload.action === 'delete_user') {
      const userId = assertUserId(payload.userId);
      const confirmEmail = assertEmail(payload.confirmEmail);

      if (!requester.requesterIsMegaMaster) {
        return jsonResponse({ error: 'Somente o Mega Master autorizado pode excluir usuários em cascata.' }, 403, request);
      }

      const targetUser = await getInternalDeleteUser(requester.serviceClient, userId);
      const targetEmail = assertEmail(targetUser.email);

      if (isMegaMasterEmail(targetEmail, requester.superAdminEmails)) {
        return jsonResponse({ error: 'O usuário Mega Master não pode ser excluído.' }, 403, request);
      }

      if (targetEmail === requester.requesterEmail) {
        return jsonResponse({ error: 'Você não pode excluir o próprio usuário autenticado.' }, 400, request);
      }

      if (confirmEmail !== targetEmail) {
        return jsonResponse({ error: 'Confirmação inválida. Digite exatamente o e-mail do usuário a excluir.' }, 400, request);
      }

      const report = await buildDeletionReport(requester.serviceClient, targetUser);
      if (payload.action === 'analyze_delete_user') {
        return jsonResponse({
          mensagem: 'Impacto da exclusão calculado.',
          deletionReport: report,
        }, 200, request);
      }

      await deleteUserCascade(requester.serviceClient, targetUser);
      const finalReport = await buildDeletionReport(requester.serviceClient, targetUser).catch(() => ({
        ...report,
        totalRecords: 0,
        steps: report.steps.map((step) => ({ ...step, status: 'done' as const })),
      }));

      return jsonResponse({
        mensagem: 'Usuário e vínculos comprovados excluídos com segurança.',
        deletionReport: {
          ...finalReport,
          steps: finalReport.steps.map((step) => ({ ...step, status: 'done' as const })),
        },
      }, 200, request);
    }

    if (payload.action === 'deactivate_user' || payload.action === 'reactivate_user') {
      const userId = assertUserId(payload.userId);
      const targetUser = await getInternalModuleUser(requester.serviceClient, userId);

      if (isProtectedMegaMasterTarget(requester, targetUser.email)) {
        return jsonResponse({ error: 'Usuário Master não pode alterar status do Mega Master.' }, 403, request);
      }

      if (payload.action === 'deactivate_user' && targetUser.email.trim().toLowerCase() === requester.requesterEmail) {
        return jsonResponse({ error: 'Você não pode inativar seu próprio usuário.' }, 400, request);
      }

      await callStatusRpc(
        requester.serviceClient,
        payload.action === 'deactivate_user' ? 'inativar_usuario' : 'reativar_usuario',
        userId,
      );
      return jsonResponse({ mensagem: payload.action === 'deactivate_user' ? 'Usuário inativado.' : 'Usuário reativado.' }, 200, request);
    }

    return jsonResponse({ error: 'Ação administrativa desconhecida.' }, 400, request);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Erro inesperado na ação administrativa.',
    }, 400, request);
  }
});
