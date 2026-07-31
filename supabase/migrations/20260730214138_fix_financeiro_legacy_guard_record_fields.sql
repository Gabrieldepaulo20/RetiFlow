-- Isola os campos de cada tabela no gatilho polimórfico financeiro.
--
-- Em funções trigger com RECORD, o PostgreSQL pode tentar resolver um campo
-- antes de aplicar o lado esquerdo de uma expressão booleana. Por isso,
-- `tg_table_name = 'Notas_de_Servico' and new.total ...` ainda falhava quando
-- a mesma função era executada por Fechamentos ou Contas_Pagar.

create or replace function "RetificaPremium".financeiro_guardar_resumo_legado()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_owner uuid;
begin
  if current_setting('retiflow.financeiro_internal',true)='on' then
    return new;
  end if;

  select u.id_usuarios
    into v_actor
  from "RetificaPremium"."Usuarios" u
  where u.auth_id=(select auth.uid())
  limit 1;

  if tg_table_name='Notas_de_Servico' then
    v_owner:=old.criado_por_usuario;

    if v_actor is not null and v_actor<>v_owner and (
      new.total is distinct from old.total
      or new.total_servicos is distinct from old.total_servicos
      or new.total_produtos is distinct from old.total_produtos
      or new.payment_status is distinct from old.payment_status
      or new.valor_recebido is distinct from old.valor_recebido
      or new.pago_em is distinct from old.pago_em
      or new.pago_com is distinct from old.pago_com
      or new.receber_em is distinct from old.receber_em
    ) then
      raise exception 'Modo suporte nao pode alterar dados financeiros da O.S.'
        using errcode='P0403';
    end if;

    if coalesce(new.valor_recebido,0)>new.total+0.004 then
      raise exception 'Recebimento excede o valor da O.S.' using errcode='P0602';
    end if;

    if (
      new.total is distinct from old.total
      or coalesce(new.valor_recebido,0)<coalesce(old.valor_recebido,0)
      or (new.payment_status='PENDENTE' and old.payment_status<>'PENDENTE')
    ) and exists(
      select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_notas_servico=old.id_notas_servico
        and m.estornado_em is null
        and m.tipo_movimento<>'ESTORNO'
    ) then
      raise exception 'O.S. com movimento financeiro exige estorno antes de alterar total ou recebimento.'
        using errcode='P0602';
    end if;

    return new;
  end if;

  if tg_table_name='Fechamentos' then
    select c.fk_criado_por
      into v_owner
    from "RetificaPremium"."Clientes" c
    where c.id_clientes=old.fk_clientes;

    if v_actor is not null and v_actor<>v_owner and (
      new.valor_total is distinct from old.valor_total
      or new.status_pagamento is distinct from old.status_pagamento
      or new.valor_recebido is distinct from old.valor_recebido
      or new.pago_em is distinct from old.pago_em
      or new.pago_com is distinct from old.pago_com
    ) then
      raise exception 'Modo suporte nao pode alterar dados financeiros do fechamento.'
        using errcode='P0403';
    end if;

    if coalesce(new.valor_recebido,0)>new.valor_total+0.004 then
      raise exception 'Recebimento excede o valor do fechamento.' using errcode='P0602';
    end if;

    if (
      new.valor_total is distinct from old.valor_total
      or coalesce(new.valor_recebido,0)<coalesce(old.valor_recebido,0)
      or (new.status_pagamento='PENDENTE' and old.status_pagamento<>'PENDENTE')
    ) and exists(
      select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_fechamentos=old.id_fechamentos
        and m.estornado_em is null
        and m.tipo_movimento<>'ESTORNO'
    ) then
      raise exception 'Fechamento com movimento financeiro exige estorno antes de alterar valor ou recebimento.'
        using errcode='P0602';
    end if;

    return new;
  end if;

  if tg_table_name='Contas_Pagar' then
    v_owner:=case when tg_op='INSERT' then new.fk_criado_por else old.fk_criado_por end;

    if v_actor is not null and v_actor<>v_owner then
      if tg_op='INSERT' and (
        new.status::text in ('PAGO','PARCIAL')
        or coalesce(new.valor_pago,0)>0
        or new.pago_em is not null
        or new.pago_com is not null
      ) then
        raise exception 'Modo suporte pode criar obrigacao pendente, mas nao registrar pagamento.'
          using errcode='P0403';
      elsif tg_op='UPDATE' and (
        new.valor_original is distinct from old.valor_original
        or new.juros is distinct from old.juros
        or new.desconto is distinct from old.desconto
        or new.valor_final is distinct from old.valor_final
        or new.valor_pago is distinct from old.valor_pago
        or new.status is distinct from old.status
        or new.pago_em is distinct from old.pago_em
        or new.pago_com is distinct from old.pago_com
      ) then
        raise exception 'Modo suporte nao pode alterar dados financeiros da conta a pagar.'
          using errcode='P0403';
      end if;
    end if;

    if tg_op='INSERT' then
      return new;
    end if;

    if coalesce(new.valor_pago,0)>new.valor_final+0.004 then
      raise exception 'Pagamento excede o valor da conta.' using errcode='P0602';
    end if;

    if (
      new.valor_final is distinct from old.valor_final
      or coalesce(new.valor_pago,0)<coalesce(old.valor_pago,0)
      or new.status::text='CANCELADO'
    ) and exists(
      select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_contas_pagar=old.id_contas_pagar
        and m.estornado_em is null
        and m.tipo_movimento<>'ESTORNO'
    ) then
      raise exception 'Conta com pagamento exige estorno antes de cancelar ou alterar o valor.'
        using errcode='P0602';
    end if;

    return new;
  end if;

  return new;
end $$;

revoke execute on function
  "RetificaPremium".financeiro_guardar_resumo_legado()
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".financeiro_guardar_resumo_legado()
  to service_role;

-- ROLLBACK: restaurar a definição imediatamente anterior da função.
-- Não há alteração de dados, triggers, assinaturas ou políticas.
