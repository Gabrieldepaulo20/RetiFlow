-- Adds paid-state hints to Gmail payable suggestions and applies them on accept.

alter table "RetificaPremium"."Sugestoes_Email"
  add column if not exists status_sugerido text not null default 'PENDENTE',
  add column if not exists pago_em_sugerido timestamp without time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sugestoes_email_status_sugerido_chk'
      and conrelid = '"RetificaPremium"."Sugestoes_Email"'::regclass
  ) then
    alter table "RetificaPremium"."Sugestoes_Email"
      add constraint sugestoes_email_status_sugerido_chk
      check (status_sugerido in ('PENDENTE', 'PAGO', 'AGENDADO', 'INCERTO'));
  end if;
end $$;

create or replace function "RetificaPremium".get_sugestoes_email(p_status text default null)
returns json
language plpgsql
security definer
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

create or replace function "RetificaPremium".aceitar_sugestao_email(p_id_sugestoes_email uuid)
returns json
language plpgsql
security definer
as $$
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
    v_sugestao.forma_pagamento_sugerida::text,
    'EMAIL_IMPORT',
    null,
    'NENHUMA',
    null, null, null,
    null,
    false
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
$$;
