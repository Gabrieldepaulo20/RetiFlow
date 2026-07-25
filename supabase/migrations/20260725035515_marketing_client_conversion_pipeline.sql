-- Conversao de marketing no momento em que um cliente e cadastrado.
--
-- Mudanca aditiva:
-- 1. fecha a atribuicao reversa (lead existente -> contato/cliente criado depois);
-- 2. permite vinculo deterministico pelo codigo RP-... recebido no WhatsApp;
-- 3. cria uma fila privada e idempotente para conversoes offline do Google Ads;
-- 4. agenda o despacho server-side sem expor click ids ou credenciais ao navegador.
--
-- Rollback operacional:
-- - desabilitar o job retiflow-marketing-offline-conversions;
-- - remover os triggers trg_auto_attribute_marketing_contact e
--   trg_queue_marketing_client_conversion;
-- - a tabela de fila pode ser preservada para auditoria.

create table if not exists "RetificaPremium"."Marketing_Offline_Conversions" (
  id_marketing_offline_conversions uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  fk_marketing_client_attributions uuid not null
    references "RetificaPremium"."Marketing_Client_Attributions"(id_marketing_client_attributions) on delete cascade,
  fk_marketing_leads uuid
    references "RetificaPremium"."Marketing_Leads"(id_marketing_leads) on delete set null,
  fk_clientes uuid not null
    references "RetificaPremium"."Clientes"(id_clientes) on delete cascade,
  conversion_kind text not null default 'client_registered'
    check (conversion_kind in ('client_registered')),
  click_id_type text not null
    check (click_id_type in ('gclid', 'gbraid', 'wbraid')),
  click_id text not null,
  conversion_date_time timestamptz not null,
  conversion_value numeric(14,2) not null default 1,
  currency_code text not null default 'BRL',
  order_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'uploaded', 'retry', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  uploaded_at timestamptz,
  google_error_code text,
  google_error_message text,
  google_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fk_criado_por, conversion_kind, fk_marketing_client_attributions),
  unique (fk_criado_por, order_id)
);

