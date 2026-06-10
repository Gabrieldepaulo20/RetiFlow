-- Document customization foundation.
-- This migration is additive: no existing document is re-rendered or backfilled.

alter table "RetificaPremium"."Configuracoes_Empresa_Usuario"
  add column if not exists whatsapp text not null default '',
  add column if not exists instagram text not null default '',
  add column if not exists horario_atendimento text not null default '',
  add column if not exists mensagem_atendimento text not null default '',
  add column if not exists observacao_documentos text not null default '',
  add column if not exists brand_primary_color text not null default '#1a7a8a',
  add column if not exists brand_secondary_color text not null default '#0f7f95';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'configuracoes_empresa_usuario_brand_primary_color_hex'
  ) then
    alter table "RetificaPremium"."Configuracoes_Empresa_Usuario"
      add constraint configuracoes_empresa_usuario_brand_primary_color_hex
      check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'configuracoes_empresa_usuario_brand_secondary_color_hex'
  ) then
    alter table "RetificaPremium"."Configuracoes_Empresa_Usuario"
      add constraint configuracoes_empresa_usuario_brand_secondary_color_hex
      check (brand_secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

create table if not exists "RetificaPremium"."Templates_Documentos_Usuario" (
  id_templates_documentos_usuario uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  fk_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  document_type text not null
    check (document_type in ('entry_note', 'exit_note', 'closing_report', 'service_order', 'receipt', 'quote', 'report')),
  name text not null default 'Modelo personalizado',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  version integer not null check (version > 0),
  config_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config_json) = 'object'),
  created_by uuid references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  published_at timestamp without time zone,
  archived_at timestamp without time zone
);

create index if not exists templates_documentos_usuario_owner_type_status_idx
  on "RetificaPremium"."Templates_Documentos_Usuario" (fk_usuarios, document_type, status, version desc);

create unique index if not exists templates_documentos_usuario_active_unique
  on "RetificaPremium"."Templates_Documentos_Usuario" (fk_usuarios, document_type)
  where status = 'active';

alter table "RetificaPremium"."Templates_Documentos_Usuario" enable row level security;

create table if not exists "RetificaPremium"."Temas_Documentos_Usuario" (
  id_temas_documentos_usuario uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  fk_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  name text not null,
  config_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config_json) = 'object'),
  applies_to_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(applies_to_json) = 'array'),
  starts_at date,
  ends_at date,
  is_active boolean not null default false,
  created_by uuid references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists temas_documentos_usuario_owner_active_idx
  on "RetificaPremium"."Temas_Documentos_Usuario" (fk_usuarios, is_active, updated_at desc);

alter table "RetificaPremium"."Temas_Documentos_Usuario" enable row level security;

create table if not exists "RetificaPremium"."Logs_Configuracoes_Usuario" (
  id_logs_configuracoes_usuario uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  fk_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  fk_actor_usuarios uuid references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_json jsonb,
  after_json jsonb
);

create index if not exists logs_configuracoes_usuario_owner_created_idx
  on "RetificaPremium"."Logs_Configuracoes_Usuario" (fk_usuarios, created_at desc);

alter table "RetificaPremium"."Logs_Configuracoes_Usuario" enable row level security;

alter table "RetificaPremium"."Notas_de_Servico"
  add column if not exists fk_template_documento uuid references "RetificaPremium"."Templates_Documentos_Usuario"(id_templates_documentos_usuario) on delete set null,
  add column if not exists documento_tema_snapshot jsonb,
  add column if not exists documento_config_snapshot jsonb;

alter table "RetificaPremium"."Fechamentos"
  add column if not exists fk_template_documento uuid references "RetificaPremium"."Templates_Documentos_Usuario"(id_templates_documentos_usuario) on delete set null,
  add column if not exists documento_tema_snapshot jsonb,
  add column if not exists documento_config_snapshot jsonb;

revoke all on table "RetificaPremium"."Templates_Documentos_Usuario" from public, anon, authenticated;
revoke all on table "RetificaPremium"."Temas_Documentos_Usuario" from public, anon, authenticated;
revoke all on table "RetificaPremium"."Logs_Configuracoes_Usuario" from public, anon, authenticated;

grant all on table "RetificaPremium"."Templates_Documentos_Usuario" to service_role;
grant all on table "RetificaPremium"."Temas_Documentos_Usuario" to service_role;
grant all on table "RetificaPremium"."Logs_Configuracoes_Usuario" to service_role;

create or replace function "RetificaPremium".sanitize_config_text(p_value text, p_max integer default 500)
returns text
language sql
immutable
as $$
  select left(regexp_replace(btrim(coalesce(p_value, '')), '[[:cntrl:]]', '', 'g'), greatest(p_max, 0));
$$;

revoke execute on function "RetificaPremium".sanitize_config_text(text, integer) from public, anon, authenticated;

create or replace function "RetificaPremium".document_default_config(p_document_type text)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_document_type = 'closing_report' then
    return jsonb_build_object(
      'title', 'Fechamento',
      'subtitle', 'Resumo dos servicos executados e valores do periodo.',
      'description', 'Confira todos os servicos antes de confirmar o fechamento.',
      'defaultObservation', 'Documento gerado automaticamente pelo sistema.',
      'footerText', 'Obrigado pela preferencia.',
      'layoutStyle', 'modern',
      'density', 'normal',
      'showLogo', true,
      'showCompanyData', true,
      'showFooter', true,
      'headerStyle', 'solid',
      'tableStyle', 'striped',
      'totalStyle', 'highlight'
    );
  end if;

  return jsonb_build_object(
    'title', 'Nota de Entrada',
    'subtitle', 'Ordem de Servico',
    'description', 'Recebemos os itens abaixo para analise e execucao dos servicos.',
    'defaultObservation', 'A desmontagem sera realizada mediante autorizacao.',
    'termsText', 'Declaro estar ciente das condicoes de servico.',
    'footerText', 'Obrigado pela preferencia.',
    'thankYouText', 'Agradecemos a confianca.',
    'layoutStyle', 'classic',
    'density', 'normal',
    'showLogo', true,
    'showCompanyData', true,
    'showFooter', true,
    'headerStyle', 'split',
    'tableStyle', 'classic',
    'totalStyle', 'boxed'
  );
