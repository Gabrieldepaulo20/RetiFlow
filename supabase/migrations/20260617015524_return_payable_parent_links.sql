-- Expõe o vínculo da série de parcelas nas RPCs de leitura de Contas a Pagar.
-- Sem mudança de tabela, RLS ou policy: apenas inclui fk_conta_pai no JSON já retornado.

create or replace function "RetificaPremium".get_contas_pagar(
  p_status text default null,
  p_fk_categorias uuid default null,
  p_fk_fornecedores uuid default null,
  p_busca text default null,
  p_apenas_urgentes boolean default null,
  p_apenas_vencidas boolean default null,
  p_incluir_excluidas boolean default false,
  p_limite integer default 50,
  p_offset integer default 0
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
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select count(*)
  into v_total
  from "RetificaPremium"."Contas_Pagar" cp
  where cp.fk_criado_por = v_usuario_id
    and (coalesce(p_incluir_excluidas, false) = true or cp.excluido_em is null)
    and (p_status is null or cp.status::text = upper(trim(p_status)))
    and (p_apenas_vencidas is null or p_apenas_vencidas = false or (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()))
    and (p_fk_categorias is null or cp.fk_categorias = p_fk_categorias)
    and (p_fk_fornecedores is null or cp.fk_fornecedores = p_fk_fornecedores)
    and (p_apenas_urgentes is null or cp.urgente = p_apenas_urgentes)
    and (p_busca is null or cp.titulo ilike '%' || p_busca || '%' or cp.nome_fornecedor ilike '%' || p_busca || '%' or cp.numero_documento ilike '%' || p_busca || '%');

  select coalesce(json_agg(r order by r.data_vencimento asc), '[]'::json)
  into v_dados
  from (
    select
      cp.id_contas_pagar,
      cp.titulo,
      cp.nome_fornecedor,
      cp.numero_documento,
      cp.data_vencimento,
      cp.data_emissao,
      cp.data_competencia,
      cp.valor_original,
      cp.juros,
      cp.desconto,
      cp.valor_final,
      cp.valor_pago,
      cp.status,
      cp.forma_pagamento_prevista,
      cp.pago_em,
      cp.pago_com,
      cp.recorrencia,
      cp.fk_conta_pai,
      cp.indice_recorrencia,
      cp.total_parcelas,
      cp.urgente,
      cp.origem_lancamento,
      cp.favorecido_tipo,
      cp.excluido_em,
      cp.created_at,
      cp.updated_at,
      (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()) as vencida,
      json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone) as categoria,
      case when cp.fk_fornecedores is not null then
        json_build_object('id', f.id_fornecedores, 'nome', f.nome)
      else null end as fornecedor
    from "RetificaPremium"."Contas_Pagar" cp
    join "RetificaPremium"."Categorias_Contas_Pagar" cat on cp.fk_categorias = cat.id_categorias
    left join "RetificaPremium"."Fornecedores_Contas_Pagar" f on cp.fk_fornecedores = f.id_fornecedores
    where cp.fk_criado_por = v_usuario_id
      and (coalesce(p_incluir_excluidas, false) = true or cp.excluido_em is null)
      and (p_status is null or cp.status::text = upper(trim(p_status)))
      and (p_apenas_vencidas is null or p_apenas_vencidas = false or (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()))
      and (p_fk_categorias is null or cp.fk_categorias = p_fk_categorias)
      and (p_fk_fornecedores is null or cp.fk_fornecedores = p_fk_fornecedores)
      and (p_apenas_urgentes is null or cp.urgente = p_apenas_urgentes)
      and (p_busca is null or cp.titulo ilike '%' || p_busca || '%' or cp.nome_fornecedor ilike '%' || p_busca || '%' or cp.numero_documento ilike '%' || p_busca || '%')
    order by cp.data_vencimento asc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Contas a pagar encontradas.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_conta_pagar_detalhes(p_id_contas_pagar uuid)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_conta json;
  v_anexos json;
  v_historico json;
  v_parcelas json;
  v_serie_pai uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if p_id_contas_pagar is null then
    raise exception 'ID da conta é obrigatório.' using errcode = 'P0700';
  end if;

  select coalesce(cp.fk_conta_pai, cp.id_contas_pagar)
  into v_serie_pai
  from "RetificaPremium"."Contas_Pagar" cp
  where cp.id_contas_pagar = p_id_contas_pagar
    and cp.fk_criado_por = v_usuario_id;

  select json_build_object(
    'id_contas_pagar', cp.id_contas_pagar,
    'titulo', cp.titulo,
    'numero_documento', cp.numero_documento,
    'data_emissao', cp.data_emissao,
    'data_vencimento', cp.data_vencimento,
    'data_competencia', cp.data_competencia,
    'valor_original', cp.valor_original,
    'juros', cp.juros,
    'desconto', cp.desconto,
    'valor_final', cp.valor_final,
    'valor_pago', cp.valor_pago,
    'status', cp.status,
    'forma_pagamento_prevista', cp.forma_pagamento_prevista,
    'pago_em', cp.pago_em,
    'pago_com', cp.pago_com,
    'observacoes_pagamento', cp.observacoes_pagamento,
    'origem_lancamento', cp.origem_lancamento,
    'status_execucao', cp.status_execucao,
    'provedor_pagamento', cp.provedor_pagamento,
    'referencia_provedor', cp.referencia_provedor,
    'agendado_para', cp.agendado_para,
    'url_comprovante', cp.url_comprovante,
    'motivo_falha', cp.motivo_falha,
    'status_conciliacao', cp.status_conciliacao,
    'recorrencia', cp.recorrencia,
    'fk_conta_pai', cp.fk_conta_pai,
    'indice_recorrencia', cp.indice_recorrencia,
    'total_parcelas', cp.total_parcelas,
    'nome_fornecedor', cp.nome_fornecedor,
    'favorecido_tipo', cp.favorecido_tipo,
    'observacoes', cp.observacoes,
    'urgente', cp.urgente,
    'excluido_em', cp.excluido_em,
    'created_at', cp.created_at,
    'updated_at', cp.updated_at,
    'vencida', (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()),
    'categoria', json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone),
    'fornecedor', case when cp.fk_fornecedores is not null then
      json_build_object('id', f.id_fornecedores, 'nome', f.nome, 'documento', f.documento, 'telefone', f.telefone, 'email', f.email)
    else null end
  )
  into v_conta
  from "RetificaPremium"."Contas_Pagar" cp
  join "RetificaPremium"."Categorias_Contas_Pagar" cat on cp.fk_categorias = cat.id_categorias
  left join "RetificaPremium"."Fornecedores_Contas_Pagar" f on cp.fk_fornecedores = f.id_fornecedores
  where cp.id_contas_pagar = p_id_contas_pagar
    and cp.fk_criado_por = v_usuario_id;

  if v_conta is null then
    raise exception 'Conta não encontrada para este usuário.' using errcode = 'P0701';
  end if;

  select coalesce(json_agg(json_build_object(
    'id_anexo', a.id_anexo,
    'tipo', a.tipo,
    'nome_arquivo', a.nome_arquivo,
    'url', a.url,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::json)
  into v_anexos
  from "RetificaPremium"."Contas_Pagar_Anexos" a
  where a.fk_contas_pagar = p_id_contas_pagar;

  select coalesce(json_agg(json_build_object(
    'id_historico_conta', h.id_historico_conta,
    'acao', h.acao,
    'descricao', h.descricao,
    'created_at', h.created_at,
    'usuario', case when h.fk_usuarios is not null then json_build_object('id', u.id_usuarios, 'nome', u.nome) else null end
  ) order by h.created_at desc), '[]'::json)
  into v_historico
  from "RetificaPremium"."Contas_Pagar_Historico" h
  left join "RetificaPremium"."Usuarios" u on h.fk_usuarios = u.id_usuarios
  where h.fk_contas_pagar = p_id_contas_pagar;

  select coalesce(json_agg(json_build_object(
    'id_contas_pagar', p.id_contas_pagar,
    'titulo', p.titulo,
    'fk_conta_pai', p.fk_conta_pai,
    'indice_recorrencia', p.indice_recorrencia,
    'total_parcelas', p.total_parcelas,
    'data_vencimento', p.data_vencimento,
    'valor_final', p.valor_final,
    'status', p.status,
    'pago_em', p.pago_em
  ) order by p.indice_recorrencia asc nulls last), '[]'::json)
  into v_parcelas
  from "RetificaPremium"."Contas_Pagar" p
  where p.fk_criado_por = v_usuario_id
    and (p.fk_conta_pai = v_serie_pai or p.id_contas_pagar = v_serie_pai)
    and p.total_parcelas > 1;

  return json_build_object('status', 200, 'conta', v_conta, 'anexos', v_anexos, 'historico', v_historico, 'parcelas', v_parcelas);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P0700' then return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', sqlerrm);
  when sqlstate 'P0701' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_contas_pagar_contexto_suporte(
  p_status text default null,
  p_fk_categorias uuid default null,
  p_fk_fornecedores uuid default null,
  p_busca text default null,
  p_apenas_urgentes boolean default null,
  p_apenas_vencidas boolean default null,
  p_incluir_excluidas boolean default false,
  p_limite integer default 50,
  p_offset integer default 0,
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
  from "RetificaPremium"."Contas_Pagar" cp
  where cp.fk_criado_por = v_usuario_id
    and (coalesce(p_incluir_excluidas, false) = true or cp.excluido_em is null)
    and (p_status is null or cp.status::text = upper(trim(p_status)))
    and (p_apenas_vencidas is null or p_apenas_vencidas = false or (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()))
    and (p_fk_categorias is null or cp.fk_categorias = p_fk_categorias)
    and (p_fk_fornecedores is null or cp.fk_fornecedores = p_fk_fornecedores)
    and (p_apenas_urgentes is null or cp.urgente = p_apenas_urgentes)
    and (p_busca is null or cp.titulo ilike '%' || p_busca || '%' or cp.nome_fornecedor ilike '%' || p_busca || '%' or cp.numero_documento ilike '%' || p_busca || '%');

  select coalesce(json_agg(r order by r.data_vencimento asc), '[]'::json)
  into v_dados
  from (
    select
      cp.id_contas_pagar,
      cp.titulo,
      cp.nome_fornecedor,
      cp.numero_documento,
      cp.data_vencimento,
      cp.data_emissao,
      cp.data_competencia,
      cp.valor_original,
      cp.juros,
      cp.desconto,
      cp.valor_final,
      cp.valor_pago,
      cp.status,
      cp.forma_pagamento_prevista,
      cp.pago_em,
      cp.pago_com,
      cp.recorrencia,
      cp.fk_conta_pai,
      cp.indice_recorrencia,
      cp.total_parcelas,
      cp.urgente,
      cp.origem_lancamento,
      cp.favorecido_tipo,
      cp.excluido_em,
      cp.created_at,
      cp.updated_at,
      (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()) as vencida,
      json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone) as categoria,
      case when cp.fk_fornecedores is not null then
        json_build_object('id', f.id_fornecedores, 'nome', f.nome)
      else null end as fornecedor
    from "RetificaPremium"."Contas_Pagar" cp
    join "RetificaPremium"."Categorias_Contas_Pagar" cat on cp.fk_categorias = cat.id_categorias
    left join "RetificaPremium"."Fornecedores_Contas_Pagar" f on cp.fk_fornecedores = f.id_fornecedores
    where cp.fk_criado_por = v_usuario_id
      and (coalesce(p_incluir_excluidas, false) = true or cp.excluido_em is null)
      and (p_status is null or cp.status::text = upper(trim(p_status)))
      and (p_apenas_vencidas is null or p_apenas_vencidas = false or (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()))
      and (p_fk_categorias is null or cp.fk_categorias = p_fk_categorias)
      and (p_fk_fornecedores is null or cp.fk_fornecedores = p_fk_fornecedores)
      and (p_apenas_urgentes is null or cp.urgente = p_apenas_urgentes)
      and (p_busca is null or cp.titulo ilike '%' || p_busca || '%' or cp.nome_fornecedor ilike '%' || p_busca || '%' or cp.numero_documento ilike '%' || p_busca || '%')
    order by cp.data_vencimento asc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Contas a pagar encontradas.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_conta_pagar_detalhes_contexto_suporte(
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
  v_conta json;
  v_anexos json;
  v_historico json;
  v_parcelas json;
  v_serie_pai uuid;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  if p_id_contas_pagar is null then
    raise exception 'ID da conta é obrigatório.' using errcode = 'P0700';
  end if;

  select coalesce(cp.fk_conta_pai, cp.id_contas_pagar)
  into v_serie_pai
  from "RetificaPremium"."Contas_Pagar" cp
  where cp.id_contas_pagar = p_id_contas_pagar
    and cp.fk_criado_por = v_usuario_id;

  select json_build_object(
    'id_contas_pagar', cp.id_contas_pagar,
    'titulo', cp.titulo,
    'numero_documento', cp.numero_documento,
    'data_emissao', cp.data_emissao,
    'data_vencimento', cp.data_vencimento,
    'data_competencia', cp.data_competencia,
    'valor_original', cp.valor_original,
    'juros', cp.juros,
    'desconto', cp.desconto,
    'valor_final', cp.valor_final,
    'valor_pago', cp.valor_pago,
    'status', cp.status,
    'forma_pagamento_prevista', cp.forma_pagamento_prevista,
    'pago_em', cp.pago_em,
    'pago_com', cp.pago_com,
    'observacoes_pagamento', cp.observacoes_pagamento,
    'origem_lancamento', cp.origem_lancamento,
    'status_execucao', cp.status_execucao,
    'provedor_pagamento', cp.provedor_pagamento,
    'referencia_provedor', cp.referencia_provedor,
    'agendado_para', cp.agendado_para,
    'url_comprovante', cp.url_comprovante,
    'motivo_falha', cp.motivo_falha,
    'status_conciliacao', cp.status_conciliacao,
    'recorrencia', cp.recorrencia,
    'fk_conta_pai', cp.fk_conta_pai,
    'indice_recorrencia', cp.indice_recorrencia,
    'total_parcelas', cp.total_parcelas,
    'nome_fornecedor', cp.nome_fornecedor,
    'favorecido_tipo', cp.favorecido_tipo,
    'observacoes', cp.observacoes,
    'urgente', cp.urgente,
    'excluido_em', cp.excluido_em,
    'created_at', cp.created_at,
    'updated_at', cp.updated_at,
    'vencida', (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()),
    'categoria', json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone),
    'fornecedor', case when cp.fk_fornecedores is not null then
      json_build_object('id', f.id_fornecedores, 'nome', f.nome, 'documento', f.documento, 'telefone', f.telefone, 'email', f.email)
    else null end
  )
  into v_conta
  from "RetificaPremium"."Contas_Pagar" cp
  join "RetificaPremium"."Categorias_Contas_Pagar" cat on cp.fk_categorias = cat.id_categorias
  left join "RetificaPremium"."Fornecedores_Contas_Pagar" f on cp.fk_fornecedores = f.id_fornecedores
  where cp.id_contas_pagar = p_id_contas_pagar
    and cp.fk_criado_por = v_usuario_id;

  if v_conta is null then
    raise exception 'Conta não encontrada para este contexto.' using errcode = 'P0701';
  end if;

  select coalesce(json_agg(json_build_object(
    'id_anexo', a.id_anexo,
    'tipo', a.tipo,
    'nome_arquivo', a.nome_arquivo,
    'url', a.url,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::json)
  into v_anexos
  from "RetificaPremium"."Contas_Pagar_Anexos" a
  where a.fk_contas_pagar = p_id_contas_pagar;

  select coalesce(json_agg(json_build_object(
    'id_historico_conta', h.id_historico_conta,
    'acao', h.acao,
    'descricao', h.descricao,
    'alteracoes_campos', h.alteracoes_campos,
    'created_at', h.created_at,
    'usuario', case when h.fk_usuarios is not null then json_build_object('id', u.id_usuarios, 'nome', u.nome) else null end
  ) order by h.created_at desc), '[]'::json)
  into v_historico
  from "RetificaPremium"."Contas_Pagar_Historico" h
  left join "RetificaPremium"."Usuarios" u on h.fk_usuarios = u.id_usuarios
  where h.fk_contas_pagar = p_id_contas_pagar;

  select coalesce(json_agg(json_build_object(
    'id_contas_pagar', p.id_contas_pagar,
    'titulo', p.titulo,
    'fk_conta_pai', p.fk_conta_pai,
    'indice_recorrencia', p.indice_recorrencia,
    'total_parcelas', p.total_parcelas,
    'data_vencimento', p.data_vencimento,
    'valor_final', p.valor_final,
    'status', p.status,
    'pago_em', p.pago_em
  ) order by p.indice_recorrencia asc nulls last), '[]'::json)
  into v_parcelas
  from "RetificaPremium"."Contas_Pagar" p
  where p.fk_criado_por = v_usuario_id
    and (p.fk_conta_pai = v_serie_pai or p.id_contas_pagar = v_serie_pai)
    and p.total_parcelas > 1;

  return json_build_object('status', 200, 'conta', v_conta, 'anexos', v_anexos, 'historico', v_historico, 'parcelas', v_parcelas);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P0700' then return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', sqlerrm);
  when sqlstate 'P0701' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;
