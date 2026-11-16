# API RimbaGuard AI

Ringkasan endpoint server Nuxt untuk fitur prioritas, peta, dan alur kerja petugas (Fase 4–5). Semua endpoint berada di origin aplikasi yang sama dengan halaman. Browser tidak pernah menerima kunci Supabase atau Gemini.

## Aturan umum

- Mutasi (`POST`, `PUT`, `PATCH`, `DELETE`) wajib memakai `Content-Type: application/json` dan origin aplikasi. Permintaan dari origin lain ditolak dengan `403 INVALID_ORIGIN`.
- Body divalidasi ketat dengan Zod. Field yang tidak dikenal, misalnya `role` atau `status` palsu, ditolak dengan `422 VALIDATION_FAILED`.
- Error memakai bentuk `{ "data": { "error": { "code": "…", "message": "…", "fields"?: {…} } } }`. Pesan selalu dalam Bahasa Indonesia dan tidak pernah memuat teks mentah dari database atau penyedia AI.
- Database tidak dapat dihubungi berarti `503 DATABASE_UNAVAILABLE`, bukan angka nol.
- Endpoint `/api/admin/*` memerlukan sesi petugas. Server memeriksa identitas dan peran di setiap handler. Fungsi database juga memeriksa ulang bahwa pelakunya admin.
- Mutasi petugas dibatasi 120 permintaan per 10 menit per petugas.

## Konflik dan revisi

Setiap laporan memiliki `revision`. Aksi petugas mengirim `expectedRevision`. Bila laporan sudah diubah pihak lain, server menjawab `409 REPORT_CONFLICT` tanpa mengubah apa pun. Klien lalu memuat ulang laporan. Perubahan status, publikasi, dan koreksi kategori menaikkan revisi. Catatan internal tidak menaikkan revisi.

`report.contentRevision` adalah revisi perubahan isi terakhir (laporan dibuat atau dikoreksi pelapor). Hasil AI tetap berlaku selama `analysis.reportRevision >= contentRevision`, walaupun petugas sudah mengubah status.

## Endpoint warga dan autentikasi

| Metode | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/auth/register` | Registrasi; email konfirmasi dikirim Supabase Auth |
| POST | `/api/auth/login` | Login; sesi di cookie HttpOnly. Dibatasi 30 percobaan per IP dan 10 per email per 15 menit |
| POST | `/api/auth/logout` | `{ "scope": "local" }` (perangkat ini) atau `{ "scope": "global" }` (semua perangkat) |
| GET | `/api/auth/session` | Identitas aman (`id`, `email`, `fullName`, `role`) atau `null`; tidak pernah token |
| POST | `/api/uploads/authorize` | Signed upload URL untuk path milik pengguna. Nama berkas tanpa direktori, JPEG/PNG/WebP, maksimal 5.000.000 byte |
| POST | `/api/uploads/finalize` | Memeriksa byte, format, dan ukuran sebenarnya, lalu menyegel bukti sebagai JPEG tanpa metadata |
| POST | `/api/reports` | Membuat laporan; wajib `Idempotency-Key` (UUID). Field `status`, `role`, skor, atau hasil AI ditolak |
| GET | `/api/reports` | Laporan milik sendiri (petugas: semua laporan), berhalaman |
| GET | `/api/reports/:id` | Detail; laporan orang lain dijawab `404`. Pelapor tidak menerima skor, catatan internal, atau kode kegagalan AI |
| PATCH | `/api/reports/:id` | Koreksi pemilik selama `pending_analysis`, `analysis_failed`, `pending_verification`, atau `needs_more_information`, dengan `expectedRevision` |
| POST | `/api/reports/:id/analyze` | Memulai atau mengulang analisis AI; dibatasi 10 per pengguna dan 3 per laporan per 10 menit |

## Endpoint petugas

| Metode | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/admin/dashboard?dataset=real\|simulation` | Ringkasan, 5 laporan aktif teratas, dan analitik 30 hari |
| GET | `/api/admin/reports?scope=&category=&priority=&dataset=&page=` | Antrean prioritas, 20 per halaman |
| GET | `/api/admin/reports/:id` | Detail tinjauan: bukti, analisis AI, skor, audit dengan nama petugas, aksi yang diizinkan |
| PATCH | `/api/admin/reports/:id/status` | Ubah status sesuai matriks |
| PUT | `/api/admin/reports/:id/publication` | Publikasikan atau perbarui ringkasan publik |
| DELETE | `/api/admin/reports/:id/publication` | Tarik publikasi |
| PATCH | `/api/admin/reports/:id/category` | Koreksi kategori oleh petugas |
| POST | `/api/admin/reports/:id/notes` | Catatan internal |
| GET | `/api/admin/map?category=&priority=&status=&from=&to=&dataset=&page=` | Peta petugas (koordinat persis) |
| GET | `/api/admin/analytics?days=7\|30\|90\|365&dataset=real\|simulation` | Analitik |
| GET | `/api/admin/settings` | Akun, keadaan layanan tanpa kunci, versi aturan skor |

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
