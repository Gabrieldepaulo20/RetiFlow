create table if not exists "RetificaPremium"."Configuracoes_Modelos_Usuario" (
  id_configuracoes_modelos_usuario uuid primary key default gen_random_uuid(),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  fk_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  os_modelo text not null default 'auto'
    check (os_modelo in ('auto', 'a5_duplo', 'a4_vertical')),
  cor_documento text not null default '#1a7a8a'
    check (cor_documento ~ '^#[0-9A-Fa-f]{6}$'),
  fechamento_modelo text not null default 'moderno'
    check (fechamento_modelo in ('moderno', 'compacto')),
  cor_fechamento text not null default '#0f7f95'
    check (cor_fechamento ~ '^#[0-9A-Fa-f]{6}$'),
  unique (fk_usuarios)
);

create index if not exists configuracoes_modelos_usuario_fk_idx
  on "RetificaPremium"."Configuracoes_Modelos_Usuario" (fk_usuarios);

alter table "RetificaPremium"."Configuracoes_Modelos_Usuario" enable row level security;

create or replace function "RetificaPremium".get_configuracao_modelo_usuario(
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

  select id_usuarios, email, acesso
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
    return jsonb_build_object('status', 403, 'mensagem', 'Sem permissão para consultar configurações de outro usuário.');
  end if;

  if not exists (select 1 from "RetificaPremium"."Usuarios" where id_usuarios = v_target_user) then
    return jsonb_build_object('status', 404, 'mensagem', 'Usuário não encontrado.');
  end if;

  select *
    into v_config
    from "RetificaPremium"."Configuracoes_Modelos_Usuario"
   where fk_usuarios = v_target_user
   limit 1;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Configuração de modelo carregada.',
    'dados', jsonb_build_object(
      'fk_usuarios', v_target_user,
      'os_modelo', coalesce(v_config.os_modelo, 'auto'),
      'cor_documento', coalesce(v_config.cor_documento, '#1a7a8a'),
      'fechamento_modelo', coalesce(v_config.fechamento_modelo, 'moderno'),
      'cor_fechamento', coalesce(v_config.cor_fechamento, '#0f7f95'),
      'updated_at', v_config.updated_at
    )
  );
end;
$$;

create or replace function "RetificaPremium".upsert_configuracao_modelo_usuario(
  p_fk_usuarios uuid,
  p_os_modelo text,
  p_cor_documento text,
  p_fechamento_modelo text,
  p_cor_fechamento text
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
  v_os_modelo text := coalesce(nullif(btrim(p_os_modelo), ''), 'auto');
  v_cor_documento text := coalesce(nullif(btrim(p_cor_documento), ''), '#1a7a8a');
  v_fechamento_modelo text := coalesce(nullif(btrim(p_fechamento_modelo), ''), 'moderno');
  v_cor_fechamento text := coalesce(nullif(btrim(p_cor_fechamento), ''), '#0f7f95');
begin
  if v_auth_id is null then
    return jsonb_build_object('status', 401, 'mensagem', 'Usuário não autenticado.');
  end if;

  select id_usuarios, email, acesso
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
    return jsonb_build_object('status', 403, 'mensagem', 'Sem permissão para alterar configurações de outro usuário.');
  end if;

  if not exists (select 1 from "RetificaPremium"."Usuarios" where id_usuarios = v_target_user) then
    return jsonb_build_object('status', 404, 'mensagem', 'Usuário não encontrado.');
  end if;

  if v_os_modelo not in ('auto', 'a5_duplo', 'a4_vertical') then
    return jsonb_build_object('status', 400, 'mensagem', 'Modelo de O.S. inválido.');
  end if;

  if v_fechamento_modelo not in ('moderno', 'compacto') then
    return jsonb_build_object('status', 400, 'mensagem', 'Modelo de fechamento inválido.');
  end if;

  if v_cor_documento !~ '^#[0-9A-Fa-f]{6}$' or v_cor_fechamento !~ '^#[0-9A-Fa-f]{6}$' then
    return jsonb_build_object('status', 400, 'mensagem', 'Cor inválida. Use hexadecimal no formato #RRGGBB.');
  end if;

  insert into "RetificaPremium"."Configuracoes_Modelos_Usuario" (
    fk_usuarios,
    os_modelo,
    cor_documento,
    fechamento_modelo,
    cor_fechamento,
    updated_at
  )
  values (
    v_target_user,
    v_os_modelo,
    v_cor_documento,
    v_fechamento_modelo,
    v_cor_fechamento,
    now()
  )
  on conflict (fk_usuarios) do update set
    os_modelo = excluded.os_modelo,
    cor_documento = excluded.cor_documento,
    fechamento_modelo = excluded.fechamento_modelo,
    cor_fechamento = excluded.cor_fechamento,
    updated_at = now();

  return "RetificaPremium".get_configuracao_modelo_usuario(v_target_user);
end;
$$;

grant execute on function "RetificaPremium".get_configuracao_modelo_usuario(uuid) to authenticated;
grant execute on function "RetificaPremium".upsert_configuracao_modelo_usuario(uuid, text, text, text, text) to authenticated;
