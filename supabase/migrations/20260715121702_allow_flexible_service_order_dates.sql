-- Allow operational users to register service orders for past months and use
-- deadlines longer than the former 10-day window.
--
-- Safety rules kept in both regular and support contexts:
--   * the entry date cannot be in the future;
--   * the deadline cannot be before the entry date;
--   * notes already linked to a closing remain immutable.
--
-- The RPCs are already long and have tenant/security fixes accumulated across
-- multiple migrations. To avoid copying stale versions of those bodies, this
-- migration performs guarded, exact replacements on the current definitions.
-- Every expected fragment is asserted before CREATE OR REPLACE runs, so schema
-- drift fails the migration instead of silently producing a partial contract.

do $migration$
declare
  v_definition text;
begin
  -- Regular creation RPC -----------------------------------------------------
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'nova_nota'
     and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if strpos(v_definition, $old$
  v_parent_nota_servico uuid;
  v_base_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prazo timestamp;
$old$) = 0 then
    raise exception 'nova_nota: bloco de declaracao de datas nao encontrado';
  end if;
  v_definition := replace(v_definition, $old$
  v_parent_nota_servico uuid;
  v_base_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prazo timestamp;
$old$, $new$
  v_parent_nota_servico uuid;
  v_base_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_entry_date date;
  v_created_at timestamp;
  v_prazo timestamp;
$new$);

  if strpos(v_definition, $old$
  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');
  v_prazo := coalesce(nullif(p_payload->>'prazo', '')::timestamp, (v_base_date + 5)::timestamp);

  if v_prazo::date < v_base_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;

  if v_prazo::date > v_base_date + 10 then
    raise exception 'O prazo da O.S. deve ficar em até 10 dias da data de entrada.' using errcode = 'P3001';
  end if;
$old$) = 0 then
    raise exception 'nova_nota: validacao antiga de prazo nao encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');
  v_prazo := coalesce(nullif(p_payload->>'prazo', '')::timestamp, (v_base_date + 5)::timestamp);

  if v_prazo::date < v_base_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;

  if v_prazo::date > v_base_date + 10 then
    raise exception 'O prazo da O.S. deve ficar em até 10 dias da data de entrada.' using errcode = 'P3001';
  end if;
$old$, $new$
  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');
  v_entry_date := coalesce(
    nullif(btrim(p_payload->>'data_entrada'), '')::date,
    v_base_date
  );

  if v_entry_date > v_base_date then
    raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
  end if;

  -- Preserve a useful time component for ordering notes created on the same day.
  v_created_at := v_entry_date::timestamp
    + (now() at time zone 'America/Sao_Paulo')::time;
  v_prazo := coalesce(
    nullif(p_payload->>'prazo', '')::timestamp,
    (v_entry_date + 5)::timestamp
  );

  if v_prazo::date < v_entry_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$new$);

  if strpos(v_definition, E'    os,\n    prazo,') = 0
     or strpos(v_definition, E'    v_numero,\n    v_prazo,') = 0 then
    raise exception 'nova_nota: insert de O.S. nao encontrado';
  end if;
  v_definition := replace(
    v_definition,
    E'    os,\n    prazo,',
    E'    os,\n    created_at,\n    prazo,'
  );
  v_definition := replace(
    v_definition,
    E'    v_numero,\n    v_prazo,',
    E'    v_numero,\n    v_created_at,\n    v_prazo,'
  );

  execute v_definition;

  -- Regular update RPC -------------------------------------------------------
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'update_nota_servico'
     and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if strpos(v_definition, $old$
  v_current_placa text;
  v_created_at timestamp;
  v_cliente_id uuid;
  v_prazo timestamp;
  v_finalizado_em timestamp;
$old$) = 0 then
    raise exception 'update_nota_servico: bloco de declaracao de datas nao encontrado';
  end if;
  v_definition := replace(v_definition, $old$
  v_current_placa text;
  v_created_at timestamp;
  v_cliente_id uuid;
  v_prazo timestamp;
  v_finalizado_em timestamp;
$old$, $new$
  v_current_placa text;
  v_created_at timestamp;
  v_new_created_at timestamp;
  v_existing_prazo timestamp;
  v_existing_finalizado_em timestamp;
  v_cliente_id uuid;
  v_prazo timestamp;
  v_finalizado_em timestamp;
$new$);

  if strpos(v_definition, $old$
  select ns.fk_veiculos, v.placa, ns.created_at
    into v_current_veiculo_id, v_current_placa, v_created_at
$old$) = 0 then
    raise exception 'update_nota_servico: leitura das datas atuais nao encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  select ns.fk_veiculos, v.placa, ns.created_at
    into v_current_veiculo_id, v_current_placa, v_created_at
