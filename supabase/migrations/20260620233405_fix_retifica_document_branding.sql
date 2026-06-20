-- Remove o fallback visual antigo da GAWI em documentos quando a configuração
-- de empresa ainda não existe ou não carrega. A linha real da Retífica Premium
-- também é normalizada para preservar acentuação nos PDFs e prévias.

alter table "RetificaPremium"."Configuracoes_Empresa_Usuario"
  alter column razao_social set default 'Retífica Premium',
  alter column nome_fantasia set default 'Retífica Premium',
  alter column cnpj set default '',
  alter column telefone set default '(16) 3524-4661',
  alter column email set default '';

update "RetificaPremium"."Configuracoes_Empresa_Usuario" c
   set razao_social = 'Retífica Premium',
       nome_fantasia = 'Retífica Premium',
       updated_at = now()
  from "RetificaPremium"."Usuarios" u
 where u.id_usuarios = c.fk_usuarios
   and lower(u.email) = 'retificapremium5@gmail.com'
   and (
     c.razao_social is distinct from 'Retífica Premium'
     or c.nome_fantasia is distinct from 'Retífica Premium'
   );

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
      'razao_social', coalesce(v_config.razao_social, 'Retífica Premium'),
      'nome_fantasia', coalesce(v_config.nome_fantasia, 'Retífica Premium'),
      'cnpj', coalesce(v_config.cnpj, ''),
      'inscricao_estadual', coalesce(v_config.inscricao_estadual, ''),
      'inscricao_municipal', coalesce(v_config.inscricao_municipal, ''),
      'endereco', coalesce(v_config.endereco, ''),
      'cidade', coalesce(v_config.cidade, ''),
      'estado', coalesce(v_config.estado, ''),
      'cep', coalesce(v_config.cep, ''),
      'telefone', coalesce(v_config.telefone, '(16) 3524-4661'),
      'email', coalesce(v_config.email, ''),
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
  v_razao_social text := coalesce(nullif(btrim(p_razao_social), ''), 'Retífica Premium');
  v_nome_fantasia text := coalesce(nullif(btrim(p_nome_fantasia), ''), 'Retífica Premium');
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
      'razao_social', coalesce(v_config.razao_social, 'Retífica Premium'),
      'nome_fantasia', coalesce(v_config.nome_fantasia, 'Retífica Premium'),
      'cnpj', coalesce(v_config.cnpj, ''),
      'inscricao_estadual', coalesce(v_config.inscricao_estadual, ''),
      'inscricao_municipal', coalesce(v_config.inscricao_municipal, ''),
      'endereco', coalesce(v_config.endereco, ''),
      'cidade', coalesce(v_config.cidade, ''),
      'estado', coalesce(v_config.estado, ''),
      'cep', coalesce(v_config.cep, ''),
      'telefone', coalesce(v_config.telefone, '(16) 3524-4661'),
      'whatsapp', coalesce(v_config.whatsapp, ''),
      'email', coalesce(v_config.email, ''),
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
grant execute on function "RetificaPremium".get_configuracao_empresa_cliente(uuid) to authenticated, service_role;
