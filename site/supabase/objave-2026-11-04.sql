-- Javni bucket za slike objava (Instagram traži javni link do slike). Piše samo admin.
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values ('objave', 'objave', true, array['image/png', 'image/jpeg'], 8388608)
on conflict (id) do update set public = true, allowed_mime_types = excluded.allowed_mime_types, file_size_limit = excluded.file_size_limit;
drop policy if exists "objave: admin piše" on storage.objects;
create policy "objave: admin piše" on storage.objects for all to authenticated
  using (bucket_id = 'objave' and public.is_admin()) with check (bucket_id = 'objave' and public.is_admin());
