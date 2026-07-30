-- Acesso de suporte passa a ser uma permissão explícita, privada e revogável.
-- Esta tabela NÃO concede perfil Mega Master nem autoriza ações administrativas:
-- ela permite somente abrir um contexto operacional auditado para os alvos
-- cadastrados aqui.
create table if not exists "RetificaPremium"."Permissoes_Suporte" (
  id_permissao_suporte uuid primary key default gen_random_uuid(),
  fk_actor_usuarios uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  fk_target_usuarios uuid
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  escopo_global boolean not null default false,
  ativo boolean not null default true,
  motivo text not null check (char_length(trim(motivo)) between 8 and 500),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissoes_suporte_target_scope_check check (
    (escopo_global is true and fk_target_usuarios is null)
    or
    (escopo_global is false and fk_target_usuarios is not null)
  ),
  constraint permissoes_suporte_different_users_check check (
    fk_target_usuarios is null or fk_actor_usuarios <> fk_target_usuarios
  )
);

create unique index if not exists uq_permissoes_suporte_actor_global
  on "RetificaPremium"."Permissoes_Suporte"(fk_actor_usuarios)
  where escopo_global is true;

create unique index if not exists uq_permissoes_suporte_actor_target
  on "RetificaPremium"."Permissoes_Suporte"(fk_actor_usuarios, fk_target_usuarios)
  where escopo_global is false;

create index if not exists idx_permissoes_suporte_target_active
  on "RetificaPremium"."Permissoes_Suporte"(fk_target_usuarios, ativo)
  where escopo_global is false;

alter table "RetificaPremium"."Permissoes_Suporte" enable row level security;

revoke all on table "RetificaPremium"."Permissoes_Suporte" from public, anon, authenticated;
grant select, insert, update, delete
  on table "RetificaPremium"."Permissoes_Suporte"
  to service_role;

comment on table "RetificaPremium"."Permissoes_Suporte" is
  'Allowlist privada de operadores e alvos do modo suporte. Não concede privilégios administrativos.';

-- Normaliza o legado antes de impor a invariável de uma sessão aberta por ator.
-- Em caso de duplicidade histórica, preserva somente a sessão aberta mais nova.
-- O lock impede que a Function antiga insira outra sessão entre a limpeza e a
-- criação do índice; ele permanece até o commit da migration.
lock table "RetificaPremium"."Sessoes_Suporte"
  in share row exclusive mode;

with sessoes_abertas_ranqueadas as (
  select
    id_sessao_suporte,
    row_number() over (
      partition by fk_actor_usuarios
      order by started_at desc, id_sessao_suporte desc
    ) as ordem
  from "RetificaPremium"."Sessoes_Suporte"
  where ended_at is null
)
update "RetificaPremium"."Sessoes_Suporte" sessao
   set ended_at = now()
  from sessoes_abertas_ranqueadas ranqueada
 where sessao.id_sessao_suporte = ranqueada.id_sessao_suporte
   and ranqueada.ordem > 1;

-- expires_at permanece apenas por compatibilidade de schema. Infinito expressa
-- corretamente que sessões abertas não expiram por relógio.
update "RetificaPremium"."Sessoes_Suporte"
   set expires_at = 'infinity'::timestamptz
 where ended_at is null;

create unique index if not exists uq_sessoes_suporte_actor_open
  on "RetificaPremium"."Sessoes_Suporte"(fk_actor_usuarios)
  where ended_at is null;

comment on column "RetificaPremium"."Sessoes_Suporte".expires_at is
  'Campo legado. Sessões abertas usam infinity e encerram somente por ended_at.';

-- O callback OAuth precisa revalidar o mesmo ator, alvo e sessão que iniciaram
-- o fluxo. Estados antigos são invalidados porque não distinguem fluxo próprio
-- de fluxo em suporte.
alter table "RetificaPremium"."Gmail_OAuth_States"
  add column if not exists flow_kind text not null default 'legacy'
    check (flow_kind in ('legacy', 'self', 'support')),
  add column if not exists fk_actor_usuarios uuid
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  add column if not exists fk_target_usuarios uuid
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete cascade,
  add column if not exists fk_sessao_suporte uuid
    references "RetificaPremium"."Sessoes_Suporte"(id_sessao_suporte) on delete cascade;