end;
$$;

revoke execute on function "RetificaPremium".document_default_config(text) from public, anon, authenticated;

create or replace function "RetificaPremium".document_settings_access(
  p_fk_usuarios uuid default null,
  p_write boolean default false
)
returns table (
  status integer,
  mensagem text,
  target_user uuid,
  actor_user uuid,
  is_super_admin boolean
)
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_current_user record;
  v_target_user uuid;
  v_module_settings boolean;
begin
  if v_auth_id is null then
    return query select 401, 'Usuario nao autenticado.', null::uuid, null::uuid, false;
    return;
  end if;

  select u.id_usuarios, u.email, u.acesso, u.status
    into v_current_user
    from "RetificaPremium"."Usuarios" u
   where u.auth_id = v_auth_id
   limit 1;

  if v_current_user.id_usuarios is null or coalesce(v_current_user.status, false) is false then
    return query select 403, 'Perfil interno nao encontrado ou inativo.', null::uuid, null::uuid, false;
    return;
  end if;

  v_target_user := coalesce(p_fk_usuarios, v_current_user.id_usuarios);

  if not exists (select 1 from "RetificaPremium"."Usuarios" where id_usuarios = v_target_user) then
    return query select 404, 'Usuario nao encontrado.', null::uuid, v_current_user.id_usuarios, false;
    return;
  end if;

  is_super_admin := lower(coalesce(v_current_user.email, '')) = 'gabrielwilliam208@gmail.com';

  if v_target_user <> v_current_user.id_usuarios and not is_super_admin then
    return query select 403, 'Sem permissao para acessar configuracoes de outro cliente.', null::uuid, v_current_user.id_usuarios, false;
    return;
  end if;

  if p_write and not is_super_admin then
    if v_current_user.acesso::text <> 'administrador' then
      return query select 403, 'Somente administradores podem alterar configuracoes da empresa.', null::uuid, v_current_user.id_usuarios, false;
      return;
    end if;

    select m.configuracoes
      into v_module_settings
      from "RetificaPremium"."Modulos" m
     where m.fk_usuarios = v_current_user.id_usuarios
     limit 1;

    if v_module_settings is false then
      return query select 403, 'Modulo Configuracoes desativado para este usuario.', null::uuid, v_current_user.id_usuarios, false;
      return;
    end if;
  end if;

  return query select 200, 'Acesso autorizado.', v_target_user, v_current_user.id_usuarios, is_super_admin;
end;
$$;

revoke execute on function "RetificaPremium".document_settings_access(uuid, boolean) from public, anon, authenticated;

