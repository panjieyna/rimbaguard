# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# RIMBAGUARD AI
### Intelligent Tropical Forest Protection & Early Warning Platform

**Document Version:** 1.0  
**Product Type:** AI-Powered Environmental Web Application  
**Development Priority:** Competition MVP  
**Target Development Duration:** 7 Days  
**Primary Language:** Bahasa Indonesia  
**Target Platform:** Responsive Web Application  
**Project Status:** Ready for Development

---

# 1. PRODUCT OVERVIEW

## 1.1 Product Name

**RimbaGuard AI**

Tagline:

*Protecting Forests Through Intelligence and Community Action.*

## 1.2 Product Description

RimbaGuard AI merupakan platform perlindungan hutan berbasis Artificial Intelligence yang dirancang untuk membantu masyarakat dan petugas konservasi mengidentifikasi, menganalisis, memprioritaskan, serta menindaklanjuti laporan ancaman terhadap hutan.

Platform ini mengintegrasikan:

- Community-Based Environmental Reporting.
- AI-Powered Threat Analysis.
- Smart Threat Prioritization.
- Interactive Forest Threat Mapping.
- Incident Verification and Response Management.
- Environmental Intelligence Dashboard.

RimbaGuard AI berfokus pada proses mengubah laporan masyarakat menjadi informasi yang terstruktur dan dapat digunakan sebagai dasar pemeriksaan oleh petugas.

## 1.3 Problem Statement

Ancaman terhadap kawasan hutan seperti penebangan liar, kebakaran hutan, dan pembukaan lahan membutuhkan proses identifikasi dan penanganan yang cepat.

Beberapa permasalahan yang ingin diselesaikan:

1. Informasi mengenai ancaman hutan dapat tersebar di berbagai sumber dan sulit dikelola secara terpusat.
2. Laporan masyarakat belum tentu memiliki format dan kelengkapan informasi yang seragam.
3. Petugas membutuhkan cara untuk menentukan laporan yang perlu diperiksa terlebih dahulu.
4. Lokasi laporan perlu divisualisasikan agar memudahkan pemantauan geografis.
5. Proses verifikasi dan tindak lanjut perlu terdokumentasi dengan baik.

## 1.4 Proposed Solution

RimbaGuard AI menyediakan sistem terintegrasi dengan alur:

**Report → AI Analysis → Threat Prioritization → Map Visualization → Human Verification → Response Tracking.**

AI membantu menganalisis bukti dan mengategorikan ancaman. Sistem menggunakan algoritma penilaian yang transparan untuk menentukan prioritas. Keputusan akhir mengenai validitas laporan tetap berada pada petugas.

## 1.5 Product Goals

Tujuan utama:

1. Mempermudah masyarakat melaporkan dugaan ancaman terhadap hutan.
2. Mengotomatisasi analisis awal laporan menggunakan AI.
3. Membantu petugas menentukan prioritas pemeriksaan.
4. Menampilkan persebaran laporan melalui peta interaktif.
5. Menyediakan sistem verifikasi dan pencatatan tindak lanjut.
6. Menyediakan informasi lingkungan dalam dashboard yang mudah dipahami.

## 1.6 Product Positioning

RimbaGuard AI bukan sekadar aplikasi pelaporan lingkungan.

RimbaGuard AI adalah:

**An AI-powered forest incident intelligence and response management platform.**

Nilai pembeda utamanya adalah kemampuan mengubah laporan lingkungan menjadi rekomendasi prioritas pemeriksaan yang transparan dan dapat ditindaklanjuti.

---

# 2. TARGET USERS & USER ROLES

MVP menggunakan dua jenis pengguna.

## 2.1 Public User / Masyarakat

Masyarakat yang menemukan atau mengetahui indikasi ancaman terhadap kawasan hutan.

Hak akses:

- Melihat landing page.
- Membuat laporan.
- Mengunggah foto bukti.
- Mengirim lokasi kejadian.
- Melihat laporan milik sendiri.
- Memeriksa status laporan.
- Melihat informasi edukasi lingkungan.

Masyarakat tidak memiliki akses ke dashboard administrasi dan laporan pribadi pengguna lain.

## 2.2 Admin / Forest Officer

Petugas yang bertanggung jawab memeriksa dan menindaklanjuti laporan.

Hak akses:

- Login ke dashboard.
- Melihat seluruh laporan.
- Melihat analisis AI.
- Melihat rekomendasi prioritas.
- Melihat peta persebaran laporan.
- Memverifikasi laporan.
- Mengubah status penanganan.
- Memberikan catatan verifikasi.
- Melihat statistik.
- Mengakses riwayat aktivitas.

## 2.3 Access Control

Gunakan role-based access control (RBAC).

| Fitur | Public | Admin |
|---|---|---|
| Landing page | Yes | Yes |
| Submit report | Yes | Optional |
| View own reports | Yes | Yes |
| View all reports | No | Yes |
| AI analysis | Via report flow | Yes |
| Threat map | Public-safe view | Full view |
| Verification | No | Yes |
| Update status | No | Yes |
| Admin dashboard | No | Yes |

Semua endpoint administratif harus memeriksa autentikasi dan role di server.

