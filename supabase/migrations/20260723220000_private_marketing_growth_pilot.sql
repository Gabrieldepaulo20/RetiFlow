-- Painel Crescimento privado do Mega Master.
--
-- Esta migration e estritamente aditiva para Clientes e Notas_de_Servico:
-- nenhuma coluna, regra ou RPC operacional existente e alterada. A atribuicao
-- e os snapshots financeiros vivem em tabelas proprias de marketing.

alter table "RetificaPremium"."Marketing_Config"
  add column if not exists search_console_site_url text,
  add column if not exists search_console_status text not null default 'not_connected',
  add column if not exists pilot_start_date date,
  add column if not exists pilot_end_date date,
  add column if not exists commission_rate numeric(5,4) not null default 0.2000,
  add column if not exists dedupe_window_minutes integer not null default 30,
  add column if not exists ads_monthly_budget numeric(12,2) not null default 1000,
  add column if not exists organic_goal_min numeric(5,4) not null default 0.2500,
  add column if not exists organic_goal_max numeric(5,4) not null default 0.6000,
  add column if not exists qualified_call_seconds integer not null default 60;

alter table "RetificaPremium"."Marketing_Config"
  drop constraint if exists marketing_config_search_console_status_check,
  drop constraint if exists marketing_config_commission_rate_check,
  drop constraint if exists marketing_config_dedupe_window_check,
  drop constraint if exists marketing_config_ads_budget_check,
  drop constraint if exists marketing_config_organic_goal_check,
  drop constraint if exists marketing_config_qualified_call_check;

alter table "RetificaPremium"."Marketing_Config"
  add constraint marketing_config_search_console_status_check
    check (search_console_status in ('not_connected', 'connected', 'needs_attention', 'syncing', 'disabled')),
  add constraint marketing_config_commission_rate_check
    check (commission_rate >= 0 and commission_rate <= 1),
  add constraint marketing_config_dedupe_window_check
    check (dedupe_window_minutes between 1 and 1440),
  add constraint marketing_config_ads_budget_check
    check (ads_monthly_budget >= 0),
  add constraint marketing_config_organic_goal_check
    check (organic_goal_min >= 0 and organic_goal_max >= organic_goal_min),
  add constraint marketing_config_qualified_call_check
    check (qualified_call_seconds between 1 and 3600);

alter table "RetificaPremium"."Marketing_Integracoes"
  drop constraint if exists "Marketing_Integracoes_provider_check";

alter table "RetificaPremium"."Marketing_Integracoes"
  add constraint "Marketing_Integracoes_provider_check"
    check (provider in ('ga4', 'search_console', 'clarity', 'meta_ads', 'google_ads', 'internal'));

alter table "RetificaPremium"."Marketing_Site_Eventos"
  drop constraint if exists "Marketing_Site_Eventos_event_type_check";

alter table "RetificaPremium"."Marketing_Site_Eventos"
  add constraint "Marketing_Site_Eventos_event_type_check"
    check (event_type in (
      'page_view',
      'whatsapp_click',
      'phone_click',
      'form_view',
      'form_start',
      'form_abandon',
      'form_submit_attempt',
      'form_validation_error',
      'form_submit_error',
      'form_submit',
      'lead_created',
      'critical_page_view',
      'custom'
    ));

alter table "RetificaPremium"."Marketing_Site_Eventos"
  add column if not exists external_event_id text,
  add column if not exists lead_code text,
  add column if not exists channel text,
  add column if not exists page_location text,
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists last_field text,
  add column if not exists validation_reason text,
  add column if not exists form_elapsed_seconds integer,
  add column if not exists fields_completed integer,
  add column if not exists duplicate_count integer not null default 0,
  add column if not exists deduplicated boolean not null default false,
  add column if not exists alert_status text not null default 'not_required';

alter table "RetificaPremium"."Marketing_Site_Eventos"
  drop constraint if exists marketing_site_eventos_alert_status_check,
  drop constraint if exists marketing_site_eventos_form_elapsed_check,
  drop constraint if exists marketing_site_eventos_fields_completed_check,
  drop constraint if exists marketing_site_eventos_duplicate_count_check;

