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
    'ga4PropertyId', c.ga4_property_id,
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
    'ga4PropertyId', null,
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
