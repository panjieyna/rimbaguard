<script setup lang="ts">
import type { PublicStatistics } from '../../shared/types/domain'
import type { PublicMapResponse } from '../../shared/types/map-api'
import type { ThreatMapPoint } from '~/types/map'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
useSeoMeta({ title: 'RimbaGuard — Bersama Menjaga Hutan Tropis' })
const pageRoot = ref<HTMLElement>()
useScrollReveal(pageRoot)
const { data: statistics, status, error, refresh } = await useFetch<PublicStatistics>('/api/public/statistics', { key: 'public-statistics' })
const metrics = computed(() => statistics.value ? [
  { value: statistics.value.totalReports, label: 'Laporan diterima' },
  { value: statistics.value.verifiedReports, label: 'Telah diverifikasi' },
  { value: statistics.value.inProgressReports, label: 'Dalam penanganan' },
  { value: statistics.value.namedLocations, label: 'Nama lokasi tercatat' },
] : [])
// The preview is supplementary; it loads after hydration and never blocks SSR.
const { data: mapPreview, status: mapStatus, error: mapError } = useLazyFetch<PublicMapResponse>('/api/public/map', { key: 'landing-map', server: false })
const previewPoints = computed<ThreatMapPoint[]>(() => (mapPreview.value?.reports ?? []).map(report => ({
  id: report.id, latitude: report.approximateLatitude, longitude: report.approximateLongitude, priority: report.priority,
  label: `${report.reportCode} · ${THREAT_CATEGORY_LABELS[report.category]}`,
})))
async function openReport(id: string) { await navigateTo({ path: '/map', query: { report: id } }) }
// The map library loads only when its section approaches the viewport.
const previewSlot = ref<HTMLElement>()
const previewVisible = ref(false)
let previewObserver: IntersectionObserver | undefined
onMounted(() => {
  if (!previewSlot.value || !('IntersectionObserver' in window)) { previewVisible.value = true; return }
  previewObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) { previewVisible.value = true; previewObserver?.disconnect() }
  }, { rootMargin: '300px 0px' })
  previewObserver.observe(previewSlot.value)
})
onBeforeUnmount(() => previewObserver?.disconnect())
</script>

