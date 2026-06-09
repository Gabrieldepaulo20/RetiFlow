-- Fecha lacunas do fluxo de fechamento mensal:
-- 1. O.S. que entram em fechamento ficam vinculadas em Notas_de_Servico.fk_fechamentos.
-- 2. O.S. vinculada a fechamento não pode mais ser editada.
-- 3. Próximos rascunhos podem pedir apenas O.S. ainda sem fechamento.

create index if not exists idx_notas_servico_owner_cliente_fechamento
  on "RetificaPremium"."Notas_de_Servico" (criado_por_usuario, fk_clientes, fk_fechamentos, finalizado_em desc);

-- Backfill seguro para fechamentos já gerados que salvaram snapshot em dados_json.
update "RetificaPremium"."Notas_de_Servico" ns
   set fk_fechamentos = f.id_fechamentos,
       updated_at = coalesce(ns.updated_at, now())
  from "RetificaPremium"."Fechamentos" f
 cross join lateral jsonb_array_elements(coalesce(f.dados_json->'notas', '[]'::jsonb)) as nota(item)
 where ns.id_notas_servico = nullif(nota.item->>'id', '')::uuid
   and ns.fk_clientes = f.fk_clientes
   and ns.fk_fechamentos is null;

drop function if exists "RetificaPremium".get_notas_servico(uuid, smallint, text, integer, integer, date, date);

create or replace function "RetificaPremium".get_notas_servico(
  p_fk_clientes uuid default null,
  p_fk_status smallint default null,
  p_busca text default null,
  p_limite integer default 50,
  p_offset integer default 0,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_apenas_sem_fechamento boolean default false
)
returns json
language plpgsql
security definer
as $$
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
    and (p_data_fim is null or ns.created_at < (p_data_fim::timestamp + interval '1 day'))
    and (coalesce(p_apenas_sem_fechamento, false) = false or ns.fk_fechamentos is null);

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
      and (coalesce(p_apenas_sem_fechamento, false) = false or ns.fk_fechamentos is null)
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

grant execute on function "RetificaPremium".get_notas_servico(uuid, smallint, text, integer, integer, date, date, boolean) to authenticated, service_role;

create or replace function "RetificaPremium".update_nota_pdf_url(p_id_nota uuid, p_pdf_url text)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if exists (
    select 1
      from "RetificaPremium"."Notas_de_Servico" ns
     where ns.id_notas_servico = p_id_nota
       and ns.criado_por_usuario = v_usuario_id
       and ns.fk_fechamentos is not null
  ) then
    raise exception 'Esta O.S. já entrou em um fechamento e não pode mais ser alterada.' using errcode = 'P4091';
  end if;

  update "RetificaPremium"."Notas_de_Servico"
     set pdf_url = p_pdf_url,
         updated_at = now()
   where id_notas_servico = p_id_nota
     and criado_por_usuario = v_usuario_id;

  if not found then
    raise exception 'O.S. não encontrada para este usuário.' using errcode = 'P3001';
  end if;

  return json_build_object('status', 200, 'mensagem', 'PDF atualizado.');
