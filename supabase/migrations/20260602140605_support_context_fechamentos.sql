-- Read-only closing list for audited Mega Master support sessions.
-- Keeps Fechamentos tenant isolation tied to the owner of the linked Cliente.

create or replace function "RetificaPremium".get_fechamentos_contexto_suporte(
  p_fk_clientes uuid default null,
  p_periodo text default null,
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
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where c.fk_criado_por = v_usuario_id
    and (p_fk_clientes is null or f.fk_clientes = p_fk_clientes)
    and (p_periodo is null or f.periodo = p_periodo);

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json)
  into v_dados
  from (
    select
      f.id_fechamentos,
      f.mes,
      f.ano,
      f.periodo,
      f.label,
      f.valor_total,
      f.versao,
      f.total_regeneracoes,
      f.total_edicoes,
      f.total_downloads,
      f.dados_json,
      f.pdf_url,
      f.created_at,
      f.updated_at,
      json_build_object('id', c.id_clientes, 'nome', c.nome) as cliente
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
    where c.fk_criado_por = v_usuario_id
      and (p_fk_clientes is null or f.fk_clientes = p_fk_clientes)
      and (p_periodo is null or f.periodo = p_periodo)
    order by f.created_at desc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Fechamentos encontrados.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

grant execute on function "RetificaPremium".get_fechamentos_contexto_suporte(uuid, text, integer, integer, uuid, uuid) to authenticated, service_role;