---

# 3. PRODUCT SCOPE

## 3.1 MVP Features — Mandatory

Fitur berikut wajib berfungsi:

1. Landing Page.
2. User Authentication.
3. Community Reporting.
4. Image Upload.
5. AI Threat Analysis.
6. Smart Threat Prioritization.
7. Interactive Threat Map.
8. Report Detail.
9. Admin Dashboard.
10. Report Verification.
11. Response Status Management.
12. Responsive Design.

## 3.2 Secondary Features

Dikerjakan setelah fitur utama stabil:

- Environmental Education.
- Report History.
- Report Search and Filters.
- Analytics and Statistics.
- Report Export.

## 3.3 Out of Scope for MVP

Jangan mengimplementasikan fitur berikut apabila menghambat penyelesaian MVP:

- IoT sensor integration.
- Continuous real-time forest surveillance.
- Custom machine learning training from scratch.
- Automatic satellite image classification.
- Real-time satellite imagery.
- Predictive deforestation forecasting.
- Automatic law enforcement dispatch.
- Native Android/iOS application.
- Complex multi-agency organization management.

Jangan menampilkan fitur simulasi sebagai data pemantauan aktual.

---

# 4. FUNCTIONAL REQUIREMENTS

# MODULE A — LANDING PAGE

**Route:** `/`

Tujuan: memperkenalkan RimbaGuard AI dan mengarahkan masyarakat untuk membuat laporan.

## A.1 Hero Section

Konten:

- Brand RimbaGuard AI.
- Headline: "Protecting Our Forests Starts With Awareness."
- Deskripsi singkat mengenai perlindungan hutan berbasis AI.
- Primary CTA: "Laporkan Ancaman".
- Secondary CTA: "Jelajahi Peta".

Visual:

- Foto hutan tropis berkualitas tinggi.
- Layout editorial.
- Typography yang kuat.
- Tidak menggunakan ilustrasi AI generik.

## A.2 How It Works

Menampilkan tiga langkah:

1. Report: masyarakat mengirimkan laporan.
2. Analyze: AI membantu menganalisis indikasi ancaman.
3. Protect: petugas melakukan verifikasi dan tindak lanjut.

## A.3 Environmental Statistics

Menampilkan statistik platform.

Contoh:

- Total laporan.
- Laporan yang telah diverifikasi.
- Laporan yang sedang ditindaklanjuti.
- Total wilayah dengan laporan.

Data harus berasal dari database.

Jika belum ada laporan, tampilkan nilai nol. Jangan membuat statistik lingkungan fiktif.

## A.4 Public Map Preview

Menampilkan preview peta dengan laporan yang aman untuk dipublikasikan.

## A.5 Footer

Berisi:

- Logo dan deskripsi produk.
- Navigasi.
- Informasi kontak resmi jika tersedia.
- Copyright.
- Disclaimer informasi laporan.

---

# MODULE B — AUTHENTICATION

**Routes:**

- `/login`
- `/register`

Fitur:

1. Registrasi pengguna.
2. Login.
3. Logout.
4. Session management.
5. Role-based redirection.

Ketentuan:

- Password harus di-hash.
- Validasi dilakukan di frontend dan backend.
- Admin tidak boleh dapat dibuat melalui registrasi publik.
- Kredensial admin awal disiapkan melalui konfigurasi atau proses seed yang aman.
- Jangan menyimpan API key di frontend.

Setelah login:

- Public user diarahkan ke halaman pengguna.
- Admin diarahkan ke dashboard admin.

---

# MODULE C — COMMUNITY REPORTING

**Route:** `/report`

Ini merupakan salah satu fitur utama produk.

## C.1 Report Form

Field wajib:

| Field | Type | Requirement |
|---|---|---|
| Title | Text | Required |
| Threat Category | Select | Required |
| Description | Textarea | Required |
| Evidence Image | Image Upload | Required |
| Latitude | Coordinate | Required |
| Longitude | Coordinate | Required |
| Incident Time | Datetime | Required |
| Location Name | Text | Optional |

Kategori ancaman:

- Illegal Logging Suspected.
- Forest Fire.
- Land Clearing.
- Suspicious Human Activity.
- Other Environmental Threat.

## C.2 Location Selection

Implementasi:

- Gunakan Browser Geolocation API.
- Minta izin lokasi dari pengguna.
- Tampilkan koordinat.
- Berikan alternatif pemilihan titik pada peta apabila GPS tidak tersedia.
- Berikan validasi koordinat.
- Jangan mengambil lokasi secara diam-diam.

## C.3 Image Upload

Ketentuan:

- Format JPEG, PNG, atau WebP.
- Ukuran maksimal 5 MB.
- Validasi MIME type dan file size.
- Simpan file pada object storage.
- Gunakan URL penyimpanan yang aman.
- Jangan menyimpan file gambar sebagai base64 dalam database.

## C.4 Submission Flow

1. Pengguna mengisi formulir.
2. Frontend memvalidasi input.
3. File diunggah ke storage.
4. Backend membuat laporan.
5. Laporan masuk ke status `pending_analysis`.
6. Backend memproses analisis AI.
7. Hasil AI disimpan.
8. Threat prioritization dijalankan.
9. Status laporan berubah menjadi `pending_verification`.
10. Laporan muncul pada dashboard dan peta.

