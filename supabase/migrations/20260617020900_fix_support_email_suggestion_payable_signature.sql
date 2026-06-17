-- Corrige RPCs de suporte em Contas a Pagar que ficaram com casts implicitos
-- ou chamada posicional depois da evolucao do contrato de favorecido/parcelas.
-- Sem mudanca de tabela, RLS ou policy.

create or replace function "RetificaPremium".insert_anexo_conta_pagar_contexto_suporte(
  p_fk_contas_pagar uuid,
  p_tipo text,
  p_nome_arquivo text,
  p_url text,
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
  v_tipo "RetificaPremium".tipo_anexo_conta;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);
  v_tipo := case upper(btrim(coalesce(p_tipo, '')))
    when 'BOLETO' then 'BOLETO'::"RetificaPremium".tipo_anexo_conta
    when 'NOTA_FISCAL' then 'NOTA_FISCAL'::"RetificaPremium".tipo_anexo_conta
    when 'COMPROVANTE' then 'COMPROVANTE'::"RetificaPremium".tipo_anexo_conta
    when 'CONTRATO' then 'CONTRATO'::"RetificaPremium".tipo_anexo_conta
    else 'OUTRO'::"RetificaPremium".tipo_anexo_conta
  end;

  if not exists (
    select 1 from "RetificaPremium"."Contas_Pagar"
    where id_contas_pagar = p_fk_contas_pagar
      and fk_criado_por = v_usuario_id
      and excluido_em is null
  ) then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Conta não encontrada para este contexto.');
  end if;

  insert into "RetificaPremium"."Contas_Pagar_Anexos" (
    fk_contas_pagar,
    tipo,
    nome_arquivo,
    url,
    fk_criado_por
  )
  values (
    p_fk_contas_pagar,
    v_tipo,
    coalesce(nullif(btrim(p_nome_arquivo), ''), 'Anexo'),
    p_url,
    v_usuario_id
  )
  returning id_anexo into v_id;

  perform "RetificaPremium".insert_historico_conta_pagar_suporte(p_fk_contas_pagar, 'ATTACHMENT_ADDED', 'Anexo registrado em modo suporte.');
  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'insert_anexo_conta_pagar', 'Contas_Pagar_Anexos', v_id::text, 'Anexo registrado em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Anexo registrado.', 'id_anexo', v_id);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

create or replace function "RetificaPremium".insert_fornecedor_contexto_suporte(
  p_nome text,
  p_nome_fantasia text default null,
  p_tipo_documento text default null,
  p_documento text default null,
  p_telefone text default null,
  p_email text default null,
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
  v_tipo_documento "RetificaPremium".tipo_documento;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);
  v_tipo_documento := case upper(btrim(coalesce(p_tipo_documento, '')))
    when 'CPF' then 'CPF'::"RetificaPremium".tipo_documento
    when 'CNPJ' then 'CNPJ'::"RetificaPremium".tipo_documento
    else null
  end;

  insert into "RetificaPremium"."Fornecedores_Contas_Pagar" (
    nome, nome_fantasia, tipo_documento, documento, telefone, email, ativo
  )
  values (
    coalesce(nullif(btrim(p_nome), ''), 'Fornecedor'),
    nullif(btrim(p_nome_fantasia), ''),
    v_tipo_documento,
    nullif(btrim(p_documento), ''),
    nullif(btrim(p_telefone), ''),
    nullif(btrim(p_email), ''),
    true
  )
  returning id_fornecedores into v_id;

  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'insert_fornecedor', 'Fornecedores_Contas_Pagar', v_id::text, 'Fornecedor criado em modo suporte.');
  return json_build_object('status', 200, 'mensagem', 'Fornecedor criado.', 'id_fornecedores', v_id);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

create or replace function "RetificaPremium".update_fornecedor_contexto_suporte(
  p_id_fornecedores uuid,
  p_nome text default null,
  p_nome_fantasia text default null,
  p_tipo_documento text default null,
  p_documento text default null,
  p_telefone text default null,
  p_email text default null,
  p_ativo boolean default null,
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
  v_tipo_documento "RetificaPremium".tipo_documento;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);
  v_tipo_documento := case upper(btrim(coalesce(p_tipo_documento, '')))
    when 'CPF' then 'CPF'::"RetificaPremium".tipo_documento
    when 'CNPJ' then 'CNPJ'::"RetificaPremium".tipo_documento
    else null
  end;

  update "RetificaPremium"."Fornecedores_Contas_Pagar"
     set nome = coalesce(nullif(btrim(p_nome), ''), nome),
         nome_fantasia = coalesce(nullif(btrim(p_nome_fantasia), ''), nome_fantasia),
         tipo_documento = coalesce(v_tipo_documento, tipo_documento),
         documento = coalesce(nullif(btrim(p_documento), ''), documento),
         telefone = coalesce(nullif(btrim(p_telefone), ''), telefone),
         email = coalesce(nullif(btrim(p_email), ''), email),
         ativo = coalesce(p_ativo, ativo),
         updated_at = now()
   where id_fornecedores = p_id_fornecedores;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Fornecedor não encontrado.');
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'update_fornecedor', 'Fornecedores_Contas_Pagar', p_id_fornecedores::text, 'Fornecedor atualizado em modo suporte.');
  return json_build_object('status', 200, 'mensagem', 'Fornecedor atualizado.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
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

  select *
    into v_sugestao
  from "RetificaPremium"."Sugestoes_Email"
  where id_sugestoes_email = p_id_sugestoes_email
    and fk_auth_user = v_auth_alvo;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Sugestão não encontrada para este contexto.');
  end if;

  if v_sugestao.status <> 'PENDING' then
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
