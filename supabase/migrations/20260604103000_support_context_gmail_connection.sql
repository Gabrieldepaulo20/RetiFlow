-- Status e configuracao Gmail em modo suporte, sempre usando a conta-alvo.

create or replace function "RetificaPremium".get_gmail_connection_status_contexto_suporte(
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_auth_user uuid;
  v_row record;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select auth_id
    into v_auth_user
  from "RetificaPremium"."Usuarios"
  where id_usuarios = v_usuario_id;

  if v_auth_user is null then
    return jsonb_build_object('status', 404, 'mensagem', 'Usuário alvo sem conta de autenticação.', 'dados', null);
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
  where fk_auth_user = v_auth_user
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
exception
  when sqlstate 'P0401' then return jsonb_build_object('status', 401, 'mensagem', sqlerrm, 'dados', null);
  when sqlstate 'P0403' then return jsonb_build_object('status', 403, 'mensagem', sqlerrm, 'dados', null);
end;
$$;

create or replace function "RetificaPremium".update_gmail_auto_sync_settings_contexto_suporte(
  p_enabled boolean,
  p_interval_hours integer default 12,
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_auth_user uuid;
  v_connection_id uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  if p_interval_hours not in (6, 12, 24) then
    return jsonb_build_object('status', 422, 'mensagem', 'Intervalo automatico invalido.', 'dados', null);
  end if;

  select auth_id
    into v_auth_user
  from "RetificaPremium"."Usuarios"
  where id_usuarios = v_usuario_id;

  if v_auth_user is null then
    return jsonb_build_object('status', 404, 'mensagem', 'Usuário alvo sem conta de autenticação.', 'dados', null);
  end if;

  select id_gmail_connections
    into v_connection_id
  from "RetificaPremium"."Gmail_Connections"
  where fk_auth_user = v_auth_user
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

  perform "RetificaPremium".insert_log_acao_suporte(
    v_usuario_id,
    p_sessao_suporte,
    'update_gmail_auto_sync_settings',
    'Gmail_Connections',
    v_connection_id::text,
    'Configuração de busca automática Gmail alterada em modo suporte.'
  );

  return "RetificaPremium".get_gmail_connection_status_contexto_suporte(p_contexto_usuario_id, p_sessao_suporte);
exception
  when sqlstate 'P0401' then return jsonb_build_object('status', 401, 'mensagem', sqlerrm, 'dados', null);
  when sqlstate 'P0403' then return jsonb_build_object('status', 403, 'mensagem', sqlerrm, 'dados', null);
end;
$$;

revoke all on function "RetificaPremium".get_gmail_connection_status_contexto_suporte(uuid, uuid) from public, anon;
revoke all on function "RetificaPremium".update_gmail_auto_sync_settings_contexto_suporte(boolean, integer, uuid, uuid) from public, anon;
grant execute on function "RetificaPremium".get_gmail_connection_status_contexto_suporte(uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".update_gmail_auto_sync_settings_contexto_suporte(boolean, integer, uuid, uuid) to authenticated, service_role;
