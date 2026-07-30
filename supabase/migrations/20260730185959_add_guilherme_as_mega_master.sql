-- Migration registrada em producao como 20260730185959.
-- Promove Guilherme a segundo Mega Master, mantendo a autoridade sincronizada
-- com as allowlists das Edge Functions e do frontend.
--
-- A migration pressupoe que o cadastro administrativo ja existe e falha
-- fechado se perfil, Auth ou modulos estiverem inconsistentes.

create or replace function "RetificaPremium".is_mega_master_email(
  p_email text
)
returns boolean
language sql
immutable
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
  select lower(trim(coalesce(p_email, ''))) = any (
    array[
      'gabrielwilliam208@gmail.com',
      'guilhermehenriquedepaulo2@gmail.com'
    ]::text[]
  );
$$;

revoke execute on function "RetificaPremium".is_mega_master_email(text)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".is_mega_master_email(text)
  to service_role;

comment on function "RetificaPremium".is_mega_master_email(text) is
  'Autoridade privada do banco para os Mega Masters ativos configurados no Retiflow.';

do $validate_mega_masters$
declare
  v_email text;
  v_count integer;
begin
  foreach v_email in array array[
    'gabrielwilliam208@gmail.com',
    'guilhermehenriquedepaulo2@gmail.com'
  ]
  loop
    select count(*)
      into v_count
      from "RetificaPremium"."Usuarios" usuario
      join "RetificaPremium"."Modulos" modulo
        on modulo.fk_usuarios = usuario.id_usuarios
     where lower(trim(usuario.email)) = v_email
       and usuario.auth_id is not null
       and usuario.status is true
       and lower(usuario.acesso::text) = 'administrador'
       and modulo.admin is true
       and modulo.marketing is true;

    if v_count <> 1 then
      raise exception
        'Mega Master % ausente, duplicado, inativo ou sem Admin/Crescimento; migration cancelada.',
        v_email;
    end if;
  end loop;
end;
$validate_mega_masters$;

-- A permissao restrita criada pela migration anterior e preservada como
-- historico revogado. A nova permissao global passa a ser a unica ativa.
do $grant_global_support$
declare
  v_guilherme_id uuid;
begin
  select id_usuarios
    into strict v_guilherme_id
    from "RetificaPremium"."Usuarios"
   where lower(trim(email)) = 'guilhermehenriquedepaulo2@gmail.com';

  update "RetificaPremium"."Permissoes_Suporte"
     set ativo = false,
         revoked_at = coalesce(revoked_at, now()),
         motivo = 'Escopo restrito substituido pela promocao a Mega Master.',
         updated_at = now()
   where fk_actor_usuarios = v_guilherme_id
     and escopo_global is false
     and (ativo is true or revoked_at is null);

  insert into "RetificaPremium"."Permissoes_Suporte" (
    fk_actor_usuarios,
    fk_target_usuarios,
    escopo_global,
    ativo,
    motivo,
    revoked_at
  )
  values (
    v_guilherme_id,
    null,
    true,
    true,
    'Escopo global autorizado para o segundo Mega Master.',
    null
  )
  on conflict (fk_actor_usuarios) where escopo_global is true
  do update set
    ativo = true,
    motivo = excluded.motivo,
    revoked_at = null,
    updated_at = now();
end;
$grant_global_support$;