alter table "RetificaPremium"."Marketing_Site_Eventos"
  add constraint marketing_site_eventos_alert_status_check
    check (alert_status in ('not_required', 'pending', 'sent', 'failed', 'already_sent')),
  add constraint marketing_site_eventos_form_elapsed_check
    check (form_elapsed_seconds is null or form_elapsed_seconds >= 0),
  add constraint marketing_site_eventos_fields_completed_check
    check (fields_completed is null or fields_completed >= 0),
  add constraint marketing_site_eventos_duplicate_count_check
    check (duplicate_count >= 0);

create unique index if not exists idx_marketing_eventos_owner_external_event
  on "RetificaPremium"."Marketing_Site_Eventos"(fk_criado_por, external_event_id)
  where external_event_id is not null;

create index if not exists idx_marketing_eventos_owner_lead_code
  on "RetificaPremium"."Marketing_Site_Eventos"(fk_criado_por, lead_code)
  where lead_code is not null;

alter table "RetificaPremium"."Marketing_Leads"
  add column if not exists lead_code text,
  add column if not exists channel text,
  add column if not exists term text,
  add column if not exists content text,
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists fk_clientes uuid references "RetificaPremium"."Clientes"(id_clientes) on delete set null,
  add column if not exists identified_at timestamptz,
  add column if not exists identification_method text,
  add column if not exists notes text;

create unique index if not exists idx_marketing_leads_owner_code
  on "RetificaPremium"."Marketing_Leads"(fk_criado_por, lead_code)
  where lead_code is not null;

create index if not exists idx_marketing_leads_owner_client
  on "RetificaPremium"."Marketing_Leads"(fk_criado_por, fk_clientes)
  where fk_clientes is not null;

create table if not exists "RetificaPremium"."Marketing_Client_Attributions" (
  id_marketing_client_attributions uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  fk_clientes uuid not null references "RetificaPremium"."Clientes"(id_clientes) on delete cascade,
  fk_marketing_leads uuid references "RetificaPremium"."Marketing_Leads"(id_marketing_leads) on delete set null,
  lead_code text,
  channel text not null default 'internet',
  source text,
  medium text,
  campaign text,
  attribution_method text not null,
  attributed_at timestamptz not null default now(),
  attributed_by uuid references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fk_criado_por, fk_clientes)
);

create index if not exists idx_marketing_client_attributions_owner_date
  on "RetificaPremium"."Marketing_Client_Attributions"(fk_criado_por, attributed_at desc);

create index if not exists idx_marketing_client_attributions_owner_lead
  on "RetificaPremium"."Marketing_Client_Attributions"(fk_criado_por, fk_marketing_leads)
  where fk_marketing_leads is not null;

create table if not exists "RetificaPremium"."Marketing_Commission_Snapshots" (
  id_marketing_commission_snapshots uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  fk_clientes uuid not null references "RetificaPremium"."Clientes"(id_clientes) on delete restrict,
  fk_notas_servico uuid not null references "RetificaPremium"."Notas_de_Servico"(id_notas_servico) on delete restrict,
  fk_marketing_client_attributions uuid not null
    references "RetificaPremium"."Marketing_Client_Attributions"(id_marketing_client_attributions) on delete restrict,
  os_numero text not null,
  status_at_approval text not null default 'APROVADO',
  services_snapshot numeric(14,2) not null,
  products_excluded_snapshot numeric(14,2) not null default 0,
  commission_rate_snapshot numeric(5,4) not null,
  commission_amount_snapshot numeric(14,2) not null,
  source_snapshot text,
  campaign_snapshot text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (fk_criado_por, fk_notas_servico)
);

create index if not exists idx_marketing_commission_owner_approved
  on "RetificaPremium"."Marketing_Commission_Snapshots"(fk_criado_por, approved_at desc);

create index if not exists idx_marketing_commission_owner_client
  on "RetificaPremium"."Marketing_Commission_Snapshots"(fk_criado_por, fk_clientes);

alter table "RetificaPremium"."Marketing_Client_Attributions" enable row level security;
alter table "RetificaPremium"."Marketing_Commission_Snapshots" enable row level security;

