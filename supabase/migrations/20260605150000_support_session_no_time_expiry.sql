-- Sessão de suporte deixa de expirar por tempo; só encerra com "Sair" (ended_at).
-- Mantém todas as demais validações (Mega Master + módulo Admin + actor/target).
-- Autorizado explicitamente pelo usuário (trade-off de segurança aceito).
CREATE OR REPLACE FUNCTION "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id uuid, p_sessao_suporte uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
declare
  v_actor record;
  v_session_exists boolean;
begin
  if p_contexto_usuario_id is null then
    return "RetificaPremium".require_current_usuario_id();
  end if;

  if p_sessao_suporte is null then
    raise exception 'Sessão de suporte obrigatória.' using errcode = 'P0403';
  end if;

  select u.id_usuarios, u.email, u.acesso, coalesce(m.admin, false) as admin
    into v_actor
    from "RetificaPremium"."Usuarios" u
    left join "RetificaPremium"."Modulos" m on m.fk_usuarios = u.id_usuarios
   where u.auth_id = auth.uid()
   limit 1;

  if v_actor.id_usuarios is null then
    raise exception 'Usuário interno não encontrado.' using errcode = 'P0403';
  end if;

  if lower(coalesce(v_actor.email, '')) <> 'gabrielwilliam208@gmail.com' then
    raise exception 'Somente o Mega Master pode acessar contexto de suporte.' using errcode = 'P0403';
  end if;

  if v_actor.acesso::text <> 'administrador' or v_actor.admin is distinct from true then
    raise exception 'Módulo Admin obrigatório para suporte.' using errcode = 'P0403';
  end if;

  select exists (
    select 1
      from "RetificaPremium"."Sessoes_Suporte" s
     where s.id_sessao_suporte = p_sessao_suporte
       and s.fk_actor_usuarios = v_actor.id_usuarios
       and s.fk_target_usuarios = p_contexto_usuario_id
       and s.ended_at is null
  )
    into v_session_exists;

  if v_session_exists is not true then
    raise exception 'Sessão de suporte inválida ou encerrada.' using errcode = 'P0403';
  end if;

  return p_contexto_usuario_id;
end;
$function$;
