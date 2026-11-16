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
    <section class="page-container grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-20" aria-labelledby="hero-title">
      <div>
        <p class="eyebrow">Kepedulian lokal. Perlindungan bersama.</p>
        <h1 id="hero-title" class="mt-5 text-[40px] leading-[1.1] font-semibold tracking-[-0.045em] text-forest-900 sm:text-[52px] lg:text-[56px]">Protecting Our Forests Starts With Awareness.</h1>
        <p class="mt-6 max-w-lg body-copy">Dari foto dan pengamatan Anda, bantu petugas memahami dugaan ancaman terhadap hutan. Setiap laporan menjadi awal pemeriksaan yang lebih terarah.</p>
        <div class="mt-8 flex flex-wrap gap-3"><NuxtLink to="/report" class="button-primary">Laporkan Ancaman <span aria-hidden="true">↗</span></NuxtLink><NuxtLink to="/map" class="button-secondary">Jelajahi Peta</NuxtLink></div>
        <p class="mt-6 max-w-md text-xs leading-5 text-charcoal/75">Bukti disimpan privat. AI membantu analisis awal; petugas tetap menentukan validitas laporan.</p>
      </div>
      <figure>
        <img src="/images/lempuyang-forest.webp" srcset="/images/lempuyang-forest-768.webp 768w, /images/lempuyang-forest-1080.webp 1080w, /images/lempuyang-forest.webp 1440w" sizes="(min-width: 1024px) 50vw, 100vw" alt="Vegetasi hutan tropis yang rapat di lereng Gunung Lempuyang, Bali" width="1440" height="960" fetchpriority="high" class="aspect-[4/4.3] w-full rounded-lg object-cover sm:aspect-[5/4] lg:aspect-[4/4.3]">
        <figcaption class="mt-3 flex flex-wrap justify-between gap-1 text-[11px] leading-5 text-charcoal/75"><span>Hutan tropis · Gunung Lempuyang, Bali</span><a href="https://commons.wikimedia.org/wiki/File:Mount_Lempuyang,_Tropical_forest,_Jungle,_Bali,_Indonesia.jpg" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">© Vyacheslav Argenberg · CC BY 4.0</a></figcaption>
      </figure>
    </section>
    <section class="border-y border-line bg-white py-9" aria-labelledby="platform-statistics"><div class="page-container">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 id="platform-statistics" class="eyebrow">Aktivitas platform</h2><p class="text-xs leading-5 text-charcoal/75">Dihitung dari laporan tersimpan. Data simulasi tidak dihitung.</p></div>
      <p v-if="status === 'pending'" role="status" class="body-copy">Memuat statistik…</p>
      <div v-else-if="error" role="status" class="flex flex-wrap items-center gap-4 text-sm"><p>Statistik belum dapat dimuat.</p><button type="button" class="text-link min-h-11" @click="refresh()">Coba kembali</button></div>
      <dl v-else-if="statistics" class="grid grid-cols-2 gap-x-7 gap-y-8 lg:grid-cols-4"><div v-for="metric in metrics" :key="metric.label"><dd class="text-4xl font-semibold tracking-tight text-forest-900">{{ metric.value.toLocaleString('id-ID') }}</dd><dt class="mt-2 text-sm leading-6 text-charcoal/80">{{ metric.label }}</dt></div></dl>
    </div></section>
    <section class="page-container py-16 sm:py-20" aria-labelledby="how-it-works">
      <div class="grid gap-6 lg:grid-cols-[1fr_1fr]"><div><p class="eyebrow">Alur RimbaGuard</p><h2 id="how-it-works" class="mt-4 max-w-lg text-3xl leading-tight font-semibold tracking-tight text-forest-900 sm:text-4xl">Pengamatan Anda,<br>informasi untuk bertindak.</h2></div><p class="max-w-xl body-copy lg:pt-8">Laporan yang lengkap membantu petugas meninjau bukti dan merencanakan pemeriksaan. Teknologi mendukung prosesnya, dengan keputusan tetap di tangan manusia.</p></div>
      <ol class="mt-10 grid gap-8 border-t border-line pt-8 sm:grid-cols-3"><li><span class="text-sm font-medium text-forest-700">01 / LAPORKAN</span><h3 class="mt-5 text-xl font-semibold text-forest-900">Sampaikan pengamatan</h3><p class="mt-3 body-copy">Unggah foto, tuliskan apa yang Anda lihat, dan tentukan titik kejadian.</p></li><li><span class="text-sm font-medium text-forest-700">02 / ANALISIS</span><h3 class="mt-5 text-xl font-semibold text-forest-900">Susun informasi awal</h3><p class="mt-3 body-copy">Analisis AI dan aturan prioritas membantu menata bukti untuk diperiksa. Hasilnya bukan kepastian kejadian.</p></li><li><span class="text-sm font-medium text-forest-700">03 / LINDUNGI</span><h3 class="mt-5 text-xl font-semibold text-forest-900">Verifikasi dan tindak lanjut</h3><p class="mt-3 body-copy">Petugas memeriksa laporan, mencatat keputusan, dan memperbarui perkembangan penanganan.</p></li></ol>
    </section>
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
