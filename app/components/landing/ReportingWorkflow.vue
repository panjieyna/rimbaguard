<script setup lang="ts">
const steps = [
  {
    number: '1',
    title: 'Tambahkan foto dan cerita',
    description: 'Pilih foto kejadian dan ceritakan apa yang Anda lihat.',
  },
  {
    number: '2',
    title: 'Periksa draf laporan',
    description: 'Asisten AI membantu menyusun informasi. Periksa drafnya, lalu lengkapi waktu dan lokasi.',
  },
  {
    number: '3',
    title: 'Kirim dan pantau laporan',
    description: 'Petugas meninjau laporan yang dikirim. Ikuti perkembangannya melalui Laporan saya.',
  },
] as const

</script>

<template>
  <section class="reporting-workflow" aria-labelledby="how-it-works">
    <div class="page-container max-w-7xl">
      <div class="workflow-layout">
        <div data-scroll-reveal class="workflow-introduction">
          <p class="eyebrow">Alur RimbaGuard</p>
          <h2 id="how-it-works" class="workflow-title">Dari ponsel Anda,<br> untuk hutan kita.</h2>
          <p class="workflow-description">Mulai dengan foto dan cerita singkat. Asisten AI membantu menyiapkan draf; petugas meninjau laporan yang Anda kirim.</p>
          <div class="workflow-invitation">
            <NuxtLink to="/report" class="button-primary min-h-13 rounded-full font-semibold">Mulai buat laporan <span aria-hidden="true">↗</span></NuxtLink>
            <p class="workflow-privacy"><LandingWorkflowIcon name="lock" class="size-4 shrink-0 text-forest-700" /><span>Foto dan lokasi rinci Anda disimpan privat.</span></p>
          </div>
        </div>

        <ol class="workflow-steps" aria-label="Tahapan pelaporan RimbaGuard">
          <li v-for="step in steps" :key="step.number" data-scroll-reveal :data-scroll-delay="(Number(step.number) - 1) * 60" class="workflow-step">
            <span aria-hidden="true" class="workflow-number">{{ step.number }}</span>
            <div class="min-w-0">
              <h3 class="text-lg leading-7 font-semibold text-forest-900 sm:text-xl sm:leading-8">{{ step.title }}</h3>
              <p class="mt-2 text-base leading-7 text-charcoal/80">{{ step.description }}</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reporting-workflow { background: #FAFAF7; padding-block: 3rem; }
.workflow-layout { display: grid; gap: 2.5rem; align-items: start; }
.workflow-title { margin-top: 1rem; font-size: clamp(2rem, 3.2vw, 2.75rem); line-height: 1.15; font-weight: 600; letter-spacing: -0.03em; color: #173D32; }
.workflow-description { max-width: 28rem; margin-top: 1.25rem; color: rgb(36 43 40 / 80%); font-size: 1rem; line-height: 1.75rem; }
.workflow-invitation { margin-top: 1.75rem; }
.workflow-privacy { display: flex; align-items: start; gap: 0.5rem; max-width: 28rem; margin-top: 1rem; color: rgb(36 43 40 / 75%); font-size: 0.875rem; line-height: 1.5rem; }
.workflow-privacy > svg { margin-top: 0.25rem; }
.workflow-steps { min-width: 0; border-top: 1px solid #DCE3D8; }
.workflow-step { display: grid; grid-template-columns: 2.25rem minmax(0, 1fr); gap: 1rem; border-bottom: 1px solid #DCE3D8; padding-block: 1.5rem; }
.workflow-number { display: flex; width: 2.25rem; height: 2.25rem; align-items: center; justify-content: center; border-radius: 50%; background: #EAF0E9; color: #285C48; font-size: 0.9375rem; line-height: 1; font-weight: 600; }
@media (min-width: 40rem) {
  .reporting-workflow { padding-block: 4rem; }
  .workflow-description { font-size: 1.125rem; line-height: 2rem; }
  .workflow-step { grid-template-columns: 2.5rem minmax(0, 1fr); gap: 1.25rem; }
  .workflow-number { width: 2.5rem; height: 2.5rem; font-size: 1rem; }
}
@media (min-width: 64rem) {
  .reporting-workflow { padding-block: 4.5rem 4rem; }
  .workflow-layout { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 4rem; }
}
</style>
