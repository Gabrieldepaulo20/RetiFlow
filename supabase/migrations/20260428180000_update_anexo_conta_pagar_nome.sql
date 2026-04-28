create or replace function "RetificaPremium".update_anexo_conta_pagar_nome(
  p_id_anexo uuid,
  p_nome_arquivo text
)
returns jsonb
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_nome text := nullif(btrim(p_nome_arquivo), '');
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'status', 401,
      'mensagem', 'Usuário não autenticado.'
    );
  end if;

  if p_id_anexo is null then
    return jsonb_build_object(
      'status', 400,
      'mensagem', 'Anexo inválido.'
    );
  end if;

  if v_nome is null or char_length(v_nome) > 140 then
    return jsonb_build_object(
      'status', 400,
      'mensagem', 'Nome do anexo deve ter entre 1 e 140 caracteres.'
    );
  end if;

  update "RetificaPremium"."Contas_Pagar_Anexos"
     set nome_arquivo = v_nome
   where id_anexo = p_id_anexo;

  if not found then
    return jsonb_build_object(
      'status', 404,
      'mensagem', 'Anexo não encontrado.'
    );
  end if;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Nome do anexo atualizado.',
    'id_anexo', p_id_anexo
  );
end;
$$;

grant execute on function "RetificaPremium".update_anexo_conta_pagar_nome(uuid, text) to authenticated;