<template>
  <div ref="pageRoot">
    <section aria-labelledby="hero-title">
      <div class="landing-hero relative isolate overflow-hidden bg-forest-900">
        <LandingHeroMotion />
        <div class="landing-hero-shade absolute inset-0" aria-hidden="true" />
        <div class="landing-hero-content page-container relative flex flex-col justify-center">
          <div class="max-w-[44rem] text-white">
            <p class="text-sm leading-6 font-medium tracking-[0.1em] text-white/90 uppercase">Perlindungan hutan, bersama.</p>
            <h1 id="hero-title" class="hero-title mt-5 font-semibold tracking-[-0.035em]">Bersama menjaga<br> hutan kita.</h1>
            <p class="mt-6 max-w-[34rem] text-lg leading-8 text-white/95">Ceritakan pengamatan Anda. Asisten AI membantu melengkapi laporan, lalu petugas memeriksa dan menindaklanjutinya.</p>
            <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <NuxtLink to="/report" class="button-primary min-h-13 rounded-full bg-white font-semibold text-forest-900 hover:bg-sage-100 focus-visible:outline-white active:bg-white">Laporkan ancaman <span aria-hidden="true">↗</span></NuxtLink>
              <NuxtLink to="/map" class="button-secondary min-h-13 rounded-full border-white/60 bg-transparent text-white hover:bg-white/10 focus-visible:outline-white active:bg-white/15">Lihat peta laporan</NuxtLink>
            </div>
            <p class="mt-5 max-w-[33rem] text-sm leading-6 text-white/90">Foto dan lokasi rinci tetap privat. Setiap laporan ditinjau petugas.</p>
          </div>
        </div>
      </div>
    </section>
    <section class="platform-activity" aria-labelledby="platform-statistics"><div data-scroll-reveal class="page-container max-w-7xl activity-layout">
      <div class="activity-introduction"><h2 id="platform-statistics" class="text-sm leading-6 font-semibold tracking-[0.09em] text-[#D6E4D7] uppercase">Aktivitas platform</h2><p class="mt-2 text-base leading-7 text-white lg:max-w-52">Ringkasan laporan masyarakat.</p></div>
      <p v-if="status === 'pending'" role="status" class="activity-feedback">Memuat statistik…</p>
      <div v-else-if="error" role="status" class="activity-feedback flex flex-wrap items-center gap-3"><p>Statistik belum dapat dimuat.</p><button type="button" class="min-h-11 font-medium underline underline-offset-4 focus-visible:outline-white" @click="refresh()">Coba kembali</button></div>
      <dl v-else-if="statistics" class="activity-metrics"><div v-for="metric in metrics" :key="metric.label" class="activity-metric"><dt class="activity-label">{{ metric.label }}</dt><dd class="activity-value">{{ metric.value.toLocaleString('id-ID') }}</dd></div></dl>
    </div></section>
    <LandingReportingWorkflow />
    <section class="border-t border-line bg-sage-100/45 py-14 sm:py-16" aria-labelledby="map-preview">
      <div class="page-container max-w-7xl grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
        <div data-scroll-reveal class="max-w-xl"><p class="eyebrow">Peta laporan publik</p><h2 id="map-preview" class="mt-4 text-3xl font-semibold tracking-tight text-forest-900">Lihat pengamatan yang telah ditinjau.</h2><p class="mt-4 body-copy">Peta hanya menampilkan ringkasan yang disetujui petugas. Koordinat publik ditampilkan sebagai perkiraan untuk menjaga privasi.</p><NuxtLink to="/map" class="button-secondary mt-7">Buka peta laporan <span aria-hidden="true">↗</span></NuxtLink></div>
        <div class="min-w-0">
          <div ref="previewSlot">
            <ClientOnly>
              <LazyMapThreatMap v-if="previewVisible" :points="previewPoints" label="Pratinjau peta laporan publik" height-class="h-[300px] sm:h-[360px]" @select="openReport" />
              <p v-else class="notice h-[300px] sm:h-[360px]">Memuat pratinjau peta…</p>
              <template #fallback><p class="notice h-[300px] sm:h-[360px]">Memuat pratinjau peta…</p></template>
            </ClientOnly>
          </div>
          <!-- A client-only fetch is idle during SSR and pending at hydration; both render the same element. -->
          <p v-if="mapStatus === 'idle' || mapStatus === 'pending'" role="status" class="form-hint">Memuat laporan publik…</p>
          <p v-else-if="mapError" role="status" class="form-hint">Laporan publik belum dapat dimuat. Peta lengkap tetap dapat dibuka.</p>
          <p v-else-if="mapPreview && !mapPreview.reports.length" role="status" class="form-hint">Belum ada laporan yang dipublikasikan. Ringkasan akan muncul setelah petugas meninjau dan menyetujuinya.</p>
          <p v-else-if="mapPreview" class="form-hint">{{ mapPreview.total.toLocaleString('id-ID') }} laporan publik · pilih titik untuk membaca ringkasannya.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-hero-shade { background: rgb(6 29 21 / 66%); }
.landing-hero-content { max-width: 80rem; min-height: 100svh; padding-top: 9rem; padding-bottom: 7rem; }
.hero-title { font-size: clamp(2.75rem, 6vw, 5rem); line-height: 1.08; }
.platform-activity { border-top: 1px solid #315749; background: #12372B; color: white; padding-block: 2rem; }
.activity-layout { display: grid; gap: 1.5rem; }
.activity-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem 1.25rem; }
.activity-metric { display: flex; min-width: 0; flex-direction: column; padding-left: 1rem; border-left: 1px solid #557364; }
.activity-label { order: 2; margin-top: 0.5rem; color: #E2EAE2; font-size: 0.9375rem; line-height: 1.5rem; }
.activity-value { font-size: clamp(2.25rem, 3.5vw, 3rem); line-height: 1.1; font-weight: 600; letter-spacing: -0.025em; font-variant-numeric: tabular-nums; }
.activity-feedback { color: #E2EAE2; font-size: 1rem; line-height: 1.75rem; }
@media (min-width: 40rem) {
  .activity-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .activity-metric { padding-left: 1.5rem; }
}

@media (min-width: 1024px) {
  .landing-hero-shade {
    background: linear-gradient(180deg, rgb(6 29 21 / 50%) 0%, transparent 45%), linear-gradient(90deg, rgb(6 29 21 / 82%) 0%, rgb(6 29 21 / 60%) 50%, rgb(6 29 21 / 25%) 100%);
  }
  .landing-hero-content { padding-top: 10rem; padding-bottom: 8rem; }
  .platform-activity { padding-block: 2.5rem; }
  .activity-layout { grid-template-columns: minmax(0, 0.9fr) minmax(0, 3.1fr); align-items: center; gap: 2rem; }
}
</style>
