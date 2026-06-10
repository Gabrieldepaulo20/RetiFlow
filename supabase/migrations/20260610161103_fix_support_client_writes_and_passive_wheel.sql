-- Corrige as escritas de Clientes/Notas em modo suporte:
-- 1. O trigger de Clientes passa a aceitar DML somente quando a RPC de suporte
--    configurou um contexto transacional validado.
-- 2. As RPCs de suporte configuram esse contexto antes de alterar Clientes.
-- 3. A criação de Nota de Compra em suporte valida a sessão antes de gravar.
-- 4. A edição de O.S. em suporte respeita o bloqueio de fechamento.
-- 5. As RPCs sensíveis deixam de herdar EXECUTE de PUBLIC.

create or replace function "RetificaPremium".support_context_dml_usuario_id()
returns uuid
language plpgsql
stable
security definer
set search_path to 'RetificaPremium', 'public'
as $$
declare
  v_contexto_text text := nullif(current_setting('retiflow.support_context_usuario_id', true), '');
  v_sessao_text text := nullif(current_setting('retiflow.support_session_id', true), '');
  v_contexto_usuario_id uuid;
  v_sessao_suporte uuid;
begin
  if v_contexto_text is null or v_sessao_text is null then
    return null;
  end if;

  begin
    v_contexto_usuario_id := v_contexto_text::uuid;
    v_sessao_suporte := v_sessao_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Contexto de suporte inválido.' using errcode = 'P0403';
  end;

  return "RetificaPremium".resolve_suporte_contexto_usuario_id(
    v_contexto_usuario_id,
    v_sessao_suporte
  );
end;
$$;

