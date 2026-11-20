# Penguatan produk untuk IT RUSH — 18 November 2026

Disetujui pengguna: fitur utama, kemudahan penggunaan, QA akhir, lalu dokumentasi lomba. Hosting memakai server Delcom milik kampus; deployment bukan bagian pelaksanaan ini. PRD tetap menjadi dasar produk. Asisten di bawah adalah perluasan yang disetujui, bukan kemampuan yang sudah tersedia sebelum pekerjaan ini.

## 1. Asisten Pelaporan AI

- [x] Kontrak bertipe: foto sealed milik pengguna dan cerita sebagai input; pengamatan visual terpisah, maksimal tiga pertanyaan, draf, serta batasan AI sebagai output.
- [x] Draf privat tersimpan di PostgreSQL; otorisasi pemilik, RLS, batas ukuran, rate limit, masa berlaku bukti, idempotensi dan pengamanan permintaan bersamaan.
- [x] Transport Gemini melalui server, validasi keluaran, batas waktu dan kegagalan tersimpan tanpa respons buatan.
- [x] Penerimaan alur sukses asisten dengan Gemini nyata sampai laporan terkirim. `gemini-3.5-flash-lite` lulus; model/default lokal diganti secara eksplisit setelah pengujian.
- [x] Jawaban pelapor dan konfirmasi eksplisit sebelum transaksi pengiriman lulus pada kontrak antarmuka, transaksi SQL dan alur browser dengan provider nyata.
- [x] Regresi formulir manual, laporan lama, koreksi dan penanganan petugas lulus. Analisis setelah pengiriman juga tersimpan `succeeded` dengan Flash-Lite pada 18 November.
- [x] Migrasi dan pengujian SQL lokal, kemudian hosted: pengguna mengonfirmasi `1..26` tanpa error.

## 2. Kemudahan penggunaan

- [x] Alur foto dan cerita → pertanyaan → pemeriksaan draf → lokasi/waktu → kirim terlihat jelas pada desktop dan ponsel.
- [x] Pengamatan AI, keterangan pelapor dan hal yang belum diketahui dipisahkan. Prompt membatasi koordinat, waktu, identitas dan klaim legalitas; keluaran tetap perlu ditinjau manusia.
- [x] Pemulihan draf, mulai baru, kembali/manual, loading, retry, error, akses keyboard dan privasi diterapkan serta diuji.
- [x] Beranda, alur pelaporan, halaman laporan dan tentang menjelaskan asisten serta pemeriksaan petugas.

## 3. Pengujian akhir

- [x] Uji provider, validasi, ownership, transisi, konfirmasi, idempotensi, error layanan, perlakuan input sebagai data dan keluaran tidak valid. Ini tidak membuktikan ketahanan model terhadap semua injeksi prompt.
- [x] Type check, 353 unit test dan production build lulus; tes lama disesuaikan dengan alur baru.
- [x] Perjalanan browser dengan persistensi dan Gemini nyata pada data simulasi berlabel lulus; pemulihan setelah reload, sesi Auth nyata, penolakan tanpa sesi dan replay idempoten diuji.
- [x] Responsif, keyboard, aksesibilitas otomatis, regresi manual, status petugas dan privasi peta diperiksa. Batas layanan dicatat di bawah.

## 4. Dokumentasi lomba

- [x] README, API, arsitektur, migrasi, pengujian dan batas kemampuan AI diperbarui.
- [x] Draf proposal dan naskah video 3–5 menit siap ditinjau. Identitas tim, URL live, akun demo dan tautan video yang belum diberikan ditandai sebagai isian.
- [x] Penggunaan AI/aset/library dan kendala verifikasi diungkapkan; tidak ada klaim dampak lapangan atau credential dalam dokumen.
- [ ] Lengkapi identitas/tautan, uji di Delcom, rekam video dan ekspor proposal final sesuai guidebook. Ini memerlukan hasil hosting dan informasi tim.

## Hasil verifikasi

Verifikasi 18 November 2026. Browser memakai server QA terisolasi pada `localhost:3001`, `.env.e2e` lokal dan akun simulasi yang ditetapkan server. Data pengujian tidak dipublikasikan. Build dan typecheck memakai direktori terisolasi dan tidak mengubah tipe server development utama.