Jika analisis AI gagal:

- Laporan tetap disimpan.
- Status berubah menjadi `analysis_failed`.
- Laporan tetap dapat diperiksa admin.
- Sediakan opsi retry analysis.

Jangan menghapus laporan hanya karena AI gagal.

---

# MODULE D — AI THREAT ANALYSIS

**Route:** `/reports/[id]`

Ini merupakan fitur AI utama.

## D.1 AI Objective

AI bertugas membantu mengidentifikasi kategori ancaman berdasarkan foto dan deskripsi pengguna.

AI tidak bertugas memutuskan apakah aktivitas tersebut ilegal.

## D.2 Input

- Report image.
- Report title.
- Report description.
- User-selected category.

## D.3 Output

AI harus menghasilkan struktur JSON yang tervalidasi.

Contoh:

{
  "category": "illegal_logging_suspected",
  "detected_indicators": [
    "fallen_trees",
    "possible_logging_activity"
  ],
  "visual_observation": "Terlihat beberapa batang pohon tumbang.",
  "risk_level": "high",
  "confidence": 0.87,
  "reasoning_summary": "Foto menunjukkan indikasi pohon tumbang.",
  "recommendation": "Perlu pemeriksaan lapangan oleh petugas.",
  "needs_human_verification": true
}

Nilai di atas hanya contoh output.

Jangan menganggap confidence yang dihasilkan oleh LLM sebagai probabilitas statistik terkalibrasi.

## D.4 AI Prompt Rules

AI harus mengikuti aturan:

1. Hanya menganalisis informasi yang terlihat atau diberikan.
2. Tidak boleh mengarang informasi.
3. Tidak boleh memastikan aktivitas ilegal berdasarkan foto saja.
4. Tidak boleh mengklaim mengetahui koordinat dari gambar.
5. Tidak boleh mengklaim telah menghubungi petugas.
6. Jika bukti tidak jelas, hasil harus `uncertain`.
7. Rekomendasi harus berupa pemeriksaan atau tindakan konservasi yang aman.
8. Output harus mengikuti JSON schema.

## D.5 AI Error Handling

Jika API gagal:

- Tampilkan pesan kegagalan analisis.
- Simpan laporan.
- Sediakan retry.
- Berikan admin opsi analisis ulang.
- Jangan membuat hasil AI palsu sebagai fallback.

## D.6 AI Service Architecture

Buat service terpisah:

`server/services/ai/threat-analysis.ts`

Gunakan provider abstraction agar model AI dapat diganti tanpa mengubah seluruh aplikasi.

API key disimpan pada server environment variables.

---

# MODULE E — SMART THREAT PRIORITIZATION

Ini adalah fitur pembeda utama RimbaGuard AI.

## E.1 Objective

Membantu petugas menentukan urutan laporan yang perlu diperiksa berdasarkan aturan penilaian yang transparan.

## E.2 Scoring System

Gunakan weighted rule-based scoring.

Total nilai: 100.

Komponen:

| Parameter | Bobot |
|---|---:|
| Threat Severity | 35 |
| Evidence Completeness | 25 |
| Recency | 20 |
| Nearby Similar Reports | 20 |
| Total | 100 |

Setiap parameter memiliki skor 0–100.

Formula:

Priority Score =

(Threat Severity × 0.35) +

(Evidence Completeness × 0.25) +

(Recency × 0.20) +

(Nearby Similar Reports × 0.20)

Contoh:

Threat Severity = 90

Evidence Completeness = 80

Recency = 100

Nearby Similar Reports = 70

Priority Score = 86.5

## E.3 Threat Severity Rules

Contoh konfigurasi awal:

| Threat Category | Base Severity |
|---|---:|
| Forest Fire | 95 |
| Illegal Logging Suspected | 90 |
| Land Clearing | 80 |
| Suspicious Human Activity | 55 |
| Other | 40 |

Nilai ini merupakan bobot awal produk, bukan tingkat bahaya ilmiah yang sudah tervalidasi.

## E.4 Evidence Completeness

Penilaian didasarkan pada kelengkapan informasi:

- Foto tersedia.
- Deskripsi jelas.
- Lokasi valid.
- Waktu kejadian tersedia.
- Informasi pendukung relevan.

## E.5 Recency

Gunakan waktu kejadian untuk memberikan nilai berdasarkan usia laporan.

Contoh:

| Usia laporan | Score |
|---|---:|
| 0–6 jam | 100 |
| 6–24 jam | 85 |
| 1–3 hari | 65 |
| 3–7 hari | 40 |
| Lebih dari 7 hari | 20 |

## E.6 Nearby Similar Reports

Gunakan koordinat laporan dan kategori ancaman.

Contoh:

- Tidak ada laporan serupa: 0.
- Satu laporan serupa: 40.
- Dua laporan serupa: 70.
- Tiga atau lebih: 100.

Gunakan radius awal 2 kilometer yang dapat dikonfigurasi.