-- Estados sem classificação foram criados antes de ser possível distinguir
-- fluxo próprio de fluxo em suporte. São consumidos sem trocar tokens; o
-- usuário apenas reinicia o consentimento com um estado novo e explícito.
update "RetificaPremium"."Gmail_OAuth_States"
   set used_at = coalesce(used_at, now())
 where flow_kind = 'legacy'
   and used_at is null;

alter table "RetificaPremium"."Gmail_OAuth_States"
  add constraint gmail_oauth_states_support_context_check check (
    (
      flow_kind in ('legacy', 'self')
      and fk_actor_usuarios is null
      and fk_target_usuarios is null
      and fk_sessao_suporte is null
    )
    or
    (
      flow_kind = 'support'
      and fk_actor_usuarios is not null
      and fk_target_usuarios is not null
      and fk_sessao_suporte is not null
    )
  ) not valid;

alter table "RetificaPremium"."Gmail_OAuth_States"
  validate constraint gmail_oauth_states_support_context_check;

create index if not exists idx_gmail_oauth_states_support_session
  on "RetificaPremium"."Gmail_OAuth_States"(fk_sessao_suporte)
  where fk_sessao_suporte is not null;

-- Mantém o Mega Master com o mesmo escopo global que já possuía e libera
-- Guilherme exclusivamente para a conta operacional da Retífica Premium.
do $$
declare
  v_mega_master_id uuid;
  v_guilherme_id uuid;
  v_retifica_premium_id uuid;
  v_mega_master_count integer;
  v_guilherme_count integer;
  v_retifica_premium_count integer;
begin
  select (array_agg(id_usuarios))[1], count(*)
    into v_mega_master_id, v_mega_master_count
    from "RetificaPremium"."Usuarios"
   where lower(trim(email)) = 'gabrielwilliam208@gmail.com';

  select (array_agg(id_usuarios))[1], count(*)
    into v_guilherme_id, v_guilherme_count
    from "RetificaPremium"."Usuarios"
   where lower(trim(email)) = 'guilhermehenriquedepaulo2@gmail.com';

  select (array_agg(id_usuarios))[1], count(*)
    into v_retifica_premium_id, v_retifica_premium_count
    from "RetificaPremium"."Usuarios"
   where lower(trim(email)) = 'retificapremium5@gmail.com';

  if v_mega_master_count <> 1 then
    raise exception 'Mega Master ausente ou duplicado; permissão de suporte não foi criada.';
  end if;

  if v_guilherme_count <> 1 then
    raise exception 'Guilherme ausente ou duplicado; permissão de suporte não foi criada.';
  end if;

  if v_retifica_premium_count <> 1 then
    raise exception 'Retífica Premium ausente ou duplicada; permissão de suporte não foi criada.';
  end if;

  insert into "RetificaPremium"."Permissoes_Suporte" (
    fk_actor_usuarios,
    fk_target_usuarios,
    escopo_global,
    ativo,
    motivo,
    revoked_at
  )
  values (
    v_mega_master_id,
    null,
    true,
    true,
    'Escopo global preservado para o Mega Master principal.',
    null
  )
  on conflict (fk_actor_usuarios) where escopo_global is true
  do update set
    ativo = true,
    motivo = excluded.motivo,
    revoked_at = null,
    updated_at = now();

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
    v_retifica_premium_id,
    false,
    true,
    'Suporte operacional autorizado apenas para a Retífica Premium.',
    null
  )
  on conflict (fk_actor_usuarios, fk_target_usuarios) where escopo_global is false
  do update set
    ativo = true,
    motivo = excluded.motivo,
    revoked_at = null,
    updated_at = now();
end;
$$;

-- Autoridade central usada pelas RPCs e Edge Functions. Além da allowlist,
-- exige operador ativo, perfil administrador, módulo Admin e alvo ativo.
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

