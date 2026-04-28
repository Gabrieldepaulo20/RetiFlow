#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`[bootstrap-super-admin] Configure as variáveis: ${missing.join(', ')}`);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.SUPER_ADMIN_EMAIL || 'gabrielwilliam208@gmail.com').trim().toLowerCase();
const name = process.env.SUPER_ADMIN_NAME || 'Gabriel William';
const phone = process.env.SUPER_ADMIN_PHONE || '';
const tempPassword = process.env.SUPER_ADMIN_TEMP_PASSWORD;
const redirectTo = process.env.AUTH_REDIRECT_TO || process.env.APP_BASE_URL || undefined;

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findAuthUserByEmail(targetEmail) {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Falha ao listar Auth users: ${error.message}`);
  return data.users.find((user) => user.email?.toLowerCase() === targetEmail) ?? null;
}

async function ensureAuthUser() {
  const existing = await findAuthUserByEmail(email);
  if (existing) return { userId: existing.id, actionLink: null, created: false };

  if (tempPassword) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) throw new Error(`Falha ao criar Auth user: ${error?.message}`);
    return { userId: data.user.id, actionLink: null, created: true };
  }

  const { data, error } = await service.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { name },
      redirectTo,
    },
  });
  if (error || !data.user) throw new Error(`Falha ao gerar convite: ${error?.message}`);
  return { userId: data.user.id, actionLink: data.properties?.action_link ?? null, created: true };
}

function modulesPayload() {
  return {
    p_dashboard: true,
    p_clientes: true,
    p_notas_de_entrada: true,
    p_kanban: true,
    p_fechamento: true,
    p_nota_fiscal: false,
    p_configuracoes: true,
    p_contas_a_pagar: true,
    p_admin: true,
  };
}

async function findInternalUserId(authUserId) {
  const { data: byAuthId, error: byAuthIdError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (byAuthIdError) throw new Error(`Falha ao procurar perfil por Auth ID: ${byAuthIdError.message}`);
  if (byAuthId?.id_usuarios) return byAuthId.id_usuarios;

  const { data: byEmail, error: byEmailError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('email', email)
    .maybeSingle();

  if (byEmailError) throw new Error(`Falha ao procurar perfil por e-mail: ${byEmailError.message}`);
  return byEmail?.id_usuarios ?? null;
}

const auth = await ensureAuthUser();

const profilePayload = {
  nome: name,
  email,
  telefone: phone,
  acesso: 'administrador',
  status: true,
  auth_id: auth.userId,
};

const existingInternalUserId = await findInternalUserId(auth.userId);
let internalUserId = existingInternalUserId;

if (existingInternalUserId) {
  const { error: updateError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .update(profilePayload)
    .eq('id_usuarios', existingInternalUserId);

  if (updateError) throw new Error(`Falha ao atualizar perfil interno: ${updateError.message}`);
} else {
  const { data: inserted, error: insertError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .insert(profilePayload)
    .select('id_usuarios')
    .single();

  if (insertError || !inserted?.id_usuarios) {
    throw new Error(`Falha ao criar perfil interno: ${insertError?.message ?? 'sem id retornado'}`);
  }
  internalUserId = inserted.id_usuarios;
}

const { error: modulesError } = await service
  .schema('RetificaPremium')
  .rpc('upsert_modulo', {
    p_fk_usuarios: internalUserId,
    ...modulesPayload(),
  });

if (modulesError) throw new Error(`Falha ao conceder módulos: ${modulesError.message}`);

console.log('[bootstrap-super-admin] Super Admin pronto.');
console.log(`[bootstrap-super-admin] email=${email}`);
console.log(`[bootstrap-super-admin] id_usuarios=${internalUserId}`);
console.log(`[bootstrap-super-admin] auth_user_id=${auth.userId}`);
console.log(`[bootstrap-super-admin] run_id=${randomUUID()}`);
if (auth.actionLink) {
  console.log('[bootstrap-super-admin] link_de_convite_temporario:');
  console.log(auth.actionLink);
}
