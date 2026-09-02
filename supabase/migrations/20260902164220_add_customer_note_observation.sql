-- Observacao publica e especifica por O.S.
-- A coluna existente `observacoes` continua sendo exclusivamente interna.
alter table "RetificaPremium"."Notas_de_Servico"
  add column if not exists observacao_cliente text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'notas_servico_observacao_cliente_tamanho'
       and conrelid = '"RetificaPremium"."Notas_de_Servico"'::regclass
  ) then
    alter table "RetificaPremium"."Notas_de_Servico"
      add constraint notas_servico_observacao_cliente_tamanho
      check (observacao_cliente is null or char_length(observacao_cliente) <= 700);
  end if;
end;
$$;

comment on column "RetificaPremium"."Notas_de_Servico".observacao_cliente is
  'Observacao publica especifica da O.S.; aparece no documento do cliente. Nao confundir com observacoes, que e interna.';

-- Preserva integralmente as RPCs atuais. Os wrappers so retiram o novo campo
-- antes de delegar e o persistem quando a operacao original foi autorizada.
do $$
begin
  if to_regprocedure('"RetificaPremium".nova_nota_pre_observacao_cliente(jsonb)') is null then
    alter function "RetificaPremium".nova_nota(jsonb)
      rename to nova_nota_pre_observacao_cliente;
  end if;
  if to_regprocedure('"RetificaPremium".nova_nota_contexto_suporte_pre_observacao_cliente(jsonb,uuid,uuid)') is null then
    alter function "RetificaPremium".nova_nota_contexto_suporte(jsonb,uuid,uuid)
      rename to nova_nota_contexto_suporte_pre_observacao_cliente;
  end if;
  if to_regprocedure('"RetificaPremium".update_nota_servico_pre_observacao_cliente(jsonb)') is null then
    alter function "RetificaPremium".update_nota_servico(jsonb)
      rename to update_nota_servico_pre_observacao_cliente;
  end if;
  if to_regprocedure('"RetificaPremium".update_nota_servico_contexto_suporte_pre_observacao_cliente(jsonb,uuid,uuid)') is null then
    alter function "RetificaPremium".update_nota_servico_contexto_suporte(jsonb,uuid,uuid)
      rename to update_nota_servico_contexto_suporte_pre_observacao_cliente;
  end if;
end;
$$;

revoke execute on function
  "RetificaPremium".nova_nota_pre_observacao_cliente(jsonb),
  "RetificaPremium".nova_nota_contexto_suporte_pre_observacao_cliente(jsonb,uuid,uuid),
  "RetificaPremium".update_nota_servico_pre_observacao_cliente(jsonb),
  "RetificaPremium".update_nota_servico_contexto_suporte_pre_observacao_cliente(jsonb,uuid,uuid)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".nova_nota_pre_observacao_cliente(jsonb),
  "RetificaPremium".nova_nota_contexto_suporte_pre_observacao_cliente(jsonb,uuid,uuid),
  "RetificaPremium".update_nota_servico_pre_observacao_cliente(jsonb),
  "RetificaPremium".update_nota_servico_contexto_suporte_pre_observacao_cliente(jsonb,uuid,uuid)
  to service_role;