create index if not exists idx_marketing_offline_conversions_queue
  on "RetificaPremium"."Marketing_Offline_Conversions"(status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

create index if not exists idx_marketing_offline_conversions_owner_date
  on "RetificaPremium"."Marketing_Offline_Conversions"(fk_criado_por, conversion_date_time desc);

create index if not exists idx_marketing_offline_conversions_client
  on "RetificaPremium"."Marketing_Offline_Conversions"(fk_clientes);

alter table "RetificaPremium"."Marketing_Offline_Conversions" enable row level security;

drop policy if exists marketing_offline_conversions_authenticated_deny
  on "RetificaPremium"."Marketing_Offline_Conversions";
create policy marketing_offline_conversions_authenticated_deny
  on "RetificaPremium"."Marketing_Offline_Conversions"
  for all
  to authenticated
  using (false)
  with check (false);

revoke all on table "RetificaPremium"."Marketing_Offline_Conversions"
  from public, anon, authenticated;
grant select, insert, update, delete
  on table "RetificaPremium"."Marketing_Offline_Conversions"
  to service_role;

create or replace function "RetificaPremium".apply_marketing_client_attribution(
  p_owner_id uuid,
  p_client_id uuid,
  p_lead_id uuid,
  p_method text,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_lead "RetificaPremium"."Marketing_Leads"%rowtype;
  v_source text;
  v_medium text;
  v_inserted_id uuid;
begin
  if p_owner_id is null or p_client_id is null or p_lead_id is null then
    raise exception 'Atribuição de marketing incompleta.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from "RetificaPremium"."Clientes" c
    where c.id_clientes = p_client_id
      and c.fk_criado_por = p_owner_id
  ) then
    raise exception 'Cliente não pertence ao usuário informado.' using errcode = 'P0403';
  end if;

  select *
  into v_lead
  from "RetificaPremium"."Marketing_Leads" l
  where l.id_marketing_leads = p_lead_id
    and l.fk_criado_por = p_owner_id
  for update;

  if v_lead.id_marketing_leads is null then
    raise exception 'Contato de marketing não encontrado.' using errcode = 'P2001';
  end if;

  if v_lead.fk_clientes is not null and v_lead.fk_clientes <> p_client_id then
    raise exception 'Este contato de marketing já pertence a outro cliente.' using errcode = 'P0409';
  end if;

  -- First-touch: um cliente nunca troca silenciosamente a origem que gerou sua conversão.
  if exists (
    select 1
    from "RetificaPremium"."Marketing_Client_Attributions" a
    where a.fk_criado_por = p_owner_id
      and a.fk_clientes = p_client_id
  ) then
    return false;
  end if;

  v_source := coalesce(
    nullif(trim(v_lead.source), ''),
    case when coalesce(v_lead.gclid, v_lead.gbraid, v_lead.wbraid) is not null then 'google' end
  );
  v_medium := coalesce(
    nullif(trim(v_lead.medium), ''),
    case when coalesce(v_lead.gclid, v_lead.gbraid, v_lead.wbraid) is not null then 'cpc' end
  );

  update "RetificaPremium"."Marketing_Leads"
  set
    fk_clientes = p_client_id,
    identified_at = coalesce(identified_at, now()),
    identification_method = coalesce(nullif(trim(p_method), ''), 'telefone_ou_email'),
    source = v_source,
    medium = v_medium,
    status = case when status in ('novo', 'intencao') then 'identificado' else status end,
    updated_at = now()
  where id_marketing_leads = p_lead_id;

  insert into "RetificaPremium"."Marketing_Client_Attributions" (
    fk_criado_por,
    fk_clientes,
    fk_marketing_leads,
    lead_code,
    channel,
    source,
    medium,
    campaign,
    attribution_method,
    attributed_at,
    attributed_by,
    metadata
  )
  values (
    p_owner_id,
    p_client_id,
    p_lead_id,
    v_lead.lead_code,
    coalesce(nullif(trim(v_lead.channel), ''), 'site_form'),
    v_source,
    v_medium,
    v_lead.campaign,
    coalesce(nullif(trim(p_method), ''), 'telefone_ou_email'),
    now(),
    p_actor_id,
    jsonb_build_object(
      'lead_occurred_at', v_lead.occurred_at,
      'has_google_click_id', coalesce(v_lead.gclid, v_lead.gbraid, v_lead.wbraid) is not null
    )
  )
  on conflict (fk_criado_por, fk_clientes) do nothing
  returning id_marketing_client_attributions into v_inserted_id;

  return v_inserted_id is not null;
end;
$$;

revoke all on function "RetificaPremium".apply_marketing_client_attribution(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".apply_marketing_client_attribution(uuid, uuid, uuid, text, uuid)
  to service_role;

create or replace function "RetificaPremium".try_auto_attribute_marketing_lead()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_client_id uuid;
  v_match_count integer;
begin
  if new.fk_clientes is not null then
    return new;
  end if;

  select count(distinct c.id_clientes), (array_agg(distinct c.id_clientes))[1]
  into v_match_count, v_client_id
  from "RetificaPremium"."Clientes" c
  join "RetificaPremium"."Contatos" ct on ct.fk_clientes = c.id_clientes
  where c.fk_criado_por = new.fk_criado_por
    and (
      (
        new.telefone is not null
        and length(regexp_replace(new.telefone, '\D', '', 'g')) >= 8
        and ct.tipo_contato = 'telefone'
        and regexp_replace(ct.contato, '\D', '', 'g') = regexp_replace(new.telefone, '\D', '', 'g')
      )
      or
      (
        new.email is not null
        and ct.tipo_contato = 'email'
        and lower(trim(ct.contato)) = lower(trim(new.email))
      )
    );

  if v_match_count = 1 and v_client_id is not null then
    perform "RetificaPremium".apply_marketing_client_attribution(
      new.fk_criado_por,
      v_client_id,
      new.id_marketing_leads,
      'telefone_ou_email',
      null
    );
  end if;

  return new;
end;
$$;

revoke all on function "RetificaPremium".try_auto_attribute_marketing_lead()
  from public, anon, authenticated;
grant execute on function "RetificaPremium".try_auto_attribute_marketing_lead()
  to service_role;

create or replace function "RetificaPremium".try_auto_attribute_marketing_contact()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_owner_id uuid;
  v_lead_id uuid;
begin
  select c.fk_criado_por
  into v_owner_id
  from "RetificaPremium"."Clientes" c
  where c.id_clientes = new.fk_clientes;

  if v_owner_id is null or exists (
    select 1
    from "RetificaPremium"."Marketing_Client_Attributions" a
    where a.fk_criado_por = v_owner_id
      and a.fk_clientes = new.fk_clientes
  ) then
    return new;
  end if;

  select l.id_marketing_leads
  into v_lead_id
  from "RetificaPremium"."Marketing_Leads" l
  where l.fk_criado_por = v_owner_id
    and l.fk_clientes is null
    and l.occurred_at >= now() - interval '90 days'
    and l.occurred_at <= now() + interval '5 minutes'
    and (
      (
        new.tipo_contato = 'telefone'
        and length(regexp_replace(new.contato, '\D', '', 'g')) >= 8
        and l.telefone is not null
        and regexp_replace(l.telefone, '\D', '', 'g') = regexp_replace(new.contato, '\D', '', 'g')
      )
      or
      (
        new.tipo_contato = 'email'
        and l.email is not null
        and lower(trim(l.email)) = lower(trim(new.contato))
      )
    )
  order by l.occurred_at desc, l.created_at desc
  limit 1;

  if v_lead_id is not null then
    perform "RetificaPremium".apply_marketing_client_attribution(
      v_owner_id,
      new.fk_clientes,
      v_lead_id,
      'telefone_ou_email',
      null
    );
  end if;

  return new;
end;
$$;

revoke all on function "RetificaPremium".try_auto_attribute_marketing_contact()
  from public, anon, authenticated;
grant execute on function "RetificaPremium".try_auto_attribute_marketing_contact()
  to service_role;

drop trigger if exists trg_auto_attribute_marketing_contact
  on "RetificaPremium"."Contatos";
create trigger trg_auto_attribute_marketing_contact
after insert or update of contato, tipo_contato, fk_clientes
on "RetificaPremium"."Contatos"
for each row execute function "RetificaPremium".try_auto_attribute_marketing_contact();

create or replace function "RetificaPremium".attribute_marketing_client_by_code(
  p_client_id uuid,
  p_lead_code text
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_owner_id uuid;
  v_actor_id uuid;
  v_lead_id uuid;
  v_applied boolean;
begin
  v_owner_id := "RetificaPremium".require_current_usuario_id();
  v_actor_id := v_owner_id;

  if p_lead_code is null or upper(trim(p_lead_code)) !~ '^RP-[0-9]{8}-[A-Z0-9]{8}$' then
    return json_build_object(
      'status', 400,
      'code', 'invalid_lead_code',
      'mensagem', 'Código do contato inválido. Use o formato RP-AAAAMMDD-XXXXXXXX.'
    );
  end if;

  if not exists (
    select 1 from "RetificaPremium"."Clientes" c
    where c.id_clientes = p_client_id and c.fk_criado_por = v_owner_id
  ) then
    return json_build_object('status', 404, 'code', 'client_not_found', 'mensagem', 'Cliente não encontrado.');
  end if;

  select l.id_marketing_leads
  into v_lead_id
  from "RetificaPremium"."Marketing_Leads" l
  where l.fk_criado_por = v_owner_id
    and upper(l.lead_code) = upper(trim(p_lead_code))
  limit 1;

  if v_lead_id is null then
    return json_build_object(
      'status', 404,
      'code', 'lead_not_found',
      'mensagem', 'Código de contato não encontrado no histórico do site.'
    );
  end if;

  v_applied := "RetificaPremium".apply_marketing_client_attribution(
    v_owner_id, p_client_id, v_lead_id, 'codigo_whatsapp', v_actor_id
  );

  return json_build_object(
    'status', 200,
    'mensagem', case when v_applied then 'Conversão vinculada ao cliente.' else 'Cliente já possuía uma origem de marketing.' end,
    'atribuido', v_applied
  );
exception
  when sqlstate 'P0409' then
    return json_build_object('status', 409, 'code', 'lead_already_linked', 'mensagem', sqlerrm);
  when others then
    return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".attribute_marketing_client_by_code_contexto_suporte(
  p_client_id uuid,
  p_lead_code text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_owner_id uuid;
  v_actor_id uuid;
  v_lead_id uuid;
  v_applied boolean;
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

  if p_lead_code is null or upper(trim(p_lead_code)) !~ '^RP-[0-9]{8}-[A-Z0-9]{8}$' then
    return json_build_object(
      'status', 400,
      'code', 'invalid_lead_code',
      'mensagem', 'Código do contato inválido. Use o formato RP-AAAAMMDD-XXXXXXXX.'
    );
  end if;

  if not exists (
    select 1 from "RetificaPremium"."Clientes" c
    where c.id_clientes = p_client_id and c.fk_criado_por = v_owner_id
  ) then
    return json_build_object('status', 404, 'code', 'client_not_found', 'mensagem', 'Cliente não encontrado.');
  end if;

  select l.id_marketing_leads
  into v_lead_id
  from "RetificaPremium"."Marketing_Leads" l
  where l.fk_criado_por = v_owner_id
    and upper(l.lead_code) = upper(trim(p_lead_code))
  limit 1;

  if v_lead_id is null then
    return json_build_object(
      'status', 404,
      'code', 'lead_not_found',
      'mensagem', 'Código de contato não encontrado no histórico do site.'
    );
  end if;

  v_applied := "RetificaPremium".apply_marketing_client_attribution(
    v_owner_id, p_client_id, v_lead_id, 'codigo_whatsapp', v_actor_id
  );

  return json_build_object(
    'status', 200,
    'mensagem', case when v_applied then 'Conversão vinculada ao cliente.' else 'Cliente já possuía uma origem de marketing.' end,
    'atribuido', v_applied
  );
exception
  when sqlstate 'P0409' then
    return json_build_object('status', 409, 'code', 'lead_already_linked', 'mensagem', sqlerrm);
  when others then
    return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

revoke all on function "RetificaPremium".attribute_marketing_client_by_code(uuid, text)
  from public, anon;
grant execute on function "RetificaPremium".attribute_marketing_client_by_code(uuid, text)
  to authenticated, service_role;

revoke all on function "RetificaPremium".attribute_marketing_client_by_code_contexto_suporte(uuid, text, uuid, uuid)
  from public, anon;
grant execute on function "RetificaPremium".attribute_marketing_client_by_code_contexto_suporte(uuid, text, uuid, uuid)
  to authenticated, service_role;

create or replace function "RetificaPremium".queue_marketing_client_conversion()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_lead "RetificaPremium"."Marketing_Leads"%rowtype;
  v_click_id_type text;
  v_click_id text;
begin
  if new.fk_marketing_leads is null then
    return new;
  end if;

  select *
  into v_lead
  from "RetificaPremium"."Marketing_Leads" l
  where l.id_marketing_leads = new.fk_marketing_leads
    and l.fk_criado_por = new.fk_criado_por;

  if v_lead.gclid is not null then
    v_click_id_type := 'gclid';
    v_click_id := v_lead.gclid;
  elsif v_lead.gbraid is not null then
    v_click_id_type := 'gbraid';
    v_click_id := v_lead.gbraid;
  elsif v_lead.wbraid is not null then
    v_click_id_type := 'wbraid';
    v_click_id := v_lead.wbraid;
  else
    return new;
  end if;

  insert into "RetificaPremium"."Marketing_Offline_Conversions" (
    fk_criado_por,
    fk_marketing_client_attributions,
    fk_marketing_leads,
    fk_clientes,
    click_id_type,
    click_id,
    conversion_date_time,
    order_id
  )
  values (
    new.fk_criado_por,
    new.id_marketing_client_attributions,
    new.fk_marketing_leads,
    new.fk_clientes,
    v_click_id_type,
    v_click_id,
    new.attributed_at,
    'retiflow-client-' || new.fk_clientes::text
  )
  on conflict (fk_criado_por, conversion_kind, fk_marketing_client_attributions) do nothing;

  return new;
end;
$$;

revoke all on function "RetificaPremium".queue_marketing_client_conversion()
  from public, anon, authenticated;
grant execute on function "RetificaPremium".queue_marketing_client_conversion()
  to service_role;

drop trigger if exists trg_queue_marketing_client_conversion
  on "RetificaPremium"."Marketing_Client_Attributions";
create trigger trg_queue_marketing_client_conversion
after insert on "RetificaPremium"."Marketing_Client_Attributions"
for each row execute function "RetificaPremium".queue_marketing_client_conversion();

-- Backfill seguro para atribuicoes que existam antes desta migration.
insert into "RetificaPremium"."Marketing_Offline_Conversions" (
  fk_criado_por,
  fk_marketing_client_attributions,
  fk_marketing_leads,
  fk_clientes,
  click_id_type,
  click_id,
  conversion_date_time,
  order_id
)
select
  a.fk_criado_por,
  a.id_marketing_client_attributions,
  a.fk_marketing_leads,
  a.fk_clientes,
  case
    when l.gclid is not null then 'gclid'
    when l.gbraid is not null then 'gbraid'
    else 'wbraid'
  end,
  coalesce(l.gclid, l.gbraid, l.wbraid),
  a.attributed_at,
  'retiflow-client-' || a.fk_clientes::text
from "RetificaPremium"."Marketing_Client_Attributions" a
join "RetificaPremium"."Marketing_Leads" l
  on l.id_marketing_leads = a.fk_marketing_leads
 and l.fk_criado_por = a.fk_criado_por
where coalesce(l.gclid, l.gbraid, l.wbraid) is not null
on conflict (fk_criado_por, conversion_kind, fk_marketing_client_attributions) do nothing;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'marketing_offline_conversion_cron_secret'
  ) then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'marketing_offline_conversion_cron_secret',
      'Autenticacao interna do cron de conversoes offline do Retiflow'
    );
  end if;
end;
$$;

create or replace function "RetificaPremium".validate_marketing_offline_conversion_cron_secret(
  p_secret text
)
returns boolean
language sql
security definer
set search_path = "RetificaPremium", public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'marketing_offline_conversion_cron_secret'
      and decrypted_secret = coalesce(p_secret, '')
  );
