-- Completa o contrato de favorecido em Contas a Pagar.
-- A coluna ja pode existir no remoto por hotfix operacional; por isso a
-- migration e idempotente nos pontos de schema.

alter table "RetificaPremium"."Contas_Pagar"
  add column if not exists favorecido_tipo text not null default 'FORNECEDOR';

update "RetificaPremium"."Contas_Pagar"
   set favorecido_tipo = 'FORNECEDOR'
 where favorecido_tipo is null
    or btrim(favorecido_tipo) = '';

alter table "RetificaPremium"."Contas_Pagar"
  alter column favorecido_tipo set default 'FORNECEDOR',
  alter column favorecido_tipo set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = '"RetificaPremium"'::regnamespace
      and conrelid = '"RetificaPremium"."Contas_Pagar"'::regclass
      and conname = 'contas_pagar_favorecido_tipo_check'
  ) then
    alter table "RetificaPremium"."Contas_Pagar"
      add constraint contas_pagar_favorecido_tipo_check
      check (favorecido_tipo in ('FORNECEDOR', 'FUNCIONARIO'));
  end if;
end $$;

drop function if exists "RetificaPremium".insert_conta_pagar(
  text,
  uuid,
  timestamp without time zone,
  numeric,
  uuid,
  text,
  text,
  timestamp without time zone,
  numeric,
  numeric,
  text,
  text,
  timestamp without time zone,
  text,
  uuid,
  smallint,
  smallint,
  text,
  boolean
);

create or replace function "RetificaPremium".insert_conta_pagar(
  p_titulo text,
  p_fk_categorias uuid,
  p_data_vencimento timestamp without time zone,
  p_valor_original numeric,
  p_fk_fornecedores uuid default null,
  p_nome_fornecedor text default null,
  p_numero_documento text default null,
  p_data_emissao timestamp without time zone default null,
  p_juros numeric default 0,
  p_desconto numeric default 0,
  p_forma_pagamento_prevista text default null,
  p_origem_lancamento text default 'MANUAL',
  p_data_competencia timestamp without time zone default null,
  p_recorrencia text default 'NENHUMA',
  p_fk_conta_pai uuid default null,
  p_indice_recorrencia smallint default null,
  p_total_parcelas smallint default null,
  p_observacoes text default null,
  p_urgente boolean default false,
  p_favorecido_tipo text default 'FORNECEDOR'
)
returns json
language plpgsql
security definer
as $function$
declare
  v_id_contas_pagar "RetificaPremium"."Contas_Pagar"."id_contas_pagar"%type;
  v_valor_final numeric(10,2);
  v_fk_criado_por uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = 'P0401';
  end if;

  if p_titulo is null or trim(p_titulo) = '' then raise exception 'Erro de parâmetro' using errcode = 'P0600'; end if;
  if p_fk_categorias is null then raise exception 'Erro de parâmetro' using errcode = 'P0601'; end if;
  if p_data_vencimento is null then raise exception 'Erro de parâmetro' using errcode = 'P0602'; end if;
  if p_valor_original is null or p_valor_original < 0 then raise exception 'Erro de parâmetro' using errcode = 'P0603'; end if;

  v_valor_final := greatest(0, p_valor_original + coalesce(p_juros, 0) - coalesce(p_desconto, 0));
  v_fk_criado_por := (
    select "id_usuarios"
    from "RetificaPremium"."Usuarios"
    where "auth_id" = auth.uid()
    limit 1
  );

  insert into "RetificaPremium"."Contas_Pagar" (
    "titulo", "fk_categorias", "data_vencimento", "valor_original",
    "fk_fornecedores", "nome_fornecedor", "numero_documento", "data_emissao",
    "juros", "desconto", "valor_final", "status",
    "forma_pagamento_prevista", "origem_lancamento", "data_competencia",
    "recorrencia", "fk_conta_pai", "indice_recorrencia", "total_parcelas",
    "observacoes", "urgente", "fk_criado_por", "favorecido_tipo"
  ) values (
    trim(p_titulo), p_fk_categorias, p_data_vencimento, p_valor_original,
    p_fk_fornecedores,
    nullif(trim(coalesce(p_nome_fornecedor, '')), ''),
    nullif(trim(coalesce(p_numero_documento, '')), ''),
    p_data_emissao,
    coalesce(p_juros, 0), coalesce(p_desconto, 0), v_valor_final, 'PENDENTE',
    nullif(upper(trim(coalesce(p_forma_pagamento_prevista, ''))), '')::"RetificaPremium"."forma_pagamento",
    coalesce(upper(trim(p_origem_lancamento)), 'MANUAL')::"RetificaPremium"."origem_lancamento",
    p_data_competencia,
    coalesce(upper(trim(p_recorrencia)), 'NENHUMA')::"RetificaPremium"."tipo_recorrencia",
    p_fk_conta_pai, p_indice_recorrencia, p_total_parcelas,
    nullif(trim(coalesce(p_observacoes, '')), ''),
    coalesce(p_urgente, false), v_fk_criado_por,
    case when upper(trim(coalesce(p_favorecido_tipo, 'FORNECEDOR'))) = 'FUNCIONARIO' then 'FUNCIONARIO' else 'FORNECEDOR' end
  )
  returning "id_contas_pagar" into v_id_contas_pagar;

  perform "RetificaPremium".registrar_historico_conta_pagar(v_id_contas_pagar, 'CREATED', 'Conta cadastrada no sistema.');

  begin
    perform "RetificaPremium".insert_log('conta_pagar_criada', 'Contas_Pagar', v_id_contas_pagar::text, 'Conta a pagar criada: ' || trim(p_titulo));
  exception when others then null;
  end;

  return json_build_object('status', 200, 'mensagem', 'Conta a pagar cadastrada com sucesso.', 'id_contas_pagar', v_id_contas_pagar);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0600' then return json_build_object('status', 400, 'code', 'missing_titulo', 'mensagem', 'O título da conta é obrigatório.');
  when sqlstate 'P0601' then return json_build_object('status', 400, 'code', 'missing_categoria', 'mensagem', 'A categoria é obrigatória.');
  when sqlstate 'P0602' then return json_build_object('status', 400, 'code', 'missing_vencimento', 'mensagem', 'A data de vencimento é obrigatória.');
  when sqlstate 'P0603' then return json_build_object('status', 400, 'code', 'invalid_valor', 'mensagem', 'O valor original deve ser maior ou igual a zero.');
  when invalid_text_representation then return json_build_object('status', 400, 'code', 'invalid_enum', 'mensagem', 'Valor de enum inválido.');
  when foreign_key_violation then return json_build_object('status', 400, 'code', 'invalid_reference', 'mensagem', 'Categoria, fornecedor ou conta pai não encontrados.');
  when others then return json_build_object('status', 500, 'code', 'unknown_error', 'mensagem', sqlerrm);
