create table if not exists "RetificaPremium"."Configuracoes_Empresa_Usuario" (
  id_configuracoes_empresa_usuario uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  fk_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  razao_social text not null default '59.540.218 GABRIEL WILLIAM DE PAULO',
  nome_fantasia text not null default 'GAWI',
  cnpj text not null default '59540218000181'
    check (cnpj = '' or cnpj ~ '^[0-9]{14}$'),
  inscricao_estadual text not null default '',
  inscricao_municipal text not null default '',
  endereco text not null default '',
  cidade text not null default '',
  estado text not null default ''
    check (estado = '' or estado ~ '^[A-Z]{2}$'),
  cep text not null default ''
    check (cep = '' or cep ~ '^[0-9]{8}$'),
  telefone text not null default '(16) 98840-5275',
  email text not null default 'gabrielwilliam208@gmail.com',
  site text not null default '',
  unique (fk_usuarios)
);

create index if not exists configuracoes_empresa_usuario_fk_idx
  on "RetificaPremium"."Configuracoes_Empresa_Usuario" (fk_usuarios);

alter table "RetificaPremium"."Configuracoes_Empresa_Usuario" enable row level security;

create or replace function "RetificaPremium".get_configuracao_empresa_usuario(
  p_fk_usuarios uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_current_user record;
  v_target_user uuid;
  v_config record;
begin
  if v_auth_id is null then
    return jsonb_build_object('status', 401, 'mensagem', 'Usuário não autenticado.');
  end if;

  select id_usuarios, email
    into v_current_user
    from "RetificaPremium"."Usuarios"
   where auth_id = v_auth_id
   limit 1;

  if v_current_user.id_usuarios is null then
    return jsonb_build_object('status', 403, 'mensagem', 'Perfil interno não encontrado.');
  end if;

  v_target_user := coalesce(p_fk_usuarios, v_current_user.id_usuarios);

  if v_target_user <> v_current_user.id_usuarios
     and lower(coalesce(v_current_user.email, '')) <> 'gabrielwilliam208@gmail.com' then
    return jsonb_build_object('status', 403, 'mensagem', 'Sem permissão para consultar dados de empresa de outro usuário.');
  end if;

  if not exists (select 1 from "RetificaPremium"."Usuarios" where id_usuarios = v_target_user) then
    return jsonb_build_object('status', 404, 'mensagem', 'Usuário não encontrado.');
  end if;

  select *
    into v_config
    from "RetificaPremium"."Configuracoes_Empresa_Usuario"
   where fk_usuarios = v_target_user
   limit 1;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Configuração da empresa carregada.',
    'dados', jsonb_build_object(
      'fk_usuarios', v_target_user,
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
      'email', coalesce(v_config.email, 'gabrielwilliam208@gmail.com'),
      'site', coalesce(v_config.site, ''),
      'updated_at', v_config.updated_at
    )
  );
end;
$$;

