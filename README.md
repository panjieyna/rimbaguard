# RimbaGuard AI

Platform pelaporan ancaman hutan berbasis komunitas, analisis awal AI, prioritas yang dapat dijelaskan, dan verifikasi petugas. Bahasa utama aplikasi: Bahasa Indonesia.

Status: **Fase 1 lulus; verifikasi akhir Fase 2 berlangsung**. Migrasi pelaporan sudah diterapkan dan 29 pengujian SQL lulus menurut hasil SQL Editor pengguna. Login, callback token, pembaruan sesi, unggah privat tepat 5 MB, penyimpanan/daftar/detail/koreksi laporan, serta logout sudah diuji dengan Supabase nyata. Registrasi baru dan penerimaan email konfirmasi pada alamat milik penguji masih perlu diverifikasi sebelum menutup Fase 2. Gemini belum terhubung karena key belum tersedia; aturan prioritas dan verifikasi petugas tetap pada fase berikutnya. Lihat [PRD](PRD.md) dan [checklist implementasi](IMPLEMENTATION_PLAN.md).

## Menjalankan secara lokal

Prasyarat: Node.js 24.x dan npm 11 atau lebih baru. Pada PowerShell, gunakan `npm.cmd` jika `npm.ps1` diblokir execution policy.

```powershell
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Jika `.env` sudah ada, pertahankan isinya; tidak perlu menyalin ulang. Buka `http://localhost:3000`. `RIMBAGUARD_SETUP_MODE=true` mengizinkan development tanpa Supabase dan menampilkan keadaan layanan belum tersedia. Mode ini tidak diterima oleh server production. Font Inter disajikan dari paket lokal, tanpa permintaan font eksternal.

## Menghubungkan Supabase