create or replace function "RetificaPremium".listar_alvos_suporte(
  p_actor_usuario_id uuid
)
returns table (id_usuarios uuid)
language sql
stable
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
  select target.id_usuarios
    from "RetificaPremium"."Usuarios" target
   where target.status is true
     and target.id_usuarios <> p_actor_usuario_id
     and "RetificaPremium".pode_acessar_suporte(
       p_actor_usuario_id,
       target.id_usuarios
     )
   order by target.created_at, target.id_usuarios;
$$;

revoke execute on function "RetificaPremium".pode_acessar_suporte(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".listar_alvos_suporte(uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".pode_acessar_suporte(uuid, uuid)
  to service_role;
grant execute on function "RetificaPremium".listar_alvos_suporte(uuid)
  to service_role;

create or replace function "RetificaPremium".sessao_suporte_valida(
  p_sessao_suporte uuid,
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
    "RetificaPremium".pode_acessar_suporte(
      p_actor_usuario_id,
      p_target_usuario_id
    )
    and exists (
      select 1
        from "RetificaPremium"."Sessoes_Suporte" sessao
       where sessao.id_sessao_suporte = p_sessao_suporte
         and sessao.fk_actor_usuarios = p_actor_usuario_id
         and sessao.fk_target_usuarios = p_target_usuario_id
         and sessao.ended_at is null
    );
$$;

revoke execute on function "RetificaPremium".sessao_suporte_valida(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".sessao_suporte_valida(uuid, uuid, uuid)
  to service_role;

-- Retorna os dados somente quando a mesma fotografia transacional confirma
-- sessão, ator, alvo e permissão. Evita validar e buscar a linha em chamadas
-- separadas na Edge Function.
create or replace function "RetificaPremium".obter_sessao_suporte_valida(
  p_sessao_suporte uuid,
  p_actor_usuario_id uuid,
  p_target_usuario_id uuid
)
returns table (
  id_sessao_suporte uuid,
  motivo text,
  started_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
  select
    sessao.id_sessao_suporte,
    sessao.motivo,
    sessao.started_at,
    sessao.expires_at
  from "RetificaPremium"."Sessoes_Suporte" sessao
  where sessao.id_sessao_suporte = p_sessao_suporte
    and sessao.fk_actor_usuarios = p_actor_usuario_id
    and sessao.fk_target_usuarios = p_target_usuario_id
    and sessao.ended_at is null
    and "RetificaPremium".pode_acessar_suporte(
      p_actor_usuario_id,
      p_target_usuario_id
    );
$$;

revoke execute on function "RetificaPremium".obter_sessao_suporte_valida(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function "RetificaPremium".obter_sessao_suporte_valida(
  uuid, uuid, uuid
) to service_role;

-- Encerra sessões imediatamente quando a permissão, o usuário ou o módulo
-- administrativo deixam de autorizar o operador. Assim uma sessão antiga não
-- "revive" ao reativar a permissão posteriormente.
create or replace function "RetificaPremium".encerrar_sessoes_ao_revogar_permissao_suporte()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    update "RetificaPremium"."Sessoes_Suporte" sessao
       set ended_at = now()
     where sessao.fk_actor_usuarios = old.fk_actor_usuarios
       and sessao.ended_at is null
       and (
         old.escopo_global is true
         or sessao.fk_target_usuarios = old.fk_target_usuarios
       );
    return old;
  end if;

  if new.ativo is not true
     or new.revoked_at is not null
     or new.fk_actor_usuarios is distinct from old.fk_actor_usuarios
     or new.fk_target_usuarios is distinct from old.fk_target_usuarios
     or new.escopo_global is distinct from old.escopo_global then
    update "RetificaPremium"."Sessoes_Suporte" sessao
       set ended_at = now()
     where sessao.fk_actor_usuarios = old.fk_actor_usuarios
       and sessao.ended_at is null
       and (
         old.escopo_global is true
         or sessao.fk_target_usuarios = old.fk_target_usuarios
       );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_permissoes_suporte_close_sessions
  on "RetificaPremium"."Permissoes_Suporte";
create trigger trg_permissoes_suporte_close_sessions
after update or delete on "RetificaPremium"."Permissoes_Suporte"
for each row execute function
  "RetificaPremium".encerrar_sessoes_ao_revogar_permissao_suporte();

create or replace function "RetificaPremium".encerrar_sessoes_ao_perder_perfil_suporte()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
begin
  if new.auth_id is distinct from old.auth_id or new.status is not true then
    update "RetificaPremium"."Sessoes_Suporte"
       set ended_at = now()
     where (
         fk_actor_usuarios = new.id_usuarios
         or fk_target_usuarios = new.id_usuarios
       )
       and ended_at is null;
  elsif lower(new.acesso::text) <> 'administrador' then
    update "RetificaPremium"."Sessoes_Suporte"
       set ended_at = now()
     where fk_actor_usuarios = new.id_usuarios
       and ended_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_close_support_sessions
  on "RetificaPremium"."Usuarios";
create trigger trg_usuarios_close_support_sessions
after update of status, acesso, auth_id on "RetificaPremium"."Usuarios"
for each row
when (
  old.status is distinct from new.status
  or old.acesso is distinct from new.acesso
  or old.auth_id is distinct from new.auth_id
)
execute function "RetificaPremium".encerrar_sessoes_ao_perder_perfil_suporte();

create or replace function "RetificaPremium".encerrar_sessoes_ao_remover_modulo_admin()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    update "RetificaPremium"."Sessoes_Suporte"
       set ended_at = now()
     where fk_actor_usuarios = old.fk_usuarios
       and ended_at is null;
    return old;
  end if;

  if new.fk_usuarios is distinct from old.fk_usuarios then
    update "RetificaPremium"."Sessoes_Suporte"
       set ended_at = now()
     where fk_actor_usuarios = old.fk_usuarios
       and ended_at is null;
  end if;

  if new.admin is not true then
    update "RetificaPremium"."Sessoes_Suporte"
       set ended_at = now()
     where fk_actor_usuarios = new.fk_usuarios
       and ended_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_modulos_close_support_sessions
  on "RetificaPremium"."Modulos";
create trigger trg_modulos_close_support_sessions
after update of admin, fk_usuarios or delete on "RetificaPremium"."Modulos"
for each row
execute function "RetificaPremium".encerrar_sessoes_ao_remover_modulo_admin();

revoke execute on function "RetificaPremium".encerrar_sessoes_ao_revogar_permissao_suporte()
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".encerrar_sessoes_ao_perder_perfil_suporte()
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".encerrar_sessoes_ao_remover_modulo_admin()
  from public, anon, authenticated;

create or replace function "RetificaPremium".iniciar_sessao_suporte(
  p_actor_usuario_id uuid,
  p_target_usuario_id uuid,
  p_motivo text
)
returns table (
  id_sessao_suporte uuid,
  started_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
declare
  v_actor_email text;
  v_target_email text;
begin
  if char_length(trim(coalesce(p_motivo, ''))) not between 8 and 500 then
    raise exception 'Motivo de suporte inválido.' using errcode = 'P0400';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_usuario_id::text, 0));

  -- Serializa início com inativação, troca de identidade/módulo e revogação.
  -- A ordem determinística evita deadlocks quando duas contas são envolvidas.
  perform 1
    from "RetificaPremium"."Usuarios"
   where id_usuarios in (p_actor_usuario_id, p_target_usuario_id)
   order by id_usuarios
     for update;

  perform 1
    from "RetificaPremium"."Modulos"
   where fk_usuarios = p_actor_usuario_id
     for update;

  perform 1
    from "RetificaPremium"."Permissoes_Suporte"
   where fk_actor_usuarios = p_actor_usuario_id
   order by id_permissao_suporte
     for update;

  if not "RetificaPremium".pode_acessar_suporte(
    p_actor_usuario_id,
    p_target_usuario_id
  ) then
    raise exception 'Operador sem permissão para esta conta de suporte.'
      using errcode = 'P0403';
  end if;

  select actor.email, target.email
    into v_actor_email, v_target_email
    from "RetificaPremium"."Usuarios" actor
    join "RetificaPremium"."Usuarios" target
      on target.id_usuarios = p_target_usuario_id
   where actor.id_usuarios = p_actor_usuario_id;

  if v_actor_email is null or v_target_email is null then
    raise exception 'Ator ou alvo de suporte não encontrado.' using errcode = 'P0403';
  end if;

  update "RetificaPremium"."Sessoes_Suporte"
     set ended_at = now()
   where fk_actor_usuarios = p_actor_usuario_id
     and ended_at is null;

  return query
  insert into "RetificaPremium"."Sessoes_Suporte" as sessao (
    fk_actor_usuarios,
    fk_target_usuarios,
    actor_email,
    target_email,
    motivo,
    expires_at
  )
  values (
    p_actor_usuario_id,
    p_target_usuario_id,
    v_actor_email,
    v_target_email,
    trim(p_motivo),
    'infinity'::timestamptz
  )
  returning
    sessao.id_sessao_suporte,
    sessao.started_at,
    sessao.expires_at;
end;
$$;

revoke execute on function "RetificaPremium".iniciar_sessao_suporte(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".iniciar_sessao_suporte(uuid, uuid, text)
  to service_role;

-- Cria estado OAuth e trilha de auditoria na mesma transação. Se o log falhar,
-- nenhum estado utilizável fica disponível para o callback.
create or replace function "RetificaPremium".criar_estado_oauth_suporte(
  p_actor_usuario_id uuid,
  p_target_usuario_id uuid,
  p_sessao_suporte uuid,
  p_state text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
declare
  v_target_auth_id uuid;
  v_state_id uuid;
begin
  if trim(coalesce(p_state, '')) = ''
     or p_expires_at is null
     or p_expires_at <= now() then
    raise exception 'Estado OAuth inválido.' using errcode = 'P0400';
  end if;

  perform 1
    from "RetificaPremium"."Usuarios"
   where id_usuarios in (p_actor_usuario_id, p_target_usuario_id)
   order by id_usuarios
     for update;

  perform 1
    from "RetificaPremium"."Modulos"
   where fk_usuarios = p_actor_usuario_id
     for update;

  perform 1
    from "RetificaPremium"."Permissoes_Suporte"
   where fk_actor_usuarios = p_actor_usuario_id
   order by id_permissao_suporte
     for update;

  perform 1
    from "RetificaPremium"."Sessoes_Suporte"
   where id_sessao_suporte = p_sessao_suporte
     and fk_actor_usuarios = p_actor_usuario_id
     and fk_target_usuarios = p_target_usuario_id
     for update;

  if not "RetificaPremium".sessao_suporte_valida(
    p_sessao_suporte,
    p_actor_usuario_id,
    p_target_usuario_id
  ) then
    raise exception 'Sessão de suporte inválida ou encerrada.' using errcode = 'P0403';
  end if;

  select auth_id
    into v_target_auth_id
    from "RetificaPremium"."Usuarios"
   where id_usuarios = p_target_usuario_id
     and status is true;

  if v_target_auth_id is null then
    raise exception 'Cliente alvo sem autenticação ativa.' using errcode = 'P0403';
  end if;

  insert into "RetificaPremium"."Gmail_OAuth_States" (
    fk_auth_user,
    state,
    expires_at,
    flow_kind,
    fk_actor_usuarios,
    fk_target_usuarios,
    fk_sessao_suporte
  )
  values (
    v_target_auth_id,
    p_state,
    p_expires_at at time zone 'UTC',
    'support',
    p_actor_usuario_id,
    p_target_usuario_id,
    p_sessao_suporte
  )
  returning id_gmail_oauth_states into v_state_id;

  insert into "RetificaPremium"."Logs_Acoes_Suporte" (
    fk_actor_usuarios,
    fk_target_usuarios,
    fk_sessao_suporte,
    acao,
    entidade,
    entidade_id,
    descricao
  )
  values (
    p_actor_usuario_id,
    p_target_usuario_id,
    p_sessao_suporte,
    'gmail_oauth_start',
    'Gmail_OAuth_States',
    v_state_id,
    'Conexão Gmail iniciada em modo suporte.'
  );

  return v_state_id;
end;
$$;

revoke execute on function "RetificaPremium".criar_estado_oauth_suporte(
  uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function "RetificaPremium".criar_estado_oauth_suporte(
  uuid, uuid, uuid, text, timestamptz
) to service_role;

-- A última validação, a persistência do refresh token e o log obrigatório
-- acontecem no mesmo commit. Revogações concorrentes são serializadas pelos
-- mesmos locks usados ao iniciar a sessão.
create or replace function "RetificaPremium".salvar_conexao_gmail_suporte(
  p_oauth_state_id uuid,
  p_email text,
  p_refresh_token_cipher text
)
returns uuid
language plpgsql
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
declare
  v_state record;
  v_connection_id uuid;
begin
  if trim(coalesce(p_email, '')) = ''
     or char_length(trim(p_email)) > 320
     or trim(coalesce(p_refresh_token_cipher, '')) = '' then
    raise exception 'Dados da conexão Gmail inválidos.' using errcode = 'P0400';
  end if;

  select
    oauth.id_gmail_oauth_states,
    oauth.fk_auth_user,
    oauth.fk_actor_usuarios,
    oauth.fk_target_usuarios,
    oauth.fk_sessao_suporte
    into v_state
    from "RetificaPremium"."Gmail_OAuth_States" oauth
   where oauth.id_gmail_oauth_states = p_oauth_state_id
     and oauth.used_at is not null
     and oauth.flow_kind = 'support'
     and oauth.fk_actor_usuarios is not null
     and oauth.fk_target_usuarios is not null
     and oauth.fk_sessao_suporte is not null
   for update;

  if v_state.id_gmail_oauth_states is null then
    raise exception 'Estado OAuth de suporte inválido.' using errcode = 'P0403';
  end if;

  perform 1
    from "RetificaPremium"."Usuarios"
   where id_usuarios in (
     v_state.fk_actor_usuarios,
     v_state.fk_target_usuarios
   )
   order by id_usuarios
     for update;

  perform 1
    from "RetificaPremium"."Modulos"
   where fk_usuarios = v_state.fk_actor_usuarios
     for update;

  perform 1
    from "RetificaPremium"."Permissoes_Suporte"
   where fk_actor_usuarios = v_state.fk_actor_usuarios
   order by id_permissao_suporte
     for update;

  perform 1
    from "RetificaPremium"."Sessoes_Suporte"
   where id_sessao_suporte = v_state.fk_sessao_suporte
     and fk_actor_usuarios = v_state.fk_actor_usuarios
     and fk_target_usuarios = v_state.fk_target_usuarios
     for update;

  if not "RetificaPremium".sessao_suporte_valida(
    v_state.fk_sessao_suporte,
    v_state.fk_actor_usuarios,
    v_state.fk_target_usuarios
  ) then
    raise exception 'Sessão de suporte inválida ou encerrada.' using errcode = 'P0403';
  end if;

  if not exists (
    select 1
      from "RetificaPremium"."Usuarios" target
     where target.id_usuarios = v_state.fk_target_usuarios
       and target.auth_id = v_state.fk_auth_user
       and target.status is true
  ) then
    raise exception 'Identidade do cliente alvo não corresponde ao OAuth.'
      using errcode = 'P0403';
  end if;

  insert into "RetificaPremium"."Gmail_Connections" as connection (
    fk_auth_user,
    email,
    refresh_token_cipher,
    status,
    sync_enabled,
    last_error,
    updated_at
  )
  values (
    v_state.fk_auth_user,
    lower(trim(p_email)),
    p_refresh_token_cipher,
    'CONNECTED',
    true,
    null,
    now()
  )
  on conflict (fk_auth_user, email)
  do update set
    refresh_token_cipher = excluded.refresh_token_cipher,
    status = 'CONNECTED',
    sync_enabled = true,
    last_error = null,
    updated_at = now()
  returning connection.id_gmail_connections
    into v_connection_id;

  insert into "RetificaPremium"."Logs_Acoes_Suporte" (
    fk_actor_usuarios,
    fk_target_usuarios,
    fk_sessao_suporte,
    acao,
    entidade,
    entidade_id,
    descricao
  )
  values (
    v_state.fk_actor_usuarios,
    v_state.fk_target_usuarios,
    v_state.fk_sessao_suporte,
    'gmail_oauth_connected',
    'Gmail_Connections',
    v_connection_id,
    'Conexão Gmail concluída em modo suporte.'
  );

  return v_connection_id;
end;
$$;

revoke execute on function "RetificaPremium".salvar_conexao_gmail_suporte(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function "RetificaPremium".salvar_conexao_gmail_suporte(
  uuid, text, text
) to service_role;

-- Todas as RPCs operacionais continuam dependendo de uma sessão exata,
-- pertencente ao ator autenticado, apontando para o mesmo alvo e ainda aberta.
-- A sessão não expira por relógio: encerra somente pelo botão "Sair do suporte",
-- conforme decisão já aplicada em 20260605150000.
create or replace function "RetificaPremium".resolve_suporte_contexto_usuario_id(
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
declare
  v_actor_usuario_id uuid;
  v_session_exists boolean;
begin
  if p_contexto_usuario_id is null then
    return "RetificaPremium".require_current_usuario_id();
  end if;

  if p_sessao_suporte is null then
    raise exception 'Sessão de suporte obrigatória.' using errcode = 'P0403';
  end if;

  select u.id_usuarios
    into v_actor_usuario_id
    from "RetificaPremium"."Usuarios" u
   where u.auth_id = auth.uid()
   limit 1;

  if v_actor_usuario_id is null then
    raise exception 'Usuário interno não encontrado.' using errcode = 'P0403';
  end if;

  if not "RetificaPremium".pode_acessar_suporte(
    v_actor_usuario_id,
    p_contexto_usuario_id
  ) then
    raise exception 'Operador sem permissão para acessar este contexto de suporte.'
      using errcode = 'P0403';
  end if;

  v_session_exists := "RetificaPremium".sessao_suporte_valida(
    p_sessao_suporte,
    v_actor_usuario_id,
    p_contexto_usuario_id
  );

  if v_session_exists is not true then
    raise exception 'Sessão de suporte inválida ou encerrada.' using errcode = 'P0403';
  end if;

  return p_contexto_usuario_id;
end;
$$;

create or replace function "RetificaPremium".has_active_support_session_for_target(
  p_target_usuario_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = "RetificaPremium", public, pg_temp
as $$
declare
  v_actor_usuario_id uuid;
begin
  if p_target_usuario_id is null or auth.uid() is null then
    return false;
  end if;

  select u.id_usuarios
    into v_actor_usuario_id
    from "RetificaPremium"."Usuarios" u
   where u.auth_id = auth.uid()
   limit 1;

  if v_actor_usuario_id is null
     or not "RetificaPremium".pode_acessar_suporte(
       v_actor_usuario_id,
       p_target_usuario_id
     ) then
    return false;
  end if;

  return exists (
    select 1
      from "RetificaPremium"."Sessoes_Suporte" s
     where s.fk_actor_usuarios = v_actor_usuario_id
       and s.fk_target_usuarios = p_target_usuario_id
       and "RetificaPremium".sessao_suporte_valida(
         s.id_sessao_suporte,
         v_actor_usuario_id,
         p_target_usuario_id
       )
  );
end;
$$;

-- Preserva os contratos de execução existentes: o resolver continua disponível
-- aos usuários autenticados; helpers internos e trigger permanecem fechados.
revoke execute on function "RetificaPremium".resolve_suporte_contexto_usuario_id(uuid, uuid)
  from public, anon;
grant execute on function "RetificaPremium".resolve_suporte_contexto_usuario_id(uuid, uuid)
  to authenticated, service_role;

revoke execute on function "RetificaPremium".has_active_support_session_for_target(uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".has_active_support_session_for_target(uuid)
  to service_role;

-- Rollback operacional:
-- 1. encerrar sessões abertas dos operadores que serão removidos;
-- 2. restaurar as versões anteriores de resolve_suporte_contexto_usuario_id e
--    has_active_support_session_for_target;
-- 3. remover listar_alvos_suporte, pode_acessar_suporte e Permissoes_Suporte.
-- Não executar o rollback sem confirmar que nenhuma sessão de suporte está ativa.
