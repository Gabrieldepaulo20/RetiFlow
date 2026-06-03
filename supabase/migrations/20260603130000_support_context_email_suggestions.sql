-- Variante de contexto de suporte para sugestões de e-mail.
-- Corrige vazamento: em modo suporte, get_sugestoes_email rodava sob auth.uid()
-- do Mega Master e mostrava as sugestões DO SUPORTE dentro da empresa acessada.
-- Esta RPC valida o super-admin + sessão de suporte e escopa as sugestões ao
-- AUTH UID da empresa-alvo (mapeado via Usuarios.auth_id). Somente leitura.

create or replace function "RetificaPremium".get_sugestoes_email_contexto_suporte(
  p_status text default null,
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
  v_dados json;
begin
  -- Valida super-admin + sessão de suporte ativa; retorna o Usuarios.id do alvo.
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  -- Mapeia o usuário-alvo para o auth uid usado por Sugestoes_Email.fk_auth_user.
  select u.auth_id
    into v_auth_alvo
  from "RetificaPremium"."Usuarios" u
  where u.id_usuarios = v_usuario_id;

  if v_auth_alvo is null then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Usuário do contexto sem vínculo de autenticação.', 'dados', '[]'::json);
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
      and (p_status is null or s.status::text = upper(trim(p_status)))
    order by s.created_at desc
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Sugestões encontradas.', 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm, 'dados', '[]'::json);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm, 'dados', '[]'::json);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm, 'dados', '[]'::json);
end;
$$;

revoke execute on function "RetificaPremium".get_sugestoes_email_contexto_suporte(text, uuid, uuid) from public, anon;
grant execute on function "RetificaPremium".get_sugestoes_email_contexto_suporte(text, uuid, uuid) to authenticated, service_role;