create or replace function "RetificaPremium".validate_document_config_json(p_config jsonb)
returns text
language plpgsql
stable
as $$
declare
  v_text text := coalesce(p_config::text, '{}');
  v_match text[];
  v_key text;
  v_allowed_keys text[] := array[
    'title',
    'subtitle',
    'description',
    'introText',
    'finalText',
    'defaultObservation',
    'termsText',
    'footerText',
    'thankYouText',
    'layoutStyle',
    'density',
    'showLogo',
    'logoSize',
    'logoAlignment',
    'showCompanyData',
    'showFooter',
    'headerStyle',
    'tableStyle',
    'totalStyle',
    'theme'
  ];
  v_allowed_variables text[] := array[
    'company_name',
    'company_phone',
    'company_whatsapp',
    'customer_name',
    'vehicle_plate',
    'service_order_number',
    'entry_note_number',
    'closing_number',
    'current_date',
    'total_amount'
  ];
  v_color_keys text[] := array[
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'headerBackgroundColor',
    'headerTextColor',
    'borderColor'
  ];
  v_theme_keys text[] := array[
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'headerBackgroundColor',
    'headerTextColor',
    'borderColor',
    'layoutStyle',
    'tableStyle',
    'totalStyle'
  ];
  v_color text;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    return 'Configuracao do documento deve ser um objeto.';
  end if;

  if length(v_text) > 12000 then
    return 'Configuracao do documento excede o limite permitido.';
  end if;

  for v_key in select key from jsonb_object_keys(p_config) as key loop
    if not (v_key = any(v_allowed_keys)) then
      return format('Campo nao permitido no modelo: %s.', v_key);
    end if;
  end loop;

  if p_config ? 'theme' and jsonb_typeof(p_config->'theme') <> 'object' then
    return 'Tema do documento deve ser um objeto.';
  end if;

  if jsonb_typeof(p_config->'theme') = 'object' then
    for v_key in select key from jsonb_object_keys(p_config->'theme') as key loop
      if not (v_key = any(v_theme_keys)) then
        return format('Campo nao permitido no tema: %s.', v_key);
      end if;
    end loop;
  end if;

  if v_text ~* '(<script|javascript:|on[a-z]+\s*=|</?[a-z][^>]*>)' then
    return 'Conteudo inseguro nao e permitido nos modelos.';
  end if;

  for v_match in
    select regexp_matches(v_text, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g')
  loop
    if not (v_match[1] = any(v_allowed_variables)) then
      return format('Variavel de modelo invalida: %s.', v_match[1]);
    end if;
  end loop;

  foreach v_key in array v_color_keys loop
    v_color := p_config #>> array['theme', v_key];
    if v_color is not null and v_color !~ '^#[0-9A-Fa-f]{6}$' then
      return format('Cor invalida em theme.%s.', v_key);
    end if;

    v_color := p_config ->> v_key;
    if v_color is not null and v_color !~ '^#[0-9A-Fa-f]{6}$' then
      return format('Cor invalida em %s.', v_key);
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function "RetificaPremium".validate_document_config_json(jsonb) from public, anon, authenticated;

create or replace function "RetificaPremium".get_configuracao_empresa_cliente(
  p_fk_usuarios uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_config record;
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, false);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  select *
    into v_config
    from "RetificaPremium"."Configuracoes_Empresa_Usuario"
   where fk_usuarios = v_access.target_user
   limit 1;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Configuracao da empresa carregada.',
    'dados', jsonb_build_object(
      'fk_usuarios', v_access.target_user,
      'razao_social', coalesce(v_config.razao_social, '59.540.218 GABRIEL WILLIAM DE PAULO'),
      'nome_fantasia', coalesce(v_config.nome_fantasia, 'GAWI'),
      'cnpj', coalesce(v_config.cnpj, '59540218000181'),
      'inscricao_estadual', coalesce(v_config.inscricao_estadual, ''),
      'inscricao_municipal', coalesce(v_config.inscricao_municipal, ''),
      'endereco', coalesce(v_config.endereco, ''),
      'cidade', coalesce(v_config.cidade, ''),
      'estado', coalesce(v_config.estado, ''),
      'cep', coalesce(v_config.cep, ''),
      'telefone', coalesce(v_config.telefone, '(16) 98840-5275'),
      'whatsapp', coalesce(v_config.whatsapp, ''),
      'email', coalesce(v_config.email, 'gabrielwilliam208@gmail.com'),
      'site', coalesce(v_config.site, ''),
      'instagram', coalesce(v_config.instagram, ''),
      'horario_atendimento', coalesce(v_config.horario_atendimento, ''),
      'mensagem_atendimento', coalesce(v_config.mensagem_atendimento, ''),
      'observacao_documentos', coalesce(v_config.observacao_documentos, ''),
      'brand_primary_color', coalesce(v_config.brand_primary_color, '#1a7a8a'),
      'brand_secondary_color', coalesce(v_config.brand_secondary_color, '#0f7f95'),
      'updated_at', v_config.updated_at
    )
  );
end;
$$;

