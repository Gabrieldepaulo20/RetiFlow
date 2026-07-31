-- Central Financeiro: backfill auditável, compatibilidade e guardas.
-- Corte confiável: 2026-06-01. Registros anteriores são ESTIMADO; registros
-- pagos sem data ficam REVISAR e não afetam o saldo real.

select set_config('retiflow.financeiro_internal','on',true);

-- Fechamento pago gera uma única entrada líquida. As O.S. filhas nunca são
-- copiadas para o razão como parte da cascata.
insert into "RetificaPremium"."Financeiro_Movimentos"(
  fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
  data_competencia,forma_pagamento,descricao,observacoes,status,impacta_dre,
  fk_fechamentos,chave_idempotencia,metadata
)
select c.fk_criado_por,fc.id_financeiro_contas,'ENTRADA','RECEBIMENTO_FECHAMENTO',
  f.valor_total,
  case when f.pago_em is null then null else f.pago_em at time zone 'America/Sao_Paulo' end,
  f.data_fechamento::date,f.pago_com,
  'Backfill fechamento - '||coalesce(c.nome,f.label,f.periodo,'Cliente'),
  'Importado do resumo legado; valor líquido do fechamento.',
  case when f.pago_em is null then 'REVISAR'
    when f.pago_em::date<date '2026-06-01' then 'ESTIMADO' else 'CONFIRMADO' end,
  false,f.id_fechamentos,'backfill:fechamento:'||f.id_fechamentos,
  jsonb_build_object('backfill',true,'regra','fechamento_liquido')
from "RetificaPremium"."Fechamentos" f
join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
join "RetificaPremium"."Financeiro_Contas" fc
  on fc.fk_criado_por=c.fk_criado_por and fc.padrao and fc.ativo
where f.status_pagamento='PAGO' and f.valor_total>0
on conflict do nothing;

-- O snapshot imutável registra as O.S. já recebidas antes de gerar o
-- fechamento. Ele é evidência melhor que o resumo atual da O.S., que sofreu a
-- antiga cascata do fechamento.
insert into "RetificaPremium"."Financeiro_Movimentos"(
  fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
  data_competencia,forma_pagamento,descricao,observacoes,status,impacta_dre,
  fk_notas_servico,chave_idempotencia,metadata
)
select c.fk_criado_por,fc.id_financeiro_contas,'ENTRADA','RECEBIMENTO_OS',
  parsed.valor,
  parsed.pago_em,
  coalesce(n.finalizado_em::date,n.receber_em,n.created_at::date),n.pago_com,
  'Backfill recebimento anterior '||n.os,
  'O.S. já recebida, preservada no snapshot imutável do fechamento.',
  case when parsed.pago_em is null then 'REVISAR'
    when (parsed.pago_em at time zone 'America/Sao_Paulo')::date
      <date '2026-06-01' then 'ESTIMADO' else 'CONFIRMADO' end,
  false,n.id_notas_servico,'backfill:nota-anterior:'||n.id_notas_servico,
  jsonb_build_object('backfill',true,'regra','os_recebida_snapshot',
    'fechamento_id',f.id_fechamentos)
from "RetificaPremium"."Fechamentos" f
join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(f.dados_json->'recebidas')='array'
    then f.dados_json->'recebidas' else '[]'::jsonb end
) r(item)
cross join lateral (
  select
    case when pg_catalog.pg_input_is_valid(r.item->>'id','uuid')
      then (r.item->>'id')::uuid end nota_id,
    case when pg_catalog.pg_input_is_valid(r.item->>'total','numeric')
      then (r.item->>'total')::numeric end valor,
    case when pg_catalog.pg_input_is_valid(
      nullif(r.item->>'pago_em',''),'timestamp without time zone'
    ) then nullif(r.item->>'pago_em','')::timestamp without time zone
      at time zone 'America/Sao_Paulo' end pago_em
) parsed
join "RetificaPremium"."Notas_de_Servico" n
  on n.id_notas_servico=parsed.nota_id
join "RetificaPremium"."Financeiro_Contas" fc
  on fc.fk_criado_por=c.fk_criado_por and fc.padrao and fc.ativo
where parsed.valor>0
on conflict do nothing;

