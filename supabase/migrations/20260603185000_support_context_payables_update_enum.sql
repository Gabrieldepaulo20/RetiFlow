-- Alinha edicao de contas em modo suporte com os enums reais do banco.

create or replace function "RetificaPremium".insert_historico_conta_pagar_suporte(
  p_fk_contas_pagar uuid,
  p_acao text,
  p_descricao text,
  p_alteracoes_campos jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_acao "RetificaPremium".acao_historico_conta;
begin
  v_acao := case p_acao
    when 'CANCELED' then 'CANCELLED'
    when 'PARTIAL_PAYMENT' then 'PARTIAL_PAID'
    when 'ATTACHMENT_UPDATED' then 'UPDATED'
    else p_acao
  end::"RetificaPremium".acao_historico_conta;

  insert into "RetificaPremium"."Contas_Pagar_Historico" (
    fk_contas_pagar,
    acao,
    descricao,
    alteracoes_campos,
    fk_usuarios
  )
  values (
    p_fk_contas_pagar,
    v_acao,
    p_descricao,
    coalesce(p_alteracoes_campos, '{}'::jsonb),
    "RetificaPremium".support_actor_usuario_id()
  );
end;
$$;

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
$$;

grant execute on function "RetificaPremium".insert_historico_conta_pagar_suporte(uuid, text, text, jsonb) to service_role;
revoke execute on function "RetificaPremium".insert_historico_conta_pagar_suporte(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function "RetificaPremium".update_conta_pagar_contexto_suporte(uuid, text, uuid, timestamp without time zone, numeric, uuid, text, text, timestamp without time zone, numeric, numeric, text, text, date, text, uuid, integer, integer, text, boolean, uuid, uuid) to authenticated, service_role;
