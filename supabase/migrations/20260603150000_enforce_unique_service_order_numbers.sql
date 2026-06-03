-- Bloqueia novas O.S. duplicadas por conta.
-- A checagem numerica evita duplicidade entre formatos como "000123" e "OS-123".

create unique index if not exists idx_notas_servico_owner_os_unique
  on "RetificaPremium"."Notas_de_Servico" (criado_por_usuario, lower(btrim(os)))
  where criado_por_usuario is not null
    and nullif(btrim(os), '') is not null;

create or replace function "RetificaPremium".nova_nota(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_tipo_nota text := p_payload->>'tipo_nota';
  v_numero text := nullif(btrim(p_payload->>'numero_nota'), '');
  v_numero_digits text;
  v_numero_numeric numeric;
  v_status_id smallint;
  v_id_nota uuid;
  v_cliente_id uuid;
  v_veiculo jsonb;
  v_modelo text;
  v_placa text;
  v_km bigint;
  v_motor text;
  v_motor_id bigint;
  v_veiculo_id uuid;
  v_item jsonb;
  v_item_nome text;
  v_item_detalhes text;
  v_servico_id bigint;
  v_quantidade smallint;
  v_valor numeric;
  v_desconto numeric;
begin
  if v_tipo_nota not in ('Serviço', 'Compra') then
    raise exception 'Tipo de nota inválido.' using errcode = 'P3001';
  end if;

  if v_numero is null then
    raise exception 'Número da nota é obrigatório.' using errcode = 'P3001';
  end if;

  v_numero_digits := nullif(regexp_replace(v_numero, '\D', '', 'g'), '');
  if v_numero_digits is not null then
    v_numero_numeric := v_numero_digits::numeric;
  end if;

  select id_status_notas
    into v_status_id
    from "RetificaPremium"."Status_Notas"
   where tipo_nota::text = v_tipo_nota
     and tipo_status = 'ativo'
   order by "index" asc
   limit 1;

  if v_status_id is null then
    raise exception 'Status inicial não encontrado.' using errcode = 'P3001';
  end if;

  if v_tipo_nota = 'Compra' then
    insert into "RetificaPremium"."Notas_de_Compra" (
      oc,
      observacoes,
      fk_status,
      fk_notas_servico
    ) values (
      v_numero,
      nullif(p_payload->>'observacoes', ''),
      v_status_id,
      nullif(p_payload->>'fk_notas_servico', '')::uuid
    )
    returning id_notas_compra into v_id_nota;

    return json_build_object('status', 200, 'mensagem', 'Nota de Compra criada.', 'id_nota', v_id_nota, 'tipo_nota', v_tipo_nota);
  end if;

  v_usuario_id := "RetificaPremium".require_current_usuario_id();
  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;

  if v_cliente_id is null then
    raise exception 'Cliente é obrigatório para O.S.' using errcode = 'P3001';
  end if;

  if not exists (
    select 1
      from "RetificaPremium"."Clientes"
     where id_clientes = v_cliente_id
       and fk_criado_por = v_usuario_id
  ) then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P0403';
  end if;

  if exists (
    select 1
      from "RetificaPremium"."Notas_de_Servico" ns
     where ns.criado_por_usuario = v_usuario_id
       and (
         lower(btrim(ns.os)) = lower(v_numero)
         or (
           v_numero_numeric is not null
           and nullif(regexp_replace(coalesce(ns.os, ''), '\D', '', 'g'), '') is not null
           and nullif(regexp_replace(coalesce(ns.os, ''), '\D', '', 'g'), '')::numeric = v_numero_numeric
         )
       )
  ) then
    raise exception 'Já existe uma O.S. com este número para esta conta.' using errcode = 'P3002';
  end if;

  v_veiculo := coalesce(p_payload->'veiculo', '{}'::jsonb);
  v_modelo := coalesce(nullif(btrim(v_veiculo->>'modelo'), ''), 'Não Identificado');
  v_placa := nullif(upper(regexp_replace(coalesce(v_veiculo->>'placa', ''), '[^a-zA-Z0-9]', '', 'g')), '');
  v_km := coalesce(nullif(v_veiculo->>'km', '')::bigint, 0);
  v_motor := coalesce(nullif(btrim(v_veiculo->>'motor'), ''), 'Não Identificado');

  if v_placa is not null and length(v_placa) <> 7 then
    raise exception 'Placa inválida.' using errcode = 'P3001';
  end if;

  select id_tipos_de_motor
    into v_motor_id
    from "RetificaPremium"."Tipos_de_Motor"
   where lower(tipo) = lower(v_motor)
   limit 1;

  if v_motor_id is null then
    insert into "RetificaPremium"."Tipos_de_Motor"(tipo)
    values (v_motor)
    returning id_tipos_de_motor into v_motor_id;
  end if;

  if v_placa is not null then
    select id_veiculos
      into v_veiculo_id
      from "RetificaPremium"."Veiculos"
     where placa = v_placa
     limit 1;
  end if;

  if v_veiculo_id is null then
    insert into "RetificaPremium"."Veiculos"(modelo, placa, km, fk_tipos_de_motor)
    values (v_modelo, v_placa, v_km, v_motor_id)
    returning id_veiculos into v_veiculo_id;
  else
    update "RetificaPremium"."Veiculos"
       set modelo = v_modelo,
           km = v_km,
           fk_tipos_de_motor = v_motor_id,
           updated_at = now()
     where id_veiculos = v_veiculo_id;
  end if;

  insert into "RetificaPremium"."Notas_de_Servico" (
    os,
    prazo,
    defeito,
    observacoes,
    fk_clientes,
    fk_veiculos,
    fk_status,
    criado_por_usuario,
    total_servicos,
    total_produtos,
    total
  ) values (
    v_numero,
    coalesce(nullif(p_payload->>'prazo', '')::timestamp, now() + interval '30 days'),
    coalesce(nullif(p_payload->>'defeito', ''), '-'),
    nullif(p_payload->>'observacoes', ''),
    v_cliente_id,
    v_veiculo_id,
    v_status_id,
    v_usuario_id,
    coalesce(nullif(p_payload->>'total_servicos', '')::numeric, 0),
    coalesce(nullif(p_payload->>'total_produtos', '')::numeric, 0),
    coalesce(nullif(p_payload->>'total', '')::numeric, 0)
  )
  returning id_notas_servico into v_id_nota;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'itens', '[]'::jsonb))
  loop
    v_item_nome := nullif(btrim(v_item->>'descricao'), '');
    if v_item_nome is null then
      continue;
    end if;

    v_item_detalhes := nullif(v_item->>'detalhes', '');
    v_quantidade := greatest(1, coalesce(nullif(v_item->>'quantidade', '')::numeric, 1))::smallint;
    v_valor := greatest(0, coalesce(nullif(v_item->>'valor', '')::numeric, 0));
    v_desconto := least(100, greatest(0, coalesce(nullif(v_item->>'desconto', '')::numeric, 0)));

    select id_servicos_itens
      into v_servico_id
      from "RetificaPremium"."Servicos_ou_Itens"
     where lower(nome) = lower(v_item_nome)
     limit 1;

    if v_servico_id is null then
      insert into "RetificaPremium"."Servicos_ou_Itens"(nome)
      values (v_item_nome)
      returning id_servicos_itens into v_servico_id;
    end if;

    insert into "RetificaPremium"."Rel_NotaS_Serv" (
      fk_notas_servico,
      fk_servicos_itens,
      quantidade,
      valor,
      desconto,
      detalhes
    ) values (
      v_id_nota,
      v_servico_id,
      v_quantidade,
      v_valor,
      v_desconto,
      v_item_detalhes
    );
  end loop;

  return json_build_object('status', 200, 'mensagem', 'Nota de Serviço criada.', 'id_nota', v_id_nota, 'tipo_nota', v_tipo_nota);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 400, 'code', 'invalid_payload', 'mensagem', sqlerrm);
  when sqlstate 'P3002' then return json_build_object('status', 400, 'code', 'duplicate_os', 'mensagem', sqlerrm);
  when unique_violation then return json_build_object('status', 400, 'code', 'duplicate_os', 'mensagem', 'Já existe uma O.S. com este número para esta conta.');
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

grant execute on function "RetificaPremium".nova_nota(jsonb) to authenticated, service_role;
