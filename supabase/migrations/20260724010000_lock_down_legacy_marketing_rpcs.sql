-- Contrato vigente do módulo Crescimento:
-- o navegador chama exclusivamente a Edge Function marketing-dashboard.
-- Estas RPCs SECURITY DEFINER ficam disponíveis somente para código server-side.

revoke execute on function "RetificaPremium".get_marketing_resumo(integer)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".upsert_marketing_config(text, text[], text)
  from public, anon, authenticated;

grant execute on function "RetificaPremium".get_marketing_resumo(integer)
  to service_role;
grant execute on function "RetificaPremium".upsert_marketing_config(text, text[], text)
  to service_role;

do $$
begin
  if has_function_privilege('anon', '"RetificaPremium".get_marketing_resumo(integer)', 'EXECUTE')
    or has_function_privilege('authenticated', '"RetificaPremium".get_marketing_resumo(integer)', 'EXECUTE')
    or not has_function_privilege('service_role', '"RetificaPremium".get_marketing_resumo(integer)', 'EXECUTE')
  then
    raise exception 'ACL inesperada em RetificaPremium.get_marketing_resumo(integer)';
  end if;

  if has_function_privilege('anon', '"RetificaPremium".upsert_marketing_config(text,text[],text)', 'EXECUTE')
    or has_function_privilege('authenticated', '"RetificaPremium".upsert_marketing_config(text,text[],text)', 'EXECUTE')
    or not has_function_privilege('service_role', '"RetificaPremium".upsert_marketing_config(text,text[],text)', 'EXECUTE')
  then
    raise exception 'ACL inesperada em RetificaPremium.upsert_marketing_config(text,text[],text)';
  end if;
end
$$;
