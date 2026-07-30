-- Fecha com confirmação do atendimento o funil entre uma interação do Google Ads e o cadastro do cliente.
--
-- Mudança aditiva e reversível:
-- - nenhuma tabela ou coluna existente é alterada;
-- - a origem confirmada fica no metadata da atribuição privada já existente;
-- - não cria conversão offline sem click id, evitando enviar atribuição inventada ao Google;
-- - preserva a regra de first-touch quando o cliente já possui uma origem.
--
-- Rollback:
-- - remover as três funções criadas abaixo;
-- - os metadados já confirmados podem ser preservados para auditoria.

create or replace function "RetificaPremium".apply_confirmed_marketing_client_origin(
  p_owner_id uuid,
  p_client_id uuid,
  p_origin text,
  p_customer_type text,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text := upper(trim(coalesce(p_origin, '')));
  v_customer_type text := upper(trim(coalesce(p_customer_type, 'UNKNOWN')));
  v_channel text;
  v_metadata jsonb;
  v_attribution_id uuid;
  v_inserted boolean := false;
begin
  if v_origin not in (
    'GOOGLE_ADS_CALL',
    'GOOGLE_ADS_ROUTE',
    'GOOGLE_ADS_WHATSAPP',
    'GOOGLE_ADS_FORM',
    'GOOGLE_ADS_SITE'
  ) then
    raise exception 'Origem de marketing inválida.' using errcode = 'P3001';
  end if;

  if v_customer_type not in ('NEW', 'EXISTING', 'UNKNOWN') then
    raise exception 'Tipo de cliente inválido.' using errcode = 'P3001';
  end if;

  if not exists (
    select 1
    from "RetificaPremium"."Clientes" c
    where c.id_clientes = p_client_id
      and c.fk_criado_por = p_owner_id
  ) then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  v_channel := case v_origin
    when 'GOOGLE_ADS_CALL' then 'ad_call'
    when 'GOOGLE_ADS_ROUTE' then 'route_arrival'
    when 'GOOGLE_ADS_WHATSAPP' then 'whatsapp'
    when 'GOOGLE_ADS_FORM' then 'site_form'
    else 'site'
  end;

  v_metadata := jsonb_build_object(
    'manual_confirmation', true,
    'manual_origin', v_origin,
    'customer_type', v_customer_type,
    'confirmed_at', now()
  );

  if v_origin = 'GOOGLE_ADS_CALL' then
    v_metadata := v_metadata || jsonb_build_object('confirmed_call', true);
  elsif v_origin = 'GOOGLE_ADS_ROUTE' then
    v_metadata := v_metadata || jsonb_build_object('confirmed_arrival', true);
  end if;

  select a.id_marketing_client_attributions
  into v_attribution_id
  from "RetificaPremium"."Marketing_Client_Attributions" a
  where a.fk_criado_por = p_owner_id
    and a.fk_clientes = p_client_id
  for update;

  if v_attribution_id is null then
    insert into "RetificaPremium"."Marketing_Client_Attributions" (
      fk_criado_por,
      fk_clientes,
      channel,
      source,
      medium,
      attribution_method,
      attributed_at,
      attributed_by,
      metadata
    )
    values (
      p_owner_id,
      p_client_id,
      v_channel,
      'google',
      'cpc',
      'atendimento_confirmado',
      now(),
      p_actor_id,
      v_metadata
    )
    returning id_marketing_client_attributions into v_attribution_id;

    v_inserted := true;
  else
    -- First-touch: adiciona a confirmação comercial, mas não troca a origem original.
    update "RetificaPremium"."Marketing_Client_Attributions"
    set
      metadata = coalesce(metadata, '{}'::jsonb) || v_metadata,
      attributed_by = coalesce(attributed_by, p_actor_id),
      updated_at = now()
    where id_marketing_client_attributions = v_attribution_id;
  end if;

  insert into "RetificaPremium"."Marketing_Audit_Logs" (
    fk_criado_por,
    actor_usuario_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    p_owner_id,
    p_actor_id,
    'confirm_marketing_client_origin',
    'Clientes',
    p_client_id::text,
    v_metadata
  );

  return v_inserted;
end;
$$;

revoke all on function "RetificaPremium".apply_confirmed_marketing_client_origin(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".apply_confirmed_marketing_client_origin(uuid, uuid, text, text, uuid)
  to service_role;

create or replace function "RetificaPremium".record_marketing_client_origin(
  p_client_id uuid,
  p_origin text,
  p_customer_type text default 'UNKNOWN'
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_inserted boolean;
begin
  v_owner_id := "RetificaPremium".require_current_usuario_id();

  v_inserted := "RetificaPremium".apply_confirmed_marketing_client_origin(
    v_owner_id,
    p_client_id,
    p_origin,
    p_customer_type,
    v_owner_id
  );

  return json_build_object(
    'status', 200,
    'mensagem', case
      when v_inserted then 'Origem do cliente registrada.'
      else 'Confirmação adicionada sem substituir a origem original.'
    end,
    'atribuido', v_inserted
  );
exception
  when sqlstate 'P2001' then
    return json_build_object('status', 404, 'code', 'client_not_found', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then
    return json_build_object('status', 400, 'code', 'invalid_marketing_origin', 'mensagem', sqlerrm);
  when others then
    return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".record_marketing_client_origin_contexto_suporte(
  p_client_id uuid,
  p_origin text,
  p_customer_type text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_actor_id uuid;
  v_inserted boolean;
begin
  v_owner_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

  select u.id_usuarios
  into v_actor_id
  from "RetificaPremium"."Usuarios" u
  where u.auth_id = auth.uid()
  limit 1;

  if v_actor_id is null then
    raise exception 'Usuário autenticado não encontrado.' using errcode = 'P0401';
  end if;

  v_inserted := "RetificaPremium".apply_confirmed_marketing_client_origin(
    v_owner_id,
    p_client_id,
    p_origin,
    p_customer_type,
    v_actor_id
  );

  return json_build_object(
    'status', 200,
    'mensagem', case
      when v_inserted then 'Origem do cliente registrada.'
      else 'Confirmação adicionada sem substituir a origem original.'
    end,
    'atribuido', v_inserted
  );
exception
  when sqlstate 'P0401' then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then
    return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then
    return json_build_object('status', 404, 'code', 'client_not_found', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then
    return json_build_object('status', 400, 'code', 'invalid_marketing_origin', 'mensagem', sqlerrm);
  when others then
    return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

revoke all on function "RetificaPremium".record_marketing_client_origin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".record_marketing_client_origin(uuid, text, text)
  to authenticated, service_role;

revoke all on function "RetificaPremium".record_marketing_client_origin_contexto_suporte(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".record_marketing_client_origin_contexto_suporte(uuid, text, text, uuid, uuid)
  to authenticated, service_role;