$$;

revoke all on function "RetificaPremium".validate_marketing_offline_conversion_cron_secret(text)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".validate_marketing_offline_conversion_cron_secret(text)
  to service_role;

create or replace function "RetificaPremium".claim_marketing_offline_conversions(
  p_limit integer default 50
)
returns table (
  id_marketing_offline_conversions uuid,
  click_id_type text,
  click_id text,
  conversion_date_time timestamptz,
  conversion_value numeric,
  currency_code text,
  order_id text,
  attempts integer
)
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
begin
  return query
  with candidates as (
    select q.id_marketing_offline_conversions
    from "RetificaPremium"."Marketing_Offline_Conversions" q
    where (
      q.status in ('pending', 'retry')
      and q.next_attempt_at <= now()
    ) or (
      q.status = 'processing'
      and q.processing_started_at < now() - interval '15 minutes'
    )
    order by q.created_at, q.id_marketing_offline_conversions
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  update "RetificaPremium"."Marketing_Offline_Conversions" q
  set
    status = 'processing',
    attempts = q.attempts + 1,
    processing_started_at = now(),
    updated_at = now(),
    google_error_code = null,
    google_error_message = null
  from candidates c
  where q.id_marketing_offline_conversions = c.id_marketing_offline_conversions
  returning
    q.id_marketing_offline_conversions,
    q.click_id_type,
    q.click_id,
    q.conversion_date_time,
    q.conversion_value,
    q.currency_code,
    q.order_id,
    q.attempts;
end;
$$;

revoke all on function "RetificaPremium".claim_marketing_offline_conversions(integer)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".claim_marketing_offline_conversions(integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'retiflow-marketing-offline-conversions'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'retiflow-marketing-offline-conversions',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'retiflow_project_url'
      ) || '/functions/v1/marketing-offline-conversions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-retiflow-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'marketing_offline_conversion_cron_secret'
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

do $$
begin
  if has_table_privilege('authenticated', '"RetificaPremium"."Marketing_Offline_Conversions"', 'SELECT')
    or has_table_privilege('anon', '"RetificaPremium"."Marketing_Offline_Conversions"', 'SELECT')
    or not has_table_privilege('service_role', '"RetificaPremium"."Marketing_Offline_Conversions"', 'SELECT')
  then
    raise exception 'ACL inesperada em Marketing_Offline_Conversions';
  end if;
end
$$;
