create table if not exists "RetificaPremium"."Usuarios_Presenca" (
  fk_usuarios uuid primary key references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  auth_id uuid not null unique,
  email text not null,
  last_seen_at timestamptz not null default now(),
  current_route text,
  updated_at timestamptz not null default now()
);

create index if not exists usuarios_presenca_last_seen_idx
  on "RetificaPremium"."Usuarios_Presenca"(last_seen_at desc);

alter table "RetificaPremium"."Usuarios_Presenca" enable row level security;

revoke all on table "RetificaPremium"."Usuarios_Presenca" from anon, authenticated;
grant all on table "RetificaPremium"."Usuarios_Presenca" to service_role;

create or replace function "RetificaPremium".touch_usuario_presenca(
  p_current_route text default null
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_usuario record;
  v_route text;
begin
  if v_auth_id is null then
    return json_build_object('status', 401, 'mensagem', 'Autenticação obrigatória.');
  end if;

  select id_usuarios, email, status
    into v_usuario
    from "RetificaPremium"."Usuarios"
   where auth_id = v_auth_id
   limit 1;

  if v_usuario.id_usuarios is null or v_usuario.status is false then
    return json_build_object('status', 403, 'mensagem', 'Usuário interno inválido ou inativo.');
  end if;

  v_route := nullif(left(coalesce(p_current_route, ''), 160), '');

  insert into "RetificaPremium"."Usuarios_Presenca" (
    fk_usuarios,
    auth_id,
    email,
    last_seen_at,
    current_route,
    updated_at
  )
  values (
    v_usuario.id_usuarios,
    v_auth_id,
    lower(v_usuario.email),
    now(),
    v_route,
    now()
  )
  on conflict (fk_usuarios) do update
    set auth_id = excluded.auth_id,
        email = excluded.email,
        last_seen_at = excluded.last_seen_at,
        current_route = excluded.current_route,
        updated_at = excluded.updated_at;

  return json_build_object('status', 200, 'mensagem', 'Presença atualizada.');
exception when others then
  return json_build_object('status', 500, 'mensagem', SQLERRM);
end;
$function$;

grant execute on function "RetificaPremium".touch_usuario_presenca(text) to authenticated;