Jangan menganggap laporan yang berdekatan sebagai bukti bahwa kejadian benar-benar terjadi.

## E.7 Priority Classification

| Score | Priority |
|---|---|
| 75–100 | High |
| 45–74 | Medium |
| 0–44 | Low |

## E.8 Explainable Priority

Setiap laporan harus memiliki alasan prioritas.

Contoh:

"Prioritas tinggi karena kategori ancaman memiliki tingkat keparahan tinggi, bukti foto tersedia, laporan masih baru, dan terdapat laporan serupa di sekitar lokasi."

Admin dapat melihat nilai setiap komponen.

## E.9 Recalculation

Prioritas harus diperbarui apabila:

- Informasi laporan berubah.
- Waktu dan lokasi dikoreksi.
- Laporan serupa ditemukan.
- Konfigurasi scoring berubah.

Simpan versi scoring agar hasil dapat diaudit.

---

# MODULE F — INTERACTIVE FOREST THREAT MAP

**Route:** `/map`

Peta merupakan salah satu bagian visual paling penting.

## F.1 Technology

- Leaflet.
- OpenStreetMap.
- Browser Geolocation API.
- PostgreSQL coordinate fields.

## F.2 Map Objectives

Peta harus membantu petugas:

1. Melihat lokasi seluruh laporan.
2. Mengidentifikasi konsentrasi laporan.
3. Menemukan laporan prioritas tinggi.
4. Memeriksa detail kejadian.
5. Memfilter laporan berdasarkan kategori dan status.

## F.3 Map Interface

Desktop layout:

- Header halaman.
- Filter toolbar.
- Main map canvas.
- Compact incident detail panel.
- Optional incident list sidebar.

Peta harus menjadi elemen utama, bukan hanya komponen kecil di dalam dashboard.

## F.4 Marker Color

Gunakan warna berdasarkan prioritas:

- Red: High.
- Amber: Medium.
- Green: Low.
- Gray: Unknown or not yet analyzed.

Status verifikasi ditampilkan pada detail marker, bukan menggunakan terlalu banyak warna berbeda pada pin.

## F.5 Marker Interaction

Ketika marker diklik:

Tampilkan popup atau side panel yang berisi:

- Report ID.
- Threat category.
- Priority.
- Report time.
- Location.
- Verification status.
- Short description.
- Button: View Details.

## F.6 Map Filters

Filter:

- Threat Category.
- Priority.
- Verification Status.
- Date Range.

Filter harus bekerja dengan data database.

## F.7 Map Clustering

Jika terdapat banyak marker, gunakan marker clustering.

Jangan menampilkan puluhan marker yang bertumpuk.

## F.8 Data Integrity

Penting:

- Marker hanya berasal dari koordinat laporan yang valid.
- Jangan membuat lokasi palsu.
- Jangan menganggap marker sebagai lokasi kejadian yang telah terverifikasi.
- Tampilkan label laporan belum diverifikasi.
- Gunakan dataset demonstrasi yang secara jelas ditandai sebagai data simulasi.
- Jangan menggambar batas kawasan hutan tanpa sumber geospasial yang sah.

Peta MVP adalah incident reporting map, bukan deforestation detection map.

---

# MODULE G — ADMIN DASHBOARD

**Route:** `/admin/dashboard`

Dashboard harus ringkas, informatif, dan berorientasi pada tindakan.

## G.1 Summary Statistics

Tampilkan:

- Total Reports.
- Pending Verification.
- High Priority Reports.
- Verified Reports.
- Resolved Reports.

Semua angka berasal dari database.

## G.2 Priority Queue

Tampilkan daftar laporan yang diurutkan berdasarkan priority score.

Informasi:

- Report ID.
- Category.
- Location.
- Priority score.
- Priority label.
- Created date.
- Status.
- Action.

## G.3 Dashboard Charts

Batasi grafik agar tidak memenuhi halaman.

Grafik yang diperlukan:

1. Reports Over Time.
2. Threat Category Distribution.
3. Report Status Distribution.

Gunakan data aktual.

Jika tidak ada data, tampilkan empty state, bukan angka dummy.

## G.4 Quick Actions

- View All Reports.
- Open Threat Map.
- Review High Priority.
- Manage Verification.

---

# MODULE H — REPORT VERIFICATION & RESPONSE

**Route:** `/admin/reports/[id]`

## H.1 Report Detail

Admin dapat melihat:

- Foto bukti.
- Deskripsi.
- Koordinat.
- Lokasi pada peta.
- Waktu kejadian.
- Kategori pengguna.
- Hasil analisis AI.
- Priority score.
- Alasan prioritas.

## H.2 Verification Actions

Admin dapat:

1. Verify Report.
2. Reject Report.
3. Request More Information.
4. Mark as In Progress.
5. Mark as Resolved.

## H.3 Status Flow

Status yang digunakan:

- `pending_analysis`
- `analysis_failed`
- `pending_verification`
- `needs_more_information`
- `verified`
- `rejected`
- `in_progress`
- `resolved`

Status harus berubah melalui backend yang memvalidasi transisi.

Contoh:

pending_verification → verified

verified → in_progress

in_progress → resolved

