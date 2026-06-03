-- Escritas auditadas em modo suporte para Contas a Pagar.
-- Nao usar auth.uid() como dono operacional: toda escrita de tenant usa o
-- Usuarios.id_usuarios resolvido pelo contexto de suporte ativo.

create table if not exists "RetificaPremium"."Logs_Acoes_Suporte" (
  id_log_suporte uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  fk_actor_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios),
  fk_target_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios),
  fk_sessao_suporte uuid not null references "RetificaPremium"."Sessoes_Suporte"(id_sessao_suporte),
  acao text not null,
  entidade text not null,
  entidade_id text,
  descricao text
);

alter table "RetificaPremium"."Logs_Acoes_Suporte" enable row level security;
revoke all on table "RetificaPremium"."Logs_Acoes_Suporte" from public, anon, authenticated;
grant all on table "RetificaPremium"."Logs_Acoes_Suporte" to service_role;

create index if not exists idx_logs_acoes_suporte_actor_created
  on "RetificaPremium"."Logs_Acoes_Suporte"(fk_actor_usuarios, created_at desc);

create index if not exists idx_logs_acoes_suporte_target_created
  on "RetificaPremium"."Logs_Acoes_Suporte"(fk_target_usuarios, created_at desc);

create or replace function "RetificaPremium".support_actor_usuario_id()
returns uuid
language plpgsql
stable
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_actor uuid;
begin
  select u.id_usuarios
    into v_actor
  from "RetificaPremium"."Usuarios" u
  where u.auth_id = auth.uid()
  limit 1;

  if v_actor is null then
    raise exception 'Usuário interno do suporte não encontrado.' using errcode = 'P0403';
  end if;

  return v_actor;
end;
$$;

create or replace function "RetificaPremium".insert_log_acao_suporte(
  p_fk_alvo uuid,
  p_sessao_suporte uuid,
  p_acao text,
  p_entidade text,
  p_entidade_id text default null,
  p_descricao text default null
)
returns void
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_actor uuid;
begin
  v_actor := "RetificaPremium".support_actor_usuario_id();

  insert into "RetificaPremium"."Logs_Acoes_Suporte" (
    fk_actor_usuarios,
    fk_target_usuarios,
    fk_sessao_suporte,
    acao,
    entidade,
    entidade_id,
    descricao
  )
  values (
    v_actor,
    p_fk_alvo,
    p_sessao_suporte,
    p_acao,
    p_entidade,
    p_entidade_id,
    p_descricao
  );
end;
$$;

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
    fk_criado_por
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
    'PENDENTE',
    nullif(btrim(p_forma_pagamento_prevista), '')::"RetificaPremium".forma_pagamento,
    coalesce(nullif(btrim(p_origem_lancamento), ''), 'MANUAL')::"RetificaPremium".origem_lancamento,
    coalesce(p_data_competencia, p_data_vencimento::date),
    coalesce(nullif(btrim(p_recorrencia), ''), 'NENHUMA')::"RetificaPremium".tipo_recorrencia,
    p_fk_conta_pai,
    p_indice_recorrencia,
    p_total_parcelas,
    nullif(btrim(p_observacoes), ''),
    coalesce(p_urgente, false),
    v_usuario_id
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

