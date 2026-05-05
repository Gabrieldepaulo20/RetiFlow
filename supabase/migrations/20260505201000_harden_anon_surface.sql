-- Hardening de superfície pública:
-- - anon key não deve ler tabelas do schema operacional diretamente;
-- - buckets privados não devem expor listagem de objetos para anon/public;
-- - authenticated continua usando RPCs e signed URLs normalmente.

revoke usage on schema "RetificaPremium" from anon;
revoke all privileges on all tables in schema "RetificaPremium" from anon;
revoke all privileges on all sequences in schema "RetificaPremium" from anon;
revoke execute on all functions in schema "RetificaPremium" from anon;
revoke execute on all functions in schema "RetificaPremium" from public;

alter default privileges in schema "RetificaPremium" revoke all on tables from anon;
alter default privileges in schema "RetificaPremium" revoke all on sequences from anon;
alter default privileges in schema "RetificaPremium" revoke execute on functions from anon;
alter default privileges in schema "RetificaPremium" revoke execute on functions from public;

update storage.buckets
set public = false
where id in ('notas', 'fechamentos', 'contas-pagar');

do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and roles && array['public', 'anon']::name[]
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

drop policy if exists notas_select_auth on storage.objects;
drop policy if exists notas_insert_auth on storage.objects;
drop policy if exists notas_update_auth on storage.objects;
drop policy if exists notas_delete_auth on storage.objects;

create policy notas_select_auth
  on storage.objects for select
  to authenticated
  using (bucket_id = 'notas' and auth.uid() is not null);

create policy notas_insert_auth
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'notas' and auth.uid() is not null);

create policy notas_update_auth
  on storage.objects for update
  to authenticated
  using (bucket_id = 'notas' and auth.uid() is not null)
  with check (bucket_id = 'notas' and auth.uid() is not null);

create policy notas_delete_auth
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'notas' and auth.uid() is not null);

drop policy if exists fechamentos_select_auth on storage.objects;
drop policy if exists fechamentos_insert_auth on storage.objects;
drop policy if exists fechamentos_update_auth on storage.objects;
drop policy if exists fechamentos_delete_auth on storage.objects;

create policy fechamentos_select_auth
  on storage.objects for select
  to authenticated
  using (bucket_id = 'fechamentos' and auth.uid() is not null);

create policy fechamentos_insert_auth
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'fechamentos' and auth.uid() is not null);

create policy fechamentos_update_auth
  on storage.objects for update
  to authenticated
  using (bucket_id = 'fechamentos' and auth.uid() is not null)
  with check (bucket_id = 'fechamentos' and auth.uid() is not null);

create policy fechamentos_delete_auth
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'fechamentos' and auth.uid() is not null);

drop policy if exists contas_pagar_select_auth on storage.objects;
drop policy if exists contas_pagar_insert_auth on storage.objects;
drop policy if exists contas_pagar_update_auth on storage.objects;
drop policy if exists contas_pagar_delete_auth on storage.objects;

create policy contas_pagar_select_auth
  on storage.objects for select
  to authenticated
  using (bucket_id = 'contas-pagar' and auth.uid() is not null);

create policy contas_pagar_insert_auth
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'contas-pagar' and auth.uid() is not null);

create policy contas_pagar_update_auth
  on storage.objects for update
  to authenticated
  using (bucket_id = 'contas-pagar' and auth.uid() is not null)
  with check (bucket_id = 'contas-pagar' and auth.uid() is not null);

create policy contas_pagar_delete_auth
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'contas-pagar' and auth.uid() is not null);