Laporan rejected tidak boleh otomatis dianggap resolved.

## H.4 Admin Notes

Admin dapat memberikan catatan.

Setiap perubahan harus mencatat:

- Admin ID.
- Previous status.
- New status.
- Note.
- Timestamp.

## H.5 Audit Trail

Semua tindakan penting harus tersimpan dan dapat dilihat pada detail laporan.

---

# 5. USER EXPERIENCE & UI DESIGN SYSTEM

Ini merupakan salah satu aspek paling penting.

RimbaGuard AI harus memiliki tampilan yang minimalis, modern, profesional, dan terasa seperti produk teknologi lingkungan yang benar-benar digunakan oleh organisasi konservasi.

**Jangan membuat website dengan tampilan AI slop.**

## 5.1 Design Direction

Design keywords:

- Minimalist.
- Editorial.
- Modern.
- Environmental.
- Professional.
- Functional.
- Data-driven.
- Calm.
- Trustworthy.

Inspirasi visual:

- Modern environmental research platforms.
- Editorial websites.
- Professional GIS dashboards.
- Modern SaaS interfaces.

Jangan meniru tampilan produk lain secara langsung.

## 5.2 Color Palette

Gunakan palet yang konsisten.

| Token | Color | Usage |
|---|---|---|
| Forest 900 | #173D32 | Primary dark |
| Forest 700 | #285C48 | Primary |
| Forest 500 | #4B8065 | Secondary |
| Sage 100 | #EAF0E9 | Subtle backgrounds |
| Warm White | #FAFAF7 | Main background |
| Charcoal | #242B28 | Main text |
| Gray | #737B76 | Secondary text |
| Border | #E5E8E3 | Dividers |
| Alert Red | #C64C45 | High priority |
| Alert Amber | #C38B35 | Medium priority |
| Success Green | #3D805B | Verified/resolved |

Jangan menggunakan seluruh warna sekaligus pada satu komponen.

## 5.3 Typography

Gunakan:

- Inter atau Manrope untuk UI.
- Gunakan font yang konsisten.
- Heading memiliki hierarchy yang jelas.
- Body text mudah dibaca.

Ukuran rekomendasi:

- H1: 44–56px desktop.
- H2: 30–36px.
- H3: 22–24px.
- Body: 14–16px.
- Caption: 12–13px.

Responsive typography harus disesuaikan untuk perangkat mobile.

## 5.4 Layout Principles

Gunakan:

- White space yang cukup.
- Consistent spacing.
- Clear visual hierarchy.
- Grid system.
- Alignment yang konsisten.
- Border tipis.
- Shadow minimal.
- Radius 8–12px.

Hindari:

- Card di dalam card tanpa kebutuhan.
- Gradient berlebihan.
- Glassmorphism.
- Glow effects.
- Animated background.
- Floating decorative shapes.
- Emoji sebagai ikon navigasi.
- Terlalu banyak badge.
- Terlalu banyak warna.
- Statistik palsu.
- Chart yang hanya dekoratif.
- Efek hover berlebihan.
- Elemen AI futuristik yang tidak memiliki fungsi.

## 5.5 Navigation

Public navigation:

- Home.
- Threat Map.
- About.
- Login.
- Report an Incident.

Admin navigation:

- Overview.
- Reports.
- Threat Map.
- Analytics.
- Settings.

Gunakan sidebar sederhana untuk admin desktop dan navigation drawer untuk mobile.

## 5.6 Interaction Design

Semua elemen interaktif harus memiliki:

- Hover state.
- Focus state.
- Active state.
- Disabled state.
- Loading state.
- Error state.
- Success feedback.

Tidak boleh ada tombol yang hanya menjadi dekorasi.

## 5.7 Responsive Design

Prioritaskan:

- Desktop: 1440px.
- Laptop: 1280px.
- Tablet: 768px.
- Mobile: 375px.

Ketentuan:

- Semua halaman dapat digunakan di mobile.
- Form mudah diisi.
- Tabel berubah menjadi layout yang sesuai.
- Peta tetap dapat dioperasikan dengan touch.
- Navigasi tidak overflow.

## 5.8 Accessibility

Targetkan WCAG 2.2 AA sejauh memungkinkan.

Implementasikan:

- Semantic HTML.
- Label pada form.
- Keyboard navigation.
- Visible focus.
- Alt text.
- Sufficient color contrast.
- Error messages yang jelas.
- Tidak mengandalkan warna saja untuk menunjukkan status.

---

# 6. INFORMATION ARCHITECTURE & ROUTING

## Public Routes

| Route | Page |
|---|---|
| `/` | Landing Page |
| `/map` | Public Threat Map |
| `/report` | Create Report |
| `/reports` | User Reports |
| `/reports/[id]` | Report Detail |
| `/login` | Login |
| `/register` | Register |
| `/about` | About RimbaGuard |

## Admin Routes

| Route | Page |
|---|---|
| `/admin/dashboard` | Dashboard |
| `/admin/reports` | Report Management |
| `/admin/reports/[id]` | Report Review |
| `/admin/map` | Admin Threat Map |
| `/admin/analytics` | Analytics |
| `/admin/settings` | Settings |

