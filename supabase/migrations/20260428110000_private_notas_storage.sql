insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notas',
  'notas',
  false,
  15728640,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'notas_select_auth'
  ) then
    create policy notas_select_auth
      on storage.objects for select
      to authenticated
      using (bucket_id = 'notas');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'notas_insert_auth'
  ) then
    create policy notas_insert_auth
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'notas');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'notas_update_auth'
  ) then
    create policy notas_update_auth
      on storage.objects for update
      to authenticated
      using (bucket_id = 'notas')
      with check (bucket_id = 'notas');
  end if;
end $$;
