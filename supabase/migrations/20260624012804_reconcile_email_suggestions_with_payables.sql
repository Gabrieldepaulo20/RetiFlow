-- Reconciles Gmail suggestions with already-created payables.
-- Goal: a payable that already exists should not keep appearing as a pending
-- email suggestion. The match is intentionally strict: similar supplier/title,
-- same due date and same amount within a small tolerance.

create or replace function "RetificaPremium".normalizar_texto_match_conta(p_value text)
returns text
language sql
immutable
as $function$
  select regexp_replace(
    lower(translate(
      coalesce(p_value, ''),
      'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
      'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
    )),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$;

create or replace function "RetificaPremium".texto_match_conta_parece_mesmo(p_left text, p_right text)
returns boolean
language sql
immutable
as $function$
  with normalized as (
    select
      "RetificaPremium".normalizar_texto_match_conta(p_left) as left_value,
      "RetificaPremium".normalizar_texto_match_conta(p_right) as right_value
  )
  select
    left_value <> ''
    and right_value <> ''
    and (
      left_value = right_value
      or (
        least(length(left_value), length(right_value)) >= 7
        and (position(left_value in right_value) > 0 or position(right_value in left_value) > 0)
      )
    )
  from normalized;
$function$;

create or replace function "RetificaPremium".reconciliar_sugestoes_email_por_usuario(
  p_auth_user uuid,
  p_usuario_id uuid
)
returns integer
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $function$
declare
  v_count integer := 0;
begin
  if p_auth_user is null or p_usuario_id is null then
    return 0;
  end if;

  update "RetificaPremium"."Sugestoes_Email" s
     set status = 'DISMISSED',
         motivo_descarte = coalesce(s.motivo_descarte, 'DUPLICADO'),
         decidido_em = coalesce(s.decidido_em, now())
   where s.fk_auth_user = p_auth_user
     and s.status = 'PENDING'
     and s.valor_sugerido is not null
     and s.vencimento_sugerido is not null
     and exists (
       select 1
       from "RetificaPremium"."Contas_Pagar" c
       where c.fk_criado_por = p_usuario_id
         and c.excluido_em is null
         and c.status::text <> 'CANCELADO'
         and c.data_vencimento::date = s.vencimento_sugerido::date
         and abs(coalesce(c.valor_final, c.valor_original, 0) - s.valor_sugerido) <= greatest(1::numeric, s.valor_sugerido * 0.02)
         and (
           "RetificaPremium".texto_match_conta_parece_mesmo(c.nome_fornecedor, s.fornecedor_sugerido)
           or "RetificaPremium".texto_match_conta_parece_mesmo(c.titulo, s.fornecedor_sugerido)
           or "RetificaPremium".texto_match_conta_parece_mesmo(c.nome_fornecedor, s.titulo_sugerido)
           or "RetificaPremium".texto_match_conta_parece_mesmo(c.titulo, s.titulo_sugerido)
         )
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function "RetificaPremium".reconciliar_sugestoes_email(p_status text default 'PENDING')
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $function$
declare
  v_user uuid := auth.uid();
  v_usuario_id uuid;
  v_reconciliadas integer := 0;
begin
  if v_user is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.', 'reconciliadas', 0);
  end if;

  if p_status is not null and upper(btrim(p_status)) <> 'PENDING' then
    return json_build_object('status', 200, 'mensagem', 'Nada para reconciliar neste status.', 'reconciliadas', 0);
  end if;

  select u.id_usuarios
    into v_usuario_id
  from "RetificaPremium"."Usuarios" u
  where u.auth_id = v_user
  order by u.created_at asc
  limit 1;

  if v_usuario_id is null then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Usuário sem cadastro operacional.', 'reconciliadas', 0);
  end if;

  v_reconciliadas := "RetificaPremium".reconciliar_sugestoes_email_por_usuario(v_user, v_usuario_id);

  return json_build_object(
    'status', 200,
    'mensagem', 'Sugestões reconciliadas.',
    'reconciliadas', v_reconciliadas
  );
exception
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm, 'reconciliadas', 0);
end;
$function$;

create or replace function "RetificaPremium".reconciliar_sugestoes_email_contexto_suporte(
  p_status text default 'PENDING',
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
  v_auth_alvo uuid;
  v_reconciliadas integer := 0;
begin
  if p_status is not null and upper(btrim(p_status)) <> 'PENDING' then
    return json_build_object('status', 200, 'mensagem', 'Nada para reconciliar neste status.', 'reconciliadas', 0);
  end if;

  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select u.auth_id
    into v_auth_alvo
  from "RetificaPremium"."Usuarios" u
  where u.id_usuarios = v_usuario_id;

  if v_auth_alvo is null then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Usuário do contexto sem vínculo de autenticação.', 'reconciliadas', 0);
  end if;

  v_reconciliadas := "RetificaPremium".reconciliar_sugestoes_email_por_usuario(v_auth_alvo, v_usuario_id);

  return json_build_object(
    'status', 200,
    'mensagem', 'Sugestões reconciliadas.',
    'reconciliadas', v_reconciliadas
  );
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm, 'reconciliadas', 0);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm, 'reconciliadas', 0);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm, 'reconciliadas', 0);
end;
$function$;