-- O.S. independente paga. Uma O.S. em fechamento só entra quando há evidência
-- de recebimento anterior/diferente da cascata do fechamento.
insert into "RetificaPremium"."Financeiro_Movimentos"(
  fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
  data_competencia,forma_pagamento,descricao,observacoes,status,impacta_dre,
  fk_notas_servico,chave_idempotencia,metadata
)
select c.fk_criado_por,fc.id_financeiro_contas,'ENTRADA','RECEBIMENTO_OS',n.total,
  case when n.pago_em is null then null else n.pago_em at time zone 'America/Sao_Paulo' end,
  coalesce(n.finalizado_em::date,n.receber_em,n.created_at::date),n.pago_com,
  'Backfill recebimento '||n.os,
  case when n.fk_fechamentos is null then 'O.S. independente.'
    else 'O.S. recebida antes/fora da cascata do fechamento.' end,
  case when n.pago_em is null then 'REVISAR'
    when n.pago_em::date<date '2026-06-01' then 'ESTIMADO' else 'CONFIRMADO' end,
  false,n.id_notas_servico,'backfill:nota:'||n.id_notas_servico,
  jsonb_build_object('backfill',true,'regra','os_independente')
from "RetificaPremium"."Notas_de_Servico" n
join "RetificaPremium"."Clientes" c on c.id_clientes=n.fk_clientes
left join "RetificaPremium"."Fechamentos" f on f.id_fechamentos=n.fk_fechamentos
join "RetificaPremium"."Financeiro_Contas" fc
  on fc.fk_criado_por=c.fk_criado_por and fc.padrao and fc.ativo
where n.payment_status='PAGO' and n.total>0
  and (n.fk_fechamentos is null
    or f.status_pagamento is distinct from 'PAGO'
    or n.pago_em is distinct from f.pago_em)
  and not exists(
    select 1
    from "RetificaPremium"."Fechamentos" fs
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(fs.dados_json->'recebidas')='array'
        then fs.dados_json->'recebidas' else '[]'::jsonb end
    ) rs(item)
    where fs.id_fechamentos=n.fk_fechamentos
      and rs.item->>'id'=n.id_notas_servico::text
  )
on conflict do nothing;

-- O legado de Contas a Pagar não possui parcelas históricas. Cada conta paga
-- vira um único evento agregado, sem inventar datas/parcelas intermediárias.
insert into "RetificaPremium"."Financeiro_Movimentos"(
  fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
  data_competencia,forma_pagamento,descricao,observacoes,status,impacta_dre,
  fk_categorias_saidas,fk_contas_pagar,chave_idempotencia,metadata
)
select cp.fk_criado_por,fc.id_financeiro_contas,'SAIDA','PAGAMENTO_CONTA',
  least(coalesce(cp.valor_pago,cp.valor_final),cp.valor_final),
  case when cp.pago_em is null then null else cp.pago_em at time zone 'America/Sao_Paulo' end,
  coalesce(cp.data_competencia::date,cp.data_vencimento::date),cp.pago_com::text,
  'Backfill pagamento - '||cp.titulo,
  'Evento histórico agregado; granularidade anterior indisponível.',
  case when cp.pago_em is null then 'REVISAR'
    when cp.pago_em::date<date '2026-06-01' then 'ESTIMADO' else 'CONFIRMADO' end,
  false,cp.fk_categorias,cp.id_contas_pagar,'backfill:conta:'||cp.id_contas_pagar,
  jsonb_build_object('backfill',true,'regra','pagamento_agregado')
from "RetificaPremium"."Contas_Pagar" cp
join "RetificaPremium"."Financeiro_Contas" fc
  on fc.fk_criado_por=cp.fk_criado_por and fc.padrao and fc.ativo
where cp.excluido_em is null and coalesce(cp.valor_pago,0)>0
on conflict do nothing;

-- Sincroniza os campos-resumo somente depois de todos os eventos existirem.
do $$
declare r record;
begin
  for r in select distinct fk_notas_servico id from "RetificaPremium"."Financeiro_Movimentos"
    where fk_notas_servico is not null
  loop perform "RetificaPremium".financeiro_recalcular_origem(r.id,null,null,null); end loop;
  for r in select distinct fk_fechamentos id from "RetificaPremium"."Financeiro_Movimentos"
    where fk_fechamentos is not null
  loop perform "RetificaPremium".financeiro_recalcular_origem(null,r.id,null,null); end loop;
  for r in select distinct fk_contas_pagar id from "RetificaPremium"."Financeiro_Movimentos"
    where fk_contas_pagar is not null
  loop perform "RetificaPremium".financeiro_recalcular_origem(null,null,r.id,null); end loop;
