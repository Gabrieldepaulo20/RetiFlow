-- ============================================================================
-- DRAFT — Reforma de status + recebimento nas notas de entrada
-- NÃO APLICAR sem aprovação explícita. Remapeia dados de status existentes.
-- Revisar nomes reais de colunas/tabelas/RPCs no schema "RetificaPremium" antes
-- de aplicar (ex.: via `list_tables`). Ter backup/rollback pronto.
-- Frontend já tolera o estado pré-migration (adapter mapeia status legados e lê
-- os campos de pagamento defensivamente), então isto pode ser aplicado depois.
-- ============================================================================

begin;

-- 1) Colunas novas (aditivas, nullable — reversíveis) ------------------------
alter table "RetificaPremium"."Notas_de_Servico"
  add column if not exists payment_status   text        not null default 'PENDENTE',
  add column if not exists pago_em           timestamptz null,
  add column if not exists pago_com          text        null,
  add column if not exists contato_nome      text        null,
  add column if not exists contato_telefone  text        null,
  add column if not exists origem            text        not null default 'SISTEMA';

-- (opcional) constraint de domínio do payment_status
alter table "RetificaPremium"."Notas_de_Servico"
  drop constraint if exists notas_payment_status_chk;
alter table "RetificaPremium"."Notas_de_Servico"
  add constraint notas_payment_status_chk check (payment_status in ('PENDENTE','PAGO'));

-- 2) Novos status na tabela de status ---------------------------------------
-- CONFIRMAR: nome real da tabela/colunas (ex.: Status_Notas(id, nome, tipo_nota, tipo_status, index)).
insert into "RetificaPremium"."Status_Notas" (nome, tipo_nota, tipo_status)
  select v.nome, 'Serviço', 'fechado'
  from (values ('Recusada'), ('Excluída')) as v(nome)
  where not exists (
    select 1 from "RetificaPremium"."Status_Notas" s where s.nome = v.nome
  );

-- 3) Remap dos status antigos -> novos --------------------------------------
-- Renomear Pronto -> Pronta; Finalizado -> Entregue; Cancelado/Descartado -> Excluída.
-- Estratégia recomendada: atualizar o fk_status das notas para o id do novo status,
-- depois inativar os status antigos (NUNCA dropar fisicamente — manter histórico).
-- Pré-condição: capturar mapa de ids antes (para rollback).
--
-- Exemplo (ajustar nomes de colunas de id/fk reais):
-- update "RetificaPremium"."Notas_de_Servico" n
--   set fk_status = (select id from "RetificaPremium"."Status_Notas" where nome = 'Pronta')
--   where fk_status = (select id from "RetificaPremium"."Status_Notas" where nome = 'Pronto');
-- update ... 'Finalizado' -> 'Entregue'
-- update ... 'Cancelado'  -> 'Excluída'
-- update ... 'Descartado' -> 'Excluída'
--
-- Para Finalizado->Entregue, preencher pago_em? NÃO assumir pago. Definir na aprovação
-- se as antigas Finalizadas entram como PENDENTE (reconciliar) ou PAGO.

-- 4) RPC de recebimento (espelha registrar_pagamento de contas a pagar) ------
-- CONFIRMAR assinatura/segurança (SECURITY DEFINER, RLS, contexto de suporte).
create or replace function "RetificaPremium".registrar_recebimento_nota(
  p_id_notas_servico uuid,
  p_pago_com text default null,
  p_data timestamptz default now()
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_status text;
begin
  update "RetificaPremium"."Notas_de_Servico"
    set payment_status = 'PAGO', pago_em = p_data, pago_com = p_pago_com
    where id_notas_servico = p_id_notas_servico
    returning payment_status into v_status;

  if v_status is null then
    return jsonb_build_object('status', 404, 'mensagem', 'Nota não encontrada');
  end if;
  return jsonb_build_object('status', 200, 'mensagem', 'Recebimento registrado');
end;
$$;

-- 5) Ajustar os RPCs de leitura/escrita para devolver/gravar os campos novos:
--    get_notas_servico, get_nota_servico_detalhes, nova_nota, update_nota_servico
--    e a function dashboard-resumo (incluir payment_status/pago_em/pago_com/contato_*).
--    + criar variantes *_contexto_suporte de registrar_recebimento_nota.

commit;

-- ============================================================================
-- ROLLBACK (esboço):
--   - restaurar fk_status das notas a partir do mapa capturado no passo 3;
--   - reativar status antigos; remover 'Recusada'/'Excluída' se sem uso;
--   - alter table ... drop column payment_status, pago_em, pago_com,
--     contato_nome, contato_telefone, origem;
--   - drop function registrar_recebimento_nota(...);
-- ============================================================================
