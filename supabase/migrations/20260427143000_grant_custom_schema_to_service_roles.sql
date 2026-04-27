-- Permite que rotinas server-side seguras e testes de integração operem no schema
-- customizado sem depender de permissões diretas no frontend.
grant usage on schema "RetificaPremium" to service_role;
grant all privileges on all tables in schema "RetificaPremium" to service_role;
grant all privileges on all sequences in schema "RetificaPremium" to service_role;

alter default privileges in schema "RetificaPremium"
  grant all privileges on tables to service_role;

alter default privileges in schema "RetificaPremium"
  grant all privileges on sequences to service_role;

-- O trigger auth.users -> RetificaPremium.ao_criar_usuario_auth roda durante
-- criação de usuários pelo Supabase Auth Admin e precisa resolver o schema.
grant usage on schema "RetificaPremium" to supabase_auth_admin;
grant execute on function "RetificaPremium".ao_criar_usuario_auth() to supabase_auth_admin;
grant execute on function "RetificaPremium".insert_usuario(text, text, text, text, boolean, uuid) to supabase_auth_admin;
grant execute on function "RetificaPremium".insert_modulo(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to supabase_auth_admin;