end $$;

-- Guardas: dinheiro não é apagado por UPDATE/DELETE legado. Estorno deve ser
-- explícito e auditado.
create or replace function "RetificaPremium".financeiro_guardar_resumo_legado()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid;
  v_owner uuid;
begin
  if current_setting('retiflow.financeiro_internal',true)='on' then return new; end if;

  select u.id_usuarios into v_actor
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
  elsif tg_table_name='Fechamentos' then
    select c.fk_criado_por into v_owner
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
  elsif tg_table_name='Contas_Pagar' then
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
    if tg_op='INSERT' then return new; end if;
  end if;

  if tg_table_name='Notas_de_Servico' and coalesce(new.valor_recebido,0)>new.total+0.004 then
    raise exception 'Recebimento excede o valor da O.S.' using errcode='P0602';
  elsif tg_table_name='Fechamentos' and coalesce(new.valor_recebido,0)>new.valor_total+0.004 then
    raise exception 'Recebimento excede o valor do fechamento.' using errcode='P0602';
  elsif tg_table_name='Contas_Pagar' and coalesce(new.valor_pago,0)>new.valor_final+0.004 then
    raise exception 'Pagamento excede o valor da conta.' using errcode='P0602';
  end if;
  if tg_table_name='Notas_de_Servico'
     and (new.total is distinct from old.total
       or coalesce(new.valor_recebido,0)<coalesce(old.valor_recebido,0)
       or (new.payment_status='PENDENTE' and old.payment_status<>'PENDENTE'))
     and exists(select 1 from "RetificaPremium"."Financeiro_Movimentos" m
       where m.fk_notas_servico=old.id_notas_servico and m.estornado_em is null
         and m.tipo_movimento<>'ESTORNO') then
    raise exception 'O.S. com movimento financeiro exige estorno antes de alterar total ou recebimento.'
      using errcode='P0602';
  elsif tg_table_name='Fechamentos'
     and (new.valor_total is distinct from old.valor_total
       or coalesce(new.valor_recebido,0)<coalesce(old.valor_recebido,0)
       or (new.status_pagamento='PENDENTE' and old.status_pagamento<>'PENDENTE'))
     and exists(select 1 from "RetificaPremium"."Financeiro_Movimentos" m
       where m.fk_fechamentos=old.id_fechamentos and m.estornado_em is null
         and m.tipo_movimento<>'ESTORNO') then
    raise exception 'Fechamento com movimento financeiro exige estorno antes de alterar valor ou recebimento.'
      using errcode='P0602';
  elsif tg_table_name='Contas_Pagar'
     and (new.valor_final is distinct from old.valor_final
       or coalesce(new.valor_pago,0)<coalesce(old.valor_pago,0)
       or new.status::text='CANCELADO')
     and exists(select 1 from "RetificaPremium"."Financeiro_Movimentos" m
       where m.fk_contas_pagar=old.id_contas_pagar and m.estornado_em is null
         and m.tipo_movimento<>'ESTORNO') then
    raise exception 'Conta com pagamento exige estorno antes de cancelar ou alterar o valor.'
      using errcode='P0602';
  end if;
  return new;
end $$;

create trigger financeiro_guard_nota_resumo
before update of total,total_servicos,total_produtos,payment_status,valor_recebido,
  pago_em,pago_com,receber_em
on "RetificaPremium"."Notas_de_Servico"
for each row execute function "RetificaPremium".financeiro_guardar_resumo_legado();
create trigger financeiro_guard_fechamento_resumo
before update of valor_total,status_pagamento,valor_recebido,pago_em,pago_com
on "RetificaPremium"."Fechamentos"
for each row execute function "RetificaPremium".financeiro_guardar_resumo_legado();
create trigger financeiro_guard_conta_resumo
before update of valor_original,juros,desconto,valor_final,valor_pago,status,pago_em,pago_com
on "RetificaPremium"."Contas_Pagar"
for each row execute function "RetificaPremium".financeiro_guardar_resumo_legado();
create trigger financeiro_guard_conta_insert_suporte
before insert on "RetificaPremium"."Contas_Pagar"
for each row execute function "RetificaPremium".financeiro_guardar_resumo_legado();

