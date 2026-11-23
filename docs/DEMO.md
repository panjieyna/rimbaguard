# Skrip demo RimbaGuard (data simulasi)

Panduan rekaman video demo 3–5 menit. Seluruh demo memakai **data simulasi berlabel**, bukan kejadian nyata. Jangan mengarang laporan nyata, statistik, atau publikasi untuk demo.

## Persiapan

Audit 20 November: alur asisten nyata, unggahan/koreksi dan penanganan petugas lulus ulang. Gunakan alur yang sama saat rekaman, dengan label simulasi tetap terlihat. Keberhasilan uji lokal ini tetap perlu diperiksa pada URL Delcom setelah deployment.

- Siapkan dua akun:
  - **Akun pelapor demo**: akun yang ID-nya diisi pada `RIMBAGUARD_TEST_USER_ID` di server, sehingga laporannya otomatis bertanda simulasi.
  - **Akun petugas demo**: akun ber-role admin yang diberikan operator melalui SQL Editor (lihat `supabase/README.md`).
- Simpan credential hanya di pengelola rahasia tim atau di formulir pengumpulan lomba. Jangan menampilkannya di layar, video, repo, atau dokumen ini.
- Sehari sebelum rekaman, periksa model Gemini dan kuotanya dengan satu analisis uji, lalu jalankan `npm.cmd run check:services`. Pemeriksaan konfigurasi tidak membuktikan keberhasilan generasi. Pada 18 November, alur asisten dan analisis nyata lulus dengan `gemini-3.5-flash-lite`; pastikan hosting memakai model yang sama. `gemini-3.5-flash` sebelumnya timeout/503. Ketersediaan dan latensi dapat berubah; periksa kembali pada hari rekaman.
- Siapkan satu foto simulasi yang jelas bertuliskan "SIMULASI", berukuran kecil (di bawah 1 MB) supaya unggahan cepat.
- Peta publik hanya menampilkan laporan nyata yang sudah diverifikasi dan dipublikasikan petugas. Jika belum ada, tunjukkan keadaan kosongnya apa adanya dan jelaskan alasannya.

## Alur (sekitar 4 menit)

| Waktu | Layar | Yang ditunjukkan |
|---|---|---|
| 0:00–0:30 | Beranda | Masalah yang diselesaikan; statistik dihitung dari database dan data simulasi tidak ikut dihitung; ajakan melapor. |
| 0:30–1:20 | `/report` (pelapor demo) | Unggah foto dan cerita simulasi; jalankan Asisten Pelaporan AI; tunjukkan pemisahan pengamatan visual dan cerita, pertanyaan pelengkap, serta pilihan "Saya tidak tahu". Buka draf, lengkapi waktu/lokasi, periksa lalu centang konfirmasi dan kirim. Draf belum menjadi laporan sebelum dikonfirmasi. |
| 1:20–1:50 | Detail laporan | Analisis AI berjalan otomatis: kategori indikasi, pengamatan visual, alasan, saran, dan keyakinan model yang belum terkalibrasi. Tekankan bahwa hasil tetap perlu diverifikasi manusia. |
| 1:50–2:30 | `/admin/dashboard` (petugas demo) | Pilih "Data simulasi"; lima angka utama; antrean prioritas; tiga grafik dan tampilan tabelnya. |
| 2:30–3:20 | `/admin/reports/[id]` | Komponen skor dan alasannya; foto bukti dan lokasi; hasil AI; verifikasi lalu tandai ditindaklanjuti; tambahkan catatan internal; tunjukkan audit dengan nama petugas. Sebutkan bahwa data simulasi tidak dapat dipublikasikan. |
| 3:20–3:45 | `/admin/map` | Cluster laporan berdekatan, warna dan huruf prioritas, filter, dan panel detail. |
| 3:45–4:10 | Akun pelapor | Status terbaru dan riwayatnya; catatan internal petugas tidak terlihat oleh pelapor. |
| 4:10–4:30 | Penutup | AI dan skor membantu urutan pemeriksaan; keputusan tetap di tangan petugas; privasi pelapor dan koordinat publik yang dibulatkan. |

## Kalimat yang perlu dihindari

Jika Gemini sedang gagal, rekam keadaan tersebut apa adanya: tunjukkan pesan aman, reload untuk membuka draf tersimpan, lalu **Isi formulir sendiri** untuk melanjutkan dengan foto dan cerita yang sama. Jangan mengisi database dengan hasil AI palsu atau menyunting video sehingga kegagalan tampak seperti hasil sukses. Persiapkan satu laporan simulasi dari pengujian nyata sebelumnya untuk menunjukkan alur petugas; jelaskan bahwa itu data uji yang sudah tersimpan.

- Jangan menyebut AI "mendeteksi penebangan liar" atau "memastikan" kejadian. Gunakan "indikasi" dan "perlu verifikasi petugas".
- Jangan menyebut skor sebagai tingkat bahaya ilmiah. Skor adalah aturan urutan pemeriksaan yang transparan.
- Jangan menyebut data simulasi sebagai laporan nyata atau angka nyata.

## Setelah rekaman

Laporan demo tetap tersimpan sebagai data simulasi dan dikecualikan dari statistik serta peta publik. Tidak perlu dihapus; laporan ini dapat menjadi fixture uji berikutnya.
