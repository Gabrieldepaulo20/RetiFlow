-- Correção defensiva para ambientes que receberam a primeira versão do
-- backfill de registered_at com o trigger de updated_at ainda habilitado.
--
-- A condição só atua quando todas as O.S. ficaram com o mesmo updated_at
-- recente, assinatura inequívoca do backfill em lote. Em instalações novas,
-- onde a migration anterior já preserva updated_at, este bloco é no-op.

do $repair$
declare
  v_total bigint;
  v_distinct_updated_at bigint;
  v_batch_timestamp timestamp;
begin
  select
    count(*),
    count(distinct updated_at),
    max(updated_at)
  into
    v_total,
    v_distinct_updated_at,
    v_batch_timestamp
  from "RetificaPremium"."Notas_de_Servico";

  if v_total > 0
     and v_distinct_updated_at = 1
     and v_batch_timestamp >= (now() - interval '1 day')::timestamp then
    execute 'alter table "RetificaPremium"."Notas_de_Servico" disable trigger atualizar_updated_at_notas_servico';

    update "RetificaPremium"."Notas_de_Servico"
       set updated_at = greatest(
         registered_at,
         coalesce(finalizado_em, registered_at),
         coalesce(pago_em, registered_at)
       );

    execute 'alter table "RetificaPremium"."Notas_de_Servico" enable trigger atualizar_updated_at_notas_servico';
  end if;
exception
  when others then
    begin
      execute 'alter table "RetificaPremium"."Notas_de_Servico" enable trigger atualizar_updated_at_notas_servico';
    exception
      when others then null;
    end;
    raise;
end;
$repair$;

-- Rollback: não há rollback exato para timestamps históricos que já haviam
-- sido sobrescritos pelo trigger. registered_at preserva o momento técnico do
-- cadastro; atualizações futuras voltarão a preencher updated_at normalmente.
