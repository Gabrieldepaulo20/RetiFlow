-- Exige e persiste o contato de quem levou o serviço na O.S.
-- O telefone da O.S. continua sendo o telefone cadastrado no cliente; contato_telefone
-- permanece apenas por compatibilidade com registros antigos.

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
  v_contato_nome text;
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
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');

  if v_cliente_id is null then
    raise exception 'Cliente é obrigatório para O.S.' using errcode = 'P3001';
  end if;

  if v_contato_nome is null then
    raise exception 'Contato é obrigatório para O.S.' using errcode = 'P3001';
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
    contato_nome,
    contato_telefone,
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
    v_contato_nome,
    nullif(btrim(p_payload->>'contato_telefone'), ''),
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

create or replace function "RetificaPremium".nova_nota_contexto_suporte(
  p_payload jsonb,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path to 'RetificaPremium', 'public'
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
  v_parent_nota_servico uuid;
  v_contato_nome text;
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
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

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
    v_parent_nota_servico := nullif(p_payload->>'fk_notas_servico', '')::uuid;

    if v_parent_nota_servico is null or not exists (
      select 1
        from "RetificaPremium"."Notas_de_Servico" ns
       where ns.id_notas_servico = v_parent_nota_servico
         and ns.criado_por_usuario = v_usuario_id
    ) then
      raise exception 'O.S. vinculada à compra não encontrada para este contexto.' using errcode = 'P0403';
    end if;

    insert into "RetificaPremium"."Notas_de_Compra" (
      oc,
      observacoes,
      fk_status,
      fk_notas_servico
    ) values (
      v_numero,
      nullif(p_payload->>'observacoes', ''),
      v_status_id,
      v_parent_nota_servico
    )
    returning id_notas_compra into v_id_nota;

    perform "RetificaPremium".insert_log_acao_suporte(
      p_contexto_usuario_id,
      p_sessao_suporte,
      'nova_nota_compra',
      'Notas_de_Compra',
      v_id_nota::text,
      'Nota de Compra criada em modo suporte: ' || v_numero
    );

    return json_build_object('status', 200, 'mensagem', 'Nota de Compra criada.', 'id_nota', v_id_nota, 'tipo_nota', v_tipo_nota);
  end if;

  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  v_contato_nome := nullif(btrim(p_payload->>'contato_nome'), '');

  if v_cliente_id is null then
    raise exception 'Cliente é obrigatório para O.S.' using errcode = 'P3001';
  end if;

  if v_contato_nome is null then
    raise exception 'Contato é obrigatório para O.S.' using errcode = 'P3001';
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
    contato_nome,
    contato_telefone,
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
    v_contato_nome,
    nullif(btrim(p_payload->>'contato_telefone'), ''),
    coalesce(nullif(p_payload->>'total_servicos', '')::numeric, 0),
    coalesce(nullif(p_payload->>'total_produtos', '')::numeric, 0),
    coalesce(nullif(p_payload->>'total', '')::numeric, 0)
  )
  returning id_notas_servico into v_id_nota;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'itens', '[]'::jsonb)) loop
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

  perform "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id,
    p_sessao_suporte,
    'nova_nota',
    'Notas_de_Servico',
    v_id_nota::text,
    'O.S. criada em modo suporte: ' || v_numero
  );

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

