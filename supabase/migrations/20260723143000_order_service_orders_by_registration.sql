-- Separa a data operacional de entrada da O.S. do momento técnico do cadastro.
--
-- Motivo:
-- `created_at` é a data de entrada escolhida pelo usuário e pode ser retroativa.
-- `updated_at` muda em edições, status e geração do PDF. Nenhuma das duas é uma
-- ordem estável de cadastro.
--
-- A listagem passa a aceitar p_ordem_campo = 'cadastro', sem remover as opções
-- existentes de data de entrada ('data') e número ('os').

alter table "RetificaPremium"."Notas_de_Servico"
  add column if not exists registered_at timestamp without time zone;

-- Para o legado, a data de entrada continua sendo o fallback mais conservador.
-- O fluxo atual grava a hora real dentro de created_at e normalmente atualiza
-- a O.S. poucos segundos depois ao salvar o PDF. Quando as horas coincidem em
-- até cinco minutos, updated_at revela com segurança o dia real do cadastro
-- retroativo (caso da O.S. criada hoje com entrada em mês anterior).
alter table "RetificaPremium"."Notas_de_Servico"
  disable trigger atualizar_updated_at_notas_servico;

update "RetificaPremium"."Notas_de_Servico"
   set registered_at = case
     when created_at::date < updated_at::date
      and least(
        abs(extract(epoch from (created_at::time - updated_at::time))),
        86400 - abs(extract(epoch from (created_at::time - updated_at::time)))
      ) <= 300
       then updated_at
     else created_at
   end
 where registered_at is null;

alter table "RetificaPremium"."Notas_de_Servico"
  enable trigger atualizar_updated_at_notas_servico;

alter table "RetificaPremium"."Notas_de_Servico"
  alter column registered_at set default now(),
  alter column registered_at set not null;

create index if not exists idx_notas_servico_owner_registered_at
  on "RetificaPremium"."Notas_de_Servico" (criado_por_usuario, registered_at desc);

do $migration$
declare
  v_function record;
  v_definition text;
  v_old_order text := $old$
    order by
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end asc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end desc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then ns.os end asc,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then ns.os end desc,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'asc' then ns.created_at end asc nulls last,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'desc' then ns.created_at end desc nulls last,
      ns.created_at desc,
      ns.id_notas_servico desc
$old$;
  v_new_order text := $new$
    order by
      case when v_ordem_campo = 'cadastro' and v_ordem_direcao = 'asc' then ns.registered_at end asc nulls last,
      case when v_ordem_campo = 'cadastro' and v_ordem_direcao = 'desc' then ns.registered_at end desc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end asc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end desc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then ns.os end asc,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then ns.os end desc,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'asc' then ns.created_at end asc nulls last,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'desc' then ns.created_at end desc nulls last,
      ns.registered_at desc,
      ns.created_at desc,
      ns.id_notas_servico desc
$new$;
begin
  for v_function in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'RetificaPremium'
       and p.proname in (
         'get_notas_servico',
         'get_notas_servico_contexto_suporte'
       )
  loop
    v_definition := pg_get_functiondef(v_function.oid);

    if strpos(
      v_definition,
      $old$v_ordem_campo text := case when lower(coalesce(p_ordem_campo, 'data')) in ('data', 'os') then lower(coalesce(p_ordem_campo, 'data')) else 'data' end;$old$
    ) = 0 then
      raise exception '%: validação dos campos de ordenação não encontrada', v_function.proname;
    end if;
    v_definition := replace(
      v_definition,
      $old$v_ordem_campo text := case when lower(coalesce(p_ordem_campo, 'data')) in ('data', 'os') then lower(coalesce(p_ordem_campo, 'data')) else 'data' end;$old$,
      $new$v_ordem_campo text := case when lower(coalesce(p_ordem_campo, 'data')) in ('cadastro', 'data', 'os') then lower(coalesce(p_ordem_campo, 'data')) else 'data' end;$new$
    );

    if strpos(v_definition, E'      ns.created_at,\n      ns.updated_at,') = 0 then
      raise exception '%: projeção das datas não encontrada', v_function.proname;
    end if;
    v_definition := replace(
      v_definition,
      E'      ns.created_at,\n      ns.updated_at,',
      E'      ns.created_at,\n      ns.updated_at,\n      ns.registered_at,'
    );

    if strpos(v_definition, v_old_order) = 0 then
      raise exception '%: bloco de ordenação não encontrado', v_function.proname;
    end if;
    v_definition := replace(v_definition, v_old_order, v_new_order);

    execute v_definition;
  end loop;
end;
$migration$;

comment on column "RetificaPremium"."Notas_de_Servico".registered_at is
  'Momento técnico e imutável do cadastro da O.S.; independente da data operacional de entrada.';

comment on function "RetificaPremium".get_notas_servico(
  uuid, smallint, text, integer, integer, date, date, boolean, text, text
) is
  'Lists service orders. p_ordem_campo accepts cadastro, data or os.';

comment on function "RetificaPremium".get_notas_servico_contexto_suporte(
  uuid, smallint, text, integer, integer, date, date, text, text, uuid, uuid
) is
  'Lists service orders in support context. p_ordem_campo accepts cadastro, data or os.';

-- Rollback:
-- 1. restaurar as duas RPCs da migration 20260620124500;
-- 2. drop index if exists "RetificaPremium".idx_notas_servico_owner_registered_at;
-- 3. alter table "RetificaPremium"."Notas_de_Servico" drop column registered_at;
