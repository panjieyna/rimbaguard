-- RIMBAGUARD: FASE 6 — FOTO PROFIL
-- Jalankan SELURUH isi file ini di Supabase SQL Editor -> New query -> Run.
-- Prasyarat: migrasi 001 sampai 006 sudah terpasang (termasuk JALANKAN_FASE_5.sql).
-- Memastikan bucket privat `profile-photos` dan menambah kebijakan pengaman yang hanya mengizinkan server.
-- Tidak membuat akun, foto, atau data lain. Aman dijalankan ulang.
-- Fitur akun sudah bekerja tanpa file ini: server membuat bucket privat yang sama saat foto pertama
-- diunggah. File ini menambah kebijakan restriktif sebagai lapisan pengaman kedua (disarankan).
-- Hasil sukses: tabel di akhir menampilkan satu baris profile-photos dengan public = false.
-- Sumber: migrations/20261117000700_profile_photos.sql.

begin;

-- BAGIAN 1: MIGRASI FOTO PROFIL
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 262144, array['image/webp']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rimbaguard_profile_photos_server_only on storage.objects;
create policy rimbaguard_profile_photos_server_only on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'profile-photos')
with check (bucket_id <> 'profile-photos');

-- BAGIAN 2: PEMERIKSAAN (transaksi dibatalkan bila ada yang tidak sesuai)
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'profile-photos' and public = false
      and file_size_limit = 262144 and allowed_mime_types = array['image/webp']::text[]
  ) then
    raise exception 'Bucket profile-photos belum privat atau konfigurasinya berbeda.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rimbaguard_profile_photos_server_only' and permissive = 'RESTRICTIVE'
      and roles @> array['anon', 'authenticated']::name[]
  ) then
    raise exception 'Kebijakan rimbaguard_profile_photos_server_only belum terpasang.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rimbaguard_evidence_server_only' and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'Kebijakan bukti laporan dari migrasi 001 tidak ditemukan. Pasang migrasi sebelumnya terlebih dahulu.';
  end if;
end;
$$;

commit;

select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'profile-photos';