create or replace function "RetificaPremium".get_sugestoes_email(p_status text default null)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $function$
declare
  v_user uuid := auth.uid();
  v_usuario_id uuid;
  v_dados json;
begin
  if v_user is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.', 'dados', '[]'::json);
  end if;

  if p_status is null or upper(btrim(p_status)) = 'PENDING' then
    select u.id_usuarios
      into v_usuario_id
    from "RetificaPremium"."Usuarios" u
    where u.auth_id = v_user
    order by u.created_at asc
    limit 1;

    perform "RetificaPremium".reconciliar_sugestoes_email_por_usuario(v_user, v_usuario_id);
  end if;

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json)
  into v_dados
  from (
    select
      s.id_sugestoes_email,
      s.assunto,
      s.nome_remetente,
      s.email_remetente,
      s.recebido_em,
      s.titulo_sugerido,
      s.valor_sugerido,
      s.vencimento_sugerido,
      s.fornecedor_sugerido,
      s.forma_pagamento_sugerida,
      s.confianca,
      s.status,
      s.status_sugerido,
      s.pago_em_sugerido,
      s.trecho_email,
      s.sender_risk,
      s.verification_signals,
      s.fraud_signals,
      s.created_at,
      case when s.fk_categorias_sugerida is not null then
        json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone)
      else null end as categoria_sugerida
    from "RetificaPremium"."Sugestoes_Email" s
    left join "RetificaPremium"."Categorias_Contas_Pagar" cat on s.fk_categorias_sugerida = cat.id_categorias
    where s.fk_auth_user = v_user
      and (p_status is null or s.status::text = upper(btrim(p_status)))
    order by s.created_at desc
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Sugestões encontradas.', 'dados', v_dados);
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm, 'dados', '[]'::json);
end;
$function$;

create or replace function "RetificaPremium".get_sugestoes_email_contexto_suporte(
  p_status text default null,
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
  v_auth_alvo uuid;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select u.auth_id
    into v_auth_alvo
  from "RetificaPremium"."Usuarios" u
  where u.id_usuarios = v_usuario_id;

  if v_auth_alvo is null then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Usuário do contexto sem vínculo de autenticação.', 'dados', '[]'::json);
  end if;

  if p_status is null or upper(btrim(p_status)) = 'PENDING' then
    perform "RetificaPremium".reconciliar_sugestoes_email_por_usuario(v_auth_alvo, v_usuario_id);
  end if;

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json)
  into v_dados
  from (
    select
      s.id_sugestoes_email,
      s.assunto,
      s.nome_remetente,
      s.email_remetente,
      s.recebido_em,
      s.titulo_sugerido,
      s.valor_sugerido,
      s.vencimento_sugerido,
      s.fornecedor_sugerido,
      s.forma_pagamento_sugerida,
      s.confianca,
      s.status,
      s.status_sugerido,
      s.pago_em_sugerido,
      s.trecho_email,
      s.sender_risk,
      s.verification_signals,
      s.fraud_signals,
      s.created_at,
      case when s.fk_categorias_sugerida is not null then
        json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone)
      else null end as categoria_sugerida
    from "RetificaPremium"."Sugestoes_Email" s
    left join "RetificaPremium"."Categorias_Contas_Pagar" cat on s.fk_categorias_sugerida = cat.id_categorias
    where s.fk_auth_user = v_auth_alvo
      and (p_status is null or s.status::text = upper(btrim(p_status)))
    order by s.created_at desc
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Sugestões encontradas.', 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm, 'dados', '[]'::json);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm, 'dados', '[]'::json);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm, 'dados', '[]'::json);
end;
$function$;

create or replace function "RetificaPremium".aceitar_sugestao_email(p_id_sugestoes_email uuid)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $function$
declare
  v_user uuid := auth.uid();
  v_usuario_id uuid;
  v_sugestao record;
  v_retorno_json json;
  v_id_contas_pagar uuid;
  v_paid_at timestamp without time zone;
