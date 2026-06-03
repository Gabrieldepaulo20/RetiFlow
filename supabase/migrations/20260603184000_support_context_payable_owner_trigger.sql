-- Permite escritas auditadas de Contas a Pagar durante uma sessao de suporte
-- ativa, sem trocar o dono operacional para auth.uid() do suporte.

create or replace function "RetificaPremium".has_active_support_session_for_target(
  p_target_usuario_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_actor record;
  v_allowed boolean;
begin
  if p_target_usuario_id is null or auth.uid() is null then
    return false;
  end if;

  select u.id_usuarios, u.email, u.acesso, coalesce(m.admin, false) as admin
    into v_actor
  from "RetificaPremium"."Usuarios" u
  left join "RetificaPremium"."Modulos" m on m.fk_usuarios = u.id_usuarios
  where u.auth_id = auth.uid()
  limit 1;

  if v_actor.id_usuarios is null then
    return false;
  end if;

  if lower(coalesce(v_actor.email, '')) <> 'gabrielwilliam208@gmail.com' then
    return false;
  end if;

  if v_actor.acesso::text <> 'administrador' or v_actor.admin is distinct from true then
    return false;
  end if;

  select exists (
    select 1
      from "RetificaPremium"."Sessoes_Suporte" s
     where s.fk_actor_usuarios = v_actor.id_usuarios
       and s.fk_target_usuarios = p_target_usuario_id
       and s.ended_at is null
       and s.expires_at > now()
  )
    into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

create or replace function "RetificaPremium".enforce_payable_owner()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if tg_op = 'INSERT' then
    new.fk_criado_por := coalesce(new.fk_criado_por, v_usuario_id);

    if new.fk_criado_por is distinct from v_usuario_id
       and not "RetificaPremium".has_active_support_session_for_target(new.fk_criado_por) then
      raise exception 'Conta pertence a outro usuário.' using errcode = 'P0403';
    end if;

    return new;
  end if;

  if old.fk_criado_por is distinct from v_usuario_id
     and not "RetificaPremium".has_active_support_session_for_target(old.fk_criado_por) then
    raise exception 'Conta não encontrada para este usuário.' using errcode = 'P0403';
  end if;

  if tg_op = 'UPDATE' then
    new.fk_criado_por := old.fk_criado_por;
    return new;
  end if;

  return old;
end;
$$;

revoke execute on function "RetificaPremium".has_active_support_session_for_target(uuid) from public, anon, authenticated;
revoke execute on function "RetificaPremium".enforce_payable_owner() from public, anon, authenticated;
grant execute on function "RetificaPremium".has_active_support_session_for_target(uuid) to service_role;
grant execute on function "RetificaPremium".enforce_payable_owner() to service_role;
