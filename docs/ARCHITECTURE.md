# Arsitektur RimbaGuard AI

RimbaGuard AI menerima laporan ancaman hutan dari masyarakat, menyusun analisis awal dengan AI, menghitung prioritas pemeriksaan secara transparan, dan membantu petugas memverifikasi serta menindaklanjuti laporan. AI dan skor hanya membantu urutan pemeriksaan; keputusan tetap di tangan petugas.

## Komponen

```
Browser (Nuxt/Vue, tanpa kunci layanan)
   │  HTTPS, cookie sesi HttpOnly, JSON + pemeriksaan origin
   ▼
Server Nuxt (Nitro/h3)  ── memvalidasi sesi, peran, dan input (Zod)
   │            │                    │
   │            │                    └─► Google Gemini API (analisis foto + teks, JSON terstruktur)
   │            └─► Supabase Storage (bucket privat, signed URL berumur pendek)
   └─► Supabase PostgreSQL (RLS, fungsi PL/pgSQL atomik, audit tidak dapat diubah)
       Supabase Auth (registrasi, konfirmasi email, login, refresh sesi)
```

- **Browser** hanya berbicara dengan server Nuxt. Kunci Supabase dan Gemini tidak pernah dikirim ke browser; pemindaian hasil build memastikannya.
- **Server Nuxt** (`server/`) memeriksa identitas dari sesi Supabase yang terverifikasi, mengambil peran dari database, memvalidasi setiap body dan parameter, lalu memanggil fungsi database dengan kredensial server.
- **Database** adalah otoritas terakhir. Status, publikasi, analisis AI, dan skor hanya dapat berubah melalui fungsi `security definer` yang mengunci baris, memeriksa revisi, memeriksa ulang peran pelaku, dan menulis audit dalam transaksi yang sama. RLS dan grant menolak penulisan langsung oleh browser maupun kredensial server.

## Alur laporan

1. **Unggah bukti.** Server memberi signed upload URL untuk path milik pengguna di namespace `incoming`. Browser mengunggah langsung ke Storage, sehingga batas 5 MB tidak bergantung pada batas payload fungsi server. Server lalu memeriksa ukuran dan tanda tangan file, memastikan gambar dapat didekode, membuang metadata, menyimpan JPEG tersegel di namespace `sealed`, dan mencatat sidik jarinya.
2. **Kirim laporan.** `POST /api/reports` dengan `Idempotency-Key`. Pengiriman ulang dengan kunci dan isi yang sama mengembalikan laporan yang sama; kunci yang sama dengan isi berbeda ditolak. Laporan disimpan sebagai `pending_analysis` sebelum AI berjalan.
3. **Analisis AI.** Halaman memulai analisis setelah penyimpanan berhasil. Server mengklaim satu percobaan dengan lease 120 detik, mengirim foto tersegel dan teks laporan, dan memperlakukan teks dan gambar sebagai data bukti, bukan instruksi. Keluaran Gemini divalidasi ulang dengan Zod dan di database. Hasil yang sah memindahkan laporan ke `pending_verification`; kegagalan disimpan dengan kode aman (`analysis_failed`) tanpa hasil buatan. Respons yang terlambat untuk revisi lama atau setelah keputusan petugas ditolak.
4. **Skor prioritas.** Database menghitung skor v1 setelah laporan dibuat, dikoreksi, atau dianalisis, dan sebelum petugas membaca peta, antrean, atau detail. Lihat bagian skor di bawah.
5. **Tinjauan petugas.** `pending_verification` atau `analysis_failed` → `verified`, `rejected`, atau `needs_more_information`; `verified` → `in_progress` → `resolved`. Penolakan dan permintaan informasi wajib disertai catatan untuk pelapor. Setelah melengkapi informasi, laporan kembali ke `pending_analysis`.
6. **Publikasi.** Hanya laporan nyata yang sudah diverifikasi yang dapat dipublikasikan, dengan ringkasan yang ditinjau petugas. Peta publik hanya menampilkan field yang diizinkan dengan koordinat dibulatkan sekitar 1 km. Data simulasi tidak dapat dipublikasikan.

## Skor prioritas v1

`skor = keparahan × 0,35 + kelengkapan × 0,25 + kebaruan × 0,20 + laporan serupa × 0,20`. Tinggi ≥ 75, sedang ≥ 45, rendah < 45.