create or replace function "RetificaPremium".set_suporte_contexto_dml(
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'RetificaPremium', 'public'
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

  perform set_config('retiflow.support_context_usuario_id', v_usuario_id::text, true);
  perform set_config('retiflow.support_session_id', p_sessao_suporte::text, true);

  return v_usuario_id;
end;
$$;

create or replace function "RetificaPremium".enforce_client_owner()
returns trigger
language plpgsql
security definer
set search_path to 'RetificaPremium', 'public'
as $$
declare
  v_usuario_id uuid;
  v_support_usuario_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_usuario_id := "RetificaPremium".require_current_usuario_id();
  v_support_usuario_id := "RetificaPremium".support_context_dml_usuario_id();

  if v_support_usuario_id is not null then
    if tg_op = 'INSERT' then
      new.fk_criado_por := coalesce(new.fk_criado_por, v_support_usuario_id);
      if new.fk_criado_por is distinct from v_support_usuario_id then
        raise exception 'Cliente pertence a outro contexto de suporte.' using errcode = 'P0403';
      end if;
      return new;
    end if;

    if old.fk_criado_por is distinct from v_support_usuario_id then
      raise exception 'Cliente não encontrado para este contexto de suporte.' using errcode = 'P0403';
    end if;

    if tg_op = 'UPDATE' then
      new.fk_criado_por := old.fk_criado_por;
      return new;
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    new.fk_criado_por := coalesce(new.fk_criado_por, v_usuario_id);
    if new.fk_criado_por is distinct from v_usuario_id then
      raise exception 'Cliente pertence a outro usuário.' using errcode = 'P0403';
    end if;
    return new;
  end if;

  if old.fk_criado_por is distinct from v_usuario_id then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P0403';
  end if;

  if tg_op = 'UPDATE' then
    new.fk_criado_por := old.fk_criado_por;
    return new;
  end if;

  return old;
end;
$$;

create or replace function "RetificaPremium".update_cliente_contexto_suporte(
  p_id_clientes uuid,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid,
  p_nome text default null,
  p_documento text default null,
  p_tipo_documento text default null,
  p_status boolean default null,
  p_observacao text default null,
  p_nome_fantasia text default null
)
returns json
language plpgsql
security definer
set search_path to 'RetificaPremium', 'public'
as $$
declare
  v_usuario_id uuid;
  v_documento_limpo text;
begin
  v_usuario_id := "RetificaPremium".set_suporte_contexto_dml(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

  if not exists (
    select 1
      from "RetificaPremium"."Clientes"
     where id_clientes = p_id_clientes
       and fk_criado_por = v_usuario_id
  ) then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  if p_documento is not null and trim(p_documento) <> '' then
    v_documento_limpo := upper(regexp_replace(p_documento, '[^a-zA-Z0-9]', '', 'g'));
  end if;

  update "RetificaPremium"."Clientes"
     set nome = case when p_nome is not null then initcap(trim(p_nome)) else nome end,
         documento = coalesce(v_documento_limpo, documento),
         tipo_documento = case
           when p_tipo_documento is not null then upper(trim(p_tipo_documento))::"RetificaPremium"."tipo_documento"
           else tipo_documento
         end,
         status = coalesce(p_status, status),
         observacao = case when p_observacao is not null then nullif(trim(p_observacao), '') else observacao end,
         nome_fantasia = case when p_nome_fantasia is not null then nullif(trim(p_nome_fantasia), '') else nome_fantasia end,
         updated_at = now()
   where id_clientes = p_id_clientes
     and fk_criado_por = v_usuario_id;

  perform "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id,
    p_sessao_suporte,
    'update_cliente',
    'Clientes',
    p_id_clientes::text,
    'Cliente atualizado em modo suporte'
  );

  return json_build_object('status', 200, 'mensagem', 'Cliente atualizado com sucesso.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when unique_violation then return json_build_object('status', 400, 'code', 'duplicate_document', 'mensagem', 'Este CPF/CNPJ já está cadastrado para este usuário.');
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".salvar_cliente_completo_contexto_suporte(
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
  v_id_cliente uuid;
  v_documento_limpo text;
  v_tipo_doc text;
  v_id_endereco_existente uuid;
  v_contato_item jsonb;
  v_acao_log text;
  v_retorno_json json;
begin
  v_usuario_id := "RetificaPremium".set_suporte_contexto_dml(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

  v_id_cliente := nullif(p_payload->>'id_clientes', '')::uuid;

  if v_id_cliente is not null and not exists (
    select 1
      from "RetificaPremium"."Clientes"
     where id_clientes = v_id_cliente
       and fk_criado_por = v_usuario_id
  ) then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  if v_id_cliente is null and p_payload->>'documento' is not null and p_payload->>'documento' <> '' then
    v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));
    select id_clientes
      into v_id_cliente
      from "RetificaPremium"."Clientes"
     where documento = v_documento_limpo
       and fk_criado_por = v_usuario_id;
  end if;

  v_tipo_doc := upper(trim(coalesce(p_payload->>'tipo_documento', '')));

  if v_id_cliente is not null then
    if p_payload->>'documento' is not null and p_payload->>'documento' <> '' then
      v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));
    end if;

    update "RetificaPremium"."Clientes"
       set nome = case when p_payload ? 'nome' then initcap(trim(p_payload->>'nome')) else nome end,
           documento = coalesce(v_documento_limpo, documento),
           tipo_documento = case
             when v_tipo_doc <> '' then v_tipo_doc::"RetificaPremium"."tipo_documento"
             else tipo_documento
           end,
           status = coalesce((p_payload->>'status')::boolean, status),
           observacao = case when p_payload ? 'observacao' then nullif(trim(p_payload->>'observacao'), '') else observacao end,
           nome_fantasia = case when p_payload ? 'nome_fantasia' then nullif(trim(p_payload->>'nome_fantasia'), '') else nome_fantasia end,
           updated_at = now()
     where id_clientes = v_id_cliente
       and fk_criado_por = v_usuario_id;

    v_acao_log := 'cliente_atualizado';
  else
    if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
      raise exception 'O nome do cliente é obrigatório.' using errcode = 'P0001';
    end if;
    if p_payload->>'documento' is null or trim(p_payload->>'documento') = '' then
      raise exception 'O documento é obrigatório.' using errcode = 'P0002';
    end if;
    if v_tipo_doc = '' then
      raise exception 'O tipo de documento é obrigatório.' using errcode = 'P0003';
    end if;

    v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));

    if v_tipo_doc = 'CPF' and length(v_documento_limpo) != 11 then
      raise exception 'CPF deve conter 11 dígitos.' using errcode = 'P0005';
    end if;
    if v_tipo_doc = 'CNPJ' and length(v_documento_limpo) != 14 then
      raise exception 'CNPJ deve conter 14 dígitos.' using errcode = 'P0006';
    end if;

    insert into "RetificaPremium"."Clientes" (
      nome,
      documento,
      tipo_documento,
      status,
      observacao,
      nome_fantasia,
      fk_criado_por
    ) values (
      initcap(trim(p_payload->>'nome')),
      v_documento_limpo,
      v_tipo_doc::"RetificaPremium"."tipo_documento",
      coalesce((p_payload->>'status')::boolean, true),
      nullif(trim(coalesce(p_payload->>'observacao', '')), ''),
      nullif(trim(coalesce(p_payload->>'nome_fantasia', '')), ''),
      v_usuario_id
    )
    returning id_clientes into v_id_cliente;

    v_acao_log := 'cliente_criado';
  end if;

  if p_payload->'endereco' is not null then
    select id_enderecos
      into v_id_endereco_existente
      from "RetificaPremium"."Enderecos"
     where fk_clientes = v_id_cliente;

    if v_id_endereco_existente is not null then
      v_retorno_json := "RetificaPremium".update_endereco(
        v_id_endereco_existente,
        p_payload->'endereco'->>'cep',
        p_payload->'endereco'->>'uf',
        p_payload->'endereco'->>'estado',
        p_payload->'endereco'->>'cidade',
        p_payload->'endereco'->>'bairro',
        p_payload->'endereco'->>'rua',
        p_payload->'endereco'->>'numero'
      );
    else
      v_retorno_json := "RetificaPremium".insert_endereco(
        v_id_cliente,
        p_payload->'endereco'->>'cep',
        p_payload->'endereco'->>'uf',
        p_payload->'endereco'->>'estado',
        p_payload->'endereco'->>'cidade',
        p_payload->'endereco'->>'bairro',
        p_payload->'endereco'->>'rua',
        p_payload->'endereco'->>'numero'
      );
    end if;

    if coalesce((v_retorno_json->>'status')::integer, 500) <> 200 then
      raise exception '%', coalesce(v_retorno_json->>'mensagem', 'Falha ao salvar endereço.') using errcode = 'P3001';
    end if;
  end if;

  if p_payload->'contatos' is not null and jsonb_typeof(p_payload->'contatos') = 'array' then
    if v_acao_log = 'cliente_atualizado' then
      delete from "RetificaPremium"."Contatos"
       where fk_clientes = v_id_cliente
         and tipo_contato in ('telefone', 'email');
    end if;

    for v_contato_item in select * from jsonb_array_elements(p_payload->'contatos') loop
      v_retorno_json := "RetificaPremium".insert_contato(
        v_id_cliente,
        v_contato_item->>'contato',
        v_contato_item->>'tipo_contato'
      );

      if coalesce((v_retorno_json->>'status')::integer, 500) <> 200 then
        raise exception '%', coalesce(v_retorno_json->>'mensagem', 'Falha ao salvar contato.') using errcode = 'P3001';
      end if;
    end loop;
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id,
    p_sessao_suporte,
    v_acao_log,
    'Clientes',
    v_id_cliente::text,
    'Cliente processado em modo suporte: ' || coalesce(p_payload->>'nome', '')
  );

  return json_build_object(
    'status', 200,
    'mensagem', 'Cliente e vínculos processados com sucesso.',
    'id_cliente', v_id_cliente
  );
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when sqlstate 'P0001' then return json_build_object('status', 400, 'code', 'missing_name', 'mensagem', sqlerrm);
  when sqlstate 'P0002' then return json_build_object('status', 400, 'code', 'missing_document', 'mensagem', sqlerrm);
  when sqlstate 'P0003' then return json_build_object('status', 400, 'code', 'missing_doc_type', 'mensagem', sqlerrm);
  when sqlstate 'P0005' then return json_build_object('status', 400, 'code', 'invalid_cpf', 'mensagem', sqlerrm);
  when sqlstate 'P0006' then return json_build_object('status', 400, 'code', 'invalid_cnpj', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 400, 'code', 'invalid_payload', 'mensagem', sqlerrm);
  when unique_violation then return json_build_object('status', 400, 'code', 'duplicate_document', 'mensagem', 'Este CPF/CNPJ já está cadastrado para este usuário.');
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".inativar_cliente_contexto_suporte(
  p_id_clientes uuid,
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
begin
  v_usuario_id := "RetificaPremium".set_suporte_contexto_dml(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

  update "RetificaPremium"."Clientes"
     set status = false,
         updated_at = now()
   where id_clientes = p_id_clientes
     and fk_criado_por = v_usuario_id;

  if not found then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id,
    p_sessao_suporte,
    'inativar_cliente',
    'Clientes',
    p_id_clientes::text,
    'Cliente inativado em modo suporte'
  );

  return json_build_object('status', 200, 'mensagem', 'Cliente inativado com sucesso.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".reativar_cliente_contexto_suporte(
  p_id_clientes uuid,
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
begin
  v_usuario_id := "RetificaPremium".set_suporte_contexto_dml(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

  update "RetificaPremium"."Clientes"
     set status = true,
         updated_at = now()
   where id_clientes = p_id_clientes
     and fk_criado_por = v_usuario_id;

  if not found then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id,
    p_sessao_suporte,
    'reativar_cliente',
    'Clientes',
    p_id_clientes::text,
    'Cliente reativado em modo suporte'
  );

  return json_build_object('status', 200, 'mensagem', 'Cliente reativado com sucesso.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
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
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id,
    p_sessao_suporte
  );

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
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id,
    p_sessao_suporte,
    'update_nota_servico',
    'Notas_de_Servico',
    v_id_nota::text,
    'O.S. editada em modo suporte'
  );

  return json_build_object('status', 200, 'mensagem', 'Nota de Serviço atualizada.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P4091' then return json_build_object('status', 409, 'code', 'note_locked_by_closing', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 400, 'code', 'invalid_payload', 'mensagem', sqlerrm);
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

revoke execute on function "RetificaPremium".support_context_dml_usuario_id() from public, anon, authenticated;
revoke execute on function "RetificaPremium".set_suporte_contexto_dml(uuid, uuid) from public, anon, authenticated;

revoke execute on function "RetificaPremium".update_nota_servico_contexto_suporte(jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function "RetificaPremium".nova_nota_contexto_suporte(jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function "RetificaPremium".update_cliente_contexto_suporte(uuid, uuid, uuid, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke execute on function "RetificaPremium".salvar_cliente_completo_contexto_suporte(jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function "RetificaPremium".inativar_cliente_contexto_suporte(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function "RetificaPremium".reativar_cliente_contexto_suporte(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function "RetificaPremium".update_nota_servico_contexto_suporte(jsonb, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".nova_nota_contexto_suporte(jsonb, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".update_cliente_contexto_suporte(uuid, uuid, uuid, text, text, text, boolean, text, text) to authenticated, service_role;
grant execute on function "RetificaPremium".salvar_cliente_completo_contexto_suporte(jsonb, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".inativar_cliente_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".reativar_cliente_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