1. Buat proyek melalui [Supabase Dashboard](https://supabase.com/dashboard). Pilih region yang sesuai pengguna dan simpan password database secara privat.
2. Temukan project URL di dialog **Connect** dan anonymous/publishable key di **Settings → API Keys**, lalu isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `.env`. Lihat [panduan API key Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
3. Isi `SUPABASE_SERVICE_ROLE_KEY` dengan credential server yang sesuai proyek. Jangan membagikan, mencatat ke log, atau memasukkannya ke source control.
4. Terapkan file SQL dalam `supabase/migrations/` sesuai urutan nama pada proyek kosong/disposable terlebih dahulu. Prosedur dan pengujian SQL ada di [panduan database](supabase/README.md).
5. Atur **Auth → URL Configuration → Site URL** menjadi `http://localhost:3000`. Tambahkan `http://localhost:3000/auth/callback` pada daftar Redirect URLs. Pada hosting, gunakan URL HTTPS aplikasi yang sesuai `NUXT_PUBLIC_APP_URL`. Konfirmasi email memakai PKCE server dan cookie HttpOnly. Untuk konfirmasi lintas perangkat, template email dapat memakai `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`; jangan mempublikasikan token ini.
6. Jalankan `npm.cmd run check:services`. Hasil lulus hanya membuktikan koneksi/skema dasar; pemeriksaan RLS dan autentikasi antar pengguna tetap diperlukan.
7. Proses admin awal harus mengikuti prosedur operator di panduan database, setelah akun yang bersangkutan dibuat melalui Supabase Auth. Tidak ada password admin default.

Jangan kirim credential melalui chat. Semua key, termasuk anonymous/publishable project key, digunakan melalui server Nuxt untuk memenuhi instruksi penyimpanan key di server. Nama `NUXT_PUBLIC_SUPABASE_ANON_KEY` dari PRD sengaja diganti dengan nama privat. URL aplikasi saja yang tersedia dalam public runtime config. Credential dapat menggunakan nama `NUXT_SUPABASE_*` pada hosting; lihat `.env.example`.

Saat Supabase sudah diisi lengkap, konfigurasi tersebut diterima tanpa perlu mematikan setup mode pada development. Pada production, hapus atau set `RIMBAGUARD_SETUP_MODE=false`, gunakan HTTPS untuk URL aplikasi dan Supabase, dan siapkan seluruh layanan yang diaktifkan. `GEMINI_API_KEY` serta `GEMINI_MODEL` dipersiapkan sekarang dan dihubungkan pada Fase 3.

## Menyiapkan akses Gemini untuk Fase 3

Buka [halaman API Keys Google AI Studio](https://aistudio.google.com/apikey), masuk dengan akun Google, lalu buat key pada proyek yang Anda miliki. Simpan nilainya hanya pada `GEMINI_API_KEY` di `.env` lokal; jangan kirim melalui chat atau memasukkannya ke kode. Panduan resmi: [pengelolaan key Gemini](https://aistudio.google.com/docs/api-key). Nama `GEMINI_MODEL` akan dipilih setelah kemampuan gambar, structured output, dan ketersediaannya pada proyek diverifikasi. Mengisi key belum berarti integrasi AI sudah dibuat atau diuji.

Untuk menyelesaikan gate autentikasi Fase 2, jalankan aplikasi, buka `/register`, gunakan email yang Anda kuasai, buka tautan konfirmasi, kemudian login. Akun QA yang dibuat melalui Auth Admin dan pengujian callback token tidak membuktikan pengiriman email registrasi. Tidak perlu membuat laporan kejadian untuk pemeriksaan ini.

## Pemeriksaan

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run check:services
npm.cmd run check:reporting
npm.cmd run test:e2e
```

Dengan server development berjalan, jalankan `npm.cmd run test:smoke` dari terminal lain untuk memeriksa halaman SSR, payload konfigurasi/sesi, dan penolakan akses/mutasi yang tidak diizinkan melalui HTTP.

`test:e2e` menjalankan Chrome/Edge lokal tanpa mengunduh browser, menguji navigasi di 375/768/1280/1440 px, keyboard, validasi login/registrasi, proteksi laporan, dan peta publik. Pengujian pelaporan yang menulis data dilewati secara eksplisit jika akun simulasi belum dikonfigurasi; skip bukan bukti alur persistensi sudah lulus.

Untuk menjalankan skenario persistensi browser pada proyek pengujian, gunakan `npm.cmd run test:e2e:prepare`. Perintah tersebut menyiapkan dua akun terkontrol ber-role `public`, tanpa mengirim email atau membuat laporan, lalu menyimpan credential hanya dalam `.env.e2e` yang diabaikan Git. Akun utama memakai `E2E_EMAIL`, `E2E_PASSWORD`, dan `RIMBAGUARD_TEST_USER_ID`; akun pembaca kedua memakai `E2E_READER_EMAIL`, `E2E_READER_PASSWORD`, dan `E2E_READER_USER_ID` untuk memeriksa isolasi antar pengguna. Akun dipertahankan untuk pengujian ulang; script tidak menghapus akun/laporan atau mengubah role.

Hentikan server development biasa sebelum menjalankan `test:e2e`; runner memulai server khusus dengan konfigurasi akun simulasi. Pengujian menolak membuat laporan jika sesi server tidak mengonfirmasi mode simulasi. Laporan uji ditandai jelas sebagai simulasi, terlihat hanya oleh pemilik/petugas, serta dikecualikan dari statistik dan peta publik. File credential tidak boleh dibagikan atau dicatat ke log. Pengujian callback membuat token untuk akun QA yang sudah ada tanpa mengirim email; registrasi baru/penerimaan email tetap perlu diuji langsung.

`check:reporting` menambahkan pemeriksaan read-only untuk ledger unggahan dan RPC statistik Fase 2. Jika kode `PGRST205`/`PGRST202` muncul, jalankan seluruh isi [migrasi pelaporan](supabase/migrations/20261114000200_reporting.sql), kemudian [pengujian SQL pelaporan](tests/database/reporting.test.sql) di SQL Editor. Pertahankan isi `.env` yang sudah dikonfigurasi.

`check:services` keluar dengan kode gagal jika konfigurasi/koneksi belum tersedia; ini bukan hasil lulus kosong. Pengujian SQL keamanan memerlukan Supabase lokal/CI dengan PostgreSQL, Auth, Storage, dan pgTAP; instruksi ada di `supabase/README.md`. Build yang berhasil tidak membuktikan autentikasi atau persistensi sudah berfungsi.

`npm.cmd run preview` menjalankan hasil build sebagai server production dan memerlukan konfigurasi server lengkap yang dipasok environment host. Untuk memuat `.env` lokal secara eksplisit saat memeriksa hasil build, gunakan `node --env-file=.env .output/server/index.mjs`; jangan gunakan setup mode sebagai pengganti konfigurasi production.

## Struktur dan batas keamanan

- `app/`: halaman, layout, komponen, composable, dan middleware navigasi.
- `server/api/`: autentikasi, unggahan, laporan milik pengguna, statistik dan proyeksi peta publik; seluruh mutasi melalui validasi/izin server.
- `server/utils/`: konfigurasi privat, pemeriksaan sesi/role, validasi, origin/CSRF, error aman, dan pembatasan permintaan berbasis database.
- `shared/`: enum, kontrak Zod, dan tipe yang tidak memuat credential.
- `supabase/`: migrasi, RLS, storage privat, audit, dan pengujian database.
- `tests/unit/`: pengujian batas validasi, konfigurasi, dan origin.

Perubahan data dibatasi ke API server. Server memvalidasi identitas dan izin sebelum memakai operasi privileged; RLS/grant menolak penulisan tabel sensitif oleh client. Laporan dan bukti privat secara default. Bukti diunggah langsung ke namespace `incoming` dengan signed token, lalu diperiksa berdasarkan bytes/ukuran/format sebenarnya, dinormalisasi, dan disegel di namespace terpisah sebelum dilampirkan pada laporan. Token incoming tidak berwenang menulis bukti sealed.

`/api/health` hanya menunjukkan konfigurasi tersedia/belum tersedia, bukan klaim bahwa koneksi telah diuji. `/api/auth/session` mengembalikan identitas aman atau `null`, tanpa access/refresh token. Semua akses `/api/admin/*` dan `/admin/*` diperiksa di server meskipun halaman admin belum dibuat. Request mutasi API harus menggunakan JSON dan origin aplikasi yang sesuai.

## Atribusi dan penggunaan AI

Pengembangan dibantu OpenAI Codex untuk perencanaan, implementasi, dan pemeriksaan kode. Ketergantungan terbuka yang digunakan: Nuxt/Vue, Tailwind CSS, Supabase SDK, Zod, Leaflet/OpenStreetMap, Sharp, Vitest, Playwright, serta font Inter melalui Fontsource. Lisensi pihak ketiga mengikuti paket masing-masing. Logo dibuat sebagai SVG. Foto landing Gunung Lempuyang karya Vyacheslav Argenberg menggunakan CC BY 4.0, diperkecil dan dikompresi ke WebP; rincian sumber/lisensi ada di [atribusi foto](public/images/ATTRIBUTION.md). Foto editorial tersebut bukan bukti suatu laporan.

Penggunaan coding assistant terpisah dari fitur Gemini di produk. Gemini belum diaktifkan pada Fase 2; laporan baru tetap `pending_analysis` tanpa hasil palsu. Ketika aset, template, library, atau alat AI lain ditambahkan, perbarui atribusi di README dan proposal.

## Acuan pengumpulan lomba

Berdasarkan guidebook yang disediakan pengguna: tenggat 20 November 2026 pukul 23.59 WIB; deployment perlu tetap aktif sampai 30 November 2026. Pengumpulan mencakup URL live, repository publik dengan riwayat commit yang dipertahankan, video YouTube Unlisted 3–5 menit, proposal `ITRUSH26_NamaTim_JudulKarya.pdf`, dan deklarasi orisinalitas/penggunaan AI. Akun demo yang disengaja disiapkan menjelang pengumpulan, tanpa hardcoded credential production. Demo final perlu menunjukkan integrasi AI yang benar-benar berhasil.

Ketentuan guidebook dicatat sebagai acuan pengumpulan; PRD tetap menjadi sumber spesifikasi produk. Publikasi eksternal dan pengumpulan belum dilakukan.
