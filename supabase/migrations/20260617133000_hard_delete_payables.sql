-- Contas a pagar: exclusao definitiva.
-- O frontend remove os objetos do bucket `contas-pagar` antes de chamar esta RPC.
-- A FK dos anexos e historico usa ON DELETE CASCADE, evitando linhas orfas no banco.

create or replace function "RetificaPremium".excluir_conta_pagar(p_id_contas_pagar uuid)
returns json
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao necessaria.' using errcode = 'P0401';
  end if;

  if p_id_contas_pagar is null then
    raise exception 'ID da conta e obrigatorio.' using errcode = 'P0640';
  end if;

  select u.id_usuarios
    into v_usuario_id
    from "RetificaPremium"."Usuarios" u
   where u.auth_id = auth.uid()
   limit 1;

  if v_usuario_id is null then
    raise exception 'Usuario autenticado nao encontrado no Retiflow.' using errcode = 'P0401';
  end if;

  delete from "RetificaPremium"."Contas_Pagar" cp
   where cp.id_contas_pagar = p_id_contas_pagar
     and cp.fk_criado_por = v_usuario_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Conta nao encontrada para este usuario.' using errcode = 'P0641';
  end if;

  begin
    perform "RetificaPremium".insert_log(
      'conta_pagar_excluida_definitivamente',
      'Contas_Pagar',
      p_id_contas_pagar::text,
      'Conta a pagar excluida definitivamente.'
    );
  exception when others then
    null;
  end;

  return json_build_object('status', 200, 'mensagem', 'Conta excluida definitivamente.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0640' then return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', sqlerrm);
  when sqlstate 'P0641' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".excluir_conta_pagar_contexto_suporte(
  p_id_contas_pagar uuid,
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
  v_rows integer;
begin
  if p_id_contas_pagar is null then
    return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', 'ID da conta e obrigatorio.');
  end if;

  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

  delete from "RetificaPremium"."Contas_Pagar" cp
   where cp.id_contas_pagar = p_id_contas_pagar
     and cp.fk_criado_por = v_usuario_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Conta nao encontrada para este contexto.');
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(
    v_usuario_id,
    p_sessao_suporte,
    'excluir_conta_pagar',
    'Contas_Pagar',
    p_id_contas_pagar::text,
    'Conta excluida definitivamente em modo suporte.'
  );

  return json_build_object('status', 200, 'mensagem', 'Conta excluida definitivamente.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

revoke execute on function "RetificaPremium".excluir_conta_pagar(uuid) from public, anon;
grant execute on function "RetificaPremium".excluir_conta_pagar(uuid) to authenticated, service_role;

revoke execute on function "RetificaPremium".excluir_conta_pagar_contexto_suporte(uuid, uuid, uuid) from public, anon;
grant execute on function "RetificaPremium".excluir_conta_pagar_contexto_suporte(uuid, uuid, uuid) to authenticated, service_role;