Semua admin routes harus dilindungi middleware autentikasi dan pemeriksaan role pada server.

---

# 7. DATABASE DESIGN

Gunakan PostgreSQL.

Rekomendasi implementasi: Supabase PostgreSQL.

## 7.1 Tables

### Table: profiles

| Column | Type |
|---|---|
| id | UUID |
| full_name | VARCHAR |
| email | VARCHAR |
| role | ENUM |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Role:

- `public`
- `admin`

Gunakan Supabase Auth sebagai sumber autentikasi dan hubungkan profile berdasarkan auth user ID.

### Table: reports

| Column | Type |
|---|---|
| id | UUID |
| report_code | VARCHAR UNIQUE |
| user_id | UUID |
| title | VARCHAR |
| category | VARCHAR |
| description | TEXT |
| image_url | TEXT |
| latitude | DECIMAL |
| longitude | DECIMAL |
| location_name | VARCHAR |
| incident_time | TIMESTAMP |
| status | VARCHAR |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

### Table: ai_analyses

| Column | Type |
|---|---|
| id | UUID |
| report_id | UUID |
| detected_category | VARCHAR |
| detected_indicators | JSONB |
| visual_observation | TEXT |
| confidence | DECIMAL |
| risk_level | VARCHAR |
| recommendation | TEXT |
| raw_response | JSONB |
| analysis_status | VARCHAR |
| model_name | VARCHAR |
| created_at | TIMESTAMP |

### Table: threat_priorities

| Column | Type |
|---|---|
| id | UUID |
| report_id | UUID |
| threat_severity | DECIMAL |
| evidence_completeness | DECIMAL |
| recency_score | DECIMAL |
| nearby_reports_score | DECIMAL |
| total_score | DECIMAL |
| priority_level | VARCHAR |
| explanation | TEXT |
| scoring_version | VARCHAR |
| calculated_at | TIMESTAMP |

### Table: report_updates

| Column | Type |
|---|---|
| id | UUID |
| report_id | UUID |
| admin_id | UUID |
| previous_status | VARCHAR |
| new_status | VARCHAR |
| note | TEXT |
| created_at | TIMESTAMP |

## 7.2 Database Relationships

- One profile can create many reports.
- One report can have multiple AI analyses.
- One report can have multiple priority calculation records.
- One report can have multiple report updates.
- One admin can create many report updates.

## 7.3 Database Security

Implement:

- Supabase Row Level Security.
- Public users can only read their own private reports.
- Public users cannot update verification status.
- Admin can manage all reports.
- Storage access policies.
- Server-side authorization.

Public map queries should only expose the fields necessary for the public map. Do not expose private user information.

---

# 8. TECHNICAL ARCHITECTURE

## 8.1 Technology Stack

Frontend:
- Nuxt 4.
- Vue 3 Composition API.
- TypeScript.
- Tailwind CSS.

Backend:
- Nuxt Server API.
- Server-side business logic.

Database:
- Supabase PostgreSQL.

Authentication:
- Supabase Auth.

Storage:
- Supabase Storage.

AI:
- Google Gemini API.

Map:
- Leaflet.
- OpenStreetMap.

Charts:
- Chart.js or ECharts.

Validation:
- Zod.

Deployment:
- Vercel.
- Supabase hosted services.

## 8.2 Architecture Principles

1. Separation of concerns.
2. Reusable components.
3. Server-side API key protection.
4. Typed API responses.
5. Input validation.
6. Consistent error handling.
7. Secure database access.
8. No duplicated business logic.
9. No unnecessary abstractions.
10. Maintainable code.

## 8.3 AI Service Architecture

Implement:

`server/services/ai/threat-analysis.ts`

Responsibilities:

- Prepare AI input.
- Send request to Gemini.
- Validate response.
- Normalize result.
- Handle API errors.

Implement:

`server/services/threat-priority.ts`

Responsibilities:

- Calculate scoring components.
- Calculate total priority.
- Generate explanation.
- Save scoring result.

AI analysis and priority calculation must remain separate services.

## 8.4 API Endpoints

### Authentication

Handled through Supabase Auth.

### Reports

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/reports` | Create report |
| GET | `/api/reports` | List permitted reports |
| GET | `/api/reports/:id` | Get report detail |
| PATCH | `/api/reports/:id` | Update permitted report data |
| POST | `/api/reports/:id/analyze` | Run AI analysis |

### Admin

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard` | Dashboard statistics |
| GET | `/api/admin/reports` | Get all reports |
| GET | `/api/admin/reports/:id` | Admin report detail |
| PATCH | `/api/admin/reports/:id/status` | Update status |
| GET | `/api/admin/map` | Get map data |
| GET | `/api/admin/analytics` | Get analytics |

Every endpoint must validate:

- Authentication.
- Authorization.
- Request body.
- Parameters.
- Database errors.

---

# 9. SECURITY REQUIREMENTS

Security is mandatory.

Implement:

1. API keys stored in environment variables.
2. No secret keys exposed in client-side JavaScript.
3. Authentication middleware.
4. Role-based access control.
5. Input validation.
6. File upload validation.
7. Rate limiting for report submission and AI requests.
8. Secure error messages.
9. RLS database policies.
10. Protected admin endpoints.