begin
  if v_user is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.');
  end if;

  if p_id_sugestoes_email is null then
    raise exception 'ID da sugestão é obrigatório.' using errcode = 'P0810';
  end if;

  select u.id_usuarios
    into v_usuario_id
  from "RetificaPremium"."Usuarios" u
  where u.auth_id = v_user
  order by u.created_at asc
  limit 1;

  perform "RetificaPremium".reconciliar_sugestoes_email_por_usuario(v_user, v_usuario_id);

  select *
  into v_sugestao
  from "RetificaPremium"."Sugestoes_Email"
  where id_sugestoes_email = p_id_sugestoes_email
    and fk_auth_user = v_user;

  if not found then
    raise exception 'Sugestão não encontrada para este usuário.' using errcode = 'P0811';
  end if;

  if v_sugestao.status <> 'PENDING' then
    if v_sugestao.status = 'DISMISSED' and v_sugestao.motivo_descarte = 'DUPLICADO' then
      return json_build_object(
        'status', 409,
        'code', 'duplicated_existing_payable',
        'mensagem', 'Esta sugestão já corresponde a uma conta cadastrada. Atualizamos a lista para evitar duplicidade.'
      );
    end if;
    raise exception 'Esta sugestão já foi processada.' using errcode = 'P0812';
  end if;

  v_retorno_json := "RetificaPremium".insert_conta_pagar(
    p_titulo => v_sugestao.titulo_sugerido,
    p_fk_categorias => v_sugestao.fk_categorias_sugerida,
    p_data_vencimento => v_sugestao.vencimento_sugerido,
    p_valor_original => v_sugestao.valor_sugerido,
    p_fk_fornecedores => null,
    p_nome_fornecedor => v_sugestao.fornecedor_sugerido,
    p_numero_documento => null,
    p_data_emissao => null,
    p_juros => 0,
    p_desconto => 0,
    p_forma_pagamento_prevista => v_sugestao.forma_pagamento_sugerida::text,
    p_origem_lancamento => 'EMAIL_IMPORT',
    p_data_competencia => null,
    p_recorrencia => 'NENHUMA',
    p_fk_conta_pai => null,
    p_indice_recorrencia => null,
    p_total_parcelas => null,
    p_observacoes => null,
    p_urgente => false,
    p_favorecido_tipo => 'FORNECEDOR'
  );

  if (v_retorno_json->>'status')::int <> 200 then
    raise exception '%', v_retorno_json->>'mensagem';
  end if;

  v_id_contas_pagar := nullif(v_retorno_json->>'id_contas_pagar', '')::uuid;

  if v_sugestao.status_sugerido = 'PAGO' then
    v_paid_at := coalesce(v_sugestao.pago_em_sugerido, now());

    update "RetificaPremium"."Contas_Pagar"
       set status = 'PAGO'::"RetificaPremium".status_conta_pagar,
           valor_pago = valor_final,
           pago_em = v_paid_at,
           pago_com = nullif(btrim(v_sugestao.forma_pagamento_sugerida::text), '')::"RetificaPremium".forma_pagamento,
           updated_at = now()
     where id_contas_pagar = v_id_contas_pagar;
  end if;

  update "RetificaPremium"."Sugestoes_Email"
  set status = 'ACCEPTED'
  where id_sugestoes_email = p_id_sugestoes_email
    and fk_auth_user = v_user;

  begin
    perform "RetificaPremium".insert_log(
      'sugestao_email_aceita',
      'Sugestoes_Email',
      p_id_sugestoes_email::text,
      case when v_sugestao.status_sugerido = 'PAGO'
        then 'Sugestão aceita. Conta paga criada: ' || v_sugestao.titulo_sugerido
        else 'Sugestão aceita. Conta criada: ' || v_sugestao.titulo_sugerido
      end
    );
  exception when others then null;
  end;

  return json_build_object(
    'status', 200,
    'mensagem', case when v_sugestao.status_sugerido = 'PAGO'
      then 'Sugestão aceita. Conta paga criada com sucesso.'
      else 'Sugestão aceita. Conta a pagar criada com sucesso.'
    end,
    'id_contas_pagar', v_id_contas_pagar
  );
