-- Agrega os itens de serviço das notas em UMA query (substitui o N+1 do
-- dashboard-resumo, que chamava get_nota_servico_detalhes por nota).

create or replace function "RetificaPremium".get_servicos_resumo(p_limite integer default 500)
 returns json
 language plpgsql
 security definer
 set search_path to 'RetificaPremium', 'public'
as $function$
declare
  v_usuario_id uuid;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v_dados
  from (
    select
      rns.id_rel_notas_servi as id_rel,
      rns.fk_notas_servico as note_id,
      si.nome as descricao,
      rns.detalhes,
      rns.quantidade,
      rns.valor as preco_unitario,
      (rns.quantidade * rns.valor) * (1 - (rns.desconto / 100.0)) as subtotal_item
    from "RetificaPremium"."Rel_NotaS_Serv" rns
    join "RetificaPremium"."Servicos_ou_Itens" si on rns.fk_servicos_itens = si.id_servicos_itens
    where rns.fk_notas_servico in (
      select ns.id_notas_servico
      from "RetificaPremium"."Notas_de_Servico" ns
      where ns.criado_por_usuario = v_usuario_id
      order by ns.created_at desc
      limit coalesce(p_limite, 500)
    )
  ) t;

  return json_build_object('status', 200, 'mensagem', 'Serviços agregados.', 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

create or replace function "RetificaPremium".get_servicos_resumo_contexto_suporte(
  p_limite integer default 500,
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
 returns json
 language plpgsql
 security definer
 set search_path to 'RetificaPremium', 'public'
as $function$
declare
  v_usuario_id uuid;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v_dados
  from (
    select
      rns.id_rel_notas_servi as id_rel,
      rns.fk_notas_servico as note_id,
      si.nome as descricao,
      rns.detalhes,
      rns.quantidade,
      rns.valor as preco_unitario,
      (rns.quantidade * rns.valor) * (1 - (rns.desconto / 100.0)) as subtotal_item
    from "RetificaPremium"."Rel_NotaS_Serv" rns
    join "RetificaPremium"."Servicos_ou_Itens" si on rns.fk_servicos_itens = si.id_servicos_itens
    where rns.fk_notas_servico in (
      select ns.id_notas_servico
      from "RetificaPremium"."Notas_de_Servico" ns
      where ns.criado_por_usuario = v_usuario_id
      order by ns.created_at desc
      limit coalesce(p_limite, 500)
    )
  ) t;

  return json_build_object('status', 200, 'mensagem', 'Serviços agregados.', 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$function$;

revoke all on function "RetificaPremium".get_servicos_resumo(integer) from public, anon;
revoke all on function "RetificaPremium".get_servicos_resumo_contexto_suporte(integer, uuid, uuid) from public, anon;
grant execute on function "RetificaPremium".get_servicos_resumo(integer) to authenticated;
grant execute on function "RetificaPremium".get_servicos_resumo_contexto_suporte(integer, uuid, uuid) to authenticated;
