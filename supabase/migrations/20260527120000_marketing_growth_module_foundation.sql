alter table "RetificaPremium"."Modulos"
  add column if not exists marketing boolean not null default false;

create unique index if not exists idx_modulos_fk_usuarios_unique
  on "RetificaPremium"."Modulos"(fk_usuarios);

create table if not exists "RetificaPremium"."Marketing_Config" (
  id_marketing_config uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  modulo_habilitado boolean not null default false,
  site_key_hash text,
  allowed_origins text[] not null default '{}',
  ga4_property_id text,
  ga4_status text not null default 'not_connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fk_criado_por)
);

create table if not exists "RetificaPremium"."Marketing_Integracoes" (
  id_marketing_integracoes uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  provider text not null check (provider in ('ga4', 'clarity', 'meta_ads', 'google_ads', 'internal')),
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'needs_attention', 'syncing', 'disabled')),
  external_account_id text,
  external_account_name text,
  config jsonb not null default '{}'::jsonb,
  token_ref text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fk_criado_por, provider, external_account_id)
);

create table if not exists "RetificaPremium"."Marketing_Site_Eventos" (
  id_marketing_site_eventos uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  event_type text not null check (event_type in ('page_view', 'whatsapp_click', 'form_submit', 'lead_created', 'critical_page_view', 'custom')),
  occurred_at timestamptz not null default now(),
  session_id text,
  anonymous_id text,
  lead_id uuid,
  page_path text,
  page_title text,
  referrer text,
  source text,
  medium text,
  campaign text,
  term text,
  content text,
  device_type text,
  city text,
  region text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists "RetificaPremium"."Marketing_Leads" (
  id_marketing_leads uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  occurred_at timestamptz not null default now(),
  nome text,
  email text,
  telefone text,
  source text,
  medium text,
  campaign text,
  page_path text,
  event_id uuid references "RetificaPremium"."Marketing_Site_Eventos"(id_marketing_site_eventos) on delete set null,
  dedupe_key text,
  status text not null default 'novo',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists "RetificaPremium"."Marketing_Snapshots" (
  id_marketing_snapshots uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('site_daily', 'campaign_daily', 'executive_summary')),
  period_start date not null,
  period_end date not null,
  metrics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  unique (fk_criado_por, snapshot_type, period_start, period_end)
);

create table if not exists "RetificaPremium"."Marketing_Sync_Logs" (
  id_marketing_sync_logs uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  provider text not null,
  status text not null check (status in ('started', 'success', 'partial', 'failed')),
  correlation_id uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer not null default 0,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists "RetificaPremium"."Marketing_Audit_Logs" (
  id_marketing_audit_logs uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  actor_usuario_id uuid references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_config_owner
  on "RetificaPremium"."Marketing_Config"(fk_criado_por);
create index if not exists idx_marketing_integracoes_owner_provider
  on "RetificaPremium"."Marketing_Integracoes"(fk_criado_por, provider, status);
create index if not exists idx_marketing_eventos_owner_date
  on "RetificaPremium"."Marketing_Site_Eventos"(fk_criado_por, occurred_at desc);
create index if not exists idx_marketing_eventos_owner_type_date
  on "RetificaPremium"."Marketing_Site_Eventos"(fk_criado_por, event_type, occurred_at desc);
create index if not exists idx_marketing_eventos_owner_page
  on "RetificaPremium"."Marketing_Site_Eventos"(fk_criado_por, page_path);
create index if not exists idx_marketing_leads_owner_date
  on "RetificaPremium"."Marketing_Leads"(fk_criado_por, occurred_at desc);
create unique index if not exists idx_marketing_leads_owner_dedupe
  on "RetificaPremium"."Marketing_Leads"(fk_criado_por, dedupe_key)
  where dedupe_key is not null;
create index if not exists idx_marketing_snapshots_owner_type_period
  on "RetificaPremium"."Marketing_Snapshots"(fk_criado_por, snapshot_type, period_start, period_end);
create index if not exists idx_marketing_sync_logs_owner_provider_date
  on "RetificaPremium"."Marketing_Sync_Logs"(fk_criado_por, provider, started_at desc);
create index if not exists idx_marketing_audit_logs_owner_date
  on "RetificaPremium"."Marketing_Audit_Logs"(fk_criado_por, created_at desc);

alter table "RetificaPremium"."Marketing_Config" enable row level security;
alter table "RetificaPremium"."Marketing_Integracoes" enable row level security;
alter table "RetificaPremium"."Marketing_Site_Eventos" enable row level security;
alter table "RetificaPremium"."Marketing_Leads" enable row level security;
alter table "RetificaPremium"."Marketing_Snapshots" enable row level security;
alter table "RetificaPremium"."Marketing_Sync_Logs" enable row level security;
alter table "RetificaPremium"."Marketing_Audit_Logs" enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'Marketing_Config',
    'Marketing_Integracoes',
    'Marketing_Site_Eventos',
    'Marketing_Leads',
    'Marketing_Snapshots',
    'Marketing_Sync_Logs',
    'Marketing_Audit_Logs'
  ]
  loop
    execute format('drop policy if exists %I on "RetificaPremium".%I', table_name || '_owner_select', table_name);
    execute format('drop policy if exists %I on "RetificaPremium".%I', table_name || '_owner_insert', table_name);
    execute format('drop policy if exists %I on "RetificaPremium".%I', table_name || '_owner_update', table_name);
    execute format('drop policy if exists %I on "RetificaPremium".%I', table_name || '_owner_delete', table_name);

    execute format(
      'create policy %I on "RetificaPremium".%I for select to authenticated using (fk_criado_por = "RetificaPremium".current_usuario_id())',
      table_name || '_owner_select',
      table_name
    );
    execute format(
      'create policy %I on "RetificaPremium".%I for insert to authenticated with check (fk_criado_por = "RetificaPremium".current_usuario_id())',
      table_name || '_owner_insert',
      table_name
    );
    execute format(
      'create policy %I on "RetificaPremium".%I for update to authenticated using (fk_criado_por = "RetificaPremium".current_usuario_id()) with check (fk_criado_por = "RetificaPremium".current_usuario_id())',
      table_name || '_owner_update',
      table_name
    );
    execute format(
      'create policy %I on "RetificaPremium".%I for delete to authenticated using (fk_criado_por = "RetificaPremium".current_usuario_id())',
      table_name || '_owner_delete',
      table_name
    );
  end loop;
end $$;

grant select, insert, update, delete on table
  "RetificaPremium"."Marketing_Config",
  "RetificaPremium"."Marketing_Integracoes",
  "RetificaPremium"."Marketing_Site_Eventos",
  "RetificaPremium"."Marketing_Leads",
  "RetificaPremium"."Marketing_Snapshots",
  "RetificaPremium"."Marketing_Sync_Logs",
  "RetificaPremium"."Marketing_Audit_Logs"
to authenticated;

grant all privileges on table
  "RetificaPremium"."Marketing_Config",
  "RetificaPremium"."Marketing_Integracoes",
  "RetificaPremium"."Marketing_Site_Eventos",
  "RetificaPremium"."Marketing_Leads",
  "RetificaPremium"."Marketing_Snapshots",
  "RetificaPremium"."Marketing_Sync_Logs",
  "RetificaPremium"."Marketing_Audit_Logs"
to service_role;

create or replace function "RetificaPremium".get_marketing_resumo(p_periodo_dias integer default 30)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_period_days integer := greatest(7, least(coalesce(p_periodo_dias, 30), 90));
  v_start timestamptz;
  v_previous_start timestamptz;
  v_config jsonb;
  v_integracoes jsonb;
  v_current jsonb;
  v_previous jsonb;
  v_pages jsonb;
  v_sources jsonb;
  v_daily jsonb;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if not exists (
    select 1
    from "RetificaPremium"."Modulos"
    where fk_usuarios = v_usuario_id and marketing is true
  ) then
    return json_build_object('status', 403, 'code', 'marketing_required', 'mensagem', 'Módulo Crescimento não habilitado para este usuário.');
  end if;

  v_start := date_trunc('day', now()) - ((v_period_days - 1) * interval '1 day');
  v_previous_start := v_start - (v_period_days * interval '1 day');

  select jsonb_build_object(
    'moduloHabilitado', coalesce(c.modulo_habilitado, false),
    'ga4Status', coalesce(c.ga4_status, 'not_connected'),
    'hasSiteKey', c.site_key_hash is not null,
    'allowedOrigins', coalesce(to_jsonb(c.allowed_origins), '[]'::jsonb),
    'updatedAt', c.updated_at
  )
  into v_config
  from "RetificaPremium"."Marketing_Config" c
  where c.fk_criado_por = v_usuario_id;

  v_config := coalesce(v_config, jsonb_build_object(
    'moduloHabilitado', false,
    'ga4Status', 'not_connected',
    'hasSiteKey', false,
    'allowedOrigins', '[]'::jsonb,
    'updatedAt', null
  ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', i.provider,
    'status', i.status,
    'accountName', i.external_account_name,
    'lastSyncAt', i.last_sync_at,
    'lastError', i.last_error
  ) order by i.provider), '[]'::jsonb)
  into v_integracoes
  from "RetificaPremium"."Marketing_Integracoes" i
  where i.fk_criado_por = v_usuario_id;

  select jsonb_build_object(
    'visits', count(*) filter (where event_type = 'page_view'),
    'whatsappClicks', count(*) filter (where event_type = 'whatsapp_click'),
    'formSubmits', count(*) filter (where event_type = 'form_submit'),
    'leads', (select count(*) from "RetificaPremium"."Marketing_Leads" l where l.fk_criado_por = v_usuario_id and l.occurred_at >= v_start),
    'conversionRate', case
      when count(*) filter (where event_type = 'page_view') = 0 then 0
      else round(((select count(*) from "RetificaPremium"."Marketing_Leads" l where l.fk_criado_por = v_usuario_id and l.occurred_at >= v_start)::numeric / nullif(count(*) filter (where event_type = 'page_view'), 0)::numeric) * 100, 2)
    end
  )
  into v_current
  from "RetificaPremium"."Marketing_Site_Eventos"
  where fk_criado_por = v_usuario_id and occurred_at >= v_start;

  select jsonb_build_object(
    'visits', count(*) filter (where event_type = 'page_view'),
    'whatsappClicks', count(*) filter (where event_type = 'whatsapp_click'),
    'formSubmits', count(*) filter (where event_type = 'form_submit'),
    'leads', (select count(*) from "RetificaPremium"."Marketing_Leads" l where l.fk_criado_por = v_usuario_id and l.occurred_at >= v_previous_start and l.occurred_at < v_start)
  )
  into v_previous
  from "RetificaPremium"."Marketing_Site_Eventos"
  where fk_criado_por = v_usuario_id and occurred_at >= v_previous_start and occurred_at < v_start;

  select coalesce(jsonb_agg(row_to_json(p) order by p.views desc), '[]'::jsonb)
  into v_pages
  from (
    select
      coalesce(page_path, '/') as path,
      max(page_title) as title,
      count(*) filter (where event_type = 'page_view') as views,
      count(*) filter (where event_type in ('whatsapp_click', 'form_submit', 'lead_created')) as conversions
    from "RetificaPremium"."Marketing_Site_Eventos"
    where fk_criado_por = v_usuario_id and occurred_at >= v_start
    group by coalesce(page_path, '/')
    order by views desc
    limit 8
  ) p;

  select coalesce(jsonb_agg(row_to_json(s) order by s.visits desc), '[]'::jsonb)
  into v_sources
  from (
    select
      visits.source,
      visits.medium,
      visits.visits,
      coalesce(leads.leads, 0) as leads
    from (
      select
        coalesce(e.source, 'direto') as source,
        coalesce(e.medium, 'sem meio') as medium,
        count(*) filter (where e.event_type = 'page_view') as visits
      from "RetificaPremium"."Marketing_Site_Eventos" e
      where e.fk_criado_por = v_usuario_id and e.occurred_at >= v_start
      group by coalesce(e.source, 'direto'), coalesce(e.medium, 'sem meio')
    ) visits
    left join (
      select
        coalesce(l.source, 'direto') as source,
        count(*) as leads
      from "RetificaPremium"."Marketing_Leads" l
      where l.fk_criado_por = v_usuario_id and l.occurred_at >= v_start
      group by coalesce(l.source, 'direto')
    ) leads on leads.source = visits.source
    order by visits.visits desc
    limit 8
  ) s;

  select coalesce(jsonb_agg(row_to_json(d) order by d.date asc), '[]'::jsonb)
  into v_daily
  from (
    select
      day::date as date,
      count(e.id_marketing_site_eventos) filter (where e.event_type = 'page_view') as visits,
      count(e.id_marketing_site_eventos) filter (where e.event_type in ('whatsapp_click', 'form_submit')) as actions,
      (select count(*) from "RetificaPremium"."Marketing_Leads" l where l.fk_criado_por = v_usuario_id and l.occurred_at::date = day::date) as leads
    from generate_series(v_start::date, now()::date, interval '1 day') day
    left join "RetificaPremium"."Marketing_Site_Eventos" e
      on e.fk_criado_por = v_usuario_id
      and e.occurred_at::date = day::date
    group by day
    order by day
  ) d;

  return json_build_object(
    'status', 200,
    'mensagem', 'Resumo do módulo Crescimento carregado.',
    'dados', jsonb_build_object(
      'periodDays', v_period_days,
      'config', v_config,
      'integrations', v_integracoes,
      'site', jsonb_build_object(
        'current', v_current,
        'previous', v_previous,
        'pages', v_pages,
        'sources', v_sources,
        'daily', v_daily
      ),
      'campaigns', jsonb_build_object(
        'current', jsonb_build_object('spend', 0, 'clicks', 0, 'leads', 0, 'cpl', 0),
        'items', '[]'::jsonb,
        'daily', '[]'::jsonb,
        'financialAvailable', false
      )
    )
  );
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

grant execute on function "RetificaPremium".get_marketing_resumo(integer) to authenticated;
grant execute on function "RetificaPremium".get_marketing_resumo(integer) to service_role;

drop function if exists "RetificaPremium".upsert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);

