-- Corrige a aceitacao de sugestoes de e-mail depois da adicao de
-- p_favorecido_tipo em insert_conta_pagar. Como a assinatura antiga ainda
-- existe por compatibilidade, a chamada posicional ficava ambigua.

create or replace function "RetificaPremium".aceitar_sugestao_email(p_id_sugestoes_email uuid)
returns json
language plpgsql
security definer
as $function$
declare
  v_user uuid := auth.uid();
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

  select *
  into v_sugestao
  from "RetificaPremium"."Sugestoes_Email"
  where id_sugestoes_email = p_id_sugestoes_email
    and fk_auth_user = v_user;

  if not found then
    raise exception 'Sugestão não encontrada para este usuário.' using errcode = 'P0811';
  end if;

  if v_sugestao.status <> 'PENDING' then
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
       set status = 'PAGO',
           valor_pago = valor_final,
           pago_em = v_paid_at,
           pago_com = v_sugestao.forma_pagamento_sugerida,
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
