-- Remove superfícies legadas SECURITY DEFINER que aceitam IDs arbitrários sem
-- validar o dono. O frontend atual usa os contratos tenant-aware mais novos;
-- essas funções permanecem disponíveis somente ao service_role e a wrappers
-- internos executados pelo proprietário das funções.

revoke execute on function "RetificaPremium".cancelar_fatura(uuid)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".get_fatura_detalhes(uuid)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".get_fechamento_detalhes(uuid)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".insert_contato(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".insert_endereco(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".insert_nota_servico(
  text, timestamp without time zone, text, uuid, uuid, smallint, text, uuid,
  uuid, numeric, numeric, numeric, text, text
) from public, anon, authenticated;
revoke execute on function "RetificaPremium".update_contato(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".update_endereco(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".update_veiculo(uuid, text, text, bigint, text)
  from public, anon, authenticated;

grant execute on function "RetificaPremium".cancelar_fatura(uuid) to service_role;
grant execute on function "RetificaPremium".get_fatura_detalhes(uuid) to service_role;
grant execute on function "RetificaPremium".get_fechamento_detalhes(uuid) to service_role;
grant execute on function "RetificaPremium".insert_contato(uuid, text, text) to service_role;
grant execute on function "RetificaPremium".insert_endereco(uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function "RetificaPremium".insert_nota_servico(
  text, timestamp without time zone, text, uuid, uuid, smallint, text, uuid,
  uuid, numeric, numeric, numeric, text, text
) to service_role;
grant execute on function "RetificaPremium".update_contato(uuid, text, text) to service_role;
grant execute on function "RetificaPremium".update_endereco(uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function "RetificaPremium".update_veiculo(uuid, text, text, bigint, text) to service_role;

-- Estas views pertencem ao postgres e não usam security_invoker. Como não há
-- consumidor no frontend/Edge Functions, remover o SELECT autenticado elimina
-- a possibilidade de contornar as policies das tabelas-base.
revoke select on table "RetificaPremium".vw_listagem_clientes
  from public, anon, authenticated;
revoke select on table "RetificaPremium".vw_listagem_notas
  from public, anon, authenticated;
revoke select on table "RetificaPremium".vw_usuarios_detalhados
  from public, anon, authenticated;

grant select on table "RetificaPremium".vw_listagem_clientes to service_role;
grant select on table "RetificaPremium".vw_listagem_notas to service_role;
grant select on table "RetificaPremium".vw_usuarios_detalhados to service_role;

-- Rollback: grant EXECUTE/SELECT novamente apenas se um consumidor legado for
-- identificado e depois de adicionar validação explícita de tenant à função ou
-- security_invoker + policies owner-aware à view.
