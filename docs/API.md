# API RimbaGuard

Ringkasan endpoint server Nuxt untuk pelaporan, asisten AI, prioritas, peta, akun, dan alur kerja petugas. Semua endpoint berada di origin aplikasi yang sama dengan halaman. Browser tidak pernah menerima kunci Supabase atau Gemini.

## Aturan umum

- Mutasi (`POST`, `PUT`, `PATCH`, `DELETE`) wajib memakai `Content-Type: application/json` dan origin aplikasi. Permintaan dari origin lain ditolak dengan `403 INVALID_ORIGIN`.
- Body divalidasi ketat dengan Zod. Field yang tidak dikenal, misalnya `role` atau `status` palsu, ditolak dengan `422 VALIDATION_FAILED`.
- Error memakai bentuk `{ "data": { "error": { "code": "…", "message": "…", "fields"?: {…} } } }`. Pesan selalu dalam Bahasa Indonesia dan tidak pernah memuat teks mentah dari database atau penyedia AI.
- Database tidak dapat dihubungi berarti `503 DATABASE_UNAVAILABLE`, bukan angka nol.
- Endpoint `/api/admin/*` memerlukan sesi petugas. Server memeriksa identitas dan peran di setiap handler. Fungsi database juga memeriksa ulang bahwa pelakunya admin.
- Mutasi petugas dibatasi 120 permintaan per 10 menit per petugas.

## Asisten pelaporan privat

Semua endpoint berikut memerlukan sesi pemilik draf. Petugas tidak memperoleh akses ke draf pribadi warga melalui endpoint ini. Foto harus sudah melewati alur authorize → upload langsung → finalize; URL/path bebas tidak diterima sebagai input asisten.

| Metode | Endpoint | Body / hasil |
|---|---|---|
| GET | `/api/report-assistant` | Draf terbaru yang belum dikirim dan belum kedaluwarsa, atau `{draft:null}`. |
| POST | `/api/report-assistant` | `{id,uploadId,story}`; ID UUID tetap untuk retry, cerita 20–1.500 karakter. Klaim atomik lalu panggil Gemini sungguhan. |
| GET | `/api/report-assistant/:id` | Draf milik sendiri; ID tidak ada/milik orang lain sama-sama `404`. |
| PUT | `/api/report-assistant/:id/answers` | `{expectedVersion,answers:[{id,text}]}`; seluruh pertanyaan wajib dijawab, maksimal tiga jawaban × 500 karakter. ID hanya dari hasil tersimpan. |
| POST | `/api/reports` | Field laporan biasa dan `assistant:{draftId,expectedVersion,confirmed:true}`, dengan header `Idempotency-Key`. |

Respons memuat `{draft}`: `id`, `uploadId`, `version`, `status`, `story`, `result`, `answers`, `description`, `errorCode`, `evidencePath`, `evidenceUrl`, `expiresAt`, `reportId`. Lease dan identitas internal tidak dikirim. Preview memakai signed URL lima menit. Hasil AI memisahkan `visual_observations`, `reported_summary`, `suggested_title`, `suggested_category`, `questions`, `limitations`, dan `needs_human_review:true`. Validasi Zod ketat tetap berlaku walaupun provider memakai JSON schema.

Status: `processing → ready | failed`; `ready → submitted` hanya setelah konfirmasi. Masa berlaku mengikuti receipt foto, dua jam sejak unggahan. Lease pemrosesan 90 detik, transport Gemini maksimal 45 detik/64 KB. Input sama dengan draf ready memakai hasil tersimpan; processing aktif menjawab `202` tanpa generasi kedua. Retry kegagalan dilakukan atas tindakan pengguna. POST dibatasi enam/pengguna dan tiga/foto per 10 menit; penyimpanan jawaban 30/pengguna per 10 menit.