create or replace function "RetificaPremium".upsert_configuracao_empresa_cliente(
  p_fk_usuarios uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_unknown text;
  v_before jsonb;
  v_after jsonb;
  v_email text;
  v_site text;
  v_instagram text;
  v_telefone text;
  v_whatsapp text;
  v_estado text;
  v_cep text;
  v_primary text;
  v_secondary text;
  v_allowed text[] := array[
    'nome_fantasia',
    'endereco',
    'cidade',
    'estado',
    'cep',
    'telefone',
    'whatsapp',
    'email',
    'site',
    'instagram',
    'horario_atendimento',
    'mensagem_atendimento',
    'observacao_documentos',
    'brand_primary_color',
    'brand_secondary_color'
  ];
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, true);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object('status', 400, 'mensagem', 'Payload de empresa deve ser um objeto.');
  end if;

  select key
    into v_unknown
    from jsonb_object_keys(v_payload) as key
   where not (key = any(v_allowed))
   limit 1;

  if v_unknown is not null then
    return jsonb_build_object('status', 400, 'mensagem', format('Campo nao permitido em dados da empresa: %s.', v_unknown));
  end if;

  v_email := lower("RetificaPremium".sanitize_config_text(v_payload->>'email', 160));
  v_site := "RetificaPremium".sanitize_config_text(v_payload->>'site', 180);
  v_instagram := "RetificaPremium".sanitize_config_text(v_payload->>'instagram', 80);
  v_telefone := regexp_replace(coalesce(v_payload->>'telefone', ''), '[^0-9]', '', 'g');
  v_whatsapp := regexp_replace(coalesce(v_payload->>'whatsapp', ''), '[^0-9]', '', 'g');
  v_estado := upper("RetificaPremium".sanitize_config_text(v_payload->>'estado', 2));
  v_cep := regexp_replace(coalesce(v_payload->>'cep', ''), '[^0-9]', '', 'g');
  v_primary := coalesce(nullif("RetificaPremium".sanitize_config_text(v_payload->>'brand_primary_color', 7), ''), '#1a7a8a');
  v_secondary := coalesce(nullif("RetificaPremium".sanitize_config_text(v_payload->>'brand_secondary_color', 7), ''), '#0f7f95');

  if v_payload ? 'email' and v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('status', 400, 'mensagem', 'E-mail de contato invalido.');
  end if;

  if v_payload ? 'site' and v_site <> '' and v_site !~* '^https?://[^\s]+$' then
    return jsonb_build_object('status', 400, 'mensagem', 'Site deve comecar com http:// ou https://.');
  end if;

  if v_payload ? 'instagram' and v_instagram <> '' and v_instagram !~* '^@?[a-z0-9._]{1,30}$' then
    return jsonb_build_object('status', 400, 'mensagem', 'Instagram invalido.');
  end if;

  if v_payload ? 'telefone' and v_telefone <> '' and length(v_telefone) not between 10 and 11 then
    return jsonb_build_object('status', 400, 'mensagem', 'Telefone deve ter 10 ou 11 digitos.');
  end if;

  if v_payload ? 'whatsapp' and v_whatsapp <> '' and length(v_whatsapp) not between 10 and 11 then
    return jsonb_build_object('status', 400, 'mensagem', 'WhatsApp deve ter 10 ou 11 digitos.');
  end if;

  if v_payload ? 'estado' and v_estado <> '' and v_estado !~ '^[A-Z]{2}$' then
    return jsonb_build_object('status', 400, 'mensagem', 'Estado deve usar UF com 2 letras.');
  end if;

  if v_payload ? 'cep' and v_cep <> '' and v_cep !~ '^[0-9]{8}$' then
    return jsonb_build_object('status', 400, 'mensagem', 'CEP deve ter 8 digitos.');
  end if;

  if (v_payload ? 'brand_primary_color' and v_primary !~ '^#[0-9A-Fa-f]{6}$')
     or (v_payload ? 'brand_secondary_color' and v_secondary !~ '^#[0-9A-Fa-f]{6}$') then
    return jsonb_build_object('status', 400, 'mensagem', 'Cores devem estar no formato #RRGGBB.');
  end if;

  select to_jsonb(c)
    into v_before
    from "RetificaPremium"."Configuracoes_Empresa_Usuario" c
   where c.fk_usuarios = v_access.target_user;

  insert into "RetificaPremium"."Configuracoes_Empresa_Usuario" (fk_usuarios, updated_at)
  values (v_access.target_user, now())
  on conflict (fk_usuarios) do nothing;

  update "RetificaPremium"."Configuracoes_Empresa_Usuario"
     set nome_fantasia = case when v_payload ? 'nome_fantasia' then coalesce(nullif("RetificaPremium".sanitize_config_text(v_payload->>'nome_fantasia', 120), ''), nome_fantasia) else nome_fantasia end,
         endereco = case when v_payload ? 'endereco' then "RetificaPremium".sanitize_config_text(v_payload->>'endereco', 220) else endereco end,
         cidade = case when v_payload ? 'cidade' then "RetificaPremium".sanitize_config_text(v_payload->>'cidade', 80) else cidade end,
         estado = case when v_payload ? 'estado' then v_estado else estado end,
         cep = case when v_payload ? 'cep' then v_cep else cep end,
         telefone = case when v_payload ? 'telefone' then v_telefone else telefone end,
         whatsapp = case when v_payload ? 'whatsapp' then v_whatsapp else whatsapp end,
         email = case when v_payload ? 'email' then v_email else email end,
         site = case when v_payload ? 'site' then v_site else site end,
         instagram = case when v_payload ? 'instagram' then v_instagram else instagram end,
         horario_atendimento = case when v_payload ? 'horario_atendimento' then "RetificaPremium".sanitize_config_text(v_payload->>'horario_atendimento', 180) else horario_atendimento end,
         mensagem_atendimento = case when v_payload ? 'mensagem_atendimento' then "RetificaPremium".sanitize_config_text(v_payload->>'mensagem_atendimento', 500) else mensagem_atendimento end,
         observacao_documentos = case when v_payload ? 'observacao_documentos' then "RetificaPremium".sanitize_config_text(v_payload->>'observacao_documentos', 700) else observacao_documentos end,
         brand_primary_color = case when v_payload ? 'brand_primary_color' then v_primary else brand_primary_color end,
         brand_secondary_color = case when v_payload ? 'brand_secondary_color' then v_secondary else brand_secondary_color end,
         updated_at = now()
   where fk_usuarios = v_access.target_user;

  select to_jsonb(c)
    into v_after
    from "RetificaPremium"."Configuracoes_Empresa_Usuario" c
   where c.fk_usuarios = v_access.target_user;

  insert into "RetificaPremium"."Logs_Configuracoes_Usuario" (
    fk_usuarios,
    fk_actor_usuarios,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  )
  values (
    v_access.target_user,
    v_access.actor_user,
    'upsert_company_settings',
    'Configuracoes_Empresa_Usuario',
    v_access.target_user::text,
    v_before,
    v_after
  );

  return "RetificaPremium".get_configuracao_empresa_cliente(v_access.target_user);
end;
$$;

create or replace function "RetificaPremium".get_modelos_documentos_usuario(
  p_fk_usuarios uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_dados jsonb;
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, false);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.document_type, t.version desc), '[]'::jsonb)
    into v_dados
    from "RetificaPremium"."Templates_Documentos_Usuario" t
   where t.fk_usuarios = v_access.target_user;

  return jsonb_build_object('status', 200, 'mensagem', 'Modelos carregados.', 'dados', v_dados);
end;
$$;