create or replace function "RetificaPremium".get_notas_servico_contexto_suporte(
  p_fk_clientes uuid default null,
  p_fk_status smallint default null,
  p_busca text default null,
  p_limite integer default 50,
  p_offset integer default 0,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_total int;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

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
      ns.fk_fechamentos,
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
$$;

create or replace function "RetificaPremium".get_nota_servico_detalhes(p_id_nota_servico uuid)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_cabecalho json;
  v_itens json;
  v_vinculos_compra json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select json_build_object(
    'id_nota', ns.id_notas_servico,
    'os_numero', ns.os,
    'prazo', ns.prazo,
    'defeito', ns.defeito,
    'observacoes', ns.observacoes,
    'data_criacao', ns.created_at,
    'finalizado_em', ns.finalizado_em,
    'total', ns.total,
    'total_servicos', ns.total_servicos,
    'total_produtos', ns.total_produtos,
    'criado_por_usuario', ns.criado_por_usuario,
    'pdf_url', ns.pdf_url,
    'contato_nome', ns.contato_nome,
    'contato_telefone', ns.contato_telefone,
    'cliente', json_build_object(
      'id', c.id_clientes,
      'nome', c.nome,
      'documento', c.documento,
      'endereco', case when e.rua is not null then trim(e.rua || case when e.numero is not null then ', ' || e.numero else '' end) else null end,
      'cep', e.cep,
      'cidade', e.cidade,
      'telefone', (select ct.contato from "RetificaPremium"."Contatos" ct where ct.fk_clientes = c.id_clientes and ct.tipo_contato = 'telefone' order by ct.created_at limit 1),
      'email', (select ct.contato from "RetificaPremium"."Contatos" ct where ct.fk_clientes = c.id_clientes and ct.tipo_contato = 'email' order by ct.created_at limit 1)
    ),
    'veiculo', json_build_object('id', v.id_veiculos, 'modelo', v.modelo, 'placa', v.placa, 'km', v.km, 'motor', tm.tipo),
    'status', json_build_object('id', sn.id_status_notas, 'nome', sn.nome, 'index', sn.index, 'tipo_status', sn.tipo_status)
  )
  into v_cabecalho
  from "RetificaPremium"."Notas_de_Servico" ns
  join "RetificaPremium"."Clientes" c on ns.fk_clientes = c.id_clientes and c.fk_criado_por = v_usuario_id
  left join "RetificaPremium"."Enderecos" e on e.fk_clientes = c.id_clientes
  join "RetificaPremium"."Veiculos" v on ns.fk_veiculos = v.id_veiculos
  join "RetificaPremium"."Tipos_de_Motor" tm on v.fk_tipos_de_motor = tm.id_tipos_de_motor
  join "RetificaPremium"."Status_Notas" sn on ns.fk_status = sn.id_status_notas
  where ns.id_notas_servico = p_id_nota_servico
    and ns.criado_por_usuario = v_usuario_id;

  if v_cabecalho is null then
    raise exception 'Nota de Serviço não encontrada para este usuário.' using errcode = 'P3001';
  end if;

  select coalesce(json_agg(json_build_object(
    'id_rel', rns.id_rel_notas_servi,
    'sku', si.id_servicos_itens,
    'descricao', si.nome,
    'detalhes', rns.detalhes,
    'quantidade', rns.quantidade,
    'preco_unitario', rns.valor,
    'desconto_porcentagem', rns.desconto,
    'subtotal_item', (rns.quantidade * rns.valor) * (1 - (rns.desconto / 100.0))
  )), '[]'::json)
  into v_itens
  from "RetificaPremium"."Rel_NotaS_Serv" rns
  join "RetificaPremium"."Servicos_ou_Itens" si on rns.fk_servicos_itens = si.id_servicos_itens
  where rns.fk_notas_servico = p_id_nota_servico;

  select coalesce(json_agg(json_build_object(
    'id_nota_compra', nc.id_notas_compra,
    'oc_numero', nc.oc,
    'status_nome', sn.nome,
    'status_tipo', sn.tipo_status
  )), '[]'::json)
  into v_vinculos_compra
  from "RetificaPremium"."Notas_de_Compra" nc
  join "RetificaPremium"."Status_Notas" sn on nc.fk_status = sn.id_status_notas
  where nc.fk_notas_servico = p_id_nota_servico;

  return json_build_object(
    'status', 200,
    'cabecalho', v_cabecalho,
    'itens_servico', v_itens,
    'notas_compra_vinculadas', v_vinculos_compra,
    'financeiro_servicos', json_build_object(
      'total_bruto', coalesce((select sum(quantidade * valor) from "RetificaPremium"."Rel_NotaS_Serv" where fk_notas_servico = p_id_nota_servico), 0),
      'total_liquido', coalesce((select sum((quantidade * valor) * (1 - (desconto / 100.0))) from "RetificaPremium"."Rel_NotaS_Serv" where fk_notas_servico = p_id_nota_servico), 0)
    )
  );
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_nota_servico_detalhes_contexto_suporte(
  p_id_nota_servico uuid,
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_cabecalho json;
  v_itens json;
  v_vinculos_compra json;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select json_build_object(
    'id_nota', ns.id_notas_servico,
    'os_numero', ns.os,
    'prazo', ns.prazo,
    'defeito', ns.defeito,
    'observacoes', ns.observacoes,
    'data_criacao', ns.created_at,
    'finalizado_em', ns.finalizado_em,
    'total', ns.total,
    'total_servicos', ns.total_servicos,
    'total_produtos', ns.total_produtos,
    'criado_por_usuario', ns.criado_por_usuario,
    'pdf_url', ns.pdf_url,
    'contato_nome', ns.contato_nome,
    'contato_telefone', ns.contato_telefone,
    'cliente', json_build_object(
      'id', c.id_clientes,
      'nome', c.nome,
      'documento', c.documento,
      'endereco', case when e.rua is not null then trim(e.rua || case when e.numero is not null then ', ' || e.numero else '' end) else null end,
      'cep', e.cep,
      'cidade', e.cidade,
      'telefone', (select ct.contato from "RetificaPremium"."Contatos" ct where ct.fk_clientes = c.id_clientes and ct.tipo_contato = 'telefone' order by ct.created_at limit 1),
      'email', (select ct.contato from "RetificaPremium"."Contatos" ct where ct.fk_clientes = c.id_clientes and ct.tipo_contato = 'email' order by ct.created_at limit 1)
    ),
    'veiculo', json_build_object('id', v.id_veiculos, 'modelo', v.modelo, 'placa', v.placa, 'km', v.km, 'motor', tm.tipo),
    'status', json_build_object('id', sn.id_status_notas, 'nome', sn.nome, 'index', sn.index, 'tipo_status', sn.tipo_status)
  )
  into v_cabecalho
  from "RetificaPremium"."Notas_de_Servico" ns
  join "RetificaPremium"."Clientes" c on ns.fk_clientes = c.id_clientes and c.fk_criado_por = v_usuario_id
  left join "RetificaPremium"."Enderecos" e on e.fk_clientes = c.id_clientes
  join "RetificaPremium"."Veiculos" v on ns.fk_veiculos = v.id_veiculos
  join "RetificaPremium"."Tipos_de_Motor" tm on v.fk_tipos_de_motor = tm.id_tipos_de_motor
  join "RetificaPremium"."Status_Notas" sn on ns.fk_status = sn.id_status_notas
  where ns.id_notas_servico = p_id_nota_servico
    and ns.criado_por_usuario = v_usuario_id;

  if v_cabecalho is null then
    raise exception 'Nota de Serviço não encontrada para este contexto.' using errcode = 'P3001';
  end if;

  select coalesce(json_agg(json_build_object(
    'id_rel', rns.id_rel_notas_servi,
    'sku', si.id_servicos_itens,
    'descricao', si.nome,
    'detalhes', rns.detalhes,
    'quantidade', rns.quantidade,
    'preco_unitario', rns.valor,
    'desconto_porcentagem', rns.desconto,
    'subtotal_item', (rns.quantidade * rns.valor) * (1 - (rns.desconto / 100.0))
  )), '[]'::json)
  into v_itens
  from "RetificaPremium"."Rel_NotaS_Serv" rns
  join "RetificaPremium"."Servicos_ou_Itens" si on rns.fk_servicos_itens = si.id_servicos_itens
  where rns.fk_notas_servico = p_id_nota_servico;

  select coalesce(json_agg(json_build_object(
    'id_nota_compra', nc.id_notas_compra,
    'oc_numero', nc.oc,
    'status_nome', sn.nome,
    'status_tipo', sn.tipo_status
  )), '[]'::json)
  into v_vinculos_compra
  from "RetificaPremium"."Notas_de_Compra" nc
  join "RetificaPremium"."Status_Notas" sn on nc.fk_status = sn.id_status_notas
  where nc.fk_notas_servico = p_id_nota_servico;

  return json_build_object(
    'status', 200,
    'cabecalho', v_cabecalho,
    'itens_servico', v_itens,
    'notas_compra_vinculadas', v_vinculos_compra,
    'financeiro_servicos', json_build_object(
      'total_bruto', coalesce((select sum(quantidade * valor) from "RetificaPremium"."Rel_NotaS_Serv" where fk_notas_servico = p_id_nota_servico), 0),
      'total_liquido', coalesce((select sum((quantidade * valor) * (1 - (desconto / 100.0))) from "RetificaPremium"."Rel_NotaS_Serv" where fk_notas_servico = p_id_nota_servico), 0)
    )
  );
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

grant execute on function "RetificaPremium".nova_nota(jsonb) to authenticated, service_role;
grant execute on function "RetificaPremium".nova_nota_contexto_suporte(jsonb, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".get_notas_servico_contexto_suporte(uuid, smallint, text, integer, integer, date, date, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".get_nota_servico_detalhes(uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".get_nota_servico_detalhes_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