exception
  when sqlstate 'P4091' then return json_build_object('status', 409, 'code', 'note_locked_by_closing', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

grant execute on function "RetificaPremium".update_nota_pdf_url(uuid, text) to authenticated, service_role;

create or replace function "RetificaPremium".update_nota_servico(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path to 'RetificaPremium', 'public'
as $$
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

  if exists (
    select 1
      from "RetificaPremium"."Notas_de_Servico" ns
     where ns.id_notas_servico = v_id_nota
       and ns.criado_por_usuario = v_usuario_id
       and ns.fk_fechamentos is not null
  ) then
    raise exception 'Esta O.S. já entrou em um fechamento e não pode mais ser alterada.' using errcode = 'P4091';
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
  when sqlstate 'P4091' then return json_build_object('status', 409, 'code', 'note_locked_by_closing', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 400, 'code', 'invalid_payload', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

grant execute on function "RetificaPremium".update_nota_servico(jsonb) to authenticated, service_role;

drop function if exists "RetificaPremium".update_fechamento(uuid, text, numeric);
drop function if exists "RetificaPremium".update_fechamento(uuid, text, numeric, jsonb, text);

create or replace function "RetificaPremium".update_fechamento(
  p_id_fechamentos uuid,
  p_label text default null,
  p_valor_total numeric default null,
  p_dados_json jsonb default null,
  p_pdf_url text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_fechamento record;
  v_note_ids uuid[];
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select f.*
    into v_fechamento
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
   where f.id_fechamentos = p_id_fechamentos
     and c.fk_criado_por = v_usuario_id
   for update;

  if v_fechamento.id_fechamentos is null then
    raise exception 'Fechamento não encontrado para este usuário.' using errcode = 'P0311';
  end if;

  if v_fechamento.dados_json is not null and v_fechamento.pdf_url is not null
     and (p_label is not null or p_valor_total is not null or p_dados_json is not null or p_pdf_url is not null) then
    raise exception 'Este fechamento já foi gerado e não pode mais ser alterado.' using errcode = 'P4092';
  end if;

  if p_dados_json is not null then
    select coalesce(array_agg(distinct nullif(item->>'id', '')::uuid), array[]::uuid[])
      into v_note_ids
      from jsonb_array_elements(coalesce(p_dados_json->'notas', '[]'::jsonb)) as item;

    if array_length(v_note_ids, 1) is null then
      raise exception 'Selecione pelo menos uma O.S. para o fechamento.' using errcode = 'P0312';
    end if;

    if exists (
      select 1
        from "RetificaPremium"."Notas_de_Servico" ns
       where ns.id_notas_servico = any(v_note_ids)
         and (
           ns.criado_por_usuario <> v_usuario_id
           or ns.fk_clientes <> v_fechamento.fk_clientes
           or (ns.fk_fechamentos is not null and ns.fk_fechamentos <> p_id_fechamentos)
         )
    ) then
      raise exception 'Uma ou mais O.S. não pertencem a este cliente ou já foram fechadas.' using errcode = 'P4093';
    end if;

    if (
      select count(*)
        from "RetificaPremium"."Notas_de_Servico" ns
       where ns.id_notas_servico = any(v_note_ids)
         and ns.criado_por_usuario = v_usuario_id
         and ns.fk_clientes = v_fechamento.fk_clientes
    ) <> array_length(v_note_ids, 1) then
      raise exception 'Uma ou mais O.S. selecionadas não foram encontradas.' using errcode = 'P4093';
    end if;
  end if;

  update "RetificaPremium"."Fechamentos"
     set label = coalesce(p_label, label),
         valor_total = coalesce(p_valor_total, valor_total),
         dados_json = coalesce(p_dados_json, dados_json),
         pdf_url = coalesce(p_pdf_url, pdf_url),
         updated_at = now()
   where id_fechamentos = p_id_fechamentos;

  if p_dados_json is not null then
    update "RetificaPremium"."Notas_de_Servico"
       set fk_fechamentos = p_id_fechamentos,
           updated_at = now()
     where id_notas_servico = any(v_note_ids)
       and criado_por_usuario = v_usuario_id
       and fk_clientes = v_fechamento.fk_clientes;
  end if;
exception
  when sqlstate 'P0311' then raise exception 'Fechamento não encontrado para este usuário.' using errcode = 'P0311';
  when sqlstate 'P0312' then raise exception 'Selecione pelo menos uma O.S. para o fechamento.' using errcode = 'P0312';
  when sqlstate 'P4092' then raise exception 'Este fechamento já foi gerado e não pode mais ser alterado.' using errcode = 'P4092';
  when sqlstate 'P4093' then raise exception 'Uma ou mais O.S. não pertencem a este cliente ou já foram fechadas.' using errcode = 'P4093';
end;
$$;

grant execute on function "RetificaPremium".update_fechamento(uuid, text, numeric, jsonb, text) to authenticated, service_role;
