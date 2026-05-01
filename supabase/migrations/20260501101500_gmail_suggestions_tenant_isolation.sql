-- Keeps Gmail/payable suggestions isolated by authenticated Supabase user.

alter table "RetificaPremium"."Sugestoes_Email"
  add column if not exists fk_auth_user uuid;

do $$
declare
  v_mega_master_auth_id uuid;
  v_null_suggestions integer;
begin
  select count(*)
  into v_null_suggestions
  from "RetificaPremium"."Sugestoes_Email"
  where fk_auth_user is null;

  if v_null_suggestions = 0 then
    return;
  end if;

  select auth_id
  into v_mega_master_auth_id
  from "RetificaPremium"."Usuarios"
  where lower(email) = 'gabrielwilliam208@gmail.com'
  order by created_at asc
  limit 1;

  if v_mega_master_auth_id is null then
    raise exception 'Mega Master Auth ID não encontrado para backfill de Sugestoes_Email.';
  end if;

  update "RetificaPremium"."Sugestoes_Email"
     set fk_auth_user = v_mega_master_auth_id
   where fk_auth_user is null;
end;
$$;

alter table "RetificaPremium"."Sugestoes_Email"
  alter column fk_auth_user set not null;

create index if not exists idx_sugestoes_email_auth_status_created
  on "RetificaPremium"."Sugestoes_Email"(fk_auth_user, status, created_at desc);

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

create or replace function "RetificaPremium".insert_sugestao_email(
  p_assunto text,
  p_nome_remetente text,
  p_email_remetente text,
  p_recebido_em timestamp without time zone,
  p_titulo_sugerido text,
  p_valor_sugerido numeric,
  p_vencimento_sugerido timestamp without time zone,
  p_fornecedor_sugerido text,
  p_forma_pagamento_sugerida text,
  p_confianca smallint,
  p_fk_categorias_sugerida uuid default null,
  p_trecho_email text default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_id "RetificaPremium"."Sugestoes_Email"."id_sugestoes_email"%type;
begin
  if v_user is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.');
  end if;

  if p_assunto is null or trim(p_assunto) = '' then raise exception 'Erro de parâmetro' using errcode = 'P0800'; end if;
  if p_titulo_sugerido is null or trim(p_titulo_sugerido) = '' then raise exception 'Erro de parâmetro' using errcode = 'P0801'; end if;
  if p_valor_sugerido is null or p_valor_sugerido < 0 then raise exception 'Erro de parâmetro' using errcode = 'P0802'; end if;
  if p_vencimento_sugerido is null then raise exception 'Erro de parâmetro' using errcode = 'P0803'; end if;

  insert into "RetificaPremium"."Sugestoes_Email" (
    fk_auth_user,
    assunto,
    nome_remetente,
    email_remetente,
    recebido_em,
    titulo_sugerido,
    valor_sugerido,
    vencimento_sugerido,
    fk_categorias_sugerida,
    fornecedor_sugerido,
    forma_pagamento_sugerida,
    confianca,
    status,
    trecho_email
  ) values (
    v_user,
    trim(p_assunto),
    trim(p_nome_remetente),
    lower(trim(p_email_remetente)),
    p_recebido_em,
    trim(p_titulo_sugerido),
    p_valor_sugerido,
    p_vencimento_sugerido,
    p_fk_categorias_sugerida,
    trim(p_fornecedor_sugerido),
    upper(trim(p_forma_pagamento_sugerida))::"RetificaPremium"."forma_pagamento",
    greatest(0, least(100, coalesce(p_confianca, 0))),
    'PENDING',
    nullif(trim(coalesce(p_trecho_email, '')), '')
  )
  returning id_sugestoes_email into v_id;

  return json_build_object('status', 200, 'mensagem', 'Sugestão registrada com sucesso.', 'id_sugestoes_email', v_id);
exception
  when sqlstate 'P0800' then return json_build_object('status', 400, 'code', 'missing_assunto', 'mensagem', 'O assunto do e-mail é obrigatório.');
  when sqlstate 'P0801' then return json_build_object('status', 400, 'code', 'missing_titulo', 'mensagem', 'O título sugerido é obrigatório.');
  when sqlstate 'P0802' then return json_build_object('status', 400, 'code', 'invalid_valor', 'mensagem', 'O valor sugerido deve ser maior ou igual a zero.');
  when sqlstate 'P0803' then return json_build_object('status', 400, 'code', 'missing_vencimento', 'mensagem', 'O vencimento sugerido é obrigatório.');
  when invalid_text_representation then return json_build_object('status', 400, 'code', 'invalid_forma', 'mensagem', 'Forma de pagamento inválida.');
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
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

  update "RetificaPremium"."Sugestoes_Email"
  set status = 'ACCEPTED'
  where id_sugestoes_email = p_id_sugestoes_email
    and fk_auth_user = v_user;

  begin
    perform "RetificaPremium".insert_log(
      'sugestao_email_aceita',
      'Sugestoes_Email',
      p_id_sugestoes_email::text,
      'Sugestão aceita. Conta criada: ' || v_sugestao.titulo_sugerido
    );
  exception when others then null;
  end;

  return json_build_object(
    'status', 200,
    'mensagem', 'Sugestão aceita. Conta a pagar criada com sucesso.',
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

create or replace function "RetificaPremium".ignorar_sugestao_email(p_id_sugestoes_email uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário não autenticado.');
  end if;

  if p_id_sugestoes_email is null then
    raise exception 'ID da sugestão é obrigatório.' using errcode = 'P0820';
  end if;

  update "RetificaPremium"."Sugestoes_Email"
  set status = 'DISMISSED'
  where id_sugestoes_email = p_id_sugestoes_email
    and fk_auth_user = v_user
    and status = 'PENDING';

  if not found then
    raise exception 'Sugestão não encontrada ou já processada.' using errcode = 'P0821';
  end if;

  return json_build_object('status', 200, 'mensagem', 'Sugestão ignorada com sucesso.');
exception
  when sqlstate 'P0820' then return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', sqlerrm);
  when sqlstate 'P0821' then return json_build_object('status', 404, 'code', 'not_found_or_done', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;