Never trust:

- User-submitted priority.
- User-submitted AI result.
- User-submitted admin role.
- Arbitrary image URLs.
- Client-side status updates.

All important business rules must execute on the server.

---

# 10. ERROR HANDLING & EDGE CASES

The application must handle:

- AI provider unavailable.
- Invalid AI response.
- Database connection failure.
- Invalid GPS coordinates.
- Location permission denied.
- Image upload failure.
- Unsupported image format.
- Duplicate submissions.
- Missing report data.
- Unauthorized admin access.
- Empty map data.
- No analytics data.
- Slow network.
- Expired authentication session.

Every page must have appropriate loading, empty, error, and success states.

---

# 11. TESTING & QUALITY ASSURANCE

## 11.1 Functional Testing

Test:

- Registration.
- Login.
- Logout.
- Report submission.
- Image upload.
- GPS acquisition.
- AI analysis.
- AI failure handling.
- Priority calculation.
- Map marker rendering.
- Map filters.
- Admin verification.
- Status updates.
- Report history.

## 11.2 Security Testing

Test:

- Public users cannot access admin routes.
- Public users cannot modify report status.
- Public users cannot read other users' private data.
- API key is not exposed.
- Invalid upload is rejected.
- Unauthorized API requests are blocked.

## 11.3 UI Testing

Test:

- Desktop.
- Tablet.
- Mobile.
- Form validation.
- Navigation.
- Empty states.
- Loading states.
- Error states.

## 11.4 Acceptance Criteria

The MVP is considered complete only if:

1. A public user can successfully submit a report.
2. An uploaded image is stored.
3. Coordinates are stored correctly.
4. AI analysis returns validated structured data, or an explicit failure state.
5. Priority score is calculated correctly.
6. Reports appear on the map.
7. Map filters work.
8. Admin can review reports.
9. Admin can verify or reject reports.
10. Status changes are recorded.
11. The website works on desktop and mobile.
12. The public deployment is accessible.
13. No critical security issue remains.

---

# 12. COMPETITION ALIGNMENT

RimbaGuard AI must demonstrate a clear relationship between its functionality and the competition evaluation criteria discussed in the project brief.

| Evaluation Component | Weight | RimbaGuard Implementation |
|---|---:|---|
| Functionality & Technical Quality | 25% | Complete reporting, AI, map, dashboard, and verification workflows |
| Innovation & Solution Fit | 20% | Explainable AI Threat Prioritization |
| Relevance & Impact | 15% | Community participation in forest protection |
| UI/UX | 15% | Minimalist, responsive, accessible design |
| Source Code Quality | 15% | Modular architecture, validation, security, testing |
| Documentation | 10% | PRD, README, architecture, API documentation, demo |

## 12.1 Innovation Statement

The main innovation is not simply the use of AI to classify forest-related images.

The innovation lies in combining:

- Community-generated environmental evidence.
- AI-assisted incident analysis.
- Explainable threat prioritization.
- Geographical incident visualization.
- Human verification and response tracking.

This approach transforms scattered environmental reports into structured information that supports conservation response.

## 12.2 Demonstration Requirements

Prepare a realistic end-to-end demonstration.

Scenario:

A citizen discovers suspected illegal logging.

1. Citizen submits a photo and location.
2. AI analyzes the evidence.
3. The system generates an initial threat classification.
4. The priority engine calculates a score.
5. The incident appears on the threat map.
6. Admin opens the report.
7. Admin reviews AI analysis and evidence.
8. Admin verifies the report.
9. Admin updates the response status.
10. The system records the action history.

All demo data must be clearly identified as simulated when it does not represent an actual field incident.

---

# 13. DEVELOPMENT TIMELINE — 7 DAYS

## Day 1 — Foundation & UI

- Initialize Nuxt 4.
- Configure Tailwind CSS.
- Configure TypeScript.
- Configure Supabase.
- Create design system.
- Create routing.
- Build landing page.
- Build login and register pages.

Deliverable: application foundation and public UI.

## Day 2 — Database & Reporting

- Create database schema.
- Configure RLS.
- Implement authentication.
- Implement report form.
- Implement image upload.
- Implement location selection.
- Implement report creation.

Deliverable: working reporting flow.

## Day 3 — AI Integration

- Configure Gemini API.
- Create AI service.
- Implement image analysis.
- Validate structured JSON.
- Save AI analysis.
- Implement failure handling.

Deliverable: functional AI analysis.

## Day 4 — Prioritization & Map

- Implement priority scoring.
- Implement explanation.
- Integrate Leaflet.
- Display report markers.
- Implement filters.
- Implement marker details.

Deliverable: functioning threat intelligence map.

## Day 5 — Admin Dashboard

- Build dashboard.
- Build report management.
- Build report detail.
- Implement verification.
- Implement status changes.
- Implement audit trail.

Deliverable: working admin workflow.

## Day 6 — Integration & Testing

- Integrate all modules.
- Fix bugs.
- Test authorization.
- Test AI failure scenarios.
- Test responsive design.
- Optimize performance.
- Prepare deployment.

