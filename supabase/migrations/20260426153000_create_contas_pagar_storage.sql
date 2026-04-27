insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contas-pagar',
  'contas-pagar',
  false,
  15728640,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contas_pagar_select_auth'
  ) then
    create policy contas_pagar_select_auth
      on storage.objects for select
      to authenticated
      using (bucket_id = 'contas-pagar');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contas_pagar_insert_auth'
  ) then
    create policy contas_pagar_insert_auth
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'contas-pagar');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contas_pagar_update_auth'
  ) then
    create policy contas_pagar_update_auth
      on storage.objects for update
      to authenticated
      using (bucket_id = 'contas-pagar')
      with check (bucket_id = 'contas-pagar');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contas_pagar_delete_auth'
  ) then
    create policy contas_pagar_delete_auth
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'contas-pagar');
  end if;
end $$;