create or replace function "RetificaPremium".upsert_modulo(
  p_fk_usuarios uuid,
  p_dashboard boolean default false,
  p_clientes boolean default false,
  p_notas_de_entrada boolean default false,
  p_kanban boolean default false,
  p_fechamento boolean default false,
  p_nota_fiscal boolean default false,
  p_configuracoes boolean default false,
  p_contas_a_pagar boolean default false,
  p_marketing boolean default false,
  p_admin boolean default false
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
begin
  insert into "RetificaPremium"."Modulos" (
    fk_usuarios,
    dashboard,
    clientes,
    notas_de_entrada,
    kanban,
    fechamento,
    nota_fiscal,
    configuracoes,
    contas_a_pagar,
    marketing,
    admin
  )
  values (
    p_fk_usuarios,
    coalesce(p_dashboard, false),
    coalesce(p_clientes, false),
    coalesce(p_notas_de_entrada, false),
    coalesce(p_kanban, false),
    coalesce(p_fechamento, false),
    coalesce(p_nota_fiscal, false),
    coalesce(p_configuracoes, false),
    coalesce(p_contas_a_pagar, false),
    coalesce(p_marketing, false),
    coalesce(p_admin, false)
  )
  on conflict (fk_usuarios) do update set
    dashboard = excluded.dashboard,
    clientes = excluded.clientes,
    notas_de_entrada = excluded.notas_de_entrada,
    kanban = excluded.kanban,
    fechamento = excluded.fechamento,
    nota_fiscal = excluded.nota_fiscal,
    configuracoes = excluded.configuracoes,
    contas_a_pagar = excluded.contas_a_pagar,
    marketing = excluded.marketing,
    admin = excluded.admin;

  return json_build_object('status', 200, 'mensagem', 'Módulos atualizados.');
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

revoke execute on function "RetificaPremium".upsert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public;
revoke execute on function "RetificaPremium".upsert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from anon;
revoke execute on function "RetificaPremium".upsert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from authenticated;
grant execute on function "RetificaPremium".upsert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to service_role;
grant execute on function "RetificaPremium".upsert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to supabase_auth_admin;

create or replace function "RetificaPremium".upsert_marketing_config(
  p_site_key_hash text default null,
  p_allowed_origins text[] default null,
  p_ga4_property_id text default null
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_config "RetificaPremium"."Marketing_Config"%rowtype;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if not exists (
    select 1
    from "RetificaPremium"."Modulos"
    where fk_usuarios = v_usuario_id and marketing is true
  ) then
    return json_build_object('status', 403, 'code', 'marketing_required', 'mensagem', 'Módulo Crescimento não habilitado para este usuário.');
  end if;

  insert into "RetificaPremium"."Marketing_Config" (
    fk_criado_por,
    modulo_habilitado,
    site_key_hash,
    allowed_origins,
    ga4_property_id,
    ga4_status,
    updated_at
  )
  values (
    v_usuario_id,
    true,
    nullif(trim(p_site_key_hash), ''),
    coalesce(p_allowed_origins, '{}'),
    nullif(trim(p_ga4_property_id), ''),
    case when nullif(trim(p_ga4_property_id), '') is null then 'not_connected' else 'needs_attention' end,
    now()
  )
  on conflict (fk_criado_por) do update set
    modulo_habilitado = true,
    site_key_hash = coalesce(nullif(trim(p_site_key_hash), ''), "RetificaPremium"."Marketing_Config".site_key_hash),
    allowed_origins = coalesce(p_allowed_origins, "RetificaPremium"."Marketing_Config".allowed_origins),
    ga4_property_id = coalesce(nullif(trim(p_ga4_property_id), ''), "RetificaPremium"."Marketing_Config".ga4_property_id),
    ga4_status = case
      when coalesce(nullif(trim(p_ga4_property_id), ''), "RetificaPremium"."Marketing_Config".ga4_property_id) is null then 'not_connected'
      else "RetificaPremium"."Marketing_Config".ga4_status
    end,
    updated_at = now()
  returning * into v_config;

  return json_build_object(
    'status', 200,
    'mensagem', 'Configuração do módulo Crescimento salva.',
    'dados', json_build_object(
      'moduloHabilitado', v_config.modulo_habilitado,
      'ga4Status', v_config.ga4_status,
      'hasSiteKey', v_config.site_key_hash is not null,
      'allowedOrigins', v_config.allowed_origins,
      'updatedAt', v_config.updated_at
    )
  );
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

grant execute on function "RetificaPremium".upsert_marketing_config(text, text[], text) to authenticated;
grant execute on function "RetificaPremium".upsert_marketing_config(text, text[], text) to service_role;

create or replace function "RetificaPremium".get_usuarios(
  p_busca text default null,
  p_acesso text default null,
  p_status boolean default null,
  p_limite integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_current_auth_id uuid := auth.uid();
  v_requester record;
  v_total int;
  v_dados json;
begin
  if v_current_auth_id is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.', 'dados', '[]'::json);
  end if;

  select u.id_usuarios, u.status, u.acesso, coalesce(m.admin, false) as admin
  into v_requester
  from "RetificaPremium"."Usuarios" u
  left join "RetificaPremium"."Modulos" m on m.fk_usuarios = u.id_usuarios
  where u.auth_id = v_current_auth_id
  limit 1;

  if not found or v_requester.status is distinct from true then
    return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', 'Perfil administrativo inválido ou inativo.', 'dados', '[]'::json);
  end if;

  if v_requester.acesso::text <> 'administrador' or v_requester.admin is distinct from true then
    return json_build_object('status', 403, 'code', 'admin_required', 'mensagem', 'A listagem de usuários é restrita ao módulo Admin.', 'dados', '[]'::json);
  end if;

  select count(*)
  into v_total
  from "RetificaPremium"."Usuarios" u
  where
    (p_status is null or u.status = p_status)
    and (p_acesso is null or u.acesso::text = p_acesso)
    and (
      p_busca is null
      or u.nome ilike '%' || p_busca || '%'
      or u.email ilike '%' || p_busca || '%'
    );

  select coalesce(json_agg(r order by r.nome asc), '[]'::json)
  into v_dados
  from (
    select
      u.id_usuarios,
      u.nome,
      u.email,
      u.telefone,
      u.acesso,
      u.status,
      u.created_at,
      u.ultimo_login,
      case
        when m.id_modulos is null then null
        else json_build_object(
          'dashboard',        m.dashboard,
          'clientes',         m.clientes,
          'notas_de_entrada', m.notas_de_entrada,
          'kanban',           m.kanban,
          'fechamento',       m.fechamento,
          'nota_fiscal',      m.nota_fiscal,
          'configuracoes',    m.configuracoes,
          'contas_a_pagar',   m.contas_a_pagar,
          'marketing',        m.marketing,
          'admin',            m.admin
        )
      end as modulos
    from "RetificaPremium"."Usuarios" u
    left join "RetificaPremium"."Modulos" m on m.fk_usuarios = u.id_usuarios
    where
      (p_status is null or u.status = p_status)
      and (p_acesso is null or u.acesso::text = p_acesso)
      and (
        p_busca is null
        or u.nome ilike '%' || p_busca || '%'
        or u.email ilike '%' || p_busca || '%'
      )
    order by u.nome asc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object(
    'status', 200,
    'mensagem', 'Usuários encontrados.',
    'total', v_total,
    'dados', v_dados
  );
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

revoke execute on function "RetificaPremium".get_usuarios(text, text, boolean, integer, integer) from public;
revoke execute on function "RetificaPremium".get_usuarios(text, text, boolean, integer, integer) from anon;
grant execute on function "RetificaPremium".get_usuarios(text, text, boolean, integer, integer) to authenticated;
grant execute on function "RetificaPremium".get_usuarios(text, text, boolean, integer, integer) to service_role;