-- Os dados de Crescimento sao privados do Mega Master. O navegador autenticado
-- nao recebe acesso direto; somente Edge Functions validadas usam service_role.
revoke all on table
  "RetificaPremium"."Marketing_Config",
  "RetificaPremium"."Marketing_Integracoes",
  "RetificaPremium"."Marketing_Site_Eventos",
  "RetificaPremium"."Marketing_Leads",
  "RetificaPremium"."Marketing_Snapshots",
  "RetificaPremium"."Marketing_Sync_Logs",
  "RetificaPremium"."Marketing_Audit_Logs",
  "RetificaPremium"."Marketing_Client_Attributions",
  "RetificaPremium"."Marketing_Commission_Snapshots"
from authenticated;

grant all privileges on table
  "RetificaPremium"."Marketing_Config",
  "RetificaPremium"."Marketing_Integracoes",
  "RetificaPremium"."Marketing_Site_Eventos",
  "RetificaPremium"."Marketing_Leads",
  "RetificaPremium"."Marketing_Snapshots",
  "RetificaPremium"."Marketing_Sync_Logs",
  "RetificaPremium"."Marketing_Audit_Logs",
  "RetificaPremium"."Marketing_Client_Attributions",
  "RetificaPremium"."Marketing_Commission_Snapshots"
to service_role;

revoke execute on function "RetificaPremium".get_marketing_resumo(integer) from authenticated;

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

  if v_match_count <> 1 or v_client_id is null then
    return new;
  end if;

  update "RetificaPremium"."Marketing_Leads"
  set
    fk_clientes = v_client_id,
    identified_at = coalesce(identified_at, now()),
    identification_method = coalesce(identification_method, 'telefone_ou_email'),
    status = case when status in ('novo', 'intencao') then 'identificado' else status end,
    updated_at = now()
  where id_marketing_leads = new.id_marketing_leads;

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
    attributed_at
  )
  values (
    new.fk_criado_por,
    v_client_id,
    new.id_marketing_leads,
    new.lead_code,
    coalesce(new.channel, 'site_form'),
    new.source,
    new.medium,
    new.campaign,
    'telefone_ou_email',
    coalesce(new.occurred_at, now())
  )
  on conflict (fk_criado_por, fk_clientes) do nothing;

  return new;
end;
$$;

revoke all on function "RetificaPremium".try_auto_attribute_marketing_lead() from public, anon, authenticated;
grant execute on function "RetificaPremium".try_auto_attribute_marketing_lead() to service_role;

drop trigger if exists trg_try_auto_attribute_marketing_lead
  on "RetificaPremium"."Marketing_Leads";

create trigger trg_try_auto_attribute_marketing_lead
after insert on "RetificaPremium"."Marketing_Leads"
for each row execute function "RetificaPremium".try_auto_attribute_marketing_lead();

create or replace function "RetificaPremium".snapshot_marketing_commission_on_approval()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_new_status text;
  v_old_status text;
  v_owner_id uuid;
  v_attribution "RetificaPremium"."Marketing_Client_Attributions"%rowtype;
  v_commission_rate numeric(5,4);
