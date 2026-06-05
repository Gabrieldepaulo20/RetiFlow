-- Colunas de pagamento + contato + origem (aditivas)
alter table "RetificaPremium"."Notas_de_Servico"
  add column if not exists payment_status text not null default 'PENDENTE',
  add column if not exists pago_em timestamp without time zone null,
  add column if not exists pago_com text null,
  add column if not exists contato_nome text null,
  add column if not exists contato_telefone text null,
  add column if not exists origem text not null default 'SISTEMA';

alter table "RetificaPremium"."Notas_de_Servico"
  drop constraint if exists notas_payment_status_chk;
alter table "RetificaPremium"."Notas_de_Servico"
  add constraint notas_payment_status_chk check (payment_status in ('PENDENTE','PAGO'));

-- Renomear status para alinhar ao novo modelo (ids preservados)
update "RetificaPremium"."Status_Notas" set nome='Aberta', updated_at=now()
  where id_status_notas=9 and nome='Aberto';
update "RetificaPremium"."Status_Notas" set nome='Pronta', updated_at=now()
  where id_status_notas=13 and nome='Pronto';

-- Novos status finais de Serviço
insert into "RetificaPremium"."Status_Notas"(nome, "index", tipo_nota, tipo_status)
select 'Recusada', 12, 'Serviço', 'fechado'
where not exists (select 1 from "RetificaPremium"."Status_Notas" where nome='Recusada' and tipo_nota='Serviço');

insert into "RetificaPremium"."Status_Notas"(nome, "index", tipo_nota, tipo_status)
select 'Excluída', 13, 'Serviço', 'fechado'
where not exists (select 1 from "RetificaPremium"."Status_Notas" where nome='Excluída' and tipo_nota='Serviço');

-- Backfill do legado: notas Finalizado (fk_status=20) -> recebidas + LEGADO
-- (autorizado explicitamente; rollback: set payment_status='PENDENTE', origem='SISTEMA', pago_em=null where origem='LEGADO')
update "RetificaPremium"."Notas_de_Servico"
   set payment_status='PAGO',
       origem='LEGADO',
       pago_em=coalesce(finalizado_em, created_at)
 where fk_status=20 and payment_status='PENDENTE';