create or replace function "RetificaPremium".upsert_configuracao_empresa_usuario(
  p_fk_usuarios uuid,
  p_razao_social text,
  p_nome_fantasia text,
  p_cnpj text,
  p_inscricao_estadual text default '',
  p_inscricao_municipal text default '',
  p_endereco text default '',
  p_cidade text default '',
  p_estado text default '',
  p_cep text default '',
  p_telefone text default '',
  p_email text default '',
  p_site text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_current_user record;
  v_target_user uuid := p_fk_usuarios;
  v_razao_social text := coalesce(nullif(btrim(p_razao_social), ''), '59.540.218 GABRIEL WILLIAM DE PAULO');
  v_nome_fantasia text := coalesce(nullif(btrim(p_nome_fantasia), ''), 'GAWI');
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  v_estado text := upper(btrim(coalesce(p_estado, '')));
  v_cep text := regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g');
begin
  if v_auth_id is null then
    return jsonb_build_object('status', 401, 'mensagem', 'Usuário não autenticado.');
  end if;

  select id_usuarios, email
    into v_current_user
    from "RetificaPremium"."Usuarios"
   where auth_id = v_auth_id
   limit 1;

  if v_current_user.id_usuarios is null then
    return jsonb_build_object('status', 403, 'mensagem', 'Perfil interno não encontrado.');
  end if;

  v_target_user := coalesce(v_target_user, v_current_user.id_usuarios);

  if v_target_user <> v_current_user.id_usuarios
     and lower(coalesce(v_current_user.email, '')) <> 'gabrielwilliam208@gmail.com' then
    return jsonb_build_object('status', 403, 'mensagem', 'Sem permissão para alterar dados de empresa de outro usuário.');
  end if;

  if not exists (select 1 from "RetificaPremium"."Usuarios" where id_usuarios = v_target_user) then
    return jsonb_build_object('status', 404, 'mensagem', 'Usuário não encontrado.');
  end if;

  if v_cnpj <> '' and v_cnpj !~ '^[0-9]{14}$' then
    return jsonb_build_object('status', 400, 'mensagem', 'CNPJ inválido. Informe 14 dígitos.');
  end if;

  if v_estado <> '' and v_estado !~ '^[A-Z]{2}$' then
    return jsonb_build_object('status', 400, 'mensagem', 'Estado inválido. Use UF com 2 letras.');
  end if;

  if v_cep <> '' and v_cep !~ '^[0-9]{8}$' then
    return jsonb_build_object('status', 400, 'mensagem', 'CEP inválido. Informe 8 dígitos.');
  end if;

  insert into "RetificaPremium"."Configuracoes_Empresa_Usuario" (
    fk_usuarios,
    razao_social,
    nome_fantasia,
    cnpj,
    inscricao_estadual,
    inscricao_municipal,
    endereco,
    cidade,
    estado,
    cep,
    telefone,
    email,
    site,
    updated_at
  )
  values (
    v_target_user,
    v_razao_social,
    v_nome_fantasia,
    v_cnpj,
    btrim(coalesce(p_inscricao_estadual, '')),
    btrim(coalesce(p_inscricao_municipal, '')),
    btrim(coalesce(p_endereco, '')),
    btrim(coalesce(p_cidade, '')),
    v_estado,
    v_cep,
    btrim(coalesce(p_telefone, '')),
    btrim(coalesce(p_email, '')),
    btrim(coalesce(p_site, '')),
    now()
  )
  on conflict (fk_usuarios) do update set
    razao_social = excluded.razao_social,
    nome_fantasia = excluded.nome_fantasia,
    cnpj = excluded.cnpj,
    inscricao_estadual = excluded.inscricao_estadual,
    inscricao_municipal = excluded.inscricao_municipal,
    endereco = excluded.endereco,
    cidade = excluded.cidade,
    estado = excluded.estado,
    cep = excluded.cep,
    telefone = excluded.telefone,
    email = excluded.email,
    site = excluded.site,
    updated_at = now();

  return "RetificaPremium".get_configuracao_empresa_usuario(v_target_user);
end;
$$;

grant execute on function "RetificaPremium".get_configuracao_empresa_usuario(uuid) to authenticated;
grant execute on function "RetificaPremium".upsert_configuracao_empresa_usuario(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

insert into "RetificaPremium"."Configuracoes_Empresa_Usuario" (
  fk_usuarios,
  razao_social,
  nome_fantasia,
  cnpj,
  telefone,
  email,
  updated_at
)
select
  id_usuarios,
  '59.540.218 GABRIEL WILLIAM DE PAULO',
  'GAWI',
  '59540218000181',
  '(16) 98840-5275',
  'gabrielwilliam208@gmail.com',
  now()
from "RetificaPremium"."Usuarios"
where lower(email) = 'gabrielwilliam208@gmail.com'
on conflict (fk_usuarios) do update set
  razao_social = excluded.razao_social,
  nome_fantasia = excluded.nome_fantasia,
  cnpj = excluded.cnpj,
  telefone = excluded.telefone,
  email = excluded.email,
  updated_at = now();
