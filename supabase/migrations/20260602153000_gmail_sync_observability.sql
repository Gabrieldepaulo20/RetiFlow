-- Exibe um resumo seguro e persistido da ultima sincronizacao Gmail.
alter table "RetificaPremium"."Gmail_Connections"
  add column if not exists last_scan_messages_count integer not null default 0,
  add column if not exists last_scan_attachments_count integer not null default 0,
  add column if not exists last_scan_suggestions_count integer not null default 0,
  add column if not exists last_scan_reconciled_count integer not null default 0,
  add column if not exists last_scan_skipped_count integer not null default 0,
  add column if not exists last_scan_errors_count integer not null default 0;

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
      'last_scan_errors_count', v_row.last_scan_errors_count
    )
  );
end;
$$;

revoke all on function "RetificaPremium".get_gmail_connection_status() from public, anon;
grant execute on function "RetificaPremium".get_gmail_connection_status() to authenticated, service_role;