create or replace function "RetificaPremium".salvar_rascunho_modelo_documento(
  p_fk_usuarios uuid default null,
  p_document_type text default 'entry_note',
  p_name text default 'Modelo personalizado',
  p_config_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_validation text;
  v_next_version integer;
  v_row record;
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, true);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  if p_document_type not in ('entry_note', 'exit_note', 'closing_report', 'service_order', 'receipt', 'quote', 'report') then
    return jsonb_build_object('status', 400, 'mensagem', 'Tipo de documento invalido.');
  end if;

  v_validation := "RetificaPremium".validate_document_config_json(coalesce(p_config_json, '{}'::jsonb));
  if v_validation is not null then
    return jsonb_build_object('status', 400, 'mensagem', v_validation);
  end if;

  select coalesce(max(version), 0) + 1
    into v_next_version
    from "RetificaPremium"."Templates_Documentos_Usuario"
   where fk_usuarios = v_access.target_user
     and document_type = p_document_type;

  insert into "RetificaPremium"."Templates_Documentos_Usuario" (
    fk_usuarios,
    document_type,
    name,
    status,
    version,
    config_json,
    created_by,
    updated_at
  )
  values (
    v_access.target_user,
    p_document_type,
    coalesce(nullif("RetificaPremium".sanitize_config_text(p_name, 90), ''), 'Modelo personalizado'),
    'draft',
    v_next_version,
    coalesce(p_config_json, '{}'::jsonb),
    v_access.actor_user,
    now()
  )
  returning * into v_row;

  insert into "RetificaPremium"."Logs_Configuracoes_Usuario" (fk_usuarios, fk_actor_usuarios, action, entity_type, entity_id, after_json)
  values (v_access.target_user, v_access.actor_user, 'save_document_template_draft', 'Templates_Documentos_Usuario', v_row.id_templates_documentos_usuario::text, to_jsonb(v_row));

  return jsonb_build_object('status', 200, 'mensagem', 'Rascunho salvo.', 'dados', to_jsonb(v_row));
end;
$$;

create or replace function "RetificaPremium".publicar_modelo_documento(
  p_id_template uuid
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_template record;
  v_access record;
  v_before jsonb;
  v_after jsonb;
begin
  select *
    into v_template
    from "RetificaPremium"."Templates_Documentos_Usuario"
   where id_templates_documentos_usuario = p_id_template;

  if v_template.id_templates_documentos_usuario is null then
    return jsonb_build_object('status', 404, 'mensagem', 'Modelo nao encontrado.');
  end if;

  select * into v_access
    from "RetificaPremium".document_settings_access(v_template.fk_usuarios, true);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  v_before := to_jsonb(v_template);

  update "RetificaPremium"."Templates_Documentos_Usuario"
     set status = 'archived',
         archived_at = coalesce(archived_at, now()),
         updated_at = now()
   where fk_usuarios = v_template.fk_usuarios
     and document_type = v_template.document_type
     and status = 'active'
     and id_templates_documentos_usuario <> p_id_template;

  update "RetificaPremium"."Templates_Documentos_Usuario" as t
     set status = 'active',
         published_at = now(),
         archived_at = null,
         updated_at = now()
   where id_templates_documentos_usuario = p_id_template
   returning to_jsonb(t) into v_after;

  insert into "RetificaPremium"."Logs_Configuracoes_Usuario" (fk_usuarios, fk_actor_usuarios, action, entity_type, entity_id, before_json, after_json)
  values (v_access.target_user, v_access.actor_user, 'publish_document_template', 'Templates_Documentos_Usuario', p_id_template::text, v_before, v_after);

  return jsonb_build_object('status', 200, 'mensagem', 'Modelo publicado.', 'dados', v_after);
end;
$$;

create or replace function "RetificaPremium".restaurar_modelo_documento_padrao(
  p_fk_usuarios uuid default null,
  p_document_type text default 'entry_note'
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_next_version integer;
  v_row record;
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, true);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  if p_document_type not in ('entry_note', 'exit_note', 'closing_report', 'service_order', 'receipt', 'quote', 'report') then
    return jsonb_build_object('status', 400, 'mensagem', 'Tipo de documento invalido.');
  end if;

  update "RetificaPremium"."Templates_Documentos_Usuario"
     set status = 'archived',
         archived_at = coalesce(archived_at, now()),
         updated_at = now()
   where fk_usuarios = v_access.target_user
     and document_type = p_document_type
     and status in ('active', 'draft');

  select coalesce(max(version), 0) + 1
    into v_next_version
    from "RetificaPremium"."Templates_Documentos_Usuario"
   where fk_usuarios = v_access.target_user
     and document_type = p_document_type;

  insert into "RetificaPremium"."Templates_Documentos_Usuario" (
    fk_usuarios,
    document_type,
    name,
    status,
    version,
    config_json,
    created_by,
    published_at,
    updated_at
  )
  values (
    v_access.target_user,
    p_document_type,
    'Padrao do sistema',
    'active',
    v_next_version,
    "RetificaPremium".document_default_config(p_document_type),
    v_access.actor_user,
    now(),
    now()
  )
  returning * into v_row;

  insert into "RetificaPremium"."Logs_Configuracoes_Usuario" (fk_usuarios, fk_actor_usuarios, action, entity_type, entity_id, after_json)
  values (v_access.target_user, v_access.actor_user, 'restore_default_document_template', 'Templates_Documentos_Usuario', v_row.id_templates_documentos_usuario::text, to_jsonb(v_row));

  return jsonb_build_object('status', 200, 'mensagem', 'Modelo padrao restaurado.', 'dados', to_jsonb(v_row));
end;
$$;

create or replace function "RetificaPremium".get_temas_documentos_usuario(
  p_fk_usuarios uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_dados jsonb;
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, false);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.is_active desc, t.updated_at desc), '[]'::jsonb)
    into v_dados
    from "RetificaPremium"."Temas_Documentos_Usuario" t
   where t.fk_usuarios = v_access.target_user;

  return jsonb_build_object('status', 200, 'mensagem', 'Temas carregados.', 'dados', v_dados);
end;
$$;

