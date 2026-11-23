# RimbaGuard

Platform pelaporan ancaman hutan berbasis komunitas, asisten penyusunan laporan AI, analisis awal, prioritas yang dapat dijelaskan, dan verifikasi petugas. Bahasa utama aplikasi: Bahasa Indonesia.

Status: **Fase 1–5 selesai; QA penguatan asisten selesai, finalisasi lomba dan hosting masih berjalan**. Asisten pelaporan menambahkan draf privat, pertanyaan pelengkap dan konfirmasi sebelum pengiriman. Migrasi hosted dikonfirmasi pengguna lulus `1..26`. Pada 18 November 2026, `gemini-3.5-flash` mengalami timeout/503; pengujian nyata kemudian lulus dengan **`gemini-3.5-flash-lite`**, yang ditetapkan sebagai default dan model lokal. Foto, draf setelah reload, jawaban, konfirmasi, pengiriman dan replay idempoten lulus terhadap Supabase/Gemini nyata; analisis setelah pengiriman juga tersimpan sebagai `succeeded`. Kegagalan tetap disimpan dan jalur manual tersedia. **Belum ada URL publik**; deployment direncanakan di Delcom kampus. Lihat [PRD](PRD.md), [checklist implementasi](IMPLEMENTATION_PLAN.md), [hasil uji terbaru](docs/COMPETITION_IMPROVEMENT_PLAN.md), [arsitektur](docs/ARCHITECTURE.md), [API](docs/API.md), [skrip demo](docs/DEMO.md), dan [draf proposal](docs/COMPETITION_PROPOSAL.md).

## Asisten pelaporan

