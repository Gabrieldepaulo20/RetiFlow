-- Preserve client name casing exactly as typed.
--
-- Bug fixed: editing a client from "Ccm" to "CCM" in support mode returned
-- success but the database kept "Ccm", because the RPC forced initcap().
-- From now on names are trimmed only; document/status/tenant validation stays
-- unchanged.

create or replace function "RetificaPremium".update_cliente(
  p_id_clientes uuid,
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
  v_tipo_doc_formatado text;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if p_nome is not null and trim(p_nome) = '' then
    raise exception 'O nome do cliente é obrigatório.' using errcode = 'P0001';
  end if;

  if p_documento is not null and trim(p_documento) <> '' then
    v_documento_limpo := upper(regexp_replace(p_documento, '[^a-zA-Z0-9]', '', 'g'));
  end if;

  if p_tipo_documento is not null and trim(p_tipo_documento) <> '' then
    v_tipo_doc_formatado := upper(trim(p_tipo_documento));
    if v_tipo_doc_formatado not in ('CPF', 'CNPJ') then
      raise exception 'Tipo de documento inválido. Use CPF ou CNPJ.' using errcode = 'P0003';
    end if;
  end if;

  if v_tipo_doc_formatado = 'CPF' and v_documento_limpo is not null and length(v_documento_limpo) != 11 then
    raise exception 'CPF deve conter 11 dígitos.' using errcode = 'P0005';
  end if;
  if v_tipo_doc_formatado = 'CNPJ' and v_documento_limpo is not null and length(v_documento_limpo) != 14 then
    raise exception 'CNPJ deve conter 14 dígitos.' using errcode = 'P0006';
  end if;

  update "RetificaPremium"."Clientes"
     set nome = case when p_nome is not null then trim(p_nome) else nome end,
         documento = coalesce(v_documento_limpo, documento),
         tipo_documento = case
           when v_tipo_doc_formatado is not null then v_tipo_doc_formatado::"RetificaPremium"."tipo_documento"
           else tipo_documento
         end,
         status = coalesce(p_status, status),
         observacao = case when p_observacao is not null then nullif(trim(p_observacao), '') else observacao end,
         nome_fantasia = case when p_nome_fantasia is not null then nullif(trim(p_nome_fantasia), '') else nome_fantasia end,
         updated_at = now()
   where id_clientes = p_id_clientes
     and fk_criado_por = v_usuario_id;

  if not found then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  return json_build_object('status', 200, 'mensagem', 'Cliente atualizado com sucesso.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when sqlstate 'P0001' then return json_build_object('status', 400, 'code', 'missing_name', 'mensagem', sqlerrm);
  when sqlstate 'P0003' then return json_build_object('status', 400, 'code', 'missing_doc_type', 'mensagem', sqlerrm);
  when sqlstate 'P0005' then return json_build_object('status', 400, 'code', 'invalid_cpf', 'mensagem', sqlerrm);
  when sqlstate 'P0006' then return json_build_object('status', 400, 'code', 'invalid_cnpj', 'mensagem', sqlerrm);
  when unique_violation then return json_build_object('status', 400, 'code', 'duplicate_document', 'mensagem', 'Este CPF/CNPJ já está cadastrado para este usuário.');
  when invalid_text_representation then return json_build_object('status', 400, 'code', 'invalid_enum', 'mensagem', 'Tipo de documento inválido. Use CPF ou CNPJ.');
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".update_cliente(
  p_id_clientes uuid,
  p_nome text default null,
  p_documento text default null,
  p_tipo_documento text default null,
  p_status boolean default null,
  p_observacao text default null
)
returns json
language plpgsql
security definer
set search_path to 'RetificaPremium', 'public'
as $$
begin
  return "RetificaPremium".update_cliente(
    p_id_clientes,
    p_nome,
    p_documento,
    p_tipo_documento,
    p_status,
    p_observacao,
    null
  );
end;
$$;

create or replace function "RetificaPremium".insert_cliente(
  p_nome text,
  p_documento text,
  p_tipo_documento text,
  p_status boolean,
  p_observacao text default null,
  p_nome_fantasia text default null
)
returns json
language plpgsql
security definer
set search_path to 'RetificaPremium', 'public'
as $$
declare
  v_id_clientes "RetificaPremium"."Clientes"."id_clientes"%type;
  v_documento_limpo text;
  v_tipo_doc_formatado text;
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if p_nome is null or trim(p_nome) = '' then
    raise exception 'Erro de parâmetro' using errcode = 'P0001';
  end if;
  if p_documento is null or trim(p_documento) = '' then
    raise exception 'Erro de parâmetro' using errcode = 'P0002';
  end if;
  if p_tipo_documento is null or trim(p_tipo_documento) = '' then
    raise exception 'Erro de parâmetro' using errcode = 'P0003';
  end if;
  if p_status is null then
    raise exception 'Erro de parâmetro' using errcode = 'P0004';
  end if;

  v_documento_limpo := upper(regexp_replace(p_documento, '[^a-zA-Z0-9]', '', 'g'));
  v_tipo_doc_formatado := upper(trim(p_tipo_documento));

  if v_tipo_doc_formatado = 'CPF' and length(v_documento_limpo) != 11 then
    raise exception 'Erro de validação' using errcode = 'P0005';
  end if;
  if v_tipo_doc_formatado = 'CNPJ' and length(v_documento_limpo) != 14 then
    raise exception 'Erro de validação' using errcode = 'P0006';
  end if;

  insert into "RetificaPremium"."Clientes" (
    nome, documento, tipo_documento, status, observacao, nome_fantasia, fk_criado_por
  ) values (
    trim(p_nome),
    v_documento_limpo,
    v_tipo_doc_formatado::"RetificaPremium"."tipo_documento",
    p_status,
    p_observacao,
    nullif(trim(coalesce(p_nome_fantasia, '')), ''),
    v_usuario_id
  )
  returning id_clientes into v_id_clientes;

  return json_build_object('status', 200, 'mensagem', 'Cliente cadastrado com sucesso.', 'id_clientes', v_id_clientes);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P0001' then return json_build_object('status', 400, 'code', 'missing_name', 'mensagem', 'O nome do cliente é obrigatório.');
  when sqlstate 'P0002' then return json_build_object('status', 400, 'code', 'missing_document', 'mensagem', 'O documento é obrigatório.');
  when sqlstate 'P0003' then return json_build_object('status', 400, 'code', 'missing_doc_type', 'mensagem', 'O tipo de documento é obrigatório.');
  when sqlstate 'P0004' then return json_build_object('status', 400, 'code', 'missing_status', 'mensagem', 'O status é obrigatório.');
  when sqlstate 'P0005' then return json_build_object('status', 400, 'code', 'invalid_cpf', 'mensagem', 'CPF deve conter 11 dígitos.');
  when sqlstate 'P0006' then return json_build_object('status', 400, 'code', 'invalid_cnpj', 'mensagem', 'CNPJ deve conter 14 dígitos.');
  when unique_violation then return json_build_object('status', 400, 'code', 'duplicate_document', 'mensagem', 'Este CPF/CNPJ já está cadastrado para este usuário.');
  when invalid_text_representation then return json_build_object('status', 400, 'code', 'invalid_enum', 'mensagem', 'Tipo de documento inválido. Use CPF ou CNPJ.');
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
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

  if p_nome is not null and trim(p_nome) = '' then
    raise exception 'O nome do cliente é obrigatório.' using errcode = 'P0001';
  end if;

  if p_documento is not null and trim(p_documento) <> '' then
    v_documento_limpo := upper(regexp_replace(p_documento, '[^a-zA-Z0-9]', '', 'g'));
  end if;

  update "RetificaPremium"."Clientes"
     set nome = case when p_nome is not null then trim(p_nome) else nome end,
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
  when sqlstate 'P0001' then return json_build_object('status', 400, 'code', 'missing_name', 'mensagem', sqlerrm);
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
    if p_payload ? 'nome' and trim(p_payload->>'nome') = '' then
      raise exception 'O nome do cliente é obrigatório.' using errcode = 'P0001';
    end if;

    if p_payload->>'documento' is not null and p_payload->>'documento' <> '' then
      v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));
    end if;

    update "RetificaPremium"."Clientes"
       set nome = case when p_payload ? 'nome' then trim(p_payload->>'nome') else nome end,
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
      trim(p_payload->>'nome'),
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

revoke execute on function "RetificaPremium".update_cliente_contexto_suporte(uuid, uuid, uuid, text, text, text, boolean, text, text) from public, anon;
revoke execute on function "RetificaPremium".salvar_cliente_completo_contexto_suporte(jsonb, uuid, uuid) from public, anon;

grant execute on function "RetificaPremium".update_cliente(uuid, text, text, text, boolean, text, text) to authenticated, service_role;
grant execute on function "RetificaPremium".update_cliente(uuid, text, text, text, boolean, text) to authenticated, service_role;
grant execute on function "RetificaPremium".insert_cliente(text, text, text, boolean, text, text) to authenticated, service_role;
grant execute on function "RetificaPremium".update_cliente_contexto_suporte(uuid, uuid, uuid, text, text, text, boolean, text, text) to authenticated, service_role;
grant execute on function "RetificaPremium".salvar_cliente_completo_contexto_suporte(jsonb, uuid, uuid) to authenticated, service_role;