| Pemeriksaan | Hasil |
|---|---|
| `npm.cmd test` | 353 lulus, 22 file. Mencakup 17 tes kontrak/provider asisten dan sembilan tes service baru. |
| Typecheck terisolasi | Lulus; tipe development utama tidak berubah. |
| Build produksi terisolasi | Lulus. Pemindaian final 241 artefak browser menemukan nol nilai credential privat. |
| SQL asisten lokal | 26 asersi, bundle dijalankan dua kali, fixture rollback. Engine PGlite dengan helper lokal, bukan pengganti pgTAP hosted. |
| SQL hosted | Pengguna mengonfirmasi hasil `1..26` tanpa error. |
| `public.spec.ts` | 13 skenario lulus, lebar 320/375/768/1280/1440, navigasi/validasi/reduced motion. |
| `accessibility.spec.ts` | Tiga skenario publik/pelapor/petugas lulus. Audit WCAG otomatis dan overflow 375/768/1280/1440; sebagian pemeriksaan WCAG, bukan sertifikasi penuh. |
| `priority-map.spec.ts` | Tiga skenario lulus: allowlist/privasi, izin warga, skor/filter/cluster/keyboard petugas. |
| `assistant-ui.spec.ts` | Dua skenario lulus dengan fixture browser yang diintersep; tidak menyimpan keluaran AI buatan di database. Pertanyaan, konfirmasi, pemisahan sumber dan jalur manual diuji. |
| `reporting.spec.ts` | Lulus dengan unggahan nyata 5 MB, kegagalan upload sekali, retry, persistensi dan koreksi. Analisis diintersep sebagai unavailable, bukan hasil sukses palsu. |
| `admin-workflow.spec.ts` | Lulus: verifikasi, penanganan, audit, pembatasan publikasi simulasi, catatan internal dan perbaikan pelapor. |
| `security.spec.ts` | Dua skenario lulus: anonim/origin/body, foto asing, validasi, rate limit dan pencabutan sesi. Draf asing diuji HTTP bila fixture masih ada; saat fixture kedaluwarsa, HTTP memeriksa ID tak ada dan foto asing. Ownership/RLS draf tetap diuji dalam SQL rollback. |
| Smoke HTTP | Sembilan pemeriksaan lulus pada server QA. |
| `check-degraded.mjs` | 21 pemeriksaan build produksi dengan konfigurasi rusak lulus; tidak menulis ke proyek hosted. |
| Gemini nyata | Flash 3.5 timeout/503; Flash-Lite lulus. `assistant.spec.ts` lulus dua kali (18,1 dan 19,8 detik), termasuk konfigurasi final LOW. Foto, draf, jawaban, reload, konfirmasi, laporan simulasi tersimpan, idempotensi dan penolakan tanpa sesi terbukti. Analisis setelah pengiriman tersimpan `succeeded`, model `gemini-3.5-flash-lite`. Default, `.env.example` dan `GEMINI_MODEL` lokal diganti secara eksplisit; tidak ada fallback model otomatis atau hasil buatan. |

Total 26 skenario browser relevan lulus pada eksekusi/pengulangan masing-masing, bukan klaim satu suite penuh semuanya hijau. Pengulangan login awal sempat menyentuh rate limit; tes fitur asisten kini memakai sesi Auth nyata dalam memori agar tidak terus menguji endpoint login. Skenario login, origin dan pencabutan sesi tetap terpisah. Kegagalan alat uji sempat mencetak header sesi akun QA; sesi tersebut dicabut dan file hasil disamarkan, lalu request sesi disalin diberi error aman. Tidak ada key layanan tercetak.

Perbaikan temuan QA: struktur `dl` kartu pelapor, nama aksesibel foto saat loading, target sentuh marker 44 px, jarak cluster, kontras marker belum dihitung (rasio 5,39:1), serta penantian geometri Leaflet stabil sebelum audit target-size. Regresi alur manual dan peta lulus setelah perbaikan.

Tim dikonfirmasi pengguna: **semogabisamagang**, **Institut Teknologi Del**. Nama, NIM dan peran anggota diisi nanti sesuai arahan pengguna. **Gate yang belum ditutup:** pengujian pada URL HTTPS Delcom, data anggota/akun demo pengumpulan, video dan PDF proposal final. Draf proposal ada di [COMPETITION_PROPOSAL.md](COMPETITION_PROPOSAL.md); naskah di [DEMO.md](DEMO.md).

## Audit ulang komponen penilaian — 20 November 2026

Audit ini memeriksa versi lokal terbaru dan guidebook halaman 4–5. Pengguna menegaskan deployment Delcom dilakukan nanti setelah perbaikan komponen selesai; audit ini tidak mencakup deployment atau pengumpulan. Nama/NIM/peran anggota tetap ditunda sesuai arahan pengguna.

