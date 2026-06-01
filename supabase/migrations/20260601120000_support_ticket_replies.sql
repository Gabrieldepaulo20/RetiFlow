-- Respostas de chamado de suporte: anexa a resposta (vinda por e-mail via SES inbound)
-- ao chamado e permite a cliente ver + marcar como lida (notificação in-app).
-- Não altera a RPC existente get_chamados_suporte; adiciona RPCs novas e colunas.

alter table "RetificaPremium"."Chamados_Suporte"
  add column if not exists resposta text,
  add column if not exists respondido_em timestamp with time zone,
  add column if not exists respondido_por text,
  add column if not exists lida_em timestamp with time zone;

-- Leitura dos chamados do próprio usuário, já com a resposta e flag de não-lida.
create or replace function "RetificaPremium".get_meus_chamados_suporte()
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_user uuid := auth.uid();
  v_dados json;
begin
  if v_user is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.', 'dados', '[]'::json);
  end if;

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json)
  into v_dados
  from (
    select
      s.id_chamados_suporte,
      s.created_at,
      s.mensagem,
      s.status,
      s.email_to,
      s.email_sent_at,
      s.email_error,
      s.resposta,
      s.respondido_em,
      s.respondido_por,
      s.lida_em
    from "RetificaPremium"."Chamados_Suporte" s
    where s.fk_auth_user = v_user
    order by s.created_at desc
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Chamados encontrados.', 'dados', v_dados);
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

-- Marca como lidas todas as respostas ainda não lidas do usuário (zera o badge).
create or replace function "RetificaPremium".marcar_chamados_suporte_lidos()
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.');
  end if;

  update "RetificaPremium"."Chamados_Suporte"
     set lida_em = now()
   where fk_auth_user = v_user
     and resposta is not null
     and lida_em is null;

  return json_build_object('status', 200, 'mensagem', 'Respostas marcadas como lidas.');
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

-- Anexa a resposta a um chamado (chamado pelo webhook SES inbound via service_role).
-- p_respondido_por: identificação livre de quem respondeu (e-mail do remetente).
create or replace function "RetificaPremium".registrar_resposta_chamado(
  p_id_chamados_suporte uuid,
  p_resposta text,
  p_respondido_por text default null
)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_resposta text := nullif(btrim(p_resposta), '');
begin
  if p_id_chamados_suporte is null then
    return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', 'ID do chamado é obrigatório.');
  end if;
  if v_resposta is null then
    return json_build_object('status', 400, 'code', 'empty_reply', 'mensagem', 'Resposta vazia.');
  end if;

  update "RetificaPremium"."Chamados_Suporte"
     set resposta = left(v_resposta, 5000),
         respondido_em = now(),
         respondido_por = left(coalesce(p_respondido_por, 'suporte'), 160),
         lida_em = null,
         status = 'RESOLVED'
   where id_chamados_suporte = p_id_chamados_suporte;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Chamado não encontrado.');
  end if;

  return json_build_object('status', 200, 'mensagem', 'Resposta registrada.');
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

-- Acesso: leitura/escrita do próprio usuário via funções; só authenticated/service_role.
revoke execute on function "RetificaPremium".get_meus_chamados_suporte() from public, anon;
grant execute on function "RetificaPremium".get_meus_chamados_suporte() to authenticated, service_role;
revoke execute on function "RetificaPremium".marcar_chamados_suporte_lidos() from public, anon;
grant execute on function "RetificaPremium".marcar_chamados_suporte_lidos() to authenticated, service_role;
-- registrar_resposta_chamado: só service_role (webhook). Nunca anon/authenticated.
revoke execute on function "RetificaPremium".registrar_resposta_chamado(uuid, text, text) from public, anon, authenticated;
grant execute on function "RetificaPremium".registrar_resposta_chamado(uuid, text, text) to service_role;
