-- Impede leitura cruzada e falsificação de autoria nos logs operacionais.
create index if not exists idx_logs_fk_usuarios_created_at
  on "RetificaPremium"."Logs" (fk_usuarios, created_at desc);

create or replace function "RetificaPremium".get_logs(
  p_fk_usuarios uuid default null,
  p_tabela_nome text default null,
  p_acao text default null,
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
  v_total integer;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if p_fk_usuarios is not null and p_fk_usuarios is distinct from v_usuario_id then
    return json_build_object(
      'status', 403,
      'code', 'forbidden',
      'mensagem', 'Não é permitido consultar logs de outro usuário.',
      'dados', '[]'::json,
      'total', 0
    );
  end if;

  select count(*)
    into v_total
    from "RetificaPremium"."Logs" l
   where l.fk_usuarios = v_usuario_id
     and (p_tabela_nome is null or l.tabela_nome = p_tabela_nome)
     and (p_acao is null or l.acao = p_acao);

  select coalesce(json_agg(row_to_json(resultado)), '[]'::json)
    into v_dados
    from (
      select
        l.id_log,
        l.created_at,
        l.acao,
        l.tabela_nome,
        l.entidade_id,
        l.descricao,
        case
          when u.id_usuarios is null then null
          else json_build_object('id', u.id_usuarios, 'nome', u.nome)
        end as usuario
      from "RetificaPremium"."Logs" l
      left join "RetificaPremium"."Usuarios" u on u.id_usuarios = l.fk_usuarios
      where l.fk_usuarios = v_usuario_id
        and (p_tabela_nome is null or l.tabela_nome = p_tabela_nome)
        and (p_acao is null or l.acao = p_acao)
      order by l.created_at desc
      limit greatest(1, least(coalesce(p_limite, 50), 200))
      offset greatest(coalesce(p_offset, 0), 0)
    ) resultado;

  return json_build_object(
    'status', 200,
    'mensagem', 'Logs recuperados com sucesso.',
    'dados', v_dados,
    'total', v_total
  );
exception
  when sqlstate 'P0401' then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Usuário autenticado obrigatório.', 'dados', '[]'::json, 'total', 0);
  when sqlstate 'P0403' then
    return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', 'Acesso negado.', 'dados', '[]'::json, 'total', 0);
end;
$$;

create or replace function "RetificaPremium".insert_log(
  p_acao text,
  p_tabela_nome text,
  p_entidade_id text,
  p_descricao text,
  p_fk_usuarios uuid default null
)
returns void
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if p_fk_usuarios is not null and p_fk_usuarios is distinct from v_usuario_id then
    raise exception 'Não é permitido registrar logs em nome de outro usuário.'
      using errcode = 'P0403';
  end if;

  insert into "RetificaPremium"."Logs" (
    acao,
    tabela_nome,
    entidade_id,
    descricao,
    fk_usuarios
  ) values (
    p_acao,
    p_tabela_nome,
    p_entidade_id,
    p_descricao,
    v_usuario_id
  );
end;
$$;

revoke all on function "RetificaPremium".get_logs(uuid, text, text, integer, integer) from public, anon;
revoke all on function "RetificaPremium".insert_log(text, text, text, text, uuid) from public, anon;

grant execute on function "RetificaPremium".get_logs(uuid, text, text, integer, integer) to authenticated, service_role;
grant execute on function "RetificaPremium".insert_log(text, text, text, text, uuid) to authenticated, service_role;