`200` dengan `draft.status:failed` berarti kegagalan provider berhasil disimpan, bukan AI berhasil. `result:null` dan kode aman seperti `AI_TIMEOUT`, `AI_QUOTA_EXCEEDED`, atau `AI_PROVIDER_UNAVAILABLE` menyertai kegagalan. Skema belum terpasang memberi `503 ASSISTANT_SCHEMA_UNAVAILABLE`. Versi/lease berubah memberi `409 ASSISTANT_CONFLICT`, bukti habis masa berlaku `409 EVIDENCE_EXPIRED`, dan jawaban/konfirmasi tidak sah `422`. Tidak ada respons AI palsu.

`description` disusun dari cerita asli dan jawaban pelapor. Observasi dan ringkasan AI hanya ditampilkan sebagai bantuan, bukan disalin ke keterangan saksi. Pelapor boleh memperbaiki judul, kategori dan deskripsi saat meninjau. Pengiriman menggunakan satu transaksi: validasi ownership, versi, jawaban lengkap, bukti dan konfirmasi → `create_report` → tautkan draf. Kegagalan membatalkan transaksi; replay payload/kunci identik mengembalikan laporan sama. Analisis ancaman setelah pengiriman tetap proses terpisah.

## Konflik dan revisi laporan

Setiap laporan memiliki `revision`. Aksi petugas mengirim `expectedRevision`. Bila laporan sudah diubah pihak lain, server menjawab `409 REPORT_CONFLICT` tanpa mengubah apa pun. Klien lalu memuat ulang laporan. Perubahan status, publikasi, dan koreksi kategori menaikkan revisi. Catatan internal tidak menaikkan revisi.

`report.contentRevision` adalah revisi perubahan isi terakhir (laporan dibuat atau dikoreksi pelapor). Hasil AI tetap berlaku selama `analysis.reportRevision >= contentRevision`, walaupun petugas sudah mengubah status.

## Endpoint warga dan autentikasi

