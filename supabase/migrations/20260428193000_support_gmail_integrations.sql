create table if not exists "RetificaPremium"."Chamados_Suporte" (
  id_chamados_suporte uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  fk_auth_user uuid not null,
  user_email text not null,
  user_name text not null,
  mensagem text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'EMAIL_SENT', 'EMAIL_FAILED', 'RESOLVED')),
  email_to text,
  email_sent_at timestamp without time zone,
  email_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists chamados_suporte_auth_created_idx
  on "RetificaPremium"."Chamados_Suporte" (fk_auth_user, created_at desc);

alter table "RetificaPremium"."Chamados_Suporte" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'RetificaPremium'
      and tablename = 'Chamados_Suporte'
      and policyname = 'chamados_suporte_select_own'
  ) then
    create policy chamados_suporte_select_own
      on "RetificaPremium"."Chamados_Suporte"
      for select
      to authenticated
      using (fk_auth_user = auth.uid());
  end if;
end $$;

create table if not exists "RetificaPremium"."Gmail_Connections" (
  id_gmail_connections uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  fk_auth_user uuid not null,
  email text not null,
  refresh_token_cipher text not null,
  status text not null default 'CONNECTED'
    check (status in ('CONNECTED', 'DISCONNECTED', 'ERROR')),
  sync_enabled boolean not null default true,
  last_sync_at timestamp without time zone,
  last_error text,
  unique (fk_auth_user, email)
);

create index if not exists gmail_connections_auth_idx
  on "RetificaPremium"."Gmail_Connections" (fk_auth_user, status);

alter table "RetificaPremium"."Gmail_Connections" enable row level security;

create table if not exists "RetificaPremium"."Gmail_OAuth_States" (
  id_gmail_oauth_states uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  fk_auth_user uuid not null,
  state text not null unique,
  expires_at timestamp without time zone not null,
  used_at timestamp without time zone
);

create index if not exists gmail_oauth_states_state_idx
  on "RetificaPremium"."Gmail_OAuth_States" (state);

alter table "RetificaPremium"."Gmail_OAuth_States" enable row level security;

create table if not exists "RetificaPremium"."Gmail_Scanned_Messages" (
  id_gmail_scanned_messages uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  fk_auth_user uuid not null,
  gmail_message_id text not null,
  message_hash text,
  assunto text,
  email_remetente text,
  recebido_em timestamp without time zone,
  fk_sugestoes_email uuid,
  unique (fk_auth_user, gmail_message_id)
);

create index if not exists gmail_scanned_messages_auth_idx
  on "RetificaPremium"."Gmail_Scanned_Messages" (fk_auth_user, created_at desc);

alter table "RetificaPremium"."Gmail_Scanned_Messages" enable row level security;

create or replace function "RetificaPremium".get_chamados_suporte()
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_user uuid := auth.uid();
  v_dados jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 401, 'mensagem', 'Usuário não autenticado.', 'dados', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id_chamados_suporte', id_chamados_suporte,
    'created_at', created_at,
    'mensagem', mensagem,
    'status', status,
    'email_to', email_to,
    'email_sent_at', email_sent_at,
    'email_error', email_error
  ) order by created_at desc), '[]'::jsonb)
  into v_dados
  from "RetificaPremium"."Chamados_Suporte"
  where fk_auth_user = v_user;

  return jsonb_build_object('status', 200, 'mensagem', 'Chamados carregados.', 'dados', v_dados);
end;
$$;

create or replace function "RetificaPremium".get_gmail_connection_status()
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_user uuid := auth.uid();
  v_row record;
begin
  if v_user is null then
    return jsonb_build_object('status', 401, 'mensagem', 'Usuário não autenticado.', 'dados', null);
  end if;

  select email, status, sync_enabled, last_sync_at, last_error, updated_at
  into v_row
  from "RetificaPremium"."Gmail_Connections"
  where fk_auth_user = v_user
  order by updated_at desc
  limit 1;

  if v_row is null then
    return jsonb_build_object('status', 200, 'mensagem', 'Gmail não conectado.', 'dados', jsonb_build_object('connected', false));
  end if;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Status Gmail carregado.',
    'dados', jsonb_build_object(
      'connected', v_row.status = 'CONNECTED',
      'email', v_row.email,
      'status', v_row.status,
      'sync_enabled', v_row.sync_enabled,
      'last_sync_at', v_row.last_sync_at,
      'last_error', v_row.last_error
    )
  );
end;
$$;

grant execute on function "RetificaPremium".get_chamados_suporte() to authenticated;
grant execute on function "RetificaPremium".get_gmail_connection_status() to authenticated;

grant all privileges on table "RetificaPremium"."Chamados_Suporte" to service_role;
grant all privileges on table "RetificaPremium"."Gmail_Connections" to service_role;
grant all privileges on table "RetificaPremium"."Gmail_OAuth_States" to service_role;
grant all privileges on table "RetificaPremium"."Gmail_Scanned_Messages" to service_role;