begin
  select upper(trim(nome))
  into v_new_status
  from "RetificaPremium"."Status_Notas"
  where id_status_notas = new.fk_status;

  if old.fk_status is not null then
    select upper(trim(nome))
    into v_old_status
    from "RetificaPremium"."Status_Notas"
    where id_status_notas = old.fk_status;
  end if;

  if v_new_status <> 'APROVADO' or coalesce(v_old_status, '') = 'APROVADO' then
    return new;
  end if;

  select c.fk_criado_por
  into v_owner_id
  from "RetificaPremium"."Clientes" c
  where c.id_clientes = new.fk_clientes;

  if v_owner_id is null then
    return new;
  end if;

  select *
  into v_attribution
  from "RetificaPremium"."Marketing_Client_Attributions" a
  where a.fk_criado_por = v_owner_id
    and a.fk_clientes = new.fk_clientes
  order by a.attributed_at asc
  limit 1;

  if v_attribution.id_marketing_client_attributions is null then
    return new;
  end if;

  select coalesce(c.commission_rate, 0.2000)
  into v_commission_rate
  from "RetificaPremium"."Marketing_Config" c
  where c.fk_criado_por = v_owner_id;

  v_commission_rate := coalesce(v_commission_rate, 0.2000);

  insert into "RetificaPremium"."Marketing_Commission_Snapshots" (
    fk_criado_por,
    fk_clientes,
    fk_notas_servico,
    fk_marketing_client_attributions,
    os_numero,
    status_at_approval,
    services_snapshot,
    products_excluded_snapshot,
    commission_rate_snapshot,
    commission_amount_snapshot,
    source_snapshot,
    campaign_snapshot,
    approved_at
  )
  values (
    v_owner_id,
    new.fk_clientes,
    new.id_notas_servico,
    v_attribution.id_marketing_client_attributions,
    new.os,
    'APROVADO',
    round(coalesce(new.total_servicos, 0)::numeric, 2),
    round(coalesce(new.total_produtos, 0)::numeric, 2),
    v_commission_rate,
    round(coalesce(new.total_servicos, 0)::numeric * v_commission_rate, 2),
    v_attribution.source,
    v_attribution.campaign,
    now()
  )
  on conflict (fk_criado_por, fk_notas_servico) do nothing;

  return new;
end;
$$;

revoke all on function "RetificaPremium".snapshot_marketing_commission_on_approval() from public, anon, authenticated;
grant execute on function "RetificaPremium".snapshot_marketing_commission_on_approval() to service_role;

drop trigger if exists trg_snapshot_marketing_commission_on_approval
  on "RetificaPremium"."Notas_de_Servico";

create trigger trg_snapshot_marketing_commission_on_approval
after update of fk_status on "RetificaPremium"."Notas_de_Servico"
for each row
when (old.fk_status is distinct from new.fk_status)
execute function "RetificaPremium".snapshot_marketing_commission_on_approval();

update "RetificaPremium"."Marketing_Config" c
set
  search_console_site_url = coalesce(c.search_console_site_url, 'sc-domain:retificapremium.com.br'),
  pilot_start_date = coalesce(c.pilot_start_date, date '2026-07-23'),
  pilot_end_date = coalesce(c.pilot_end_date, date '2026-10-21'),
  commission_rate = 0.2000,
  dedupe_window_minutes = 30,
  ads_monthly_budget = 1000,
  organic_goal_min = 0.2500,
  organic_goal_max = 0.6000,
  qualified_call_seconds = 60,
  updated_at = now()
from "RetificaPremium"."Usuarios" u
where u.id_usuarios = c.fk_criado_por
  and lower(u.email) = lower('retificapremium5@gmail.com');

insert into "RetificaPremium"."Marketing_Snapshots" (
  fk_criado_por,
  snapshot_type,
  period_start,
  period_end,
  metrics,
  generated_at
)
select
  u.id_usuarios,
  'executive_summary',
  date '2026-07-23',
  date '2026-07-23',
  jsonb_build_object(
    'marker', 'D0',
    'searchConsole', jsonb_build_object(
      'impressions28d', 1791,
      'clicks28d', 34,
      'impressions90d', 2759,
      'clicks90d', 75,
      'ctr90d', 2.7,
      'position90d', 6.6
    ),
    'ga4', jsonb_build_object(
      'activeUsers28d', 76,
      'sessions28d', 107,
      'whatsappClicks28d', 14,
      'formStarts28d', 7,
      'generateLead28d', 0
    ),
    'ads', jsonb_build_object(
      'spend', 0,
      'impressions', 0,
      'clicks', 0
    ),
    'business', jsonb_build_object(
      'identifiedClients', 0,
      'approvedOrders', 0,
      'approvedServices', 0,
      'commission', 0
    )
  ),
  timestamptz '2026-07-23 15:00:00-03'
from "RetificaPremium"."Usuarios" u
where lower(u.email) = lower('retificapremium5@gmail.com')
on conflict (fk_criado_por, snapshot_type, period_start, period_end) do nothing;