create or replace function "RetificaPremium".registrar_pagamento_contexto_suporte(
  p_id_contas_pagar uuid,
  p_valor_pago numeric,
  p_pago_com text default null,
  p_observacoes_pagamento text default null,
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
  v_conta record;
  v_valor_pago numeric := coalesce(p_valor_pago, 0);
  v_pago_total numeric;
  v_novo_status text;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select *
    into v_conta
  from "RetificaPremium"."Contas_Pagar"
  where id_contas_pagar = p_id_contas_pagar
    and fk_criado_por = v_usuario_id
    and excluido_em is null
  for update;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Conta não encontrada para este contexto.');
  end if;

  if v_conta.status not in ('PENDENTE', 'PARCIAL', 'AGENDADO') then
    return json_build_object('status', 400, 'code', 'invalid_status', 'mensagem', 'Conta não aceita pagamento neste status.');
  end if;

  if v_valor_pago <= 0 then
    return json_build_object('status', 400, 'code', 'invalid_amount', 'mensagem', 'Valor pago deve ser maior que zero.');
  end if;

  v_pago_total := coalesce(v_conta.valor_pago, 0) + v_valor_pago;
  v_novo_status := case when v_pago_total + 0.0001 >= v_conta.valor_final then 'PAGO' else 'PARCIAL' end;

  update "RetificaPremium"."Contas_Pagar"
     set valor_pago = least(v_pago_total, valor_final),
         status = v_novo_status::"RetificaPremium".status_conta_pagar,
         pago_em = case when v_novo_status = 'PAGO' then now() else pago_em end,
         pago_com = coalesce(nullif(btrim(p_pago_com), '')::"RetificaPremium".forma_pagamento, pago_com),
         observacoes_pagamento = coalesce(nullif(btrim(p_observacoes_pagamento), ''), observacoes_pagamento),
         updated_at = now()
   where id_contas_pagar = p_id_contas_pagar
     and fk_criado_por = v_usuario_id;

  perform "RetificaPremium".insert_historico_conta_pagar_suporte(
    p_id_contas_pagar,
    case when v_novo_status = 'PAGO' then 'PAID' else 'PARTIAL_PAYMENT' end,
    'Pagamento registrado em modo suporte.',
    jsonb_build_object('valor_pago', v_valor_pago, 'novo_status', v_novo_status)
  );
  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'registrar_pagamento', 'Contas_Pagar', p_id_contas_pagar::text, 'Pagamento registrado em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Pagamento registrado.', 'novo_status', v_novo_status);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".cancelar_conta_pagar_contexto_suporte(
  p_id_contas_pagar uuid,
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
  v_status text;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select status
    into v_status
  from "RetificaPremium"."Contas_Pagar"
  where id_contas_pagar = p_id_contas_pagar
    and fk_criado_por = v_usuario_id
    and excluido_em is null;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Conta não encontrada para este contexto.');
  end if;

  if v_status = 'CANCELADO' then
    return json_build_object('status', 400, 'code', 'invalid_action', 'mensagem', 'Conta já está cancelada.');
  end if;

  update "RetificaPremium"."Contas_Pagar"
     set status = 'CANCELADO'::"RetificaPremium".status_conta_pagar,
         updated_at = now()
   where id_contas_pagar = p_id_contas_pagar
     and fk_criado_por = v_usuario_id;

  perform "RetificaPremium".insert_historico_conta_pagar_suporte(p_id_contas_pagar, 'CANCELED', 'Conta cancelada em modo suporte.');
  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'cancelar_conta_pagar', 'Contas_Pagar', p_id_contas_pagar::text, 'Conta cancelada em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Conta cancelada.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".excluir_conta_pagar_contexto_suporte(
  p_id_contas_pagar uuid,
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
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  update "RetificaPremium"."Contas_Pagar"
     set excluido_em = coalesce(excluido_em, now()),
         updated_at = now()
   where id_contas_pagar = p_id_contas_pagar
     and fk_criado_por = v_usuario_id
     and excluido_em is null;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Conta não encontrada para este contexto.');
  end if;

  perform "RetificaPremium".insert_historico_conta_pagar_suporte(p_id_contas_pagar, 'DELETED', 'Conta excluída em modo suporte.');
  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'excluir_conta_pagar', 'Contas_Pagar', p_id_contas_pagar::text, 'Conta excluída em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Conta excluída.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

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
as $$
declare
  v_usuario_id uuid;
  v_id uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

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
    coalesce(nullif(btrim(p_tipo), ''), 'outro'),
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
$$;

