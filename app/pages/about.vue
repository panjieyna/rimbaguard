<script setup lang="ts">
useSeoMeta({ title: 'Tentang — RimbaGuard', description: 'Kenali RimbaGuard: laporan masyarakat, analisis awal, dan pemeriksaan petugas untuk membantu perlindungan hutan.' })
const pageRoot = ref<HTMLElement>()
useScrollReveal(pageRoot)
const steps = [
  { icon: 'camera', title: 'Laporan masyarakat', description: 'Foto, cerita, waktu, dan titik kejadian menjadi informasi awal bagi petugas.' },
  { icon: 'analysis', title: 'Bantuan AI dan prioritas', description: 'Asisten menanyakan informasi pelengkap dan membantu menyiapkan draf untuk diperiksa pelapor. Setelah dikirim, aturan penilaian membantu petugas menyusun urutan pemeriksaan.' },
  { icon: 'clipboard', title: 'Verifikasi petugas', description: 'Petugas memeriksa laporan, mencatat keputusan, dan memperbarui perkembangan penanganan.' },
] as const
</script>

<template>
  <article ref="pageRoot" class="page-container max-w-7xl about-page">
    <header class="about-hero">
      <div class="about-hero-copy">
        <p class="eyebrow">Tentang RimbaGuard</p>
        <h1>Kepedulian Anda,<br> awal perlindungan hutan.</h1>
        <p class="about-lead">RimbaGuard menghubungkan pengamatan masyarakat dengan pemeriksaan petugas. Laporan Anda membantu menyusun informasi dugaan ancaman terhadap hutan agar dapat ditindaklanjuti.</p>
        <div class="about-actions"><NuxtLink to="/report" class="button-primary">Buat laporan<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NuxtLink><NuxtLink to="/map" class="about-map-link">Jelajahi peta laporan<span aria-hidden="true">↗</span></NuxtLink></div>
      </div>
      <div data-scroll-reveal class="about-hero-image" aria-hidden="true"><img src="/images/about-rainforest.webp" srcset="/images/about-rainforest-768.webp 768w, /images/about-rainforest.webp 1254w" sizes="(min-width: 1280px) 520px, (min-width: 1024px) 42vw, (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)" width="1254" height="1254" alt="" decoding="async"></div>
    </header>

    <section class="about-workflow" aria-labelledby="about-workflow-title">
      <div data-scroll-reveal class="about-section-heading"><div><p class="eyebrow">Cara kerja</p><h2 id="about-workflow-title">Dari pengamatan,<br> menjadi langkah pemeriksaan.</h2></div><p>Laporan yang lengkap membantu petugas memahami kejadian dan menentukan informasi yang perlu diperiksa.</p></div>
      <ol class="about-steps">
        <li v-for="(step, index) in steps" :key="step.title" data-scroll-reveal :data-scroll-delay="index * 60"><div class="about-step-top"><span class="about-icon"><LandingWorkflowIcon :name="step.icon" /></span><span class="about-step-number" aria-hidden="true">0{{ index + 1 }}</span></div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></li>
      </ol>
    </section>

    <section class="about-principles" aria-labelledby="about-principles-title">
      <div data-scroll-reveal class="about-privacy"><p class="eyebrow">Kepercayaan dalam setiap laporan</p><h2 id="about-principles-title">Informasi dijaga.<br> Perkembangan bisa dipantau.</h2><ul><li><LandingWorkflowIcon name="lock" /><div><h3>Foto dan lokasi rinci tetap privat</h3><p>Bukti foto dan titik kejadian persis hanya dapat dilihat pemilik laporan dan petugas.</p></div></li><li><LandingWorkflowIcon name="community" /><div><h3>Peta publik melalui peninjauan</h3><p>Ringkasan yang dipublikasikan telah ditinjau petugas. Titik pada peta publik ditampilkan sebagai perkiraan.</p></div></li><li><LandingWorkflowIcon name="clipboard" /><div><h3>Status laporan dapat diikuti</h3><p>Pantau perkembangan pemeriksaan dan catatan untuk Anda melalui halaman Laporan saya.</p></div></li></ul></div>
      <aside data-scroll-reveal data-scroll-delay="60" class="about-human-review" aria-labelledby="human-review-title"><span class="about-review-icon"><LandingWorkflowIcon name="shield" /></span><h2 id="human-review-title">Teknologi membantu.<br> Petugas menentukan.</h2><p>Analisis AI adalah penilaian awal berdasarkan bukti yang diberikan. Hasilnya tetap perlu diperiksa dan tidak memastikan suatu aktivitas ilegal.</p><div><h3>Keputusan oleh manusia</h3><p>Petugas meninjau bukti, memverifikasi laporan, dan mencatat tindak lanjut.</p></div><div><h3>Prioritas yang dapat dijelaskan</h3><p>Aturan penilaian membantu menyusun urutan pemeriksaan. Skor bukan kepastian terjadinya ancaman.</p></div></aside>
    </section>

    <section data-scroll-reveal class="about-invitation" aria-labelledby="about-invitation-title"><div><h2 id="about-invitation-title">Mulai dari apa yang Anda lihat.</h2><p>Sampaikan pengamatan, sertakan foto, lalu tentukan lokasi kejadian.</p></div><NuxtLink to="/report" class="button-primary">Laporkan pengamatan<span aria-hidden="true">↗</span></NuxtLink></section>
    <NuxtLink to="/" class="about-home text-link">Kembali ke beranda</NuxtLink>
  </article>
