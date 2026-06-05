-- Estende update_nota_servico para gravar fk_status (lacuna pré-existente),
-- payment_status, pago_em, pago_com, contato_nome, contato_telefone.
-- Estende get_notas_servico para retornar esses campos.

CREATE OR REPLACE FUNCTION "RetificaPremium".update_nota_servico(p_payload jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
declare
  v_usuario_id uuid;
  v_id_nota uuid := nullif(p_payload->>'id_notas_servico', '')::uuid;
  v_current_veiculo_id uuid;
  v_current_placa text;
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
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if v_id_nota is null then
    raise exception 'ID da O.S. é obrigatório.' using errcode = 'P3001';
  end if;

  select ns.fk_veiculos, v.placa
    into v_current_veiculo_id, v_current_placa
    from "RetificaPremium"."Notas_de_Servico" ns
    join "RetificaPremium"."Veiculos" v on v.id_veiculos = ns.fk_veiculos
   where ns.id_notas_servico = v_id_nota
     and ns.criado_por_usuario = v_usuario_id;

  if v_current_veiculo_id is null then
    raise exception 'O.S. não encontrada para este usuário.' using errcode = 'P3001';
  end if;

  if p_payload ? 'fk_clientes' then
    v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
    if v_cliente_id is null or not exists (
      select 1
        from "RetificaPremium"."Clientes"
       where id_clientes = v_cliente_id
         and fk_criado_por = v_usuario_id
    ) then
      raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P0403';
    end if;
  end if;

  update "RetificaPremium"."Notas_de_Servico"
     set defeito = case when p_payload ? 'defeito' then coalesce(nullif(p_payload->>'defeito', ''), '-') else defeito end,
         observacoes = case when p_payload ? 'observacoes' then nullif(p_payload->>'observacoes', '') else observacoes end,
         fk_clientes = coalesce(v_cliente_id, fk_clientes),
         prazo = case when p_payload ? 'prazo' then coalesce(nullif(p_payload->>'prazo', '')::timestamp, prazo) else prazo end,
         total_servicos = case when p_payload ? 'total_servicos' then coalesce(nullif(p_payload->>'total_servicos', '')::numeric, 0) else total_servicos end,
         total_produtos = case when p_payload ? 'total_produtos' then coalesce(nullif(p_payload->>'total_produtos', '')::numeric, 0) else total_produtos end,
         total = case when p_payload ? 'total' then coalesce(nullif(p_payload->>'total', '')::numeric, 0) else total end,
         fk_status = case when p_payload ? 'fk_status' then coalesce(nullif(p_payload->>'fk_status', '')::smallint, fk_status) else fk_status end,
         payment_status = case when p_payload ? 'payment_status' then coalesce(nullif(p_payload->>'payment_status', ''), payment_status) else payment_status end,
         pago_em = case when p_payload ? 'pago_em' then nullif(p_payload->>'pago_em', '')::timestamp else pago_em end,
         pago_com = case when p_payload ? 'pago_com' then nullif(p_payload->>'pago_com', '') else pago_com end,
         contato_nome = case when p_payload ? 'contato_nome' then nullif(p_payload->>'contato_nome', '') else contato_nome end,
         contato_telefone = case when p_payload ? 'contato_telefone' then nullif(p_payload->>'contato_telefone', '') else contato_telefone end,
         updated_at = now()
   where id_notas_servico = v_id_nota
     and criado_por_usuario = v_usuario_id;

  if p_payload ? 'veiculo' then
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

    if v_veiculo_id is null and v_placa is null and v_current_placa is null then
      v_veiculo_id := v_current_veiculo_id;
    end if;

    if v_veiculo_id is null then
      insert into "RetificaPremium"."Veiculos"(modelo, placa, km, fk_tipos_de_motor)
      values (v_modelo, v_placa, v_km, v_motor_id)
      returning id_veiculos into v_veiculo_id;
    else
      update "RetificaPremium"."Veiculos"
         set modelo = v_modelo,
             placa = v_placa,
             km = v_km,
             fk_tipos_de_motor = v_motor_id,
             updated_at = now()
       where id_veiculos = v_veiculo_id;
    end if;

    update "RetificaPremium"."Notas_de_Servico"
       set fk_veiculos = v_veiculo_id,
           updated_at = now()
     where id_notas_servico = v_id_nota
       and criado_por_usuario = v_usuario_id;
  end if;

  if p_payload ? 'itens' then
    delete from "RetificaPremium"."Rel_NotaS_Serv"
     where fk_notas_servico = v_id_nota;

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
  end if;

  return json_build_object('status', 200, 'mensagem', 'Nota de Serviço atualizada.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 400, 'code', 'invalid_payload', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

CREATE OR REPLACE FUNCTION "RetificaPremium".get_notas_servico(p_fk_clientes uuid DEFAULT NULL::uuid, p_fk_status smallint DEFAULT NULL::smallint, p_busca text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_usuario_id uuid;
  v_total int;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select count(*)
  into v_total
  from "RetificaPremium"."Notas_de_Servico" ns
  where ns.criado_por_usuario = v_usuario_id
    and (p_fk_clientes is null or ns.fk_clientes = p_fk_clientes)
    and (p_fk_status is null or ns.fk_status = p_fk_status)
    and (p_busca is null or ns.os ilike '%' || p_busca || '%' or ns.defeito ilike '%' || p_busca || '%')
    and (p_data_inicio is null or ns.created_at >= p_data_inicio::timestamp)
    and (p_data_fim is null or ns.created_at < (p_data_fim::timestamp + interval '1 day'));

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json)
  into v_dados
  from (
    select
      ns.id_notas_servico,
      ns.os,
      ns.prazo,
      ns.defeito,
      ns.observacoes,
      ns.total,
      ns.total_servicos,
      ns.total_produtos,
      ns.created_at,
      ns.updated_at,
      ns.pdf_url,
      ns.finalizado_em,
      ns.payment_status,
      ns.pago_em,
      ns.pago_com,
      ns.contato_nome,
      ns.contato_telefone,
      json_build_object('id', c.id_clientes, 'nome', c.nome) as cliente,
      json_build_object('id', v.id_veiculos, 'modelo', v.modelo, 'placa', v.placa, 'km', v.km, 'motor', coalesce(tm.tipo, '')) as veiculo,
      json_build_object('id', sn.id_status_notas, 'nome', sn.nome, 'index', sn.index, 'tipo_status', sn.tipo_status) as status
    from "RetificaPremium"."Notas_de_Servico" ns
    join "RetificaPremium"."Clientes" c on ns.fk_clientes = c.id_clientes and c.fk_criado_por = v_usuario_id
    join "RetificaPremium"."Veiculos" v on ns.fk_veiculos = v.id_veiculos
    join "RetificaPremium"."Status_Notas" sn on ns.fk_status = sn.id_status_notas
    left join "RetificaPremium"."Tipos_de_Motor" tm on v.fk_tipos_de_motor = tm.id_tipos_de_motor
    where ns.criado_por_usuario = v_usuario_id
      and (p_fk_clientes is null or ns.fk_clientes = p_fk_clientes)
      and (p_fk_status is null or ns.fk_status = p_fk_status)
      and (p_busca is null or ns.os ilike '%' || p_busca || '%' or ns.defeito ilike '%' || p_busca || '%')
      and (p_data_inicio is null or ns.created_at >= p_data_inicio::timestamp)
      and (p_data_fim is null or ns.created_at < (p_data_fim::timestamp + interval '1 day'))
    order by ns.created_at desc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Notas de Serviço encontradas.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;
