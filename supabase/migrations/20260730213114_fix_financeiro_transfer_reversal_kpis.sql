-- Corrige os KPIs consolidados após o estorno de uma transferência.
-- As duas pontas originais e seus estornos compartilham fk_transferencia;
-- portanto, nenhuma delas deve compor entradas/saídas quando nenhuma conta
-- específica está selecionada.

create or replace function "RetificaPremium".financeiro_resumo_usuario(
  p_usuario uuid,p_data_inicio date,p_data_fim date,p_modo text,p_conta uuid
)
returns json
language plpgsql stable security definer set search_path=''
as $$
declare
  v_saldo_confirmado boolean; v_inicial numeric; v_anterior numeric;
  v_entradas numeric; v_saidas numeric; v_receber numeric; v_pagar numeric;
  v_faturamento numeric; v_despesas numeric;
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario);
  if p_data_inicio is null or p_data_fim is null or p_data_inicio>p_data_fim
     or coalesce(p_modo,'CAIXA') not in ('CAIXA','PREVISTO','COMPETENCIA') then
    raise exception 'Periodo ou modo invalido.' using errcode='P0602';
  end if;
  select coalesce(bool_and(c.saldo_inicial_confirmado and c.data_corte<=p_data_inicio),false),
         coalesce(sum(case when c.data_corte<=p_data_inicio then coalesce(c.saldo_inicial,0) else 0 end),0)
    into v_saldo_confirmado,v_inicial
  from "RetificaPremium"."Financeiro_Contas" c
  where c.fk_criado_por=p_usuario and c.ativo
    and (p_conta is null or c.id_financeiro_contas=p_conta);

  select v_inicial+coalesce(sum(case when m.direcao='ENTRADA' then m.valor else -m.valor end),0)
    into v_anterior
  from "RetificaPremium"."Financeiro_Movimentos" m
  join "RetificaPremium"."Financeiro_Contas" c
    on c.id_financeiro_contas=m.fk_financeiro_contas
  where m.fk_criado_por=p_usuario and m.status='CONFIRMADO'
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date<p_data_inicio
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date>=c.data_corte
    and (p_conta is null or m.fk_financeiro_contas=p_conta);
  select coalesce(sum(m.valor) filter(where m.direcao='ENTRADA'),0),
         coalesce(sum(m.valor) filter(where m.direcao='SAIDA'),0)
    into v_entradas,v_saidas
  from "RetificaPremium"."Financeiro_Movimentos" m
  join "RetificaPremium"."Financeiro_Contas" c
    on c.id_financeiro_contas=m.fk_financeiro_contas
  where m.fk_criado_por=p_usuario and m.status='CONFIRMADO'
    and (p_conta is not null or m.fk_transferencia is null)
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date between p_data_inicio and p_data_fim
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date>=c.data_corte
    and (p_conta is null or m.fk_financeiro_contas=p_conta);

  select coalesce(sum(x.aberto),0) into v_receber from (
    select greatest(n.total-coalesce(n.valor_recebido,0),0) aberto
    from "RetificaPremium"."Notas_de_Servico" n join "RetificaPremium"."Clientes" c on c.id_clientes=n.fk_clientes
    join "RetificaPremium"."Status_Notas" s on s.id_status_notas=n.fk_status
    where c.fk_criado_por=p_usuario and n.fk_fechamentos is null
      and lower(s.nome) in ('entregue','recusada','sem conserto','finalizado')
      and coalesce(n.receber_em,n.created_at::date)<=p_data_fim
    union all
    select greatest(f.valor_total-coalesce(f.valor_recebido,0),0)
    from "RetificaPremium"."Fechamentos" f join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
    where c.fk_criado_por=p_usuario and coalesce(f.vencimento_em,f.data_fechamento::date)<=p_data_fim
    union all
    select greatest(r.valor_previsto-r.valor_recebido,0)
    from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    where r.fk_criado_por=p_usuario and r.status<>'CANCELADO' and r.data_vencimento<=p_data_fim
  ) x;
  select coalesce(sum(greatest(c.valor_final-coalesce(c.valor_pago,0),0)),0) into v_pagar
  from "RetificaPremium"."Contas_Pagar" c
  where c.fk_criado_por=p_usuario and c.excluido_em is null and c.status::text<>'CANCELADO'
    and c.data_vencimento::date<=p_data_fim;

  select coalesce(sum(x.valor),0) into v_faturamento from (
    select n.total valor from "RetificaPremium"."Notas_de_Servico" n
    join "RetificaPremium"."Clientes" c on c.id_clientes=n.fk_clientes
    join "RetificaPremium"."Status_Notas" s on s.id_status_notas=n.fk_status
    where c.fk_criado_por=p_usuario and n.fk_fechamentos is null
      and lower(s.nome) in ('entregue','recusada','sem conserto','finalizado')
      and coalesce(n.finalizado_em::date,n.receber_em,n.created_at::date)
        between p_data_inicio and p_data_fim
    union all
    -- O.S. comprovadamente recebida antes do fechamento não compõe o valor
    -- líquido cobrado no fechamento e, portanto, é receita independente.
    select recebida.valor
    from (
      select distinct on (n.id_notas_servico)
        parsed.valor valor,
        coalesce(
          n.finalizado_em::date,
          n.created_at::date
        ) competencia
      from "RetificaPremium"."Fechamentos" f
      join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(f.dados_json->'recebidas')='array'
            then f.dados_json->'recebidas'
          else '[]'::jsonb
        end
      ) r(item)
      cross join lateral (
        select
          case
            when coalesce(r.item->>'id','') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (r.item->>'id')::uuid
          end nota_id,
          case
            when coalesce(r.item->>'total','') ~ '^[0-9]+([.][0-9]{1,2})?$'
            then (r.item->>'total')::numeric
          end valor
      ) parsed
      join "RetificaPremium"."Notas_de_Servico" n
        on n.id_notas_servico=parsed.nota_id
       and n.fk_fechamentos=f.id_fechamentos
      where c.fk_criado_por=p_usuario
        and parsed.valor>0
      order by n.id_notas_servico,f.created_at desc
    ) recebida
    where recebida.competencia between p_data_inicio and p_data_fim
    union all
    select f.valor_total from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
    where c.fk_criado_por=p_usuario and f.data_fechamento::date between p_data_inicio and p_data_fim
    union all
    select r.valor_previsto from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    where r.fk_criado_por=p_usuario and r.impacta_dre and r.status<>'CANCELADO'
      and r.data_competencia between p_data_inicio and p_data_fim
    union all
    select m.valor from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_criado_por=p_usuario and m.impacta_dre and m.direcao='ENTRADA'
      and m.tipo_movimento in ('RECEITA_AVULSA','REEMBOLSO')
      and m.estornado_em is null
      and m.data_competencia between p_data_inicio and p_data_fim
  ) x;
  select coalesce(sum(c.valor_final),0) into v_despesas
  from "RetificaPremium"."Contas_Pagar" c
  where c.fk_criado_por=p_usuario and c.excluido_em is null and c.status::text<>'CANCELADO'
    and coalesce(c.data_competencia::date,c.data_vencimento::date) between p_data_inicio and p_data_fim;

  return json_build_object(
    'saldo_inicial_informado',v_saldo_confirmado,'saldo_anterior',v_anterior,
    'entradas_recebidas',v_entradas,'saidas_pagas',v_saidas,
    'saldo_atual',v_anterior+v_entradas-v_saidas,'a_receber',v_receber,'a_pagar',v_pagar,
    'saldo_projetado',v_anterior+v_entradas-v_saidas+v_receber-v_pagar,
    'resultado_periodo',v_entradas-v_saidas,'faturamento_competencia',v_faturamento,
    'despesas_competencia',v_despesas,'resultado_competencia',v_faturamento-v_despesas);
end $$;

revoke execute on function
  "RetificaPremium".financeiro_resumo_usuario(uuid,date,date,text,uuid)
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".financeiro_resumo_usuario(uuid,date,date,text,uuid)
  to service_role;

-- ROLLBACK: substituir apenas o predicado consolidado acima por
-- `(p_conta is not null or m.tipo_movimento <> 'TRANSFERENCIA')` para restaurar
-- exatamente o comportamento anterior.
