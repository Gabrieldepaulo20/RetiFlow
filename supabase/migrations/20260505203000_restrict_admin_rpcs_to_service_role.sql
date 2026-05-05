-- RPCs administrativas não podem ser chamadas diretamente do navegador.
-- O frontend deve passar pela Edge Function admin-users, que valida o JWT,
-- Mega Master/Admin permitido e usa service_role somente no backend.

do $$
declare
  fn regprocedure;
  sensitive_functions text[] := array[
    'insert_usuario',
    'update_usuario',
    'inativar_usuario',
    'reativar_usuario',
    'insert_modulo',
    'upsert_modulo'
  ];
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'RetificaPremium'
      and p.proname = any(sensitive_functions)
  loop
    execute format('revoke execute on function %s from public', fn);
    execute format('revoke execute on function %s from anon', fn);
    execute format('revoke execute on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- O trigger auth.users -> RetificaPremium.ao_criar_usuario_auth pode depender
-- destas funções durante criação segura pelo Supabase Auth Admin.
grant execute on function "RetificaPremium".insert_usuario(text, text, text, text, boolean, uuid) to supabase_auth_admin;
grant execute on function "RetificaPremium".insert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to supabase_auth_admin;