create or replace function "RetificaPremium".salvar_tema_documento(
  p_fk_usuarios uuid default null,
  p_id_tema uuid default null,
  p_name text default 'Tema personalizado',
  p_config_json jsonb default '{}'::jsonb,
  p_applies_to_json jsonb default '[]'::jsonb,
  p_starts_at date default null,
  p_ends_at date default null,
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_existing record;
  v_validation text;
  v_row record;
  v_owner uuid;
begin
  v_owner := p_fk_usuarios;

  if p_id_tema is not null then
    select *
      into v_existing
      from "RetificaPremium"."Temas_Documentos_Usuario"
     where id_temas_documentos_usuario = p_id_tema;

    if v_existing.id_temas_documentos_usuario is null then
      return jsonb_build_object('status', 404, 'mensagem', 'Tema nao encontrado.');
    end if;

    v_owner := v_existing.fk_usuarios;
  end if;

  select * into v_access
    from "RetificaPremium".document_settings_access(v_owner, true);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  if jsonb_typeof(coalesce(p_applies_to_json, '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('status', 400, 'mensagem', 'Lista de documentos do tema deve ser um array.');
  end if;

  v_validation := "RetificaPremium".validate_document_config_json(coalesce(p_config_json, '{}'::jsonb));
  if v_validation is not null then
    return jsonb_build_object('status', 400, 'mensagem', v_validation);
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_starts_at > p_ends_at then
    return jsonb_build_object('status', 400, 'mensagem', 'Periodo do tema invalido.');
  end if;

  if p_id_tema is null then
    insert into "RetificaPremium"."Temas_Documentos_Usuario" (
      fk_usuarios,
      name,
      config_json,
      applies_to_json,
      starts_at,
      ends_at,
      is_active,
      created_by,
      updated_at
    )
    values (
      v_access.target_user,
      coalesce(nullif("RetificaPremium".sanitize_config_text(p_name, 90), ''), 'Tema personalizado'),
      coalesce(p_config_json, '{}'::jsonb),
      coalesce(p_applies_to_json, '[]'::jsonb),
      p_starts_at,
      p_ends_at,
      coalesce(p_is_active, false),
      v_access.actor_user,
      now()
    )
    returning * into v_row;
  else
    update "RetificaPremium"."Temas_Documentos_Usuario"
       set name = coalesce(nullif("RetificaPremium".sanitize_config_text(p_name, 90), ''), name),
           config_json = coalesce(p_config_json, config_json),
           applies_to_json = coalesce(p_applies_to_json, applies_to_json),
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           is_active = coalesce(p_is_active, is_active),
           updated_at = now()
     where id_temas_documentos_usuario = p_id_tema
     returning * into v_row;
  end if;

  insert into "RetificaPremium"."Logs_Configuracoes_Usuario" (fk_usuarios, fk_actor_usuarios, action, entity_type, entity_id, before_json, after_json)
  values (v_access.target_user, v_access.actor_user, case when p_id_tema is null then 'create_document_theme' else 'update_document_theme' end, 'Temas_Documentos_Usuario', v_row.id_temas_documentos_usuario::text, to_jsonb(v_existing), to_jsonb(v_row));

  return jsonb_build_object('status', 200, 'mensagem', 'Tema salvo.', 'dados', to_jsonb(v_row));
end;
$$;

create or replace function "RetificaPremium".ativar_tema_documento(
  p_id_tema uuid,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_theme record;
  v_access record;
  v_after jsonb;
begin
  select *
    into v_theme
    from "RetificaPremium"."Temas_Documentos_Usuario"
   where id_temas_documentos_usuario = p_id_tema;

  if v_theme.id_temas_documentos_usuario is null then
    return jsonb_build_object('status', 404, 'mensagem', 'Tema nao encontrado.');
  end if;

  select * into v_access
    from "RetificaPremium".document_settings_access(v_theme.fk_usuarios, true);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  update "RetificaPremium"."Temas_Documentos_Usuario" as t
     set is_active = coalesce(p_is_active, true),
         updated_at = now()
   where id_temas_documentos_usuario = p_id_tema
   returning to_jsonb(t) into v_after;

  insert into "RetificaPremium"."Logs_Configuracoes_Usuario" (fk_usuarios, fk_actor_usuarios, action, entity_type, entity_id, before_json, after_json)
  values (v_access.target_user, v_access.actor_user, case when coalesce(p_is_active, true) then 'activate_document_theme' else 'deactivate_document_theme' end, 'Temas_Documentos_Usuario', p_id_tema::text, to_jsonb(v_theme), v_after);

  return jsonb_build_object('status', 200, 'mensagem', 'Tema atualizado.', 'dados', v_after);
end;
$$;

create or replace function "RetificaPremium".resolver_configuracao_documento(
  p_fk_usuarios uuid default null,
  p_document_type text default 'entry_note',
  p_generated_at date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_company jsonb;
  v_template record;
  v_theme record;
  v_resolved jsonb;
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, false);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  if p_document_type not in ('entry_note', 'exit_note', 'closing_report', 'service_order', 'receipt', 'quote', 'report') then
    return jsonb_build_object('status', 400, 'mensagem', 'Tipo de documento invalido.');
  end if;

  select (env->'dados')
    into v_company
    from (select "RetificaPremium".get_configuracao_empresa_cliente(v_access.target_user) as env) q;

  select *
    into v_template
    from "RetificaPremium"."Templates_Documentos_Usuario"
   where fk_usuarios = v_access.target_user
     and document_type = p_document_type
     and status = 'active'
   order by version desc
   limit 1;

  select *
    into v_theme
    from "RetificaPremium"."Temas_Documentos_Usuario" t
   where t.fk_usuarios = v_access.target_user
     and t.is_active = true
     and (
       t.applies_to_json = '[]'::jsonb
       or t.applies_to_json ? p_document_type
     )
     and (t.starts_at is null or t.starts_at <= coalesce(p_generated_at, current_date))
     and (t.ends_at is null or t.ends_at >= coalesce(p_generated_at, current_date))
   order by
     case when t.starts_at is null and t.ends_at is null then 0 else 1 end,
     t.updated_at desc
   limit 1;

  v_resolved := "RetificaPremium".document_default_config(p_document_type)
    || jsonb_build_object(
      'theme',
      jsonb_build_object(
        'primaryColor', coalesce(v_company->>'brand_primary_color', '#1a7a8a'),
        'secondaryColor', coalesce(v_company->>'brand_secondary_color', '#0f7f95'),
        'accentColor', coalesce(v_company->>'brand_primary_color', '#1a7a8a'),
        'headerBackgroundColor', coalesce(v_company->>'brand_primary_color', '#1a7a8a'),
        'headerTextColor', '#ffffff',
        'borderColor', '#d6e3e8'
      )
    );

  if v_theme.id_temas_documentos_usuario is not null then
    v_resolved := v_resolved || jsonb_build_object('theme', (coalesce(v_resolved->'theme', '{}'::jsonb) || coalesce(v_theme.config_json, '{}'::jsonb)));
  end if;

  if v_template.id_templates_documentos_usuario is not null then
    v_resolved := v_resolved || coalesce(v_template.config_json, '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Configuracao de documento resolvida.',
    'dados', jsonb_build_object(
      'fk_usuarios', v_access.target_user,
      'document_type', p_document_type,
      'company', v_company,
      'template', case when v_template.id_templates_documentos_usuario is null then null else to_jsonb(v_template) end,
      'theme', case when v_theme.id_temas_documentos_usuario is null then null else to_jsonb(v_theme) end,
      'resolved_config', v_resolved
    )
  );
end;
$$;

create or replace function "RetificaPremium".get_historico_configuracoes_usuario(
  p_fk_usuarios uuid default null,
  p_limite integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_access record;
  v_dados jsonb;
begin
  select * into v_access
    from "RetificaPremium".document_settings_access(p_fk_usuarios, false);

  if v_access.status <> 200 then
    return jsonb_build_object('status', v_access.status, 'mensagem', v_access.mensagem);
  end if;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
    into v_dados
    from (
      select *
        from "RetificaPremium"."Logs_Configuracoes_Usuario"
       where fk_usuarios = v_access.target_user
       order by created_at desc
       limit least(greatest(coalesce(p_limite, 50), 1), 100)
    ) l;

  return jsonb_build_object('status', 200, 'mensagem', 'Historico carregado.', 'dados', v_dados);
end;
$$;

drop function if exists "RetificaPremium".update_nota_pdf_url(uuid, text);

create or replace function "RetificaPremium".update_nota_pdf_url(
  p_id_nota uuid,
  p_pdf_url text,
  p_fk_template_documento uuid default null,
  p_documento_tema_snapshot jsonb default null,
  p_documento_config_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if exists (
    select 1
      from "RetificaPremium"."Notas_de_Servico" ns
     where ns.id_notas_servico = p_id_nota
       and ns.criado_por_usuario = v_usuario_id
       and ns.fk_fechamentos is not null
  ) then
    raise exception 'Esta O.S. ja entrou em um fechamento e nao pode mais ser alterada.' using errcode = 'P4091';
  end if;

  update "RetificaPremium"."Notas_de_Servico"
     set pdf_url = p_pdf_url,
         fk_template_documento = coalesce(p_fk_template_documento, fk_template_documento),
         documento_tema_snapshot = coalesce(p_documento_tema_snapshot, documento_tema_snapshot),
         documento_config_snapshot = coalesce(p_documento_config_snapshot, documento_config_snapshot),
         updated_at = now()
   where id_notas_servico = p_id_nota
     and criado_por_usuario = v_usuario_id;

  if not found then
    raise exception 'O.S. nao encontrada para este usuario.' using errcode = 'P3001';
  end if;

  return jsonb_build_object('status', 200, 'mensagem', 'PDF da nota atualizado.');
exception
  when sqlstate 'P4091' then return jsonb_build_object('status', 409, 'code', 'note_locked_by_closing', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return jsonb_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when sqlstate 'P0401' then return jsonb_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when others then return jsonb_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

drop function if exists "RetificaPremium".update_fechamento(uuid, text, numeric, jsonb, text);

create or replace function "RetificaPremium".update_fechamento(
  p_id_fechamentos uuid,
  p_label text default null,
  p_valor_total numeric default null,
  p_dados_json jsonb default null,
  p_pdf_url text default null,
  p_fk_template_documento uuid default null,
  p_documento_tema_snapshot jsonb default null,
  p_documento_config_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_fechamento record;
  v_note_ids uuid[];
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select f.*
    into v_fechamento
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
   where f.id_fechamentos = p_id_fechamentos
     and c.fk_criado_por = v_usuario_id
   for update;

  if v_fechamento.id_fechamentos is null then
    raise exception 'Fechamento nao encontrado para este usuario.' using errcode = 'P0311';
  end if;

  if v_fechamento.dados_json is not null and v_fechamento.pdf_url is not null
     and (p_label is not null or p_valor_total is not null or p_dados_json is not null or p_pdf_url is not null) then
    raise exception 'Este fechamento ja foi gerado e nao pode mais ser alterado.' using errcode = 'P4092';
  end if;

  if p_dados_json is not null then
    select coalesce(array_agg(distinct nullif(item->>'id', '')::uuid), array[]::uuid[])
      into v_note_ids
      from jsonb_array_elements(coalesce(p_dados_json->'notas', '[]'::jsonb)) as item;

    if array_length(v_note_ids, 1) is null then
      raise exception 'Selecione pelo menos uma O.S. para o fechamento.' using errcode = 'P0312';
    end if;

    if exists (
      select 1
        from "RetificaPremium"."Notas_de_Servico" ns
       where ns.id_notas_servico = any(v_note_ids)
         and (
           ns.criado_por_usuario <> v_usuario_id
           or ns.fk_clientes <> v_fechamento.fk_clientes
           or (ns.fk_fechamentos is not null and ns.fk_fechamentos <> p_id_fechamentos)
         )
    ) then
      raise exception 'Uma ou mais O.S. nao pertencem a este cliente ou ja foram fechadas.' using errcode = 'P4093';
    end if;

    if (
      select count(*)
        from "RetificaPremium"."Notas_de_Servico" ns
       where ns.id_notas_servico = any(v_note_ids)
         and ns.criado_por_usuario = v_usuario_id
         and ns.fk_clientes = v_fechamento.fk_clientes
    ) <> array_length(v_note_ids, 1) then
      raise exception 'Uma ou mais O.S. selecionadas nao foram encontradas.' using errcode = 'P4093';
    end if;
  end if;

  update "RetificaPremium"."Fechamentos"
     set label = coalesce(p_label, label),
         valor_total = coalesce(p_valor_total, valor_total),
         dados_json = coalesce(p_dados_json, dados_json),
         pdf_url = coalesce(p_pdf_url, pdf_url),
         fk_template_documento = coalesce(p_fk_template_documento, fk_template_documento),
         documento_tema_snapshot = coalesce(p_documento_tema_snapshot, documento_tema_snapshot),
         documento_config_snapshot = coalesce(p_documento_config_snapshot, documento_config_snapshot),
         updated_at = now()
   where id_fechamentos = p_id_fechamentos;

  if p_dados_json is not null then
    update "RetificaPremium"."Notas_de_Servico"
       set fk_fechamentos = p_id_fechamentos,
           updated_at = now()
     where id_notas_servico = any(v_note_ids)
       and criado_por_usuario = v_usuario_id
       and fk_clientes = v_fechamento.fk_clientes;
  end if;

  return jsonb_build_object('status', 200, 'mensagem', 'Fechamento atualizado.');
exception
  when sqlstate 'P0311' then return jsonb_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when sqlstate 'P0312' then return jsonb_build_object('status', 400, 'code', 'empty_closing', 'mensagem', sqlerrm);
  when sqlstate 'P4092' then return jsonb_build_object('status', 409, 'code', 'closing_locked', 'mensagem', sqlerrm);
  when sqlstate 'P4093' then return jsonb_build_object('status', 409, 'code', 'invalid_closing_notes', 'mensagem', sqlerrm);
  when sqlstate 'P0401' then return jsonb_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when others then return jsonb_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

revoke execute on function "RetificaPremium".get_configuracao_empresa_cliente(uuid) from public, anon;
revoke execute on function "RetificaPremium".upsert_configuracao_empresa_cliente(uuid, jsonb) from public, anon;
revoke execute on function "RetificaPremium".get_modelos_documentos_usuario(uuid) from public, anon;
revoke execute on function "RetificaPremium".salvar_rascunho_modelo_documento(uuid, text, text, jsonb) from public, anon;
revoke execute on function "RetificaPremium".publicar_modelo_documento(uuid) from public, anon;
revoke execute on function "RetificaPremium".restaurar_modelo_documento_padrao(uuid, text) from public, anon;
revoke execute on function "RetificaPremium".get_temas_documentos_usuario(uuid) from public, anon;
revoke execute on function "RetificaPremium".salvar_tema_documento(uuid, uuid, text, jsonb, jsonb, date, date, boolean) from public, anon;
revoke execute on function "RetificaPremium".ativar_tema_documento(uuid, boolean) from public, anon;
revoke execute on function "RetificaPremium".resolver_configuracao_documento(uuid, text, date) from public, anon;
revoke execute on function "RetificaPremium".get_historico_configuracoes_usuario(uuid, integer) from public, anon;

grant execute on function "RetificaPremium".get_configuracao_empresa_cliente(uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".upsert_configuracao_empresa_cliente(uuid, jsonb) to authenticated, service_role;
grant execute on function "RetificaPremium".get_modelos_documentos_usuario(uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".salvar_rascunho_modelo_documento(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function "RetificaPremium".publicar_modelo_documento(uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".restaurar_modelo_documento_padrao(uuid, text) to authenticated, service_role;
grant execute on function "RetificaPremium".get_temas_documentos_usuario(uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".salvar_tema_documento(uuid, uuid, text, jsonb, jsonb, date, date, boolean) to authenticated, service_role;
grant execute on function "RetificaPremium".ativar_tema_documento(uuid, boolean) to authenticated, service_role;
grant execute on function "RetificaPremium".resolver_configuracao_documento(uuid, text, date) to authenticated, service_role;
grant execute on function "RetificaPremium".get_historico_configuracoes_usuario(uuid, integer) to authenticated, service_role;
grant execute on function "RetificaPremium".update_nota_pdf_url(uuid, text, uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function "RetificaPremium".update_fechamento(uuid, text, numeric, jsonb, text, uuid, jsonb, jsonb) to authenticated, service_role;
