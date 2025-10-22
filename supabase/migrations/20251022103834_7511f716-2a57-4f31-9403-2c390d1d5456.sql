-- Create public bucket for profile and cover images
insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('cover-images', 'cover-images', true)
on conflict (id) do nothing;

-- Public read access for profile-images
create policy "Public read profile images"
  on storage.objects for select
  using (bucket_id = 'profile-images');

-- Public read access for cover-images
create policy "Public read cover images"
  on storage.objects for select
  using (bucket_id = 'cover-images');

-- Authenticated users can upload their own files (path starts with user id)
create policy "Users can upload profile images"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own profile images"
  on storage.objects for update
  using (
    bucket_id = 'profile-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'profile-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own profile images"
  on storage.objects for delete
  using (
    bucket_id = 'profile-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Same policies for cover-images
create policy "Users can upload cover images"
  on storage.objects for insert
  with check (
    bucket_id = 'cover-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own cover images"
  on storage.objects for update
  using (
    bucket_id = 'cover-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'cover-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own cover images"
  on storage.objects for delete
  using (
    bucket_id = 'cover-images' and
    auth.role() = 'authenticated' and
    auth.uid()::text = (storage.foldername(name))[1]
  );