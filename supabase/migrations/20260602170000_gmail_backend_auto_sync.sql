-- Move a busca automatica do Gmail para o backend. A configuracao nasce
-- desligada e o segredo interno do cron permanece somente no Vault.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

alter table "RetificaPremium"."Gmail_Connections"
  add column if not exists auto_sync_enabled boolean not null default false,
  add column if not exists auto_sync_interval_hours integer not null default 12,
  add column if not exists next_auto_sync_at timestamptz,
  add column if not exists last_auto_sync_at timestamptz,
  add column if not exists auto_sync_failures integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gmail_connections_auto_sync_interval_hours_check'
      and conrelid = '"RetificaPremium"."Gmail_Connections"'::regclass
  ) then
    alter table "RetificaPremium"."Gmail_Connections"
      add constraint gmail_connections_auto_sync_interval_hours_check
      check (auto_sync_interval_hours in (6, 12, 24));
  end if;
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
    return jsonb_build_object('status', 401, 'mensagem', 'Usuario nao autenticado.', 'dados', null);
  end if;

  select
    email,
    status,
    sync_enabled,
    last_sync_at,
    last_error,
    last_scan_messages_count,
    last_scan_attachments_count,
    last_scan_suggestions_count,
    last_scan_reconciled_count,
    last_scan_skipped_count,
    last_scan_errors_count,
    auto_sync_enabled,
    auto_sync_interval_hours,
    next_auto_sync_at,
    last_auto_sync_at,
    auto_sync_failures,
    updated_at
  into v_row
  from "RetificaPremium"."Gmail_Connections"
  where fk_auth_user = v_user
  order by updated_at desc
  limit 1;

  if v_row is null then
    return jsonb_build_object('status', 200, 'mensagem', 'Gmail nao conectado.', 'dados', jsonb_build_object('connected', false));
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
      'last_error', v_row.last_error,
      'last_scan_messages_count', v_row.last_scan_messages_count,
      'last_scan_attachments_count', v_row.last_scan_attachments_count,
      'last_scan_suggestions_count', v_row.last_scan_suggestions_count,
      'last_scan_reconciled_count', v_row.last_scan_reconciled_count,
      'last_scan_skipped_count', v_row.last_scan_skipped_count,
      'last_scan_errors_count', v_row.last_scan_errors_count,
      'auto_sync_enabled', v_row.auto_sync_enabled,
      'auto_sync_interval_hours', v_row.auto_sync_interval_hours,
      'next_auto_sync_at', v_row.next_auto_sync_at,
      'last_auto_sync_at', v_row.last_auto_sync_at,
      'auto_sync_failures', v_row.auto_sync_failures
    )
  );
end;
$$;

revoke all on function "RetificaPremium".get_gmail_connection_status() from public, anon;
grant execute on function "RetificaPremium".get_gmail_connection_status() to authenticated, service_role;

create or replace function "RetificaPremium".update_gmail_auto_sync_settings(
  p_enabled boolean,
  p_interval_hours integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_user uuid := auth.uid();
  v_connection_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('status', 401, 'mensagem', 'Usuario nao autenticado.', 'dados', null);
  end if;

  if p_interval_hours not in (6, 12, 24) then
    return jsonb_build_object('status', 422, 'mensagem', 'Intervalo automatico invalido.', 'dados', null);
  end if;

  select id_gmail_connections
  into v_connection_id
  from "RetificaPremium"."Gmail_Connections"
  where fk_auth_user = v_user
  order by updated_at desc
  limit 1;

  if v_connection_id is null then
    return jsonb_build_object('status', 404, 'mensagem', 'Gmail ainda nao conectado.', 'dados', null);
  end if;

  update "RetificaPremium"."Gmail_Connections"
  set
    auto_sync_enabled = p_enabled,
    auto_sync_interval_hours = p_interval_hours,
    next_auto_sync_at = case when p_enabled then now() else null end,
    updated_at = now()
  where id_gmail_connections = v_connection_id;

  return "RetificaPremium".get_gmail_connection_status();
end;
$$;

revoke all on function "RetificaPremium".update_gmail_auto_sync_settings(boolean, integer) from public, anon;
grant execute on function "RetificaPremium".update_gmail_auto_sync_settings(boolean, integer) to authenticated, service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'gmail_auto_sync_cron_secret') then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'gmail_auto_sync_cron_secret',
      'Autenticacao interna do cron Gmail do Retiflow'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'retiflow_project_url') then
    perform vault.create_secret(
      'https://dqeoxxokvvcpssajycgq.supabase.co',
      'retiflow_project_url',
      'URL publica do projeto Retiflow usada pelos jobs internos'
    );
  end if;
end;
$$;

create or replace function "RetificaPremium".validate_gmail_auto_sync_cron_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = "RetificaPremium", public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'gmail_auto_sync_cron_secret'
      and decrypted_secret = coalesce(p_secret, '')
  );
$$;

revoke all on function "RetificaPremium".validate_gmail_auto_sync_cron_secret(text) from public, anon, authenticated;
grant execute on function "RetificaPremium".validate_gmail_auto_sync_cron_secret(text) to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'retiflow-gmail-auto-sync'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'retiflow-gmail-auto-sync',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'retiflow_project_url'
      ) || '/functions/v1/gmail-auto-sync-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-retiflow-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'gmail_auto_sync_cron_secret'
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb
    );
  $job$
);
