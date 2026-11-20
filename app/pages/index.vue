<script setup lang="ts">
import type { PublicStatistics } from '../../shared/types/domain'
import type { PublicMapResponse } from '../../shared/types/map-api'
import type { ThreatMapPoint } from '~/types/map'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
useSeoMeta({ title: 'RimbaGuard AI — Bersama Menjaga Hutan Tropis' })
const { data: statistics, status, error, refresh } = await useFetch<PublicStatistics>('/api/public/statistics', { key: 'public-statistics' })
const metrics = computed(() => statistics.value ? [
  { value: statistics.value.totalReports, label: 'Laporan diterima' },
  { value: statistics.value.verifiedReports, label: 'Telah diverifikasi' },
  { value: statistics.value.inProgressReports, label: 'Sedang ditindaklanjuti' },
  { value: statistics.value.namedLocations, label: 'Lokasi bernama dilaporkan' },
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
  <div>
    <section class="pb-8 sm:pb-10" aria-labelledby="hero-title">
      <div class="landing-hero relative isolate mx-3 overflow-hidden rounded-[1.75rem] bg-forest-900 sm:mx-5 sm:rounded-[2.5rem] lg:mx-6">
        <img src="/images/rainforest-panorama-2172.webp" srcset="/images/rainforest-panorama-768.webp 768w, /images/rainforest-panorama-1280.webp 1280w, /images/rainforest-panorama-2172.webp 2172w" sizes="(min-width: 2172px) 100vw, 2172px" alt="" aria-hidden="true" width="2172" height="724" fetchpriority="high" decoding="async" class="landing-hero-image absolute inset-0 h-full w-full object-cover">
        <div class="landing-hero-shade absolute inset-0" aria-hidden="true" />
        <div class="landing-hero-content page-container relative flex flex-col justify-center pt-28 pb-16 sm:pt-32 sm:pb-20 lg:py-32">
          <div class="max-w-[38rem] text-white">
            <p class="text-sm leading-6 font-medium tracking-[0.1em] text-white/90 uppercase">Perlindungan hutan, bersama.</p>
            <h1 id="hero-title" class="mt-5 text-[2.25rem] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-[3rem] lg:text-[3.5rem]">Bersama menjaga<br class="hidden sm:block"> hutan kita.</h1>
            <p class="mt-6 max-w-[34rem] text-lg leading-8 text-white/95">Mulai dari foto dan cerita Anda. Asisten AI membantu melengkapi informasi dan menyiapkan draf laporan untuk Anda periksa sebelum dikirim kepada petugas.</p>
            <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <NuxtLink to="/report" class="button-primary min-h-13 bg-white font-semibold text-forest-900 hover:bg-sage-100 focus-visible:outline-white active:bg-white">Laporkan ancaman <span aria-hidden="true">↗</span></NuxtLink>
              <NuxtLink to="/map" class="button-secondary min-h-13 border-white/60 bg-transparent text-white hover:bg-white/10 focus-visible:outline-white active:bg-white/15">Lihat peta laporan</NuxtLink>
            </div>
            <p class="mt-5 max-w-[33rem] text-sm leading-6 text-white/90">Foto dan lokasi rinci disimpan privat. AI membantu analisis awal; keputusan tetap di tangan petugas.</p>
          </div>
        </div>
      </div>
    </section>
    <section class="border-y border-line bg-white py-9" aria-labelledby="platform-statistics"><div class="page-container">
      <div class="mb-6"><h2 id="platform-statistics" class="eyebrow">Aktivitas platform</h2></div>
      <p v-if="status === 'pending'" role="status" class="body-copy">Memuat statistik…</p>
      <div v-else-if="error" role="status" class="flex flex-wrap items-center gap-4 text-sm"><p>Statistik belum dapat dimuat.</p><button type="button" class="text-link min-h-11" @click="refresh()">Coba kembali</button></div>
      <dl v-else-if="statistics" class="grid grid-cols-2 gap-x-7 gap-y-8 lg:grid-cols-4"><div v-for="metric in metrics" :key="metric.label"><dd class="text-4xl font-semibold tracking-tight text-forest-900">{{ metric.value.toLocaleString('id-ID') }}</dd><dt class="mt-2 text-sm leading-6 text-charcoal/80">{{ metric.label }}</dt></div></dl>
    </div></section>
    <LandingReportingWorkflow />
    <section class="border-t border-line bg-sage-100/45 py-14 sm:py-16" aria-labelledby="map-preview">
      <div class="page-container grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
        <div class="max-w-xl"><p class="eyebrow">Peta laporan publik</p><h2 id="map-preview" class="mt-4 text-3xl font-semibold tracking-tight text-forest-900">Lihat pengamatan yang telah ditinjau.</h2><p class="mt-4 body-copy">Peta hanya menampilkan ringkasan yang disetujui petugas. Koordinat publik ditampilkan sebagai perkiraan untuk menjaga privasi.</p><NuxtLink to="/map" class="button-secondary mt-7">Buka peta laporan <span aria-hidden="true">↗</span></NuxtLink></div>
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
.landing-hero-image { object-position: 64% center; }
.landing-hero-shade { background: rgb(6 29 21 / 68%); }
.landing-hero-content { min-height: 40rem; }

@media (min-width: 1024px) {
  .landing-hero-image { object-position: center; }
  .landing-hero-shade {
    background: linear-gradient(90deg, rgb(6 29 21 / 84%) 0%, rgb(6 29 21 / 68%) 48%, rgb(6 29 21 / 24%) 100%);
  }
  .landing-hero-content { min-height: min(46rem, calc(100svh - 4rem)); }
}
</style>