end;
$function$;

drop function if exists "RetificaPremium".update_conta_pagar(
  uuid,
  text,
  uuid,
  timestamp without time zone,
  numeric,
  uuid,
  text,
  text,
  timestamp without time zone,
  numeric,
  numeric,
  text,
  boolean,
  timestamp without time zone,
  text
);

create or replace function "RetificaPremium".update_conta_pagar(
  p_id_contas_pagar uuid,
  p_titulo text default null,
  p_fk_categorias uuid default null,
  p_data_vencimento timestamp without time zone default null,
  p_valor_original numeric default null,
  p_fk_fornecedores uuid default null,
  p_nome_fornecedor text default null,
  p_numero_documento text default null,
  p_data_emissao timestamp without time zone default null,
  p_juros numeric default null,
  p_desconto numeric default null,
  p_observacoes text default null,
  p_urgente boolean default null,
  p_data_competencia timestamp without time zone default null,
  p_forma_pagamento_prevista text default null,
  p_favorecido_tipo text default null
)
returns json
language plpgsql
security definer
as $function$
declare
  v_valor_original_atual numeric(10,2);
  v_juros_atual numeric(10,2);
  v_desconto_atual numeric(10,2);
  v_novo_valor_final numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = 'P0401';
  end if;

  if p_id_contas_pagar is null then
    raise exception 'ID da conta é obrigatório.' using errcode = 'P0610';
  end if;

  select "valor_original", "juros", "desconto"
    into v_valor_original_atual, v_juros_atual, v_desconto_atual
  from "RetificaPremium"."Contas_Pagar"
  where "id_contas_pagar" = p_id_contas_pagar
    and "excluido_em" is null;

  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0611';
  end if;

  v_novo_valor_final := greatest(0,
    coalesce(p_valor_original, v_valor_original_atual)
    + coalesce(p_juros, v_juros_atual)
    - coalesce(p_desconto, v_desconto_atual)
  );

  update "RetificaPremium"."Contas_Pagar" set
    "titulo" = coalesce(nullif(trim(p_titulo), ''), "titulo"),
    "fk_categorias" = coalesce(p_fk_categorias, "fk_categorias"),
    "data_vencimento" = coalesce(p_data_vencimento, "data_vencimento"),
    "valor_original" = coalesce(p_valor_original, "valor_original"),
    "fk_fornecedores" = coalesce(p_fk_fornecedores, "fk_fornecedores"),
    "nome_fornecedor" = coalesce(nullif(trim(coalesce(p_nome_fornecedor, '')), ''), "nome_fornecedor"),
    "numero_documento" = coalesce(nullif(trim(coalesce(p_numero_documento, '')), ''), "numero_documento"),
    "data_emissao" = coalesce(p_data_emissao, "data_emissao"),
    "juros" = coalesce(p_juros, "juros"),
    "desconto" = coalesce(p_desconto, "desconto"),
    "valor_final" = v_novo_valor_final,
    "observacoes" = coalesce(nullif(trim(coalesce(p_observacoes, '')), ''), "observacoes"),
    "urgente" = coalesce(p_urgente, "urgente"),
    "data_competencia" = coalesce(p_data_competencia, "data_competencia"),
    "forma_pagamento_prevista" = coalesce(nullif(upper(trim(coalesce(p_forma_pagamento_prevista, ''))), '')::"RetificaPremium"."forma_pagamento", "forma_pagamento_prevista"),
    "favorecido_tipo" = case
      when p_favorecido_tipo is null then "favorecido_tipo"
      when upper(trim(p_favorecido_tipo)) = 'FUNCIONARIO' then 'FUNCIONARIO'
      else 'FORNECEDOR'
    end,
    "updated_at" = now()
  where "id_contas_pagar" = p_id_contas_pagar;

  perform "RetificaPremium".registrar_historico_conta_pagar(p_id_contas_pagar, 'UPDATED', 'Informações da conta atualizadas.');

  begin
    perform "RetificaPremium".insert_log('conta_pagar_atualizada', 'Contas_Pagar', p_id_contas_pagar::text, 'Conta a pagar atualizada.');
  exception when others then null;
  end;

  return json_build_object('status', 200, 'mensagem', 'Conta a pagar atualizada com sucesso.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0610' then return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', sqlerrm);
  when sqlstate 'P0611' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', 'unknown_error', 'mensagem', sqlerrm);
end;
$function$;

drop function if exists "RetificaPremium".insert_conta_pagar_contexto_suporte(
  text,
  uuid,
  timestamp without time zone,
  numeric,
  uuid,
  text,
  text,
  timestamp without time zone,
  numeric,
  numeric,
  text,
  text,
  date,
  text,
  uuid,
  integer,
  integer,
  text,
  boolean,
  uuid,
  uuid
);

create or replace function "RetificaPremium".insert_conta_pagar_contexto_suporte(
  p_titulo text,
  p_fk_categorias uuid,
  p_data_vencimento timestamp without time zone,
  p_valor_original numeric,
  p_fk_fornecedores uuid default null,
  p_nome_fornecedor text default null,
  p_numero_documento text default null,
  p_data_emissao timestamp without time zone default null,
  p_juros numeric default 0,
  p_desconto numeric default 0,
  p_forma_pagamento_prevista text default null,
  p_origem_lancamento text default 'MANUAL',
  p_data_competencia date default null,
  p_recorrencia text default 'NENHUMA',
  p_fk_conta_pai uuid default null,
  p_indice_recorrencia integer default null,
  p_total_parcelas integer default null,
  p_observacoes text default null,
  p_urgente boolean default false,
  p_favorecido_tipo text default 'FORNECEDOR',
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $function$
declare
  v_usuario_id uuid;
  v_id uuid;
  v_titulo text := nullif(btrim(p_titulo), '');
  v_valor_original numeric := coalesce(p_valor_original, 0);
  v_juros numeric := coalesce(p_juros, 0);
  v_desconto numeric := coalesce(p_desconto, 0);
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  if v_titulo is null then
    return json_build_object('status', 400, 'code', 'missing_title', 'mensagem', 'Título da conta é obrigatório.');
  end if;

  if p_fk_categorias is null then
    return json_build_object('status', 400, 'code', 'missing_category', 'mensagem', 'Categoria é obrigatória.');
  end if;

  if p_data_vencimento is null then
    return json_build_object('status', 400, 'code', 'missing_due_date', 'mensagem', 'Vencimento é obrigatório.');
  end if;

  if v_valor_original < 0 or v_juros < 0 or v_desconto < 0 then
    return json_build_object('status', 400, 'code', 'invalid_amount', 'mensagem', 'Valores financeiros não podem ser negativos.');
  end if;

  insert into "RetificaPremium"."Contas_Pagar" (
    titulo,
    fk_fornecedores,
    nome_fornecedor,
    fk_categorias,
    numero_documento,
    data_emissao,
    data_vencimento,
    valor_original,
    juros,
    desconto,
    valor_final,
    valor_pago,
    status,
    forma_pagamento_prevista,
    origem_lancamento,
    data_competencia,
    recorrencia,
    fk_conta_pai,
    indice_recorrencia,
    total_parcelas,
    observacoes,
    urgente,
    fk_criado_por,
    favorecido_tipo
  )
  values (
    v_titulo,
    p_fk_fornecedores,
    nullif(btrim(p_nome_fornecedor), ''),
    p_fk_categorias,
    nullif(btrim(p_numero_documento), ''),
    p_data_emissao,
    p_data_vencimento,
    v_valor_original,
    v_juros,
    v_desconto,
    greatest(0, v_valor_original + v_juros - v_desconto),
    0,
    'PENDENTE'::"RetificaPremium".status_conta_pagar,
    nullif(btrim(p_forma_pagamento_prevista), '')::"RetificaPremium".forma_pagamento,
    coalesce(nullif(btrim(p_origem_lancamento), ''), 'MANUAL')::"RetificaPremium".origem_lancamento,
    coalesce(p_data_competencia, p_data_vencimento::date),
    coalesce(nullif(btrim(p_recorrencia), ''), 'NENHUMA')::"RetificaPremium".tipo_recorrencia,
    p_fk_conta_pai,
    p_indice_recorrencia,
    p_total_parcelas,
    nullif(btrim(p_observacoes), ''),
    coalesce(p_urgente, false),
    v_usuario_id,
    case when upper(trim(coalesce(p_favorecido_tipo, 'FORNECEDOR'))) = 'FUNCIONARIO' then 'FUNCIONARIO' else 'FORNECEDOR' end
  )
  returning id_contas_pagar into v_id;

  perform "RetificaPremium".insert_historico_conta_pagar_suporte(v_id, 'CREATED', 'Conta criada em modo suporte.');
  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'insert_conta_pagar', 'Contas_Pagar', v_id::text, 'Conta criada em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Conta a pagar criada.', 'id_contas_pagar', v_id);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

drop function if exists "RetificaPremium".update_conta_pagar_contexto_suporte(
  uuid,
  text,
  uuid,
  timestamp without time zone,
  numeric,
  uuid,
  text,
  text,
  timestamp without time zone,
  numeric,
  numeric,
  text,
  text,
  date,
  text,
  uuid,
  integer,
  integer,
  text,
  boolean,
  uuid,
  uuid
);

create or replace function "RetificaPremium".update_conta_pagar_contexto_suporte(
  p_id_contas_pagar uuid,
  p_titulo text default null,
  p_fk_categorias uuid default null,
  p_data_vencimento timestamp without time zone default null,
  p_valor_original numeric default null,
  p_fk_fornecedores uuid default null,
  p_nome_fornecedor text default null,
  p_numero_documento text default null,
  p_data_emissao timestamp without time zone default null,
  p_juros numeric default null,
  p_desconto numeric default null,
  p_forma_pagamento_prevista text default null,
  p_origem_lancamento text default null,
  p_data_competencia date default null,
  p_recorrencia text default null,
  p_fk_conta_pai uuid default null,
  p_indice_recorrencia integer default null,
  p_total_parcelas integer default null,
  p_observacoes text default null,
  p_urgente boolean default null,
  p_favorecido_tipo text default null,
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $function$
declare
  v_usuario_id uuid;
  v_atual record;
  v_valor_original numeric;
  v_juros numeric;
  v_desconto numeric;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select *
    into v_atual
  from "RetificaPremium"."Contas_Pagar"
  where id_contas_pagar = p_id_contas_pagar
    and fk_criado_por = v_usuario_id
    and excluido_em is null;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Conta não encontrada para este contexto.');
  end if;

  v_valor_original := coalesce(p_valor_original, v_atual.valor_original);
  v_juros := coalesce(p_juros, v_atual.juros, 0);
  v_desconto := coalesce(p_desconto, v_atual.desconto, 0);

  if v_valor_original < 0 or v_juros < 0 or v_desconto < 0 then
    return json_build_object('status', 400, 'code', 'invalid_amount', 'mensagem', 'Valores financeiros não podem ser negativos.');
  end if;

  update "RetificaPremium"."Contas_Pagar"
     set titulo = coalesce(nullif(btrim(p_titulo), ''), titulo),
         fk_categorias = coalesce(p_fk_categorias, fk_categorias),
         data_vencimento = coalesce(p_data_vencimento, data_vencimento),
         valor_original = v_valor_original,
         fk_fornecedores = coalesce(p_fk_fornecedores, fk_fornecedores),
         nome_fornecedor = coalesce(nullif(btrim(p_nome_fornecedor), ''), nome_fornecedor),
         numero_documento = coalesce(nullif(btrim(p_numero_documento), ''), numero_documento),
         data_emissao = coalesce(p_data_emissao, data_emissao),
         juros = v_juros,
         desconto = v_desconto,
         valor_final = greatest(0, v_valor_original + v_juros - v_desconto),
         forma_pagamento_prevista = coalesce(nullif(btrim(p_forma_pagamento_prevista), '')::"RetificaPremium".forma_pagamento, forma_pagamento_prevista),
         origem_lancamento = coalesce(nullif(btrim(p_origem_lancamento), '')::"RetificaPremium".origem_lancamento, origem_lancamento),
         data_competencia = coalesce(p_data_competencia, data_competencia),
         recorrencia = coalesce(nullif(btrim(p_recorrencia), '')::"RetificaPremium".tipo_recorrencia, recorrencia),
         fk_conta_pai = coalesce(p_fk_conta_pai, fk_conta_pai),
         indice_recorrencia = coalesce(p_indice_recorrencia, indice_recorrencia),
         total_parcelas = coalesce(p_total_parcelas, total_parcelas),
         observacoes = coalesce(nullif(btrim(p_observacoes), ''), observacoes),
         urgente = coalesce(p_urgente, urgente),
         favorecido_tipo = case
           when p_favorecido_tipo is null then favorecido_tipo
           when upper(trim(p_favorecido_tipo)) = 'FUNCIONARIO' then 'FUNCIONARIO'
           else 'FORNECEDOR'
         end,
         updated_at = now()
   where id_contas_pagar = p_id_contas_pagar
     and fk_criado_por = v_usuario_id;

  perform "RetificaPremium".insert_historico_conta_pagar_suporte(p_id_contas_pagar, 'UPDATED', 'Conta atualizada em modo suporte.');
  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'update_conta_pagar', 'Contas_Pagar', p_id_contas_pagar::text, 'Conta atualizada em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Conta atualizada.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

do $$
declare
  v_sql text;
  v_oid oid;
begin
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'RetificaPremium'
      and p.proname in (
        'get_contas_pagar',
        'get_contas_pagar_contexto_suporte'
      )
  loop
    select pg_get_functiondef(v_oid) into v_sql;
    if position('cp.favorecido_tipo' in v_sql) = 0 then
      v_sql := replace(
        v_sql,
        'cp.origem_lancamento,' || chr(10) || '      cp.excluido_em,',
        'cp.origem_lancamento,' || chr(10) || '      cp.favorecido_tipo,' || chr(10) || '      cp.excluido_em,'
      );

      if position('cp.favorecido_tipo' in v_sql) = 0 then
        raise exception 'Nao foi possivel adicionar favorecido_tipo em %', v_oid::regprocedure;
      end if;

      execute v_sql;
    end if;
  end loop;

  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'RetificaPremium'
      and p.proname in (
        'get_conta_pagar_detalhes',
        'get_conta_pagar_detalhes_contexto_suporte'
      )
  loop
    select pg_get_functiondef(v_oid) into v_sql;
    if position('''favorecido_tipo''' in v_sql) = 0 then
      v_sql := replace(
        v_sql,
        '''nome_fornecedor'', cp.nome_fornecedor,' || chr(10) || '    ''observacoes'', cp.observacoes,',
        '''nome_fornecedor'', cp.nome_fornecedor,' || chr(10) || '    ''favorecido_tipo'', cp.favorecido_tipo,' || chr(10) || '    ''observacoes'', cp.observacoes,'
      );

      if position('''favorecido_tipo''' in v_sql) = 0 then
        raise exception 'Nao foi possivel adicionar favorecido_tipo em %', v_oid::regprocedure;
      end if;

      execute v_sql;
    end if;
  end loop;
end $$;

grant execute on function "RetificaPremium".insert_conta_pagar_contexto_suporte(
  text, uuid, timestamp without time zone, numeric, uuid, text, text,
  timestamp without time zone, numeric, numeric, text, text, date, text,
  uuid, integer, integer, text, boolean, text, uuid, uuid
) to authenticated, service_role;

grant execute on function "RetificaPremium".update_conta_pagar_contexto_suporte(
  uuid, text, uuid, timestamp without time zone, numeric, uuid, text, text,
  timestamp without time zone, numeric, numeric, text, text, date, text,
  uuid, integer, integer, text, boolean, text, uuid, uuid
) to authenticated, service_role;
