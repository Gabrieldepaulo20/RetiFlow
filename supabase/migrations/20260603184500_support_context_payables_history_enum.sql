-- Ajusta historico de contas em modo suporte para o enum real da tabela.

create or replace function "RetificaPremium".insert_historico_conta_pagar_suporte(
  p_fk_contas_pagar uuid,
  p_acao text,
  p_descricao text,
  p_alteracoes_campos jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_acao "RetificaPremium".acao_historico_conta;
begin
  v_acao := case p_acao
    when 'CANCELED' then 'CANCELLED'
    when 'PARTIAL_PAYMENT' then 'PARTIAL_PAID'
    when 'ATTACHMENT_UPDATED' then 'UPDATED'
    else p_acao
  end::"RetificaPremium".acao_historico_conta;

  insert into "RetificaPremium"."Contas_Pagar_Historico" (
    fk_contas_pagar,
    acao,
    descricao,
    alteracoes_campos,
    fk_usuarios
  )
  values (
    p_fk_contas_pagar,
    v_acao,
    p_descricao,
    coalesce(p_alteracoes_campos, '{}'::jsonb),
    "RetificaPremium".support_actor_usuario_id()
  );
end;
$$;

grant execute on function "RetificaPremium".insert_historico_conta_pagar_suporte(uuid, text, text, jsonb) to service_role;
revoke execute on function "RetificaPremium".insert_historico_conta_pagar_suporte(uuid, text, text, jsonb) from public, anon, authenticated;