create or replace function "RetificaPremium".update_anexo_conta_pagar_nome_contexto_suporte(
  p_id_anexo uuid,
  p_nome_arquivo text,
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
  v_conta uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select a.fk_contas_pagar
    into v_conta
  from "RetificaPremium"."Contas_Pagar_Anexos" a
  join "RetificaPremium"."Contas_Pagar" cp on cp.id_contas_pagar = a.fk_contas_pagar
  where a.id_anexo = p_id_anexo
    and cp.fk_criado_por = v_usuario_id;

  if v_conta is null then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Anexo não encontrado para este contexto.');
  end if;

  update "RetificaPremium"."Contas_Pagar_Anexos"
     set nome_arquivo = coalesce(nullif(btrim(p_nome_arquivo), ''), nome_arquivo)
   where id_anexo = p_id_anexo;

  perform "RetificaPremium".insert_historico_conta_pagar_suporte(v_conta, 'ATTACHMENT_UPDATED', 'Anexo renomeado em modo suporte.');
  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'update_anexo_conta_pagar_nome', 'Contas_Pagar_Anexos', p_id_anexo::text, 'Anexo renomeado em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Nome do anexo atualizado.', 'id_anexo', p_id_anexo);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".aceitar_sugestao_email_contexto_suporte(
  p_id_sugestoes_email uuid,
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
    v_sugestao.titulo_sugerido,
    v_sugestao.fk_categorias_sugerida,
    v_sugestao.vencimento_sugerido,
    v_sugestao.valor_sugerido,
    null,
    v_sugestao.fornecedor_sugerido,
    null,
    null,
    0,
    0,
    v_sugestao.forma_pagamento_sugerida,
    'EMAIL_IMPORT',
    null,
    'NENHUMA',
    null,
    null,
    null,
    null,
    false,
    p_contexto_usuario_id,
    p_sessao_suporte
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
           pago_com = nullif(btrim(v_sugestao.forma_pagamento_sugerida), '')::"RetificaPremium".forma_pagamento,
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
$$;