$old$, $new$
  select ns.fk_veiculos, v.placa, ns.created_at, ns.prazo, ns.finalizado_em
    into v_current_veiculo_id, v_current_placa, v_created_at, v_existing_prazo, v_existing_finalizado_em
$new$);

  if strpos(v_definition, $old$
  if p_payload ? 'prazo' then
    v_prazo := nullif(p_payload->>'prazo', '')::timestamp;

    if v_prazo is not null and v_prazo::date < v_created_at::date then
      raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
    end if;

    if v_prazo is not null and v_prazo::date > v_created_at::date + 10 then
      raise exception 'O prazo da O.S. deve ficar em até 10 dias da data de entrada.' using errcode = 'P3001';
    end if;
  end if;

  if p_payload ? 'finalizado_em' then
    v_finalizado_em := nullif(p_payload->>'finalizado_em', '')::timestamp;

    if v_finalizado_em is not null and v_finalizado_em::date < v_created_at::date then
      raise exception 'A data de entrega não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
    end if;
  end if;
$old$) = 0 then
    raise exception 'update_nota_servico: validacao antiga de datas nao encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  if p_payload ? 'prazo' then
    v_prazo := nullif(p_payload->>'prazo', '')::timestamp;

    if v_prazo is not null and v_prazo::date < v_created_at::date then
      raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
    end if;

    if v_prazo is not null and v_prazo::date > v_created_at::date + 10 then
      raise exception 'O prazo da O.S. deve ficar em até 10 dias da data de entrada.' using errcode = 'P3001';
    end if;
  end if;

  if p_payload ? 'finalizado_em' then
    v_finalizado_em := nullif(p_payload->>'finalizado_em', '')::timestamp;

    if v_finalizado_em is not null and v_finalizado_em::date < v_created_at::date then
      raise exception 'A data de entrega não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
    end if;
  end if;
$old$, $new$
  v_new_created_at := v_created_at;
  if p_payload ? 'data_entrada' then
    if nullif(btrim(p_payload->>'data_entrada'), '') is null then
      raise exception 'A data de entrada da O.S. é obrigatória.' using errcode = 'P3001';
    end if;

    v_new_created_at := nullif(btrim(p_payload->>'data_entrada'), '')::date::timestamp
      + v_created_at::time;

    if v_new_created_at::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
    end if;
  end if;

  v_prazo := case
    when p_payload ? 'prazo' then nullif(p_payload->>'prazo', '')::timestamp
    else v_existing_prazo
  end;

  if v_prazo is not null and v_prazo::date < v_new_created_at::date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;

  v_finalizado_em := case
    when p_payload ? 'finalizado_em' then nullif(p_payload->>'finalizado_em', '')::timestamp
    else v_existing_finalizado_em
  end;

  if v_finalizado_em is not null and v_finalizado_em::date < v_new_created_at::date then
    raise exception 'A data de entrega não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$new$);

  if strpos(
    v_definition,
    E'  update "RetificaPremium"."Notas_de_Servico"\n     set defeito = case when p_payload ? ''defeito'' then'
  ) = 0 then
    raise exception 'update_nota_servico: update principal nao encontrado';
  end if;
  v_definition := replace(
    v_definition,
    E'  update "RetificaPremium"."Notas_de_Servico"\n     set defeito = case when p_payload ? ''defeito'' then',
    E'  update "RetificaPremium"."Notas_de_Servico"\n     set created_at = case when p_payload ? ''data_entrada'' then v_new_created_at else created_at end,\n         defeito = case when p_payload ? ''defeito'' then'
  );

  execute v_definition;

  -- Support creation RPC -----------------------------------------------------
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'nova_nota_contexto_suporte';

  if strpos(v_definition, $old$
  v_parent_nota_servico uuid;
  v_contato_nome text;
  v_veiculo jsonb;
$old$) = 0 then
    raise exception 'nova_nota_contexto_suporte: bloco de declaracao nao encontrado';
  end if;
  v_definition := replace(v_definition, $old$
  v_parent_nota_servico uuid;
  v_contato_nome text;
  v_veiculo jsonb;
$old$, $new$
  v_parent_nota_servico uuid;
  v_contato_nome text;
  v_base_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_entry_date date;
  v_created_at timestamp;
  v_prazo timestamp;
  v_veiculo jsonb;
$new$);

  if strpos(v_definition, $old$
  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');

  if v_cliente_id is null then
$old$) = 0 then
    raise exception 'nova_nota_contexto_suporte: inicio da validacao da O.S. nao encontrado';
  end if;
  v_definition := replace(v_definition, $old$
  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');

  if v_cliente_id is null then
$old$, $new$
  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');
  v_entry_date := coalesce(
    nullif(btrim(p_payload->>'data_entrada'), '')::date,
    v_base_date
  );

  if v_entry_date > v_base_date then
    raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
  end if;

  v_created_at := v_entry_date::timestamp
    + (now() at time zone 'America/Sao_Paulo')::time;
  v_prazo := coalesce(
    nullif(p_payload->>'prazo', '')::timestamp,
    (v_entry_date + 5)::timestamp
  );

  if v_prazo::date < v_entry_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;

  if v_cliente_id is null then
$new$);

  if strpos(v_definition, E'    os,\n    prazo,') = 0
     or strpos(v_definition, $old$
    v_numero,
    coalesce(nullif(p_payload->>'prazo', '')::timestamp, now() + interval '30 days'),
$old$) = 0 then
    raise exception 'nova_nota_contexto_suporte: insert de O.S. nao encontrado';
  end if;
  v_definition := replace(
    v_definition,
    E'    os,\n    prazo,',
    E'    os,\n    created_at,\n    prazo,'
  );
  v_definition := replace(v_definition, $old$
    v_numero,
    coalesce(nullif(p_payload->>'prazo', '')::timestamp, now() + interval '30 days'),
$old$, $new$
    v_numero,
    v_created_at,
    v_prazo,
$new$);

  execute v_definition;

  -- Support update RPC -------------------------------------------------------
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'update_nota_servico_contexto_suporte';

  if strpos(v_definition, $old$
  v_current_placa text;
  v_cliente_id uuid;
$old$) = 0 then
    raise exception 'update_nota_servico_contexto_suporte: bloco de declaracao nao encontrado';
  end if;
  v_definition := replace(v_definition, $old$
  v_current_placa text;
  v_cliente_id uuid;
$old$, $new$
  v_current_placa text;
  v_created_at timestamp;
  v_new_created_at timestamp;
  v_existing_prazo timestamp;
  v_prazo timestamp;
  v_cliente_id uuid;
$new$);

  if strpos(v_definition, $old$
  select ns.fk_veiculos, v.placa
    into v_current_veiculo_id, v_current_placa
$old$) = 0 then
    raise exception 'update_nota_servico_contexto_suporte: leitura da O.S. nao encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  select ns.fk_veiculos, v.placa
    into v_current_veiculo_id, v_current_placa