| Metode | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/auth/register` | Registrasi; email konfirmasi dikirim Supabase Auth |
| POST | `/api/auth/login` | Login; sesi di cookie HttpOnly. Dibatasi 30 percobaan per IP dan 10 per email per 15 menit |
| POST | `/api/auth/logout` | `{ "scope": "local" }` (perangkat ini) atau `{ "scope": "global" }` (semua perangkat) |
| GET | `/api/auth/session` | Identitas aman (`id`, `email`, `fullName`, `role`, `avatarUrl`) atau `null`; tidak pernah token atau path penyimpanan |
| PATCH | `/api/account/profile` | `{ "fullName" }` (2–100 karakter). Mengganti nama sendiri; dibatasi 10 per 10 menit |
| POST | `/api/account/password` | `{ "currentPassword", "newPassword" }`. Kata sandi lama diperiksa lewat sesi terpisah yang langsung ditutup; kata sandi baru minimal 12 karakter dan harus berbeda. Setelah berhasil, sesi di perangkat lain dicabut, perangkat ini tetap masuk. Dibatasi 5 per 15 menit |
| PUT | `/api/account/avatar` | `{ "image": "<base64>" }` maksimal 45.000 byte (browser memotong dan memperkecil foto lebih dulu). Server memeriksa isi berkas lalu menyimpannya ulang sebagai WebP 256 × 256 tanpa metadata di bucket privat `profile-photos` (dibuat otomatis bila belum ada; migrasi `007` menambah kebijakan pengaman) |
| DELETE | `/api/account/avatar` | Body `{}`. Menghapus foto profil sendiri |
| GET | `/api/account/avatar?v=<id>` | Foto profil milik sesi itu sendiri sebagai `image/webp`. Versi lama dijawab `404`, sehingga URL berversi boleh di-cache privat |
| POST | `/api/uploads/authorize` | Signed upload URL untuk path milik pengguna. Nama berkas tanpa direktori, JPEG/PNG/WebP, maksimal 5.000.000 byte |
| POST | `/api/uploads/finalize` | Memeriksa byte, format, dan ukuran sebenarnya, lalu menyegel bukti sebagai JPEG tanpa metadata |
| POST | `/api/reports` | Membuat laporan; wajib `Idempotency-Key` (UUID). Field `status`, `role`, skor, atau hasil AI ditolak |
| GET | `/api/reports` | Laporan milik sendiri (petugas: semua laporan), berhalaman |
| GET | `/api/reports/:id/thumbnail` | Thumbnail foto bukti WebP maksimal 384 × 288, menampilkan gambar utuh di tengah dengan latar netral tanpa crop. Memerlukan sesi pemilik atau petugas; laporan orang lain dijawab `404`. Respons `private, no-store` tanpa URL Storage atau path bukti |
| GET | `/api/reports/:id` | Detail; laporan orang lain dijawab `404`. Pelapor tidak menerima skor, catatan internal, atau kode kegagalan AI |
| PATCH | `/api/reports/:id` | Koreksi pemilik selama `pending_analysis`, `analysis_failed`, `pending_verification`, atau `needs_more_information`, dengan `expectedRevision` |
| POST | `/api/reports/:id/analyze` | Memulai atau mengulang analisis AI; dibatasi 10 per pengguna dan 3 per laporan per 10 menit |

## Endpoint petugas

| Metode | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/admin/dashboard?dataset=real\|simulation` | Ringkasan, 5 laporan aktif teratas, dan analitik 30 hari |
| GET | `/api/admin/reports?scope=&category=&priority=&dataset=&page=` | Antrean prioritas, 20 per halaman |
| GET | `/api/admin/reports/:id` | Detail tinjauan: bukti, analisis AI, skor, audit dengan nama petugas, aksi yang diizinkan |
| GET | `/api/admin/reports/:id/evidence?size=thumbnail\|full` | Foto privat sebagai gambar biner; default thumbnail WebP maksimal 384 × 288 tanpa crop, full memakai foto bukti tersimpan |
| PATCH | `/api/admin/reports/:id/status` | Ubah status sesuai matriks |
| PUT | `/api/admin/reports/:id/publication` | Publikasikan atau perbarui ringkasan publik |
| DELETE | `/api/admin/reports/:id/publication` | Tarik publikasi |
| PATCH | `/api/admin/reports/:id/category` | Koreksi kategori oleh petugas |
| POST | `/api/admin/reports/:id/notes` | Catatan internal |
| GET | `/api/admin/map?category=&priority=&status=&from=&to=&dataset=&page=` | Peta petugas (koordinat persis) |
| GET | `/api/admin/analytics?days=7\|30\|90\|365&dataset=real\|simulation` | Analitik |
| GET | `/api/admin/settings` | Akun, keadaan layanan tanpa kunci, versi aturan skor |

### Foto pada antrean petugas

Endpoint foto memeriksa sesi/peran petugas dan akses RLS laporan sebelum mengambil objek bukti privat yang sudah tersimpan. Klien mengirim ID laporan dan pilihan ukuran, tanpa path Storage atau URL eksternal. Respons sukses memakai MIME gambar yang tervalidasi, `private, no-store`, `nosniff`, dan kebijakan resource same-origin; URL bertanda tangan maupun kunci layanan tidak dikirim ke browser.

Anonim mendapat `401`, pengguna non-petugas `403`, laporan yang tidak ditemukan `404`, serta ID/ukuran tidak valid `422`. Kegagalan mengambil atau memproses foto dijawab `503 EVIDENCE_UNAVAILABLE`, terpisah dari keberhasilan memuat daftar laporan. Pratinjau dimuat secara lazy dan foto penuh hanya saat petugas membuka dialog.

### Status

```json
PATCH /api/admin/reports/:id/status
{ "expectedRevision": 3, "status": "verified", "note": "Opsional, maks. 2.000 karakter" }
```

| Dari | Ke |
|---|---|
| `pending_verification`, `analysis_failed` | `verified`, `rejected`, `needs_more_information` |
| `verified` | `in_progress` |
| `in_progress` | `resolved` |

`rejected` dan `needs_more_information` wajib disertai catatan minimal 5 karakter. Catatan ini ditujukan kepada pelapor dan ditampilkan kepadanya. Catatan untuk status lain hanya terlihat petugas. `resolved` dan `rejected` bersifat final; laporan yang ditolak tidak pernah dianggap selesai. Transisi lain ditolak dengan `422 INVALID_TRANSITION`.