-- Defesa em profundidade: uma sessao de suporte nunca pode ter outro
-- Mega Master como alvo, mesmo se uma Edge Function for chamada incorretamente.
create or replace function "RetificaPremium".pode_acessar_suporte(
  p_actor_usuario_id uuid,
  p_target_usuario_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
  select
    p_actor_usuario_id is not null
    and p_target_usuario_id is not null
    and p_actor_usuario_id <> p_target_usuario_id
    and exists (
      select 1
        from "RetificaPremium"."Usuarios" actor
        join "RetificaPremium"."Modulos" modulos
          on modulos.fk_usuarios = actor.id_usuarios
        join "RetificaPremium"."Usuarios" target
          on target.id_usuarios = p_target_usuario_id
        join "RetificaPremium"."Permissoes_Suporte" permissao
          on permissao.fk_actor_usuarios = actor.id_usuarios
       where actor.id_usuarios = p_actor_usuario_id
         and actor.status is true
         and lower(actor.acesso::text) = 'administrador'
         and modulos.admin is true
         and target.status is true
         and not "RetificaPremium".is_mega_master_email(target.email)
         and permissao.ativo is true
         and permissao.revoked_at is null
         and (
           permissao.escopo_global is true
           or (
             permissao.escopo_global is false
             and permissao.fk_target_usuarios = target.id_usuarios
           )
         )
    );
$$;

revoke execute on function "RetificaPremium".pode_acessar_suporte(uuid, uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".pode_acessar_suporte(uuid, uuid)
  to service_role;

-- Os cinco contratos de configuracao atuais possuem a mesma regra historica
-- hardcoded para Gabriel. Substitui somente essa expressao, preservando
-- assinaturas, validacoes, defaults e grants existentes.
do $upgrade_configuration_authority$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    '"RetificaPremium".document_settings_access(uuid,boolean)'::regprocedure,
    '"RetificaPremium".get_configuracao_empresa_usuario(uuid)'::regprocedure,
    '"RetificaPremium".upsert_configuracao_empresa_usuario(uuid,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure,
    '"RetificaPremium".get_configuracao_modelo_usuario(uuid)'::regprocedure,
    '"RetificaPremium".upsert_configuracao_modelo_usuario(uuid,text,text,text,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature)
      into v_definition;

    v_updated := replace(
      v_definition,
      $from$lower(coalesce(v_current_user.email, '')) = 'gabrielwilliam208@gmail.com'$from$,
      $to$"RetificaPremium".is_mega_master_email(v_current_user.email)$to$
    );
    v_updated := replace(
      v_updated,
      $from$lower(coalesce(v_current_user.email, '')) <> 'gabrielwilliam208@gmail.com'$from$,
      $to$not "RetificaPremium".is_mega_master_email(v_current_user.email)$to$
    );

    if v_updated = v_definition then
      raise exception
        'Regra Mega Master esperada nao encontrada em %; migration cancelada.',
        v_signature::text;
    end if;

    execute v_updated;
  end loop;
end;
$upgrade_configuration_authority$;

do $verify_dual_mega_master$
declare
  v_gabriel_id uuid;
  v_guilherme_id uuid;
  v_retifica_id uuid;
begin
  select id_usuarios into strict v_gabriel_id
    from "RetificaPremium"."Usuarios"
   where lower(trim(email)) = 'gabrielwilliam208@gmail.com';

  select id_usuarios into strict v_guilherme_id
    from "RetificaPremium"."Usuarios"
   where lower(trim(email)) = 'guilhermehenriquedepaulo2@gmail.com';

  select id_usuarios into strict v_retifica_id
    from "RetificaPremium"."Usuarios"
   where lower(trim(email)) = 'retificapremium5@gmail.com';

  if not "RetificaPremium".pode_acessar_suporte(v_guilherme_id, v_retifica_id) then
    raise exception 'Guilherme nao recebeu o escopo global de suporte esperado.';
  end if;

  if "RetificaPremium".pode_acessar_suporte(v_guilherme_id, v_gabriel_id) then
    raise exception 'Protecao entre Mega Masters nao foi aplicada.';
  end if;
end;
$verify_dual_mega_master$;

-- Rollback operacional:
-- 1. remover Guilherme das allowlists do Amplify e das Edge Functions;
-- 2. revogar a permissao global dele em Permissoes_Suporte;
-- 3. restaurar os cinco contratos de configuracao a partir da migration
--    20260610024551/20260620233405;
-- 4. remover is_mega_master_email somente depois de restaurar os contratos.