create or replace function "RetificaPremium".financeiro_capturar_resumo_legado()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_owner uuid; v_conta uuid; v_target numeric; v_atual numeric; v_delta numeric;
  v_data timestamptz; v_status text; v_descricao text; v_comp date; v_forma text;
  v_nota uuid; v_fechamento uuid; v_cp uuid; v_cat uuid;
begin
  if current_setting('retiflow.financeiro_internal',true)='on' then return new; end if;
  if tg_table_name='Notas_de_Servico' then
    if new.fk_fechamentos is not null then return new; end if;
    select c.fk_criado_por into v_owner from "RetificaPremium"."Clientes" c where c.id_clientes=new.fk_clientes;
    v_target:=case when new.payment_status='PAGO' then new.total else coalesce(new.valor_recebido,0) end;
    v_data:=case when new.pago_em is null then null else new.pago_em at time zone 'America/Sao_Paulo' end;
    v_descricao:='Compatibilidade - recebimento '||new.os;
    v_comp:=coalesce(new.finalizado_em::date,new.receber_em,new.created_at::date);
    v_forma:=new.pago_com; v_nota:=new.id_notas_servico;
  elsif tg_table_name='Fechamentos' then
    select c.fk_criado_por into v_owner from "RetificaPremium"."Clientes" c where c.id_clientes=new.fk_clientes;
    v_target:=case when new.status_pagamento='PAGO' then new.valor_total else coalesce(new.valor_recebido,0) end;
    v_data:=case when new.pago_em is null then null else new.pago_em at time zone 'America/Sao_Paulo' end;
    v_descricao:='Compatibilidade - fechamento '||coalesce(new.label,new.periodo,new.id_fechamentos::text);
    v_comp:=new.data_fechamento::date; v_forma:=new.pago_com; v_fechamento:=new.id_fechamentos;
  else
    v_owner:=new.fk_criado_por; v_target:=coalesce(new.valor_pago,0);
    v_data:=case when new.pago_em is null then null else new.pago_em at time zone 'America/Sao_Paulo' end;
    v_descricao:='Compatibilidade - pagamento '||new.titulo;
    v_comp:=coalesce(new.data_competencia::date,new.data_vencimento::date);
    v_forma:=new.pago_com::text; v_cp:=new.id_contas_pagar; v_cat:=new.fk_categorias;
  end if;
  select coalesce(sum(case
    when (v_cp is not null and m.direcao='SAIDA') or (v_cp is null and m.direcao='ENTRADA')
      then m.valor else -m.valor end),0)
  into v_atual from "RetificaPremium"."Financeiro_Movimentos" m
  where (m.fk_notas_servico=v_nota or m.fk_fechamentos=v_fechamento or m.fk_contas_pagar=v_cp)
    and m.status in ('CONFIRMADO','ESTIMADO','REVISAR');
  v_delta:=greatest(coalesce(v_target,0)-coalesce(v_atual,0),0);
  if v_delta<=0.004 then return new; end if;
  v_conta:="RetificaPremium".garantir_conta_financeira_padrao(v_owner);
  v_status:=case when v_data is null then 'REVISAR'
    when (v_data at time zone 'America/Sao_Paulo')::date<date '2026-06-01' then 'ESTIMADO'
    else 'CONFIRMADO' end;
  perform set_config('retiflow.financeiro_internal','on',true);
  insert into "RetificaPremium"."Financeiro_Movimentos"(
    fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
    data_competencia,forma_pagamento,descricao,status,impacta_dre,fk_categorias_saidas,
    fk_notas_servico,fk_fechamentos,fk_contas_pagar,chave_idempotencia,metadata
  ) values(v_owner,v_conta,case when v_cp is null then 'ENTRADA' else 'SAIDA' end,
    case when v_nota is not null then 'RECEBIMENTO_OS'
      when v_fechamento is not null then 'RECEBIMENTO_FECHAMENTO' else 'PAGAMENTO_CONTA' end,
    v_delta,v_data,v_comp,v_forma,v_descricao,v_status,false,v_cat,v_nota,v_fechamento,v_cp,
    'compat:'||tg_table_name||':'||coalesce(v_nota,v_fechamento,v_cp)::text||':'||v_target::text,
    jsonb_build_object('compatibilidade_legado',true))
  on conflict do nothing;
  perform "RetificaPremium".financeiro_recalcular_origem(v_nota,v_fechamento,v_cp,null);
  return new;
end $$;