Setelah `needs_more_information`, pelapor memperbaiki laporan melalui `PATCH /api/reports/:id`. Laporan lalu kembali ke `pending_analysis` dan dianalisis ulang.

### Publikasi

```json
PUT /api/admin/reports/:id/publication
{ "expectedRevision": 4, "publicSummary": "10–500 karakter, tanpa identitas atau koordinat persis" }

DELETE /api/admin/reports/:id/publication
{ "expectedRevision": 5, "note": "Alasan internal, minimal 5 karakter" }
```

Hanya laporan nyata berstatus `verified`, `in_progress`, atau `resolved` yang dapat dipublikasikan. Data simulasi ditolak dengan `422 SIMULATION_NOT_PUBLISHABLE`, dan status lain dengan `422 PUBLICATION_NOT_ELIGIBLE`. Audit menyimpan teks ringkasan yang disetujui. Setelah publikasi ditarik, ringkasan disimpan sebagai draf privat.

### Kategori dan catatan

```json
PATCH /api/admin/reports/:id/category
{ "expectedRevision": 5, "category": "forest_fire", "note": "Opsional" }

POST /api/admin/reports/:id/notes
{ "note": "5–2.000 karakter" }
```

`category: null` menghapus koreksi, sehingga skor kembali memakai kategori AI atau pelapor. Kategori yang tidak berubah dijawab `409 CATEGORY_UNCHANGED`. Catatan internal dan alasan koreksi kategori tidak pernah dikirim ke pelapor maupun publik.

## Definisi statistik

Angka berasal dari fungsi database `admin_analytics` dan dihitung saat diminta. Laporan nyata dan data simulasi tidak pernah digabung. Pilih salah satunya dengan `dataset`.

| Field | Arti |
|---|---|
| `summary.total` | Semua laporan pada dataset, tanpa batas tanggal. |
| `summary.pendingVerification` | Laporan berstatus `pending_verification` (hasil AI tersedia, menunggu petugas). |
| `summary.analysisFailed` | Laporan berstatus `analysis_failed` yang menunggu tinjauan manual. |
| `summary.needsMoreInformation` | Laporan yang menunggu tambahan informasi dari pelapor. |
| `summary.highPriority` | Laporan **aktif** (bukan `rejected`/`resolved`) yang skor prioritas terbarunya tinggi. |
| `summary.verified` | Laporan yang pernah diverifikasi: `verified` + `in_progress` + `resolved`. |
| `summary.inProgress`, `summary.resolved`, `summary.rejected` | Laporan dengan status tersebut saat ini. |
| `rangeTotal` | Laporan yang **dikirim** dalam rentang tanggal (WIB). |
| `daily` | Jumlah laporan yang dikirim per hari kalender WIB. Setiap hari dalam rentang selalu ada, dan nol berarti tidak ada laporan. |
| `statusCounts` | Status **saat ini** dari laporan yang dikirim dalam rentang. |
| `categoryCounts` | Kategori yang dinilai (koreksi petugas, lalu AI yang tervalidasi, lalu pelapor) dari laporan yang dikirim dalam rentang. |

Statistik publik di `/api/public/statistics` memakai arti yang sama untuk `verifiedReports`, dan hanya menghitung laporan nyata. `namedLocations` adalah jumlah nama lokasi berbeda yang diketik pelapor. Angka itu bukan wilayah administratif dan bukan ukuran dampak lingkungan.

## Endpoint publik peta

| Metode | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/public/map?category=&priority=&status=&from=&to=&page=` | Laporan nyata yang dipublikasikan |
| GET | `/api/public/map/:id` | Satu laporan publik untuk tautan `/map?report=<id>`; laporan yang belum dipublikasikan dijawab `404` |

Field publik dibatasi pada `id`, `reportCode`, `category`, `summary`, `approximateLatitude`, `approximateLongitude` (dibulatkan 0,01°), `coordinatesAreApproximate`, `incidentTime`, `publishedAt`, `status`, dan `priority`. Permintaan anonim tidak pernah memicu perhitungan skor.