exception
  when sqlstate 'P0810' then return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', sqlerrm);
  when sqlstate 'P0811' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when sqlstate 'P0812' then return json_build_object('status', 400, 'code', 'already_processed', 'mensagem', sqlerrm);
  when raise_exception then return json_build_object('status', 400, 'code', 'validation_error', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

create or replace function "RetificaPremium".aceitar_sugestao_email_contexto_suporte(
  p_id_sugestoes_email uuid,
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
  v_auth_alvo uuid;
  v_sugestao record;
  v_conta json;
  v_id_contas_pagar uuid;
  v_paid_at timestamp without time zone;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select u.auth_id
    into v_auth_alvo
  from "RetificaPremium"."Usuarios" u
  where u.id_usuarios = v_usuario_id;

  if v_auth_alvo is null then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Usuário do contexto sem vínculo de autenticação.');
  end if;

  perform "RetificaPremium".reconciliar_sugestoes_email_por_usuario(v_auth_alvo, v_usuario_id);

  select *
    into v_sugestao
  from "RetificaPremium"."Sugestoes_Email"
  where id_sugestoes_email = p_id_sugestoes_email
    and fk_auth_user = v_auth_alvo;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Sugestão não encontrada para este contexto.');
  end if;

  if v_sugestao.status <> 'PENDING' then
    if v_sugestao.status = 'DISMISSED' and v_sugestao.motivo_descarte = 'DUPLICADO' then
      return json_build_object(
        'status', 409,
        'code', 'duplicated_existing_payable',
        'mensagem', 'Esta sugestão já corresponde a uma conta cadastrada. Atualizamos a lista para evitar duplicidade.'
      );
    end if;
    return json_build_object('status', 400, 'code', 'already_processed', 'mensagem', 'Esta sugestão já foi processada.');
  end if;

  v_conta := "RetificaPremium".insert_conta_pagar_contexto_suporte(
    p_titulo => v_sugestao.titulo_sugerido,
    p_fk_categorias => v_sugestao.fk_categorias_sugerida,
    p_data_vencimento => v_sugestao.vencimento_sugerido,
    p_valor_original => v_sugestao.valor_sugerido,
    p_fk_fornecedores => null::uuid,
    p_nome_fornecedor => v_sugestao.fornecedor_sugerido,
    p_numero_documento => null::text,
    p_data_emissao => null::timestamp without time zone,
    p_juros => 0::numeric,
    p_desconto => 0::numeric,
    p_forma_pagamento_prevista => v_sugestao.forma_pagamento_sugerida::text,
    p_origem_lancamento => 'EMAIL_IMPORT'::text,
    p_data_competencia => null::date,
    p_recorrencia => 'NENHUMA'::text,
    p_fk_conta_pai => null::uuid,
    p_indice_recorrencia => null::integer,
    p_total_parcelas => null::integer,
    p_observacoes => null::text,
    p_urgente => false,
    p_favorecido_tipo => 'FORNECEDOR'::text,
    p_contexto_usuario_id => p_contexto_usuario_id,
    p_sessao_suporte => p_sessao_suporte
  );

  if (v_conta->>'status')::int <> 200 then
    return v_conta;
  end if;

  v_id_contas_pagar := nullif(v_conta->>'id_contas_pagar', '')::uuid;

  if v_sugestao.status_sugerido = 'PAGO' then
    v_paid_at := coalesce(v_sugestao.pago_em_sugerido, now());

    update "RetificaPremium"."Contas_Pagar"
       set status = 'PAGO'::"RetificaPremium".status_conta_pagar,
           valor_pago = valor_final,
           pago_em = v_paid_at,
           pago_com = nullif(btrim(v_sugestao.forma_pagamento_sugerida::text), '')::"RetificaPremium".forma_pagamento,
           updated_at = now()
     where id_contas_pagar = v_id_contas_pagar
       and fk_criado_por = v_usuario_id;

    perform "RetificaPremium".insert_historico_conta_pagar_suporte(v_id_contas_pagar, 'PAID', 'Conta criada como paga a partir de sugestão em modo suporte.');
  end if;

  update "RetificaPremium"."Sugestoes_Email"
     set status = 'ACCEPTED'
   where id_sugestoes_email = p_id_sugestoes_email
     and fk_auth_user = v_auth_alvo;

  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'aceitar_sugestao_email', 'Sugestoes_Email', p_id_sugestoes_email::text, 'Sugestão aceita em modo suporte.');

  return json_build_object(
    'status', 200,
    'mensagem', case when v_sugestao.status_sugerido = 'PAGO'
      then 'Sugestão aceita. Conta paga criada com sucesso.'
      else 'Sugestão aceita. Conta a pagar criada com sucesso.'
    end,
    'id_contas_pagar', v_id_contas_pagar
  );
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

revoke all on function "RetificaPremium".normalizar_texto_match_conta(text) from public, anon, authenticated;
revoke all on function "RetificaPremium".texto_match_conta_parece_mesmo(text, text) from public, anon, authenticated;
revoke all on function "RetificaPremium".reconciliar_sugestoes_email_por_usuario(uuid, uuid) from public, anon, authenticated;
revoke all on function "RetificaPremium".reconciliar_sugestoes_email(text) from public, anon;
revoke all on function "RetificaPremium".reconciliar_sugestoes_email_contexto_suporte(text, uuid, uuid) from public, anon;

grant execute on function "RetificaPremium".reconciliar_sugestoes_email(text) to authenticated, service_role;
grant execute on function "RetificaPremium".reconciliar_sugestoes_email_contexto_suporte(text, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".get_sugestoes_email(text) to authenticated, service_role;
grant execute on function "RetificaPremium".get_sugestoes_email_contexto_suporte(text, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".aceitar_sugestao_email(uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".aceitar_sugestao_email_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
