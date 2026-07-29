-- Mantém o perfil autenticado alinhado com a matriz real de módulos.
-- Sem `marketing`, Masters com Crescimento habilitado eram interpretados pelo
-- frontend como se não tivessem acesso, embora a tabela Modulos estivesse correta.
create or replace function "RetificaPremium".get_usuario_por_auth_id()
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_dados json;
begin
  select json_build_object(
    'id_usuarios',  u.id_usuarios,
    'auth_id',      u.auth_id,
    'nome',         u.nome,
    'email',        u.email,
    'telefone',     u.telefone,
    'acesso',       u.acesso,
    'status',       u.status,
    'ultimo_login', u.ultimo_login,
    'modulos',      json_build_object(
      'dashboard',        m.dashboard,
      'clientes',         m.clientes,
      'notas_de_entrada', m.notas_de_entrada,
      'kanban',           m.kanban,
      'fechamento',       m.fechamento,
      'nota_fiscal',      m.nota_fiscal,
      'configuracoes',    m.configuracoes,
      'contas_a_pagar',   m.contas_a_pagar,
      'marketing',        m.marketing,
      'admin',            m.admin
    )
  )
  into v_dados
  from "RetificaPremium"."Usuarios" u
  left join "RetificaPremium"."Modulos" m on m.fk_usuarios = u.id_usuarios
  where u.auth_id = auth.uid();

  if v_dados is null then
    return json_build_object(
      'status', 404,
      'code', 'not_found',
      'mensagem', 'Perfil não encontrado para este usuário.'
    );
  end if;

  update "RetificaPremium"."Usuarios"
     set ultimo_login = now()
   where auth_id = auth.uid();

  return json_build_object(
    'status', 200,
    'mensagem', 'Perfil encontrado.',
    'dados', v_dados
  );
exception when others then
  return json_build_object(
    'status', 500,
    'code', 'unknown_error',
    'mensagem', sqlerrm
  );
end;
$$;

revoke execute on function "RetificaPremium".get_usuario_por_auth_id() from public, anon;
grant execute on function "RetificaPremium".get_usuario_por_auth_id() to authenticated, service_role;