create or replace function "RetificaPremium".nova_nota(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado json;
begin
  if char_length(coalesce(p_payload->>'observacao_cliente', '')) > 700 then
    return json_build_object('status', 400, 'code', 'invalid_customer_observation',
      'mensagem', 'A observacao para o cliente deve ter no maximo 700 caracteres.');
  end if;

  v_resultado := "RetificaPremium".nova_nota_pre_observacao_cliente(
    p_payload - 'observacao_cliente'
  );

  if coalesce((v_resultado->>'status')::integer, 500) = 200
     and v_resultado->>'tipo_nota' = 'Serviço'
     and p_payload ? 'observacao_cliente' then
    update "RetificaPremium"."Notas_de_Servico"
       set observacao_cliente = nullif(btrim(p_payload->>'observacao_cliente'), '')
     where id_notas_servico = (v_resultado->>'id_nota')::uuid;
  end if;

  return v_resultado;
end;
$$;

create or replace function "RetificaPremium".nova_nota_contexto_suporte(
  p_payload jsonb,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado json;
begin
  if char_length(coalesce(p_payload->>'observacao_cliente', '')) > 700 then
    return json_build_object('status', 400, 'code', 'invalid_customer_observation',
      'mensagem', 'A observacao para o cliente deve ter no maximo 700 caracteres.');
  end if;

  v_resultado := "RetificaPremium".nova_nota_contexto_suporte_pre_observacao_cliente(
    p_payload - 'observacao_cliente', p_contexto_usuario_id, p_sessao_suporte
  );

  if coalesce((v_resultado->>'status')::integer, 500) = 200
     and v_resultado->>'tipo_nota' = 'Serviço'
     and p_payload ? 'observacao_cliente' then
    update "RetificaPremium"."Notas_de_Servico"
       set observacao_cliente = nullif(btrim(p_payload->>'observacao_cliente'), '')
     where id_notas_servico = (v_resultado->>'id_nota')::uuid;
  end if;

  return v_resultado;
end;
$$;

create or replace function "RetificaPremium".update_nota_servico(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado json;
begin
  if char_length(coalesce(p_payload->>'observacao_cliente', '')) > 700 then
    return json_build_object('status', 400, 'code', 'invalid_customer_observation',
      'mensagem', 'A observacao para o cliente deve ter no maximo 700 caracteres.');
  end if;

  v_resultado := "RetificaPremium".update_nota_servico_pre_observacao_cliente(
    p_payload - 'observacao_cliente'
  );

  if coalesce((v_resultado->>'status')::integer, 500) = 200
     and p_payload ? 'observacao_cliente' then
    update "RetificaPremium"."Notas_de_Servico"
       set observacao_cliente = nullif(btrim(p_payload->>'observacao_cliente'), '')
     where id_notas_servico = nullif(p_payload->>'id_notas_servico', '')::uuid;
  end if;

  return v_resultado;
end;
$$;

create or replace function "RetificaPremium".update_nota_servico_contexto_suporte(
  p_payload jsonb,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado json;
begin
  if char_length(coalesce(p_payload->>'observacao_cliente', '')) > 700 then
    return json_build_object('status', 400, 'code', 'invalid_customer_observation',
      'mensagem', 'A observacao para o cliente deve ter no maximo 700 caracteres.');
  end if;

  v_resultado := "RetificaPremium".update_nota_servico_contexto_suporte_pre_observacao_cliente(
    p_payload - 'observacao_cliente', p_contexto_usuario_id, p_sessao_suporte
  );

  if coalesce((v_resultado->>'status')::integer, 500) = 200
     and p_payload ? 'observacao_cliente' then
    update "RetificaPremium"."Notas_de_Servico"
       set observacao_cliente = nullif(btrim(p_payload->>'observacao_cliente'), '')
     where id_notas_servico = nullif(p_payload->>'id_notas_servico', '')::uuid;
  end if;

  return v_resultado;
end;
$$;

revoke execute on function
  "RetificaPremium".nova_nota(jsonb),
  "RetificaPremium".nova_nota_contexto_suporte(jsonb,uuid,uuid),
  "RetificaPremium".update_nota_servico(jsonb),
  "RetificaPremium".update_nota_servico_contexto_suporte(jsonb,uuid,uuid)
  from public, anon;
grant execute on function
  "RetificaPremium".nova_nota(jsonb),
  "RetificaPremium".nova_nota_contexto_suporte(jsonb,uuid,uuid),
  "RetificaPremium".update_nota_servico(jsonb),
  "RetificaPremium".update_nota_servico_contexto_suporte(jsonb,uuid,uuid)
  to authenticated, service_role;

-- As leituras atuais passam por estes dois enriquecedores. Assim as variantes
-- normal e de suporte recebem o novo campo sem duplicar os contratos legados.
create or replace function "RetificaPremium".financeiro_enriquecer_notas(p_result json)
returns json language sql stable security definer set search_path=''
as $$
  select jsonb_set(coalesce(p_result,'{}'::json)::jsonb,'{dados}',
    coalesce((select jsonb_agg(e.item||jsonb_build_object(
      'payment_status',n.payment_status,'valor_recebido',coalesce(n.valor_recebido,0),
      'pago_em',n.pago_em,'pago_com',n.pago_com,'contato_nome',n.contato_nome,
      'contato_telefone',n.contato_telefone,'receber_em',n.receber_em,
      'observacao_cliente',n.observacao_cliente))
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
      'contato_telefone',n.contato_telefone,'receber_em',n.receber_em,
      'observacao_cliente',n.observacao_cliente)
      from (select coalesce(p_result::jsonb->'cabecalho','{}'::jsonb) item) d
      join "RetificaPremium"."Notas_de_Servico" n
        on n.id_notas_servico=(coalesce(d.item->>'id_nota',d.item->>'id_notas_servico',d.item->>'id'))::uuid),
    coalesce(p_result::jsonb->'cabecalho','{}'::jsonb)))::json
$$;

revoke execute on function
  "RetificaPremium".financeiro_enriquecer_notas(json),
  "RetificaPremium".financeiro_enriquecer_nota_detalhe(json)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".financeiro_enriquecer_notas(json),
  "RetificaPremium".financeiro_enriquecer_nota_detalhe(json)
  to service_role;

notify pgrst, 'reload schema';

-- ROLLBACK:
-- 1. Remover as quatro RPCs wrapper acima.
-- 2. Renomear as funcoes *_pre_observacao_cliente para os nomes originais.
-- 3. Restaurar os enriquecedores da migration 20260730212808.
-- 4. Somente apos exportar qualquer texto digitado, remover observacao_cliente.