- **Keparahan** memakai bobot awal PRD per kategori. Kategori yang dinilai adalah koreksi petugas, lalu kategori AI yang tervalidasi dan bukan `uncertain`, lalu pilihan pelapor sebagai kategori sementara.
- **Kelengkapan** menilai kelengkapan informasi: foto, deskripsi, koordinat, waktu, dan nama lokasi. Ini bukan penilaian keaslian bukti.
- **Kebaruan** turun bertahap pada usia kejadian 6, 24, 72, dan 168 jam. Batas berikutnya tersimpan per laporan, sehingga skor kedaluwarsa dihitung ulang saat dibaca petugas tanpa job terjadwal.
- **Laporan serupa** adalah laporan lain yang tidak ditolak, berkategori sama, dalam radius 2 km, dan berselisih waktu kejadian paling lama 7 hari, pada jenis data yang sama. Laporan nyata tidak pernah dihitung bersama data simulasi. Laporan berdekatan bukan bukti bahwa kejadian benar terjadi.

Perhitungan diserialkan dengan advisory lock. Perubahan satu laporan menandai lingkungan lama dan barunya, dan riwayat skor hanya bertambah bila hasilnya berubah. Aturan yang ditampilkan di aplikasi (`shared/constants/scoring.ts`) dijaga sama dengan SQL oleh unit test kontrak. Perubahan aturan memerlukan versi migrasi baru.

## Batas keamanan dan privasi

- **Sesi**: cookie HttpOnly, `SameSite=Lax`, `Secure` di produksi. "Keluar dari semua perangkat" mencabut seluruh sesi akun; cookie yang disalin ikut tidak berlaku.
- **Mutasi**: wajib JSON dari origin aplikasi; body maksimal 64 KB; rate limit tersimpan di database sehingga berlaku untuk semua instance server.
- **Peran**: diperiksa di setiap handler dan diperiksa ulang di fungsi database. Peran admin hanya diberikan operator melalui SQL Editor.
- **Privasi laporan**: laporan dan bukti privat secara default; bukti hanya dapat dibuka dengan signed URL lima menit untuk pemilik atau petugas. Pelapor tidak melihat skor, catatan internal, alasan koreksi kategori, alasan penarikan publikasi, maupun kode kegagalan AI.
- **Cache**: respons API dan halaman untuk pengunjung yang masuk dikirim dengan `private, no-store`.
- **Data simulasi**: akun uji yang ditetapkan server membuat laporan bertanda simulasi. Data ini dikecualikan dari statistik dan peta publik, tidak dapat dipublikasikan, dan dipisahkan di analitik petugas.

## Perilaku saat layanan gagal

| Keadaan | Perilaku |
|---|---|
| Database tidak terjangkau | API menjawab `503 DATABASE_UNAVAILABLE` dalam hitungan milidetik; halaman tetap tampil dengan pesan "belum dapat dimuat", bukan angka nol. Diuji oleh `npm.cmd run check:degraded`. |
| Konfigurasi produksi tidak lengkap, setup mode aktif, atau URL aplikasi bukan HTTPS | Server menolak berjalan dengan pesan konfigurasi yang jelas tanpa menampilkan kunci. |
| Gemini tidak dikonfigurasi, timeout, kuota habis, atau keluaran tidak valid | Percobaan disimpan sebagai gagal dengan kode aman; laporan tetap tersimpan dan dapat dianalisis ulang atau ditinjau manual oleh petugas. |
| Peta dasar OpenStreetMap gagal | Pesan ditampilkan; daftar laporan dan pengisian koordinat manual tetap berfungsi. |
| Izin lokasi ditolak | Pelapor memilih titik di peta atau mengisi koordinat manual. |
| Unggahan gagal atau terlalu lambat | Formulir mempertahankan isian dan meminta pengunggahan ulang dengan token baru. |
| Skor sedang dihitung proses lain | Halaman memakai perhitungan terakhir dan menandainya "menunggu pembaruan". |

## Struktur kode

| Direktori | Isi |
|---|---|
| `app/` | Halaman, layout publik dan petugas, komponen (peta, grafik, laporan, tindakan petugas), composable. |
| `server/api/` | Endpoint autentikasi, unggahan, laporan, analisis, publik, dan petugas. |
| `server/services/` | Laporan, bukti, analisis AI (`ai/threat-analysis.ts`), prioritas dan peta (`threat-priority.ts`), petugas (`admin-service.ts`). |
| `server/utils/` | Konfigurasi, sesi dan peran, validasi, origin, rate limit, pemetaan error, proyeksi timeline. |
| `shared/` | Konstanta, schema Zod, dan tipe yang dipakai client dan server. |
| `supabase/` | Migrasi `001`–`006` dan bundle SQL Editor (`JALANKAN_FASE_*.sql`). |
| `tests/` | Unit test (Vitest), tes database (pgTAP), dan tes browser/API (Playwright). |
| `scripts/` | Pemeriksaan layanan, kondisi gagal, dan penyiapan akun QA. |

Kontrak endpoint dan arti statistik ada di [API.md](API.md). Riwayat keputusan dan hasil verifikasi setiap fase ada di [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md).
