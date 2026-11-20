-- Private profile photos for citizens and officers. Apply after 001-006.
-- Safe to re-run. Creates no accounts, photos or other data.
--
-- The server re-encodes every photo to a 256 x 256 WebP without metadata and
-- stores it as <user-id>/<uuid>.webp. The current path is kept in the user's
-- auth app_metadata, which only the service role can write, so no table or
-- grant changes are needed. Name changes use the existing service-role grant
-- on profiles.full_name (migration 001). Password changes go through Supabase Auth.
-- If this migration has not run, the server creates the same private bucket on
-- the first upload; this file adds the restrictive policy as a second guard.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 262144, array['image/webp']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Same server-only guard as report evidence: no browser role can list, read,
-- overwrite or delete profile photos, even if a broad policy is added later.
-- The server checks the session and serves only the owner's current photo.
drop policy if exists rimbaguard_profile_photos_server_only on storage.objects;
create policy rimbaguard_profile_photos_server_only on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'profile-photos')
with check (bucket_id <> 'profile-photos');