</template>

<style scoped>
.about-page { padding-top: 2rem; padding-bottom: 3rem; }
.about-hero { display: grid; gap: 2rem; align-items: center; }
.about-hero h1 { margin-top: 1rem; font-size: clamp(2rem, 3.5vw, 2.75rem); font-weight: 600; line-height: 1.15; letter-spacing: -0.03em; color: #173D32; overflow-wrap: anywhere; }
.about-lead { max-width: 36rem; margin-top: 1.25rem; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.about-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; margin-top: 1.5rem; }
.about-page .button-primary { border-radius: 999px; }
.about-map-link { display: inline-flex; min-height: 2.75rem; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 500; color: #285C48; }
.about-map-link:hover { text-decoration: underline; text-underline-offset: 0.25rem; }
.about-hero-image { min-width: 0; height: 14rem; overflow: hidden; border-radius: 0.75rem; background: #EAF0E9; }
.about-hero-image img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.about-workflow { margin-top: 3rem; border-top: 1px solid #DCE3D8; padding-top: 2.5rem; }
.about-section-heading { display: grid; align-items: end; gap: 1rem; }
.about-page h2 { font-size: 1.75rem; font-weight: 600; line-height: 1.25; letter-spacing: -0.025em; color: #173D32; }
.about-section-heading h2, .about-privacy > h2 { margin-top: 0.75rem; }
.about-section-heading > p { max-width: 33rem; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.about-steps { display: grid; margin-top: 1.75rem; border-block: 1px solid #DCE3D8; }
.about-steps > li { min-width: 0; padding: 1.5rem 0; }
.about-steps > li + li { border-top: 1px solid #DCE3D8; }
.about-step-top { display: flex; align-items: center; gap: 0.75rem; }
.about-icon { display: inline-flex; width: 2.5rem; height: 2.5rem; align-items: center; justify-content: center; border-radius: 50%; background: #EAF0E9; color: #285C48; }
.about-step-number { font-size: 0.875rem; font-weight: 600; color: #526057; }
.about-steps h3 { margin-top: 1rem; font-size: 1.125rem; font-weight: 600; line-height: 1.75rem; color: #173D32; }
.about-steps p { margin-top: 0.5rem; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.about-principles { display: grid; align-items: start; gap: 2rem; margin-top: 3rem; }
.about-privacy ul { display: grid; gap: 1.5rem; margin-top: 1.75rem; }
.about-privacy li { display: flex; align-items: flex-start; gap: 0.875rem; }
.about-privacy li > svg { margin-top: 0.1875rem; color: #285C48; }
.about-privacy h3 { font-size: 1.0625rem; font-weight: 600; line-height: 1.75rem; color: #173D32; }
.about-privacy li p { margin-top: 0.375rem; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.about-human-review { min-width: 0; border-radius: 0.75rem; background: #173D32; padding: 1.5rem; color: #F3F6EF; }
.about-review-icon { display: flex; width: 2.5rem; height: 2.5rem; align-items: center; justify-content: center; color: #D6E4D7; }
.about-human-review > h2 { margin-top: 1rem; color: #F3F6EF; }
.about-human-review p { margin-top: 0.75rem; font-size: 1rem; line-height: 1.75rem; color: #E2EAE2; }
.about-human-review > div { margin-top: 1.5rem; border-top: 1px solid #557364; padding-top: 1.25rem; }
.about-human-review h3 { font-size: 1.0625rem; font-weight: 600; line-height: 1.75rem; }
.about-human-review > div p { margin-top: 0.375rem; }
.about-invitation { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; margin-top: 3rem; border-top: 1px solid #DCE3D8; padding-top: 1.75rem; }
.about-invitation h2 { font-size: 1.5rem; }
.about-invitation p { margin-top: 0.75rem; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.about-home { display: inline-flex; min-height: 2.75rem; align-items: center; margin-top: 1.25rem; }
@media (min-width: 40rem) {
  .about-page { padding-top: 2.5rem; padding-bottom: 4rem; }
  .about-lead { font-size: 1.125rem; line-height: 2rem; }
  .about-hero-image { height: 20rem; }
  .about-page h2 { font-size: 2rem; }
  .about-human-review { padding: 1.75rem; }
  .about-invitation h2 { font-size: 1.5rem; }
}
@media (min-width: 64rem) {
  .about-hero { grid-template-columns: minmax(0,1.1fr) minmax(0,0.9fr); gap: 3rem; }
  .about-hero-image { height: 21rem; }
  .about-workflow, .about-principles, .about-invitation { margin-top: 4rem; }
  .about-section-heading { grid-template-columns: minmax(0,1.1fr) minmax(0,0.9fr); gap: 3rem; }
  .about-steps { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .about-steps > li { padding: 1.75rem 1.5rem; }
  .about-steps > li:first-child { padding-left: 0; }
  .about-steps > li:last-child { padding-right: 0; }
  .about-steps > li + li { border-top: 0; border-left: 1px solid #DCE3D8; }
  .about-principles { grid-template-columns: minmax(0,1.1fr) minmax(0,0.9fr); gap: 3rem; }
}
</style>
