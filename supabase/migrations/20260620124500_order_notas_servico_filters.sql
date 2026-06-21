-- Adiciona ordenacao segura nas RPCs de listagem de O.S.
-- Campos aceitos:
-- - p_ordem_campo: 'data' ou 'os'
-- - p_ordem_direcao: 'asc' ou 'desc'
-- Valores invalidos caem no padrao data desc.

drop function if exists "RetificaPremium".get_notas_servico(uuid, smallint, text, integer, integer, date, date, boolean);
drop function if exists "RetificaPremium".get_notas_servico(uuid, smallint, text, integer, integer, date, date, boolean, text, text);

create or replace function "RetificaPremium".get_notas_servico(
  p_fk_clientes uuid default null,
  p_fk_status smallint default null,
  p_busca text default null,
  p_limite integer default 50,
  p_offset integer default 0,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_apenas_sem_fechamento boolean default false,
  p_ordem_campo text default 'data',
  p_ordem_direcao text default 'desc'
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
  v_ordem_campo text := case when lower(coalesce(p_ordem_campo, 'data')) in ('data', 'os') then lower(coalesce(p_ordem_campo, 'data')) else 'data' end;
  v_ordem_direcao text := case when lower(coalesce(p_ordem_direcao, 'desc')) in ('asc', 'desc') then lower(coalesce(p_ordem_direcao, 'desc')) else 'desc' end;
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

  select coalesce(json_agg(r), '[]'::json)
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
    order by
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end asc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end desc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then ns.os end asc,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then ns.os end desc,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'asc' then ns.created_at end asc nulls last,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'desc' then ns.created_at end desc nulls last,
      ns.created_at desc,
      ns.id_notas_servico desc
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

drop function if exists "RetificaPremium".get_notas_servico_contexto_suporte(uuid, smallint, text, integer, integer, uuid, uuid);
drop function if exists "RetificaPremium".get_notas_servico_contexto_suporte(uuid, smallint, text, integer, integer, date, date, uuid, uuid);
drop function if exists "RetificaPremium".get_notas_servico_contexto_suporte(uuid, smallint, text, integer, integer, date, date, text, text, uuid, uuid);

create or replace function "RetificaPremium".get_notas_servico_contexto_suporte(
  p_fk_clientes uuid default null,
  p_fk_status smallint default null,
  p_busca text default null,
  p_limite integer default 50,
  p_offset integer default 0,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_ordem_campo text default 'data',
  p_ordem_direcao text default 'desc',
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
  v_ordem_campo text := case when lower(coalesce(p_ordem_campo, 'data')) in ('data', 'os') then lower(coalesce(p_ordem_campo, 'data')) else 'data' end;
  v_ordem_direcao text := case when lower(coalesce(p_ordem_direcao, 'desc')) in ('asc', 'desc') then lower(coalesce(p_ordem_direcao, 'desc')) else 'desc' end;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select count(*)
  into v_total
  from "RetificaPremium"."Notas_de_Servico" ns
  where ns.criado_por_usuario = v_usuario_id
    and (p_fk_clientes is null or ns.fk_clientes = p_fk_clientes)
    and (p_fk_status is null or ns.fk_status = p_fk_status)
    and (p_busca is null or ns.os ilike '%' || p_busca || '%' or ns.defeito ilike '%' || p_busca || '%')
    and (p_data_inicio is null or ns.created_at >= p_data_inicio::timestamp)
    and (p_data_fim is null or ns.created_at < (p_data_fim::timestamp + interval '1 day'));

  select coalesce(json_agg(r), '[]'::json)
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
    order by
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end asc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then nullif(regexp_replace(ns.os, '\D', '', 'g'), '')::numeric end desc nulls last,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'asc' then ns.os end asc,
      case when v_ordem_campo = 'os' and v_ordem_direcao = 'desc' then ns.os end desc,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'asc' then ns.created_at end asc nulls last,
      case when v_ordem_campo = 'data' and v_ordem_direcao = 'desc' then ns.created_at end desc nulls last,
      ns.created_at desc,
      ns.id_notas_servico desc
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

grant execute on function "RetificaPremium".get_notas_servico(uuid, smallint, text, integer, integer, date, date, boolean, text, text) to authenticated, service_role;
grant execute on function "RetificaPremium".get_notas_servico_contexto_suporte(uuid, smallint, text, integer, integer, date, date, text, text, uuid, uuid) to authenticated, service_role;
