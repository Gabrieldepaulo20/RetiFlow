-- Persiste os sinais antifraude das sugestões de e-mail (risco do remetente +
-- sinais de verificação/fraude) para exibição no front: chips, badge de risco e
-- gating de criação para remetentes de alto risco.

alter table "RetificaPremium"."Sugestoes_Email"
  add column if not exists sender_risk text not null default 'BAIXO',
  add column if not exists verification_signals text[] not null default '{}',
  add column if not exists fraud_signals text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sugestoes_email_sender_risk_chk'
      and conrelid = '"RetificaPremium"."Sugestoes_Email"'::regclass
  ) then
    alter table "RetificaPremium"."Sugestoes_Email"
      add constraint sugestoes_email_sender_risk_chk
      check (sender_risk in ('BAIXO', 'MEDIO', 'ALTO'));
  end if;
end $$;

-- Redefine o leitor para devolver os novos campos. Também adiciona `set search_path`
-- (hardening que faltava nesta função — alinha com as demais SECURITY DEFINER).
create or replace function "RetificaPremium".get_sugestoes_email(p_status text default null)
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
    where s.fk_auth_user = v_user
      and (p_status is null or s.status::text = upper(trim(p_status)))
    order by s.created_at desc
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Sugestões encontradas.', 'dados', v_dados);
exception when others then
  return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;