create or replace function "RetificaPremium".ignorar_sugestao_email_contexto_suporte(
  p_id_sugestoes_email uuid,
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
  v_auth_alvo uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select u.auth_id
    into v_auth_alvo
  from "RetificaPremium"."Usuarios" u
  where u.id_usuarios = v_usuario_id;

  if v_auth_alvo is null then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Usuário do contexto sem vínculo de autenticação.');
  end if;

  update "RetificaPremium"."Sugestoes_Email"
     set status = 'DISMISSED'
   where id_sugestoes_email = p_id_sugestoes_email
     and fk_auth_user = v_auth_alvo
     and status = 'PENDING';

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Sugestão pendente não encontrada para este contexto.');
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'ignorar_sugestao_email', 'Sugestoes_Email', p_id_sugestoes_email::text, 'Sugestão ignorada em modo suporte.');

  return json_build_object('status', 200, 'mensagem', 'Sugestão ignorada.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

-- Variantes auditadas para contratos auxiliares globais. O schema atual nao tem
-- fk_criado_por em Categorias_Contas_Pagar nem Fornecedores_Contas_Pagar; por
-- isso elas auditam o suporte, mas nao conseguem isolar esses cadastros por
-- tenant ate uma futura mudanca estrutural.

create or replace function "RetificaPremium".insert_categoria_conta_pagar_contexto_suporte(
  p_nome text,
  p_cor text default '#64748b',
  p_icone text default 'tag',
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
  v_id uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  insert into "RetificaPremium"."Categorias_Contas_Pagar"(nome, cor, icone, ativo)
  values (coalesce(nullif(btrim(p_nome), ''), 'Categoria'), coalesce(nullif(btrim(p_cor), ''), '#64748b'), coalesce(nullif(btrim(p_icone), ''), 'tag'), true)
  returning id_categorias into v_id;

  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'insert_categoria_conta_pagar', 'Categorias_Contas_Pagar', v_id::text, 'Categoria criada em modo suporte.');
  return json_build_object('status', 200, 'mensagem', 'Categoria criada.', 'id_categorias', v_id);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".update_categoria_conta_pagar_contexto_suporte(
  p_id_categorias uuid,
  p_nome text default null,
  p_cor text default null,
  p_icone text default null,
  p_ativo boolean default null,
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
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  update "RetificaPremium"."Categorias_Contas_Pagar"
     set nome = coalesce(nullif(btrim(p_nome), ''), nome),
         cor = coalesce(nullif(btrim(p_cor), ''), cor),
         icone = coalesce(nullif(btrim(p_icone), ''), icone),
         ativo = coalesce(p_ativo, ativo),
         updated_at = now()
   where id_categorias = p_id_categorias;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Categoria não encontrada.');
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'update_categoria_conta_pagar', 'Categorias_Contas_Pagar', p_id_categorias::text, 'Categoria atualizada em modo suporte.');
  return json_build_object('status', 200, 'mensagem', 'Categoria atualizada.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

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
as $$
declare
  v_usuario_id uuid;
  v_id uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  insert into "RetificaPremium"."Fornecedores_Contas_Pagar" (
    nome, nome_fantasia, tipo_documento, documento, telefone, email, ativo
  )
  values (
    coalesce(nullif(btrim(p_nome), ''), 'Fornecedor'),
    nullif(btrim(p_nome_fantasia), ''),
    nullif(btrim(p_tipo_documento), ''),
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
$$;

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
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  update "RetificaPremium"."Fornecedores_Contas_Pagar"
     set nome = coalesce(nullif(btrim(p_nome), ''), nome),
         nome_fantasia = coalesce(nullif(btrim(p_nome_fantasia), ''), nome_fantasia),
         tipo_documento = coalesce(nullif(btrim(p_tipo_documento), ''), tipo_documento),
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
$$;

create or replace function "RetificaPremium".inativar_fornecedor_contexto_suporte(
  p_id_fornecedores uuid,
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
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  update "RetificaPremium"."Fornecedores_Contas_Pagar"
     set ativo = false,
         updated_at = now()
   where id_fornecedores = p_id_fornecedores;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Fornecedor não encontrado.');
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(v_usuario_id, p_sessao_suporte, 'inativar_fornecedor', 'Fornecedores_Contas_Pagar', p_id_fornecedores::text, 'Fornecedor inativado em modo suporte.');
  return json_build_object('status', 200, 'mensagem', 'Fornecedor inativado.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

revoke execute on function "RetificaPremium".support_actor_usuario_id() from public, anon, authenticated;
revoke execute on function "RetificaPremium".insert_log_acao_suporte(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function "RetificaPremium".insert_historico_conta_pagar_suporte(uuid, text, text, jsonb) from public, anon, authenticated;

revoke execute on function "RetificaPremium".insert_conta_pagar_contexto_suporte(text, uuid, timestamp without time zone, numeric, uuid, text, text, timestamp without time zone, numeric, numeric, text, text, date, text, uuid, integer, integer, text, boolean, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".update_conta_pagar_contexto_suporte(uuid, text, uuid, timestamp without time zone, numeric, uuid, text, text, timestamp without time zone, numeric, numeric, text, text, date, text, uuid, integer, integer, text, boolean, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".registrar_pagamento_contexto_suporte(uuid, numeric, text, text, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".cancelar_conta_pagar_contexto_suporte(uuid, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".excluir_conta_pagar_contexto_suporte(uuid, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".insert_anexo_conta_pagar_contexto_suporte(uuid, text, text, text, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".update_anexo_conta_pagar_nome_contexto_suporte(uuid, text, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".aceitar_sugestao_email_contexto_suporte(uuid, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".ignorar_sugestao_email_contexto_suporte(uuid, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".insert_categoria_conta_pagar_contexto_suporte(text, text, text, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".update_categoria_conta_pagar_contexto_suporte(uuid, text, text, text, boolean, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".insert_fornecedor_contexto_suporte(text, text, text, text, text, text, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".update_fornecedor_contexto_suporte(uuid, text, text, text, text, text, text, boolean, uuid, uuid) from public, anon;
revoke execute on function "RetificaPremium".inativar_fornecedor_contexto_suporte(uuid, uuid, uuid) from public, anon;

grant execute on function "RetificaPremium".insert_conta_pagar_contexto_suporte(text, uuid, timestamp without time zone, numeric, uuid, text, text, timestamp without time zone, numeric, numeric, text, text, date, text, uuid, integer, integer, text, boolean, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".update_conta_pagar_contexto_suporte(uuid, text, uuid, timestamp without time zone, numeric, uuid, text, text, timestamp without time zone, numeric, numeric, text, text, date, text, uuid, integer, integer, text, boolean, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".registrar_pagamento_contexto_suporte(uuid, numeric, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".cancelar_conta_pagar_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".excluir_conta_pagar_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".insert_anexo_conta_pagar_contexto_suporte(uuid, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".update_anexo_conta_pagar_nome_contexto_suporte(uuid, text, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".aceitar_sugestao_email_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".ignorar_sugestao_email_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".insert_categoria_conta_pagar_contexto_suporte(text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".update_categoria_conta_pagar_contexto_suporte(uuid, text, text, text, boolean, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".insert_fornecedor_contexto_suporte(text, text, text, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".update_fornecedor_contexto_suporte(uuid, text, text, text, text, text, text, boolean, uuid, uuid) to authenticated, service_role;
grant execute on function "RetificaPremium".inativar_fornecedor_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