$old$, $new$
  select ns.fk_veiculos, v.placa, ns.created_at, ns.prazo
    into v_current_veiculo_id, v_current_placa, v_created_at, v_existing_prazo
$new$);

  if strpos(
    v_definition,
    E'  update "RetificaPremium"."Notas_de_Servico"\n     set defeito = case when p_payload ? ''defeito'' then'
  ) = 0 then
    raise exception 'update_nota_servico_contexto_suporte: update principal nao encontrado';
  end if;
  v_definition := replace(
    v_definition,
    E'  update "RetificaPremium"."Notas_de_Servico"\n     set defeito = case when p_payload ? ''defeito'' then',
    $new$
  v_new_created_at := v_created_at;
  if p_payload ? 'data_entrada' then
    if nullif(btrim(p_payload->>'data_entrada'), '') is null then
      raise exception 'A data de entrada da O.S. é obrigatória.' using errcode = 'P3001';
    end if;

    v_new_created_at := nullif(btrim(p_payload->>'data_entrada'), '')::date::timestamp
      + v_created_at::time;

    if v_new_created_at::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
    end if;
  end if;

  v_prazo := case
    when p_payload ? 'prazo' then nullif(p_payload->>'prazo', '')::timestamp
    else v_existing_prazo
  end;

  if v_prazo is not null and v_prazo::date < v_new_created_at::date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;

  update "RetificaPremium"."Notas_de_Servico"
     set created_at = case when p_payload ? 'data_entrada' then v_new_created_at else created_at end,
         defeito = case when p_payload ? 'defeito' then$new$
  );

  if strpos(v_definition, $old$
         prazo = case when p_payload ? 'prazo' then coalesce(nullif(p_payload->>'prazo', '')::timestamp, prazo) else prazo end,
$old$) = 0 then
    raise exception 'update_nota_servico_contexto_suporte: atribuicao de prazo nao encontrada';
  end if;
  v_definition := replace(v_definition, $old$
         prazo = case when p_payload ? 'prazo' then coalesce(nullif(p_payload->>'prazo', '')::timestamp, prazo) else prazo end,
$old$, $new$
         prazo = case when p_payload ? 'prazo' then coalesce(v_prazo, prazo) else prazo end,
$new$);

  execute v_definition;
end;
$migration$;

comment on function "RetificaPremium".nova_nota(jsonb) is
  'Creates purchase/service notes. Service payload accepts data_entrada in past or today and an unrestricted prazo not before entry.';
comment on function "RetificaPremium".update_nota_servico(jsonb) is
  'Updates unlocked service notes, including historical data_entrada and flexible prazo not before entry.';

-- Rollback: restore the four function definitions from the immediately previous
-- migrations (20260624163711, 20260620223410 and 20260610161103). No table data,
-- RLS policy, index or column is changed by this migration.