create trigger financeiro_capture_nota_resumo
after update of payment_status,valor_recebido,pago_em,pago_com on "RetificaPremium"."Notas_de_Servico"
for each row execute function "RetificaPremium".financeiro_capturar_resumo_legado();
create trigger financeiro_capture_fechamento_resumo
after update of status_pagamento,valor_recebido,pago_em,pago_com on "RetificaPremium"."Fechamentos"
for each row execute function "RetificaPremium".financeiro_capturar_resumo_legado();
create trigger financeiro_capture_conta_resumo
after update of status,valor_pago,pago_em,pago_com on "RetificaPremium"."Contas_Pagar"
for each row execute function "RetificaPremium".financeiro_capturar_resumo_legado();

create or replace function "RetificaPremium".financeiro_bloquear_delete_conta_paga()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if coalesce(old.valor_pago,0)>0 or exists(
    select 1 from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_contas_pagar=old.id_contas_pagar
  ) then
    raise exception 'Conta com histórico financeiro não pode ser excluída; use estorno.'
      using errcode='P0602';
  end if;
  return old;
end $$;
create trigger financeiro_guard_delete_conta
before delete on "RetificaPremium"."Contas_Pagar"
for each row execute function "RetificaPremium".financeiro_bloquear_delete_conta_paga();

