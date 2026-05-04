-- Hardens invite-only production behavior.
-- Public signup is controlled in Supabase Auth config; this migration blocks
-- direct anon execution and restricts sensitive user/module RPCs.

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'RetificaPremium'
  loop
    execute format('revoke execute on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

do $$
declare
  fn regprocedure;
  sensitive_functions text[] := array[
    'insert_usuario',
    'update_usuario',
    'inativar_usuario',
    'reativar_usuario',
    'insert_modulo',
    'upsert_modulo'
  ];
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'RetificaPremium'
      and p.proname = any(sensitive_functions)
  loop
    execute format('revoke execute on function %s from public', fn);
    execute format('revoke execute on function %s from anon', fn);
    execute format('revoke execute on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

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