| Komponen dan bobot | Kesimpulan audit | Bukti / batas kesiapan |
|---|---|---|
| Fungsionalitas dan kualitas teknis — 25% | Alur utama lulus lokal | Asisten nyata, persistensi/reload, konfirmasi, idempotensi, unggahan 5 MB, koreksi, keputusan petugas dan audit lulus. Satu percobaan Gemini awal gagal dengan `AI_PROVIDER_UNAVAILABLE`; kegagalan tersimpan, lalu pengujian ulang lulus. |
| Inovasi dan ketepatan solusi — 20% | Pembeda sudah diterapkan | AI mengajukan pertanyaan pelengkap; sumber keterangan terpisah; pelapor mengonfirmasi; petugas memperoleh prioritas dengan komponen/alasan. Tidak hanya klasifikasi foto. |
| Relevansi tema dan dampak — 15% | Relevan pada alur perlindungan hutan | Manfaat dirumuskan sebagai kelengkapan dan keterlacakan laporan. Belum ada evaluasi pengguna lapangan atau pengukuran dampak; angka dampak tidak dibuat. |
| UI dan UX — 15% | Lulus pemeriksaan lokal | Publik/pelapor/petugas lolos audit otomatis dan overflow pada 375/768/1280/1440; navigasi publik juga diuji 320. Tahap laporan sudah simetris. Audit otomatis bukan sertifikasi aksesibilitas penuh. |
| Kualitas source code — 15% | Kode lokal teruji; publikasi versi terbaru tertunda | 353 unit test, tipe, build, validasi, RLS dan kontrak SQL lulus. GitHub publik, tetapi push terakhir 17 November dan fitur terbaru masih berupa perubahan lokal. |
| Dokumentasi karya — 10% | Struktur proposal diperbaiki; berkas final tertunda | Proposal kini mengikuti Kata Pengantar/Daftar Isi/BAB I–IV/Daftar Pustaka, termasuk monetisasi sebagai rencana, wireframe dan UI aktual. Video, data anggota, surat bertanda tangan serta PDF final belum tersedia. |

### Hasil pengujian baru

- `npm.cmd test`: **353 lulus, 22 file**.
- Typecheck dan build produksi terisolasi: **lulus**, tipe development utama tidak berubah.
- Suite browser publik, autentikasi, aksesibilitas, kontrak asisten, keamanan dan peta: **31 lulus** dalam satu eksekusi.
- Suite alur petugas, asisten live dan pelaporan: **3 lulus** dalam satu eksekusi ulang. Total **34 skenario browser berbeda lulus**; percobaan live awal yang gagal tetap dicatat sebagai kegagalan sementara provider.
- Uji live asisten: **34,6 detik** untuk seluruh skenario browser, termasuk penyimpanan/reload/konfirmasi. Ini bukan pengukuran latensi model saja. Analisis laporan setelah pengiriman diperiksa melalui database: `succeeded`, `pending_verification`, model `gemini-3.5-flash-lite`.
- SQL asisten lokal: **26 asersi**, bundle dua kali, fixture rollback. Hosted SQL tidak dijalankan ulang; hasil hosted terakhir tetap konfirmasi pengguna `1..26` pada 18 November.
- Pemeriksaan koneksi/skema/bucket Supabase: **lulus**. Smoke HTTP: **9 lulus**. Kegagalan konfigurasi pada build produksi: **21 lulus**.
- Pemindaian **247 artefak browser**: **nol** nilai credential privat ditemukan. Tidak ada pengiriman email atau publikasi laporan pada audit ini; laporan uji memakai akun simulasi yang ditetapkan server.

Pengujian lokal belum membuktikan perilaku reverse proxy, HTTPS, origin/callback dan koneksi pada Delcom, maupun performa jaringan perangkat pengguna. Tidak ada skor Lighthouse atau nilai juri yang dikarang.

### Perbaikan dokumentasi pada audit ini

- [x] Baca template proposal resmi dari tautan guidebook; draf sebelumnya belum mengikuti struktur yang diminta.
- [x] Sesuaikan [proposal](COMPETITION_PROPOSAL.md) ke bagian 1.1–4.2, Kata Pengantar, Daftar Isi, Daftar Pustaka dan lampiran pengujian/AI.
- [x] Tambahkan [wireframe SVG](assets/wireframes.svg) berdasarkan struktur fitur yang sudah ada.
- [x] Ambil UI aktual beranda, formulir asisten dan ringkasan petugas; tampilkan label simulasi pada gambar yang relevan. Gambar bukan mockup hasil AI.
- [x] Cantumkan potensi kemitraan/monetisasi sebagai rencana, tanpa mengklaim pembayaran atau pelanggan yang belum ada.
- [x] Periksa tautan surat orisinalitas/AI. Dokumen tertaut berisi identitas dan contoh karya pihak lain; identitas/contohnya tidak disalin ke berkas tim ini. Pernyataan final perlu diisi sesuai keadaan sebenarnya dan ditandatangani pihak berwenang.

### Pekerjaan akhir di luar audit lokal

1. Masukkan perubahan final ke repository publik dengan riwayat commit tetap utuh. Audit hanya membaca GitHub; belum melakukan commit atau push.
2. Lengkapi data anggota saat pengguna siap; siapkan akun demo pengumpulan secara privat, video Unlisted 3–5 menit, proposal PDF dan surat orisinalitas/AI.
3. Setelah pengguna deploy ke Delcom, uji ulang origin/HTTPS, callback login, upload, Gemini, verifikasi dan akses publik. Isi URL final pada proposal/README.
4. Periksa kelengkapan berkas administratif dan ketepatan pengumpulan menurut guidebook. Tenggat dokumen: **20 November 2026, 23.59 WIB**; website aktif sampai **30 November 2026**.

Kesimpulan ini merupakan penilaian kesiapan berbasis bukti implementasi, bukan pemberian nilai lomba atau jaminan hasil penjurian.