Deliverable: stable MVP.

## Day 7 — Finalization

- Deploy public application.
- Configure production environment variables.
- Run final testing.
- Write README.
- Prepare technical documentation.
- Prepare competition proposal.
- Record demo video.
- Verify public accessibility.

Deliverable: competition-ready MVP.

---

# 14. PROJECT STRUCTURE

Use a modular Nuxt 4 structure.

Recommended:

```text
rimbaguard-ai/
│
├── app/
│   ├── assets/
│   │   └── css/
│   │       └── main.css
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── landing/
│   │   ├── reports/
│   │   ├── map/
│   │   ├── dashboard/
│   │   └── ui/
│   │
│   ├── composables/
│   │   ├── useAuth.ts
│   │   ├── useReports.ts
│   │   └── useMap.ts
│   │
│   ├── layouts/
│   │   ├── default.vue
│   │   └── admin.vue
│   │
│   ├── middleware/
│   │
│   ├── pages/
│   │   ├── index.vue
│   │   ├── map.vue
│   │   ├── report.vue
│   │   ├── login.vue
│   │   ├── register.vue
│   │   ├── reports/
│   │   └── admin/
│   │
│   └── types/
│       ├── report.ts
│       ├── user.ts
│       └── ai.ts
│
├── server/
│   ├── api/
│   │   ├── reports/
│   │   └── admin/
│   │
│   ├── middleware/
│   ├── services/
│   │   ├── ai/
│   │   │   └── threat-analysis.ts
│   │   ├── threat-priority.ts
│   │   └── report-service.ts
│   │
│   └── utils/
│       ├── auth.ts
│       ├── validation.ts
│       └── response.ts
│
├── shared/
│   ├── types/
│   └── constants/
│
├── supabase/
│   └── migrations/
│
├── public/
│   ├── images/
│   └── icons/
│
├── tests/
│
├── .env.example
├── nuxt.config.ts
├── package.json
├── README.md
└── tsconfig.json
```

This structure may be adjusted to match Nuxt 4 conventions, but maintain the separation of frontend, server logic, and shared types.

---

# 15. ENVIRONMENT VARIABLES

Prepare `.env.example`.

```env
NUXT_PUBLIC_SUPABASE_URL=
NUXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

GEMINI_API_KEY=

NUXT_PUBLIC_APP_URL=
```

Rules:

- Never commit `.env`.
- Never expose service role credentials.
- Never expose Gemini API keys.
- Validate environment variables at application startup.
- Use production-specific environment configuration.

---

# 16. DESIGN & IMPLEMENTATION NON-NEGOTIABLES

These rules must be followed throughout development.

## Visual Rules

1. Minimalist and modern visual design.
2. Professional environmental identity.
3. Consistent color palette.
4. Strong typography hierarchy.
5. Generous whitespace.
6. Clear navigation.
7. Consistent component sizing.
8. Subtle borders and shadows.
9. Responsive layout.
10. Accessible contrast.

## Avoid AI Slop

Do not:

- Generate generic SaaS templates without product-specific identity.
- Put gradients on every section.
- Use random floating circles.
- Use excessive glassmorphism.
- Fill every section with cards.
- Use random stock AI illustrations.
- Use excessive icons and badges.
- Generate fake charts.
- Invent statistics.
- Add unnecessary animations.
- Create decorative buttons without functionality.
- Use repetitive layouts across every page.

## Functional Rules

1. Every button must have a real action.
2. Every form must validate.
3. Every important action must provide feedback.
4. Every data-driven component must use real database data.
5. Every API must validate permissions.
6. Every AI output must be validated.
7. Every report must have a traceable status.
8. Every priority calculation must be explainable.

---

# 17. PRODUCT SUCCESS METRICS

MVP success is measured by the following functional outcomes:

| Metric | MVP Target |
|---|---|
| Report submission | Successfully completed |
| AI analysis | Structured result or explicit failure |
| Priority calculation | Deterministic and explainable |
| Map rendering | Correct report coordinates |
| Verification | Admin can complete workflow |
| Data persistence | Reports survive page refresh |
| Security | Unauthorized actions blocked |
| Responsive UI | Usable across target devices |
| Deployment | Public URL accessible |

Do not claim environmental impact such as hectares of forest saved or illegal logging prevented unless supported by independently verified field data.

---

# 18. FINAL PRODUCT DEFINITION

RimbaGuard AI is a community-powered, AI-assisted forest protection platform that helps transform environmental incident reports into structured, prioritized, and verifiable conservation information.

Its main differentiator is:

**AI does not merely detect a possible threat. It helps organize the evidence, explain its initial assessment, prioritize the report, and support the human verification process.**

The final product should feel like a professional environmental intelligence platform, not a generic AI-generated website.

**Primary Product Flow:**

COMMUNITY REPORTING  
↓  
AI THREAT ANALYSIS  
↓  
EXPLAINABLE PRIORITIZATION  
↓  
INTERACTIVE THREAT MAP  
↓  
ADMIN VERIFICATION  
↓  
RESPONSE TRACKING

**END OF PRD — RIMBAGUARD AI VERSION 1.0**