create or replace function "RetificaPremium".registrar_pagamento_contexto_suporte(
  p_id_contas_pagar uuid,p_valor_pago numeric,p_pago_com text default null,
  p_observacoes_pagamento text default null,p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json language sql security definer set search_path=''
as $$ select json_build_object('status',403,'code','support_read_only',
  'mensagem','Modo suporte pode consultar o Financeiro, mas nao movimentar dinheiro.') $$;
revoke execute on function
  "RetificaPremium".registrar_pagamento_contexto_suporte(uuid,numeric,text,text,uuid,uuid)
  from public,anon;
grant execute on function
  "RetificaPremium".registrar_pagamento_contexto_suporte(uuid,numeric,text,text,uuid,uuid)
  to authenticated,service_role;

-- A edição operacional em suporte continua disponível, mas campos financeiros
-- são rejeitados. Sem esta barreira, a RPC legada poderia marcar a O.S. como
-- paga e o trigger de compatibilidade criaria uma entrada real no razão.
do $$
begin
  if to_regprocedure('"RetificaPremium".update_nota_servico_contexto_suporte_pre_financeiro(jsonb,uuid,uuid)') is null then
    alter function "RetificaPremium".update_nota_servico_contexto_suporte(jsonb,uuid,uuid)
      rename to update_nota_servico_contexto_suporte_pre_financeiro;
  end if;
end $$;

revoke execute on function
  "RetificaPremium".update_nota_servico_contexto_suporte_pre_financeiro(jsonb,uuid,uuid)
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".update_nota_servico_contexto_suporte_pre_financeiro(jsonb,uuid,uuid)
  to service_role;

create or replace function "RetificaPremium".update_nota_servico_contexto_suporte(
  p_payload jsonb,p_contexto_usuario_id uuid,p_sessao_suporte uuid
)
returns json language plpgsql security definer set search_path=''
as $$
begin
  if p_payload ?| array[
    'total','total_servicos','total_produtos','payment_status',
    'valor_recebido','pago_em','pago_com','receber_em'
  ] then
    return json_build_object(
      'status',403,
      'code','support_financial_read_only',
      'mensagem','Modo suporte pode editar a O.S., mas nao movimentar ou alterar dados financeiros.'
    );
  end if;

  return "RetificaPremium".update_nota_servico_contexto_suporte_pre_financeiro(
    p_payload,p_contexto_usuario_id,p_sessao_suporte
  );
end $$;

revoke execute on function
  "RetificaPremium".update_nota_servico_contexto_suporte(jsonb,uuid,uuid)
  from public,anon;
grant execute on function
  "RetificaPremium".update_nota_servico_contexto_suporte(jsonb,uuid,uuid)
  to authenticated,service_role;

create or replace function "RetificaPremium".financeiro_gerar_recorrencias_todos()
returns void language plpgsql security definer set search_path=''
as $$
declare r record; v_ate date:=(now() at time zone 'America/Sao_Paulo')::date+90;
begin
  for r in
    select distinct m.fk_criado_por
    from "RetificaPremium"."Financeiro_Modelos_Recorrentes" m
    join "RetificaPremium"."Modulos" md on md.fk_usuarios=m.fk_criado_por
    join "RetificaPremium"."Usuarios" u on u.id_usuarios=m.fk_criado_por
    where m.ativo and md.contas_a_pagar and u.status
  loop
    perform "RetificaPremium".financeiro_gerar_recorrencias_usuario(r.fk_criado_por,v_ate);
  end loop;
end $$;

do $$
declare v_job bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into v_job from cron.job where jobname='retiflow-financeiro-recorrencias';
    if v_job is not null then perform cron.unschedule(v_job); end if;
    perform cron.schedule('retiflow-financeiro-recorrencias','30 3 * * *',
      $cron$select "RetificaPremium".financeiro_gerar_recorrencias_todos();$cron$);
  end if;
end $$;

revoke execute on function
  "RetificaPremium".financeiro_guardar_resumo_legado(),
  "RetificaPremium".financeiro_capturar_resumo_legado(),
  "RetificaPremium".financeiro_bloquear_delete_conta_paga(),
  "RetificaPremium".financeiro_gerar_recorrencias_todos()
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".financeiro_guardar_resumo_legado(),
  "RetificaPremium".financeiro_capturar_resumo_legado(),
  "RetificaPremium".financeiro_bloquear_delete_conta_paga(),
  "RetificaPremium".financeiro_gerar_recorrencias_todos()
  to service_role;

-- ---------------------------------------------------------------------------
-- Contratos legados enriquecidos: PARCIAL sobrevive a refresh.
-- A implementação anterior é preservada com sufixo _pre_financeiro.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('"RetificaPremium".get_notas_servico_pre_financeiro(uuid,smallint,text,integer,integer,date,date,boolean,text,text)') is null then
    alter function "RetificaPremium".get_notas_servico(uuid,smallint,text,integer,integer,date,date,boolean,text,text)
      rename to get_notas_servico_pre_financeiro;
  end if;
  if to_regprocedure('"RetificaPremium".get_notas_servico_contexto_suporte_pre_financeiro(uuid,smallint,text,integer,integer,date,date,text,text,uuid,uuid)') is null then
    alter function "RetificaPremium".get_notas_servico_contexto_suporte(uuid,smallint,text,integer,integer,date,date,text,text,uuid,uuid)
      rename to get_notas_servico_contexto_suporte_pre_financeiro;
  end if;
  if to_regprocedure('"RetificaPremium".get_nota_servico_detalhes_pre_financeiro(uuid)') is null then
    alter function "RetificaPremium".get_nota_servico_detalhes(uuid)
      rename to get_nota_servico_detalhes_pre_financeiro;
  end if;
  if to_regprocedure('"RetificaPremium".get_nota_servico_detalhes_contexto_suporte_pre_financeiro(uuid,uuid,uuid)') is null then
    alter function "RetificaPremium".get_nota_servico_detalhes_contexto_suporte(uuid,uuid,uuid)
      rename to get_nota_servico_detalhes_contexto_suporte_pre_financeiro;
  end if;
  if to_regprocedure('"RetificaPremium".get_fechamentos_pre_financeiro(uuid,text,integer,integer)') is null then
    alter function "RetificaPremium".get_fechamentos(uuid,text,integer,integer)
      rename to get_fechamentos_pre_financeiro;
  end if;
  if to_regprocedure('"RetificaPremium".get_fechamentos_contexto_suporte_pre_financeiro(uuid,text,integer,integer,uuid,uuid)') is null then
    alter function "RetificaPremium".get_fechamentos_contexto_suporte(uuid,text,integer,integer,uuid,uuid)
      rename to get_fechamentos_contexto_suporte_pre_financeiro;
  end if;
end $$;

revoke execute on function
  "RetificaPremium".get_notas_servico_pre_financeiro(uuid,smallint,text,integer,integer,date,date,boolean,text,text),
  "RetificaPremium".get_notas_servico_contexto_suporte_pre_financeiro(uuid,smallint,text,integer,integer,date,date,text,text,uuid,uuid),
  "RetificaPremium".get_nota_servico_detalhes_pre_financeiro(uuid),
  "RetificaPremium".get_nota_servico_detalhes_contexto_suporte_pre_financeiro(uuid,uuid,uuid),
  "RetificaPremium".get_fechamentos_pre_financeiro(uuid,text,integer,integer),
  "RetificaPremium".get_fechamentos_contexto_suporte_pre_financeiro(uuid,text,integer,integer,uuid,uuid)
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".get_notas_servico_pre_financeiro(uuid,smallint,text,integer,integer,date,date,boolean,text,text),
  "RetificaPremium".get_notas_servico_contexto_suporte_pre_financeiro(uuid,smallint,text,integer,integer,date,date,text,text,uuid,uuid),
  "RetificaPremium".get_nota_servico_detalhes_pre_financeiro(uuid),
  "RetificaPremium".get_nota_servico_detalhes_contexto_suporte_pre_financeiro(uuid,uuid,uuid),
  "RetificaPremium".get_fechamentos_pre_financeiro(uuid,text,integer,integer),
  "RetificaPremium".get_fechamentos_contexto_suporte_pre_financeiro(uuid,text,integer,integer,uuid,uuid)
  to service_role;

create or replace function "RetificaPremium".financeiro_enriquecer_notas(p_result json)
returns json language sql stable security definer set search_path=''
as $$
  select jsonb_set(coalesce(p_result,'{}'::json)::jsonb,'{dados}',
    coalesce((select jsonb_agg(e.item||jsonb_build_object(
      'payment_status',n.payment_status,'valor_recebido',coalesce(n.valor_recebido,0),
      'pago_em',n.pago_em,'pago_com',n.pago_com,'contato_nome',n.contato_nome,
      'contato_telefone',n.contato_telefone,'receber_em',n.receber_em))
      from jsonb_array_elements(coalesce(p_result::jsonb->'dados','[]'::jsonb)) e(item)
      join "RetificaPremium"."Notas_de_Servico" n
        on n.id_notas_servico=(coalesce(e.item->>'id_notas_servico',e.item->>'id'))::uuid),
    '[]'::jsonb))::json
$$;

create or replace function "RetificaPremium".financeiro_enriquecer_nota_detalhe(p_result json)
returns json language sql stable security definer set search_path=''
as $$
  select jsonb_set(coalesce(p_result,'{}'::json)::jsonb,'{cabecalho}',
    coalesce((select d.item||jsonb_build_object(
      'payment_status',n.payment_status,'valor_recebido',coalesce(n.valor_recebido,0),
      'pago_em',n.pago_em,'pago_com',n.pago_com,'contato_nome',n.contato_nome,
      'contato_telefone',n.contato_telefone,'receber_em',n.receber_em)
      from (select coalesce(p_result::jsonb->'cabecalho','{}'::jsonb) item) d
      join "RetificaPremium"."Notas_de_Servico" n
        on n.id_notas_servico=(coalesce(d.item->>'id_nota',d.item->>'id_notas_servico',d.item->>'id'))::uuid),
    coalesce(p_result::jsonb->'cabecalho','{}'::jsonb)))::json
$$;

create or replace function "RetificaPremium".financeiro_enriquecer_fechamentos(p_result json)
returns json language sql stable security definer set search_path=''
as $$
  select jsonb_set(coalesce(p_result,'{}'::json)::jsonb,'{dados}',
    coalesce((select jsonb_agg(e.item||jsonb_build_object(
      'status_pagamento',f.status_pagamento,'valor_recebido',coalesce(f.valor_recebido,0),
      'pago_em',f.pago_em,'pago_com',f.pago_com,'vencimento_em',f.vencimento_em))
      from jsonb_array_elements(coalesce(p_result::jsonb->'dados','[]'::jsonb)) e(item)
      join "RetificaPremium"."Fechamentos" f
        on f.id_fechamentos=(coalesce(e.item->>'id_fechamentos',e.item->>'id'))::uuid),
    '[]'::jsonb))::json
$$;

create or replace function "RetificaPremium".get_notas_servico(
  p_fk_clientes uuid default null,p_fk_status smallint default null,p_busca text default null,
  p_limite integer default 100,p_offset integer default 0,p_data_inicio date default null,
  p_data_fim date default null,p_apenas_sem_fechamento boolean default false,
  p_ordem_campo text default 'cadastro',p_ordem_direcao text default 'desc')
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_enriquecer_notas(
  "RetificaPremium".get_notas_servico_pre_financeiro(p_fk_clientes,p_fk_status,p_busca,p_limite,
    p_offset,p_data_inicio,p_data_fim,p_apenas_sem_fechamento,p_ordem_campo,p_ordem_direcao)) $$;

create or replace function "RetificaPremium".get_notas_servico_contexto_suporte(
  p_fk_clientes uuid default null,p_fk_status smallint default null,p_busca text default null,
  p_limite integer default 100,p_offset integer default 0,p_data_inicio date default null,
  p_data_fim date default null,p_ordem_campo text default 'cadastro',
  p_ordem_direcao text default 'desc',p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_enriquecer_notas(
  "RetificaPremium".get_notas_servico_contexto_suporte_pre_financeiro(
    p_fk_clientes,p_fk_status,p_busca,p_limite,p_offset,p_data_inicio,p_data_fim,
    p_ordem_campo,p_ordem_direcao,p_contexto_usuario_id,p_sessao_suporte)) $$;

create or replace function "RetificaPremium".get_nota_servico_detalhes(p_id_nota_servico uuid)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_enriquecer_nota_detalhe(
  "RetificaPremium".get_nota_servico_detalhes_pre_financeiro(p_id_nota_servico)) $$;
create or replace function "RetificaPremium".get_nota_servico_detalhes_contexto_suporte(
  p_id_nota_servico uuid,p_contexto_usuario_id uuid default null,p_sessao_suporte uuid default null)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_enriquecer_nota_detalhe(
  "RetificaPremium".get_nota_servico_detalhes_contexto_suporte_pre_financeiro(
    p_id_nota_servico,p_contexto_usuario_id,p_sessao_suporte)) $$;

create or replace function "RetificaPremium".get_fechamentos(
  p_fk_clientes uuid default null,p_periodo text default null,p_limite integer default 50,p_offset integer default 0)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_enriquecer_fechamentos(
  "RetificaPremium".get_fechamentos_pre_financeiro(p_fk_clientes,p_periodo,p_limite,p_offset)) $$;
create or replace function "RetificaPremium".get_fechamentos_contexto_suporte(
  p_fk_clientes uuid default null,p_periodo text default null,p_limite integer default 50,p_offset integer default 0,
  p_contexto_usuario_id uuid default null,p_sessao_suporte uuid default null)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_enriquecer_fechamentos(
  "RetificaPremium".get_fechamentos_contexto_suporte_pre_financeiro(
    p_fk_clientes,p_periodo,p_limite,p_offset,p_contexto_usuario_id,p_sessao_suporte)) $$;

revoke execute on function
  "RetificaPremium".financeiro_enriquecer_notas(json),
  "RetificaPremium".financeiro_enriquecer_nota_detalhe(json),
  "RetificaPremium".financeiro_enriquecer_fechamentos(json)
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".financeiro_enriquecer_notas(json),
  "RetificaPremium".financeiro_enriquecer_nota_detalhe(json),
  "RetificaPremium".financeiro_enriquecer_fechamentos(json)
  to service_role;
revoke execute on function
  "RetificaPremium".get_notas_servico(uuid,smallint,text,integer,integer,date,date,boolean,text,text),
  "RetificaPremium".get_notas_servico_contexto_suporte(uuid,smallint,text,integer,integer,date,date,text,text,uuid,uuid),
  "RetificaPremium".get_nota_servico_detalhes(uuid),
  "RetificaPremium".get_nota_servico_detalhes_contexto_suporte(uuid,uuid,uuid),
  "RetificaPremium".get_fechamentos(uuid,text,integer,integer),
  "RetificaPremium".get_fechamentos_contexto_suporte(uuid,text,integer,integer,uuid,uuid)
  from public,anon;
grant execute on function
  "RetificaPremium".get_notas_servico(uuid,smallint,text,integer,integer,date,date,boolean,text,text),
  "RetificaPremium".get_notas_servico_contexto_suporte(uuid,smallint,text,integer,integer,date,date,text,text,uuid,uuid),
  "RetificaPremium".get_nota_servico_detalhes(uuid),
  "RetificaPremium".get_nota_servico_detalhes_contexto_suporte(uuid,uuid,uuid),
  "RetificaPremium".get_fechamentos(uuid,text,integer,integer),
  "RetificaPremium".get_fechamentos_contexto_suporte(uuid,text,integer,integer,uuid,uuid)
  to authenticated,service_role;

-- ROLLBACK: desagendar cron, remover triggers e wrappers, renomear as funções
-- *_pre_financeiro para os nomes originais. Nunca apagar o razão/backfill sem
-- exportação e reconciliação; os estornos são parte do histórico imutável.
