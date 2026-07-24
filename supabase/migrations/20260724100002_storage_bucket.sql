-- Public storage bucket replacing base44.integrations.Core.UploadFile.
-- Public read (file_url is fetched directly client-side all over the app —
-- fetch(layer.file_url), img.src, L.imageOverlay), writes require a real
-- authenticated session (matches how every other write path in this app is
-- gated post-migration).
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do nothing;

create policy "project-files public read"
  on storage.objects for select
  using (bucket_id = 'project-files');

create policy "project-files authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'project-files');

create policy "project-files authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'project-files')
  with check (bucket_id = 'project-files');

create policy "project-files authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'project-files');