Audit ulang **20 November 2026**: 353 unit test, typecheck/build, 34 skenario browser, dan uji ulang Gemini nyata lulus. Proposal sudah disesuaikan dengan template resmi dan dilengkapi wireframe serta UI aktual. Versi terbaru masih lokal; finalisasi repository, video, PDF dan hosting belum ditutup. Rincian per bobot penilaian dan batas verifikasi ada di [audit komponen](docs/COMPETITION_IMPROVEMENT_PLAN.md#audit-ulang-komponen-penilaian--20-november-2026).

1. Buka `/report`, unggah foto dan ceritakan pengamatan dalam 20–1.500 karakter.
2. AI memisahkan apa yang terlihat dari cerita pelapor, menyarankan judul/kategori, dan menanyakan paling banyak tiga hal yang belum jelas. Jawaban **Saya tidak tahu** diperbolehkan.
3. Jawaban tersimpan di draf privat. Saat formulir disiapkan, deskripsinya mempertahankan cerita asli dan jawaban pelapor; pengamatan maupun ringkasan AI tidak disalin menjadi kesaksian.
4. Periksa seluruh isian, tentukan waktu dan lokasi, lalu centang konfirmasi untuk mengirim. Mengubah isian membatalkan centang. Draf belum masuk antrean petugas sebelum dikirim.
5. Setelah laporan tersimpan, analisis ancaman yang terpisah dan prioritas dijalankan seperti alur semula. Petugas tetap menentukan verifikasi dan tindak lanjut.

Draf dapat dilanjutkan setelah reload selama bukti masih berlaku (dua jam sejak unggahan). Jika AI gagal, cerita dan foto yang sudah disiapkan dapat diteruskan melalui **Isi formulir sendiri**. Asisten tidak mengenali GPS, menyimpulkan legalitas, melakukan pemantauan satelit, atau menghubungi petugas otomatis.

Pada proyek yang sudah memakai migrasi `001`–`006`, jalankan seluruh isi [JALANKAN_ASISTEN_PELAPORAN.sql](supabase/JALANKAN_ASISTEN_PELAPORAN.sql). Hasil `finish` yang diharapkan `1..26`; fixture dibatalkan sebelum commit migrasi. Migrasi profil `007` diperlukan untuk fitur foto akun, tetapi tidak menjadi dependensi asisten. Key Supabase aplikasi bukan credential eksekusi SQL.

`tests/e2e/assistant-ui.spec.ts` menguji kontrak antarmuka dengan fixture lokal yang diintersep dan tidak disimpan ke database. `tests/e2e/assistant.spec.ts` memakai unggahan, database dan Gemini nyata, hanya saat `E2E_GEMINI_LIVE=true` dan server mengonfirmasi akun simulasi. Uji antarmuka tidak menggantikan bukti keberhasilan provider nyata.

## Menjalankan secara lokal

Prasyarat: Node.js 24.x dan npm 11 atau lebih baru. Pada PowerShell, gunakan `npm.cmd` jika `npm.ps1` diblokir execution policy.

```powershell
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Jika `.env` sudah ada, pertahankan isinya; tidak perlu menyalin ulang. Buka `http://localhost:3000`. `RIMBAGUARD_SETUP_MODE=true` mengizinkan development tanpa Supabase dan menampilkan keadaan layanan belum tersedia. Mode ini tidak diterima oleh server production. Font Inter disajikan dari paket lokal, tanpa permintaan font eksternal.

Navigasi GET/HEAD development dari alias loopback `127.0.0.1`/`::1` pada port dan protokol yang sama diarahkan sementara ke origin `NUXT_PUBLIC_APP_URL`. Ini menjaga cookie sesi dan callback pada satu alamat. API mutasi tetap menolak origin asing, alias yang berbeda, origin tidak valid, dan metadata cross-site; production tidak memakai pengalihan ini. Setelah mengubah `.env`, restart server development agar konfigurasi baru terbaca.

## Menghubungkan Supabase

1. Buat proyek melalui [Supabase Dashboard](https://supabase.com/dashboard). Pilih region yang sesuai pengguna dan simpan password database secara privat.
2. Temukan project URL di dialog **Connect** dan anonymous/publishable key di **Settings → API Keys**, lalu isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `.env`. Lihat [panduan API key Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
3. Isi `SUPABASE_SERVICE_ROLE_KEY` dengan credential server yang sesuai proyek. Jangan membagikan, mencatat ke log, atau memasukkannya ke source control.
4. Terapkan file SQL dalam `supabase/migrations/` sesuai urutan nama pada proyek kosong/disposable terlebih dahulu. Prosedur dan pengujian SQL ada di [panduan database](supabase/README.md).
5. Atur **Auth → URL Configuration → Site URL** menjadi `http://localhost:3000`. Tambahkan `http://localhost:3000/auth/callback` pada daftar Redirect URLs. Pada hosting, gunakan URL HTTPS aplikasi yang sesuai `NUXT_PUBLIC_APP_URL`. Konfirmasi email memakai PKCE server dan cookie HttpOnly. Untuk konfirmasi lintas perangkat, template email dapat memakai `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`; jangan mempublikasikan token ini.
6. Jalankan `npm.cmd run check:services`. Hasil lulus hanya membuktikan koneksi/skema dasar; pemeriksaan RLS dan autentikasi antar pengguna tetap diperlukan.
7. Proses admin awal harus mengikuti prosedur operator di panduan database, setelah akun yang bersangkutan dibuat melalui Supabase Auth. Tidak ada password admin default.

Jangan kirim credential melalui chat. Semua key, termasuk anonymous/publishable project key, digunakan melalui server Nuxt untuk memenuhi instruksi penyimpanan key di server. Nama `NUXT_PUBLIC_SUPABASE_ANON_KEY` dari PRD sengaja diganti dengan nama privat. URL aplikasi saja yang tersedia dalam public runtime config. Credential dapat menggunakan nama `NUXT_SUPABASE_*` pada hosting; lihat `.env.example`.

Saat Supabase sudah diisi lengkap, konfigurasi tersebut diterima tanpa perlu mematikan setup mode pada development. Pada production, hapus atau set `RIMBAGUARD_SETUP_MODE=false`, gunakan HTTPS untuk URL aplikasi dan Supabase, dan siapkan seluruh layanan yang diaktifkan. `GEMINI_API_KEY` wajib diisi untuk analisis AI Fase 3, termasuk di secret hosting; `GEMINI_MODEL` opsional dan menimpa model default.

## Perbaikan konflik untuk proyek yang sudah memasang Fase 2

Jalankan **seluruh isi** [JALANKAN_PERBAIKAN_KONFLIK.sql](supabase/JALANKAN_PERBAIKAN_KONFLIK.sql) pada query baru SQL Editor. File tersebut menerapkan migrasi `003` dan 10 pengujian; hasil `finish` yang diharapkan adalah `1..10` tanpa error. Laporan yang sudah tersimpan dipertahankan, dan fixture pengujian dibatalkan sebelum commit. Untuk instalasi baru, terapkan seluruh migrasi sesuai urutan sebelum menjalankan aplikasi atau pengujian REST.

Konflik bisnis sekarang memakai `PT409`. Kode `40001` sebelumnya memicu loop retry pada PostgREST 14; [panduan resmi Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) menjelaskan perbaikannya. Setelah SQL berhasil, restart proyek lewat Dashboard untuk membersihkan permintaan lama yang sudah terjebak; layanan terputus sementara selama restart. Mengubah fungsi tidak menghentikan loop yang sudah berjalan. Pada proyek ini, perbaikan dan restart sudah dikonfirmasi pengguna, dan pengujian REST konflik telah lulus dengan HTTP `409`.

## Menyiapkan akses Gemini untuk Fase 3

Buka [halaman API Keys Google AI Studio](https://aistudio.google.com/apikey), lalu isi `GEMINI_API_KEY` hanya dalam `.env` lokal. Jangan kirim nilainya melalui chat atau memasukkannya ke source. Model default server adalah `gemini-3.5-flash`. Pada 15 November 2026 model ini lulus uji langsung dengan input gambar, structured output, dan pengaturan `thinkingLevel: LOW`. Default sebelumnya, `gemini-3.8-flash`, timeout atau mengembalikan HTTP 503 di sisi Google pada pengujian yang sama. `GEMINI_MODEL` dapat mengubah pilihan tersebut; akses dan kuota aktual tetap perlu diuji ulang sebelum demo. Panduan key: [Google AI Studio](https://aistudio.google.com/docs/api-key).

Untuk menyelesaikan gate autentikasi Fase 2, jalankan aplikasi, buka `/register`, gunakan email yang Anda kuasai, buka tautan konfirmasi, kemudian login. Akun QA yang dibuat melalui Auth Admin dan pengujian callback token tidak membuktikan pengiriman email registrasi. Tidak perlu membuat laporan kejadian untuk pemeriksaan ini.

Pengguna telah mengonfirmasi gate registrasi tersebut lulus pada proyek ini.

## Mengaktifkan penyimpanan analisis Fase 3

Setelah migrasi `001`–`003`, jalankan seluruh isi [JALANKAN_FASE_3.sql](supabase/JALANKAN_FASE_3.sql) pada query baru SQL Editor. Hasil `finish` yang diharapkan: `1..44` tanpa error. File menambahkan transaksi claim/complete/fail, membatasi penulisan analisis ke RPC server, dan membatalkan seluruh fixture uji sebelum commit. Jangan mengulang migrasi fondasi untuk menambah fitur ini.

`POST /api/reports/:id/analyze` menerima hanya `expectedRevision` dan `force` (khusus petugas). Server memeriksa sesi/izin dan membatasi 10 permintaan per pengguna serta 3 per laporan dalam 10 menit. Foto diambil dari bukti sealed yang diizinkan; model menerima foto, judul, deskripsi, dan kategori pilihan pengguna, tanpa identitas atau koordinat. Respons provider dibatasi 64 KB/45 detik dan divalidasi ulang dengan Zod. Tidak ada retry tersembunyi atau hasil pengganti buatan.

HTTP `202` menunjukkan attempt masih diproses. HTTP `200` mengembalikan hasil attempt tersimpan, termasuk `analysisStatus: failed` beserta kode aman jika layanan gagal; kegagalan tidak menghapus laporan. Hasil yang usang/konflik mengembalikan `409` setelah riwayat aman disimpan. Panel memisahkan revisi terbaru dari riwayat dan menyediakan retry. Analisis otomatis hanya dimulai dari state client setelah simpan berhasil, bukan dari parameter URL yang dapat dibuat pihak lain.

Uji Gemini sungguhan ada di `tests/e2e/analysis.spec.ts`, aktif hanya dengan `E2E_GEMINI_LIVE=true`, migrasi `004`, key/kuota, dan fixture simulasi terkontrol. Uji menggunakan kegagalan QA bertanda khusus, lalu retry nyata dan permintaan bersamaan; hanya hasil provider tervalidasi yang dapat menjadi `succeeded`. Keadaan skip tidak dihitung sebagai keberhasilan integrasi.

Hasil verifikasi terakhir (15 November 2026): key diterima katalog model. Timeout sebelumnya berasal dari `gemini-3.8-flash` yang tidak merespons atau mengembalikan HTTP 503 di sisi Google, bukan dari key, jaringan, atau kode. Dengan `gemini-3.5-flash`, `analysis.spec.ts` lulus: kegagalan QA bertanda khusus disimpan, retry memanggil Gemini, permintaan bersamaan memakai attempt yang sama, dan tepat satu hasil `succeeded` tervalidasi tersimpan untuk revisi laporan tersebut. `analysis-failure.spec.ts` juga lulus: pesan error, retry, penyimpanan/reload, dan ketiadaan hasil buatan terbukti. Pergantian model dilakukan secara eksplisit melalui default kode dan `GEMINI_MODEL`, bukan fallback diam-diam.

## Mengaktifkan prioritas dan peta Fase 4

Setelah migrasi `001`–`004`, jalankan seluruh isi [JALANKAN_FASE_4.sql](supabase/JALANKAN_FASE_4.sql) pada query baru SQL Editor. Hasil `finish` yang diharapkan: `1..66` tanpa error. File menambahkan perhitungan skor, penanda kesegaran skor, dan proyeksi peta; fixture uji dibatalkan sebelum commit, dan laporan lama ditandai untuk dihitung ulang oleh aplikasi.

Skor prioritas v1 dihitung hanya oleh database: keparahan × 35% + kelengkapan × 25% + kebaruan × 20% + laporan serupa × 20%. Tinggi ≥ 75, sedang ≥ 45, rendah < 45. Contoh PRD menghasilkan 85,5 (bukan 86,5). Kategori yang dinilai adalah koreksi petugas, lalu kategori AI tervalidasi yang bukan `uncertain`, lalu pilihan pelapor sebagai kategori sementara. Laporan serupa adalah laporan lain yang tidak ditolak, berkategori sama, dalam radius 2 km dan selisih waktu kejadian paling lama 7 hari, pada jenis data yang sama: laporan nyata hanya dihitung bersama laporan nyata, data simulasi hanya bersama data simulasi. Aturan lengkap tampil di detail laporan petugas dan disalin di `shared/constants/scoring.ts`, yang dijaga sama dengan SQL oleh unit test kontrak.

Skor dihitung ulang setelah laporan dibuat, dikoreksi, atau menerima hasil AI, serta sebelum petugas membuka peta atau detail laporan. Perubahan satu laporan ikut menandai lingkungan lama dan barunya. Batas kebaruan (6/24/72/168 jam) tercatat per laporan, sehingga skor kedaluwarsa dihitung ulang saat dibaca petugas; tidak diperlukan job terjadwal. Perhitungan diserialkan dengan advisory lock dan riwayat hanya bertambah saat hasil berubah.

- `/map`: hanya laporan nyata yang dipublikasikan petugas, dengan koordinat dibulatkan 0,01° (sekitar 1 km) dan daftar field yang dibatasi. Tautan `/map?report=<id>` dapat dibagikan; laporan yang belum dipublikasikan tidak dapat dibedakan dari laporan yang tidak ada. Permintaan anonim tidak pernah memicu perhitungan skor.
- `/admin/map`: semua laporan, termasuk data simulasi bertanda jelas, dengan koordinat persis, status kesegaran skor, filter kategori/prioritas/status/tanggal (WIB)/jenis data, dan tautan ke detail laporan.
- Skor dan komponennya hanya untuk petugas. Pelapor tidak menerima skor karena jumlah laporan serupa dapat mengungkap aktivitas pelapor lain.

Peta memakai Leaflet, OpenStreetMap, dan `leaflet.markercluster`. Marker memakai huruf (T/S/R/–) selain warna; kelompok berwarna prioritas tertinggi di dalamnya. Peta tidak menggambar batas kawasan hutan atau data satelit.

## Mengaktifkan alur kerja petugas Fase 5

Setelah migrasi `001`–`005`, jalankan seluruh isi [JALANKAN_FASE_5.sql](supabase/JALANKAN_FASE_5.sql) pada query baru SQL Editor. Hasil `finish` yang diharapkan: `1..64` tanpa error. Fixture uji dibatalkan sebelum commit.

Ruang petugas memakai sidebar di desktop dan menu drawer di ponsel:

- `/admin/dashboard`: total laporan, menunggu verifikasi, prioritas tinggi aktif, telah diverifikasi, selesai ditangani, lima laporan aktif teratas, tiga grafik 30 hari, dan tindakan cepat. Data nyata dan simulasi dipilih terpisah dan tidak pernah digabung.
- `/admin/reports`: antrean berdasarkan skor prioritas. Defaultnya laporan aktif; filter cakupan, kategori, prioritas, dan jenis data tersedia.
- `/admin/reports/[id]`: bukti, lokasi, analisis AI, komponen skor, audit lengkap dengan nama petugas, serta tindakan berikut:
  - verifikasi, tolak, minta informasi, tandai ditindaklanjuti, dan tandai selesai, hanya pada transisi yang diizinkan database;
  - publikasi atau penarikan ringkasan publik, dengan penolakan untuk data simulasi;
  - koreksi kategori dan catatan internal.
- `/admin/analytics`: rentang 7 hari sampai 12 bulan, dengan definisi setiap angka.
- `/admin/settings`: akun, keluar dari perangkat ini atau semua perangkat, keadaan layanan tanpa kunci, dan aturan skor.

Pelapor hanya melihat catatan yang ditujukan kepadanya (alasan penolakan atau permintaan informasi) serta ringkasan publik yang disetujui. Catatan internal, alasan koreksi kategori, alasan penarikan, dan kode kegagalan AI tetap untuk petugas. Setelah melengkapi informasi, laporan kembali dianalisis. Grafik memakai Chart.js dengan tampilan tabel sebagai alternatif aksesibel. Arti setiap statistik dan kontrak endpoint ada di [docs/API.md](docs/API.md).

## Pemeriksaan

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run check:services
npm.cmd run check:reporting
npm.cmd run check:degraded
npm.cmd run test:e2e
```

`check:degraded` menjalankan hasil build produksi dengan konfigurasi yang sengaja dirusak. Pemeriksaan ini memastikan bahwa:
- saat database tidak terjangkau, API menjawab 503 dengan cepat dan halaman menampilkan pesan "belum dapat dimuat", bukan angka nol;
- tidak ada kunci yang bocor ke respons maupun log;
- produksi menolak berjalan tanpa konfigurasi Supabase, dengan setup mode, atau dengan URL aplikasi non-HTTPS.

Pemeriksaan ini tidak menghubungi project Supabase. Jalankan `npm.cmd run build` terlebih dahulu.

Spesifikasi browser dan API Fase 6:
- `accessibility.spec.ts`: memindai 14 halaman dengan axe (WCAG 2.0/2.1/2.2 A dan AA), dan memastikan tidak ada scroll horizontal di 375/768/1280/1440 px.
- `security.spec.ts`: akses anonim, CSRF/origin, tipe konten, ukuran body, header keamanan, bukti privat di Storage, penyalahgunaan unggahan, laporan milik orang lain, rate limit, cache halaman bersesi, dan sesi curian setelah "keluar dari semua perangkat".
- `journey.spec.ts`: perjalanan lengkap warga, AI, petugas, lalu warga di sesi baru. Uji ini memanggil Gemini sekali, sehingga hanya aktif dengan `E2E_GEMINI_LIVE=true`.

Dengan server development berjalan, jalankan `npm.cmd run test:smoke` dari terminal lain untuk memeriksa halaman SSR, payload konfigurasi/sesi, dan penolakan akses/mutasi yang tidak diizinkan melalui HTTP.

`test:e2e` menjalankan Chrome/Edge lokal tanpa mengunduh browser, menguji navigasi landing di 320/375/768/1280/1440 px, keyboard, validasi login/registrasi, proteksi laporan, dan peta publik. Pengujian pelaporan yang menulis data dilewati secara eksplisit jika akun simulasi belum dikonfigurasi; skip bukan bukti alur persistensi sudah lulus.

Animasi scroll Beranda dan Tentang memakai IntersectionObserver bawaan browser: kemunculan sekali dengan pergeseran pendek dan jeda antarlangkah yang dibatasi. Konten awal tetap terlihat, fokus keyboard ditampilkan langsung, dan reduced motion maupun browser tanpa JavaScript/observer tetap dapat membaca informasi. Peta, formulir dan navigasi tidak ikut digerakkan.

Untuk regresi desain, jalankan `npm.cmd run test:e2e:ui`. Cakupannya: hero video hutan tanpa tombol pemutaran, versi ponsel, fallback gambar, preferensi pengurangan animasi, tiga langkah yang seragam, tautan menuju laporan, autentikasi split-screen, kontrol kata sandi melalui keyboard, menu akun terpisah, dan pemindaian aksesibilitas. Tes UI ini tidak membuat laporan, mengirim email pendaftaran, atau memanggil Gemini. Tes menu akun dan halaman privat memakai sesi QA sungguhan; tes aksesibilitas halaman laporan memerlukan fixture simulasi yang sudah tersimpan. Pemeriksaan callback, rotasi sesi, ownership, alur unggahan/petugas, dan Gemini tetap ada dalam suite penuh. Jangan menganggap fixture yang tidak tersedia atau tes yang dilewati sebagai hasil lulus.

Untuk menjalankan skenario persistensi browser pada proyek pengujian, gunakan `npm.cmd run test:e2e:prepare`. Perintah tersebut menyiapkan dua akun terkontrol ber-role `public`, tanpa mengirim email atau membuat laporan, lalu menyimpan credential hanya dalam `.env.e2e` yang diabaikan Git. Akun utama memakai `E2E_EMAIL`, `E2E_PASSWORD`, dan `RIMBAGUARD_TEST_USER_ID`; akun pembaca kedua memakai `E2E_READER_EMAIL`, `E2E_READER_PASSWORD`, dan `E2E_READER_USER_ID` untuk memeriksa isolasi antar pengguna. Akun dipertahankan untuk pengujian ulang; script tidak menghapus akun/laporan atau mengubah role.

Uji halaman petugas memakai akun petugas QA terpisah (`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_ADMIN_USER_ID`) yang dibuat dengan `npm.cmd run test:e2e:prepare-officer`. Script hanya membuat akun terkonfirmasi ber-role `public` dan mencetak perintah SQL; role admin tetap diberikan operator melalui SQL Editor sesuai [prosedur admin](supabase/README.md#restricted-first-admin-provisioning). Uji petugas dilewati selama role tersebut belum diberikan. `admin-workflow.spec.ts` membutuhkan dua laporan simulasi yang dapat ditinjau. Fixture diambil dari laporan `pending_analysis` yang diberi gangguan QA berlabel melalui RPC asli (tanpa hasil AI buatan), lalu laporan `analysis_failed` lama, lalu laporan `pending_verification`. Laporan `analysis_failed` terbaru disisakan untuk `analysis-failure.spec.ts`; jalankan `reporting.spec.ts` untuk menambah fixture.

Hentikan server development biasa sebelum menjalankan `test:e2e`; runner memulai server khusus dengan konfigurasi akun simulasi. Pengujian menolak membuat laporan jika sesi server tidak mengonfirmasi mode simulasi. Laporan uji ditandai jelas sebagai simulasi, terlihat hanya oleh pemilik/petugas, serta dikecualikan dari statistik dan peta publik. File credential tidak boleh dibagikan atau dicatat ke log. Pengujian callback membuat token untuk akun QA yang sudah ada tanpa mengirim email; registrasi baru/penerimaan email tetap perlu diuji langsung.

`check:reporting` menambahkan pemeriksaan read-only untuk ledger unggahan dan RPC statistik Fase 2. Jika kode `PGRST205`/`PGRST202` muncul, jalankan seluruh isi [migrasi pelaporan](supabase/migrations/20261114000200_reporting.sql), kemudian [pengujian SQL pelaporan](tests/database/reporting.test.sql) di SQL Editor. Pertahankan isi `.env` yang sudah dikonfigurasi.

`check:services` keluar dengan kode gagal jika konfigurasi/koneksi belum tersedia; ini bukan hasil lulus kosong. Pengujian SQL keamanan memerlukan Supabase lokal/CI dengan PostgreSQL, Auth, Storage, dan pgTAP; instruksi ada di `supabase/README.md`. Build yang berhasil tidak membuktikan autentikasi atau persistensi sudah berfungsi.

`npm.cmd run preview` menjalankan hasil build sebagai server production dan memerlukan konfigurasi server lengkap yang dipasok environment host. Untuk memuat `.env` lokal secara eksplisit saat memeriksa hasil build, gunakan `node --env-file=.env .output/server/index.mjs`; jangan gunakan setup mode sebagai pengganti konfigurasi production.

## Struktur dan batas keamanan

- `app/`: halaman, layout, komponen, composable, dan middleware navigasi.
- `server/api/`: autentikasi, unggahan, laporan milik pengguna, statistik, proyeksi peta publik, dan peta petugas (`/api/admin/map`); seluruh mutasi melalui validasi/izin server.
- `server/services/`: alur laporan, analisis AI (`ai/threat-analysis.ts`), permintaan hitung ulang skor serta validasi proyeksi peta (`threat-priority.ts`), dan tindakan serta analitik petugas (`admin-service.ts`).
- `server/utils/`: konfigurasi privat, pemeriksaan sesi/role, validasi, origin/CSRF, error aman, dan pembatasan permintaan berbasis database.
- `shared/`: enum, kontrak Zod, dan tipe yang tidak memuat credential.
- `supabase/`: migrasi, RLS, storage privat, audit, dan pengujian database.
- `tests/unit/`: pengujian batas validasi, konfigurasi, dan origin.

Perubahan data dibatasi ke API server. Server memvalidasi identitas dan izin sebelum memakai operasi privileged; RLS/grant menolak penulisan tabel sensitif oleh client. Laporan dan bukti privat secara default. Bukti diunggah langsung ke namespace `incoming` dengan signed token, lalu diperiksa berdasarkan bytes/ukuran/format sebenarnya, dinormalisasi, dan disegel di namespace terpisah sebelum dilampirkan pada laporan. Token incoming tidak berwenang menulis bukti sealed.

`/api/health` hanya menunjukkan konfigurasi tersedia/belum tersedia, bukan klaim bahwa koneksi telah diuji. `/api/auth/session` mengembalikan identitas aman atau `null`, tanpa access/refresh token. Semua akses `/api/admin/*` dan `/admin/*` diperiksa di server; fungsi database petugas juga memeriksa ulang role pelaku. Request mutasi API harus menggunakan JSON dan origin aplikasi yang sesuai.

## Atribusi dan penggunaan AI

Pengembangan dibantu OpenAI Codex dan Claude Code (Anthropic) untuk perencanaan, implementasi, dan pemeriksaan kode. Ketergantungan terbuka yang digunakan: Nuxt/Vue, Tailwind CSS, Supabase SDK, Zod, Leaflet/OpenStreetMap, Leaflet.markercluster, Chart.js, Sharp, Vitest, Playwright, axe-core, serta font Inter melalui Fontsource. Lisensi pihak ketiga mengikuti paket masing-masing. Logo dan ikon alur dibuat sebagai SVG. Beranda memakai video **Drone Footage of Trees and Forest** karya **Mikhail Nilov** dari [Pexels](https://www.pexels.com/video/drone-footage-of-trees-and-forest-6989121/), sesuai [Pexels License](https://www.pexels.com/license/), dikompresi menjadi MP4 tanpa suara 1080p/720p beserta gambar fallback. Referensi susunan navbar/video diberikan pengguna: [Gojek.io](https://www.gojek.io/); logo dan media Gojek tidak digunakan.

Panorama yang sebelumnya menjadi latar beranda dan masih dipakai pada autentikasi, gambar hutan halaman Tentang, serta karakter dan lanskap hutan yang sempat dicoba pada bagian alur dibuat dengan OpenAI image generation. Bagian alur final memakai pengantar dan tombol di kiri, tiga langkah bernomor di kanan, serta latar gading polos tanpa ilustrasi. Aset percobaan `workflow-landscape-v2*.webp` dan catatan pembuatannya tetap tersimpan sebagai arsip; gambar tersebut tidak dimuat pada beranda. Video dan gambar dekoratif bukan dokumentasi kejadian, pelapor, atau bukti suatu laporan. Foto Gunung Lempuyang sebelumnya tetap memiliki atribusi CC BY 4.0 karya Vyacheslav Argenberg. Rincian sumber, lisensi dan prompt ada di [catatan aset](public/images/ATTRIBUTION.md).

Penggunaan coding assistant terpisah dari fitur Gemini di produk. Analisis Gemini memakai adapter server Fase 3; hasil hanya ditampilkan setelah lolos validasi dan transaksi penyimpanan. Pada kegagalan layanan, laporan dan riwayat percobaan tetap tersimpan tanpa hasil palsu. Ketika aset, template, library, atau alat AI lain ditambahkan, perbarui atribusi di README dan proposal.

## Acuan pengumpulan lomba

Proposal versi tinjauan 22 November 2026 tersedia dalam [PDF RimbaGuard](docs/ITRUSH26_semogabisamagang_RimbaGuard.pdf), dengan sumber edit [COMPETITION_PROPOSAL.md](docs/COMPETITION_PROPOSAL.md). Dokumen mengikuti struktur template resmi, A4, Times New Roman 12 pt, margin 2,54 cm, daftar isi/gambar bernomor halaman, serta UI aktual terbaru. Identitas keempat anggota sudah dimasukkan; tautan website, video dan akun demo sengaja dikosongkan untuk dilengkapi pada salinan pengumpulan.

Bangun ulang PDF secara lokal dengan `node scripts/build-competition-proposal.mjs`. Renderer memakai Playwright/Chromium dan Sharp yang sudah menjadi dependensi proyek; lokasi browser dapat diatur lewat `RIMBAGUARD_PDF_BROWSER_PATH`. Proses ekspor tidak memerlukan server aplikasi atau panggilan layanan eksternal. Screenshot asli dan manifest sumber berada di `docs/assets/proposal-2026/`; kompresi gambar untuk PDF mempertahankan dimensi aslinya.

[Surat Pernyataan Orisinalitas dan AI dalam Word](docs/ITRUSH26_semogabisamagang_Surat_Orisinalitas_RimbaGuard.docx) sudah diisi mengikuti template panitia, dengan Panji Ananda Lumbantoruan sebagai ketua serta tempat/tanggal Sitoluama, 23 November 2026. Surat memuat pengungkapan AI/API dan masih perlu ditandatangani serta dibubuhi meterai. Ketua pada sumber proposal dan PDF juga telah dikoreksi sesuai arahan pengguna.

Pengguna mengonfirmasi perpanjangan pengumpulan hingga 23 November 2026. Guidebook menetapkan deployment perlu tetap aktif sampai 30 November 2026. Pengumpulan mencakup URL live, repository publik dengan riwayat commit yang dipertahankan, video YouTube Unlisted 3–5 menit, proposal `ITRUSH26_NamaTim_JudulKarya.pdf`, dan deklarasi orisinalitas/penggunaan AI. Akun demo yang disengaja disiapkan menjelang pengumpulan, tanpa hardcoded credential production. Demo final perlu menunjukkan integrasi AI yang benar-benar berhasil.

Ketentuan guidebook dicatat sebagai acuan pengumpulan; PRD tetap menjadi sumber spesifikasi produk. Publikasi eksternal dan pengumpulan belum dilakukan.
