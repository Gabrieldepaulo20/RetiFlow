-- Removes implicit PUBLIC execution from business RPCs.
-- Browser clients must authenticate before calling RetificaPremium RPCs.

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'RetificaPremium'
  loop
    execute format('revoke execute on function %s from public', fn);
    execute format('revoke execute on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

grant execute on function "RetificaPremium".ao_criar_usuario_auth() to supabase_auth_admin;

alter default privileges in schema "RetificaPremium"
  revoke execute on functions from public;

alter default privileges in schema "RetificaPremium"
  grant execute on functions to authenticated;

alter default privileges in schema "RetificaPremium"
  grant execute on functions to service_role;
