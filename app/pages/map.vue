<script setup lang="ts">
import type { PublicMapReport } from '../../shared/types/domain'
import type { PublicMapResponse } from '../../shared/types/map-api'
import type { MapFilterValues, ThreatMapPoint } from '~/types/map'
import { PUBLIC_REPORT_STATUSES, REPORT_STATUS_LABELS, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { formatReportDate } from '~/utils/dates'

useSeoMeta({ title: 'Peta Laporan — RimbaGuard AI', description: 'Peta laporan ancaman hutan yang telah ditinjau dan dipublikasikan petugas.' })
const route = useRoute()
const FILTER_KEYS = ['category', 'priority', 'status', 'from', 'to'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// String keys keep these objects stable while only ?report= changes, so
// selecting a marker neither refetches nor resets unsaved filter input.
const filterKey = computed(() => {
  const values: MapFilterValues = {}
  for (const key of FILTER_KEYS) if (typeof route.query[key] === 'string' && route.query[key]) values[key] = route.query[key] as string
  return JSON.stringify(values)
})
const filters = computed<MapFilterValues>(() => JSON.parse(filterKey.value))
const page = computed(() => Math.max(1, Number.parseInt(String(route.query.page ?? '1'), 10) || 1))
const hasFilters = computed(() => Object.keys(filters.value).length > 0)
const filterOpen = ref(hasFilters.value)
watch(filterKey, () => { filterOpen.value = hasFilters.value })
const query = computed(() => ({ ...filters.value, page: page.value }))
const { data, status, error, refresh } = await useFetch<PublicMapResponse>('/api/public/map', { key: 'public-map', query })

const selectedId = computed(() => typeof route.query.report === 'string' && UUID.test(route.query.report) ? route.query.report : null)
const listed = computed(() => data.value?.reports.find(report => report.id === selectedId.value) ?? null)
// A shared link may point to a published report outside the current filters.
const { data: shared, status: sharedStatus } = await useAsyncData('public-map-shared', async () => {
  if (!selectedId.value || listed.value) return null
  try { return (await $fetch<{ report: PublicMapReport }>(`/api/public/map/${selectedId.value}`)).report }
  catch { return null }
}, { watch: [selectedId, listed] })
const selected = computed(() => listed.value ?? shared.value ?? null)
const selectionMissing = computed(() => Boolean(route.query.report) && !selected.value && sharedStatus.value !== 'pending')

const points = computed<ThreatMapPoint[]>(() => (data.value?.reports ?? []).map(report => ({
  id: report.id, latitude: report.approximateLatitude, longitude: report.approximateLongitude, priority: report.priority,
  label: `${report.reportCode} · ${THREAT_CATEGORY_LABELS[report.category]}`,
})))
const pageCount = computed(() => data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1)

async function applyFilters(values: MapFilterValues) { await navigateTo({ path: '/map', query: values }, { replace: true }) }
async function select(id: string | null) {
  await navigateTo({ path: '/map', query: { ...route.query, report: id ?? undefined } }, { replace: true })
}
async function goToPage(next: number) { await navigateTo({ path: '/map', query: { ...route.query, page: next > 1 ? String(next) : undefined, report: undefined } }) }
const copied = ref(false)
const copyError = ref(false)
const detailSection = ref<HTMLElement>()
const listHeading = ref<HTMLElement>()
async function copyLink() {
  if (!selected.value) return
  copyError.value = false
  try { await navigator.clipboard.writeText(`${window.location.origin}/map?report=${selected.value.id}`); copied.value = true }
  catch { copied.value = false; copyError.value = true }
}
watch(selectedId, async () => {
  copied.value = false
  copyError.value = false
  if (!import.meta.client) return
  await nextTick()
  if (selected.value && detailSection.value) {
    detailSection.value.focus({ preventScroll: true })
    detailSection.value.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  else if (!selectedId.value) listHeading.value?.focus({ preventScroll: true })
})
</script>

<template>
  <div class="public-map-page mx-auto w-full max-w-[1360px] px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
    <header class="public-map-header">
      <div>
        <p class="eyebrow">Laporan yang dibagikan kepada publik</p>
        <h1>Peta laporan masyarakat</h1>
        <p>Lihat perkiraan lokasi dan perkembangan laporan yang telah ditinjau serta dipublikasikan petugas.</p>
      </div>
      <NuxtLink to="/report" class="button-primary">Buat laporan<span aria-hidden="true">↗</span></NuxtLink>
    </header>

    <details class="public-map-filters" :open="filterOpen" @toggle="filterOpen = ($event.target as HTMLDetailsElement).open">
      <summary><span><strong>Saring laporan</strong><span class="filter-description">Kategori, prioritas, status, atau tanggal</span></span><span class="filter-toggle">{{ hasFilters ? 'Filter aktif' : 'Opsional' }}<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></summary>
      <MapFilters :statuses="PUBLIC_REPORT_STATUSES" :values="filters" expanded @apply="applyFilters" />
    </details>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat laporan publik…</p>
    <div v-else-if="error" class="notice mt-6" role="alert">
      <p>{{ error.statusCode === 422 ? 'Filter peta tidak valid. Periksa rentang tanggal atau pilihan filter.' : 'Peta laporan belum dapat dimuat.' }}</p>
      <button type="button" class="text-link mt-3 min-h-11" @click="error.statusCode === 422 ? applyFilters({}) : refresh()">{{ error.statusCode === 422 ? 'Hapus filter' : 'Coba kembali' }}</button>
    </div>
    <div v-else-if="data" class="public-map-workspace">
      <section class="public-map-canvas" aria-labelledby="map-canvas-title">
        <div class="map-canvas-heading"><h2 id="map-canvas-title">Lokasi laporan</h2><p>{{ points.length ? 'Pilih titik pada peta atau pilih laporan dari daftar untuk membaca ringkasannya.' : 'Titik akan muncul setelah laporan dipublikasikan petugas.' }}</p></div>
        <ClientOnly>
          <MapThreatMap :points="points" :selected-id="selected?.id" label="Peta lokasi laporan" height-class="h-[380px] sm:h-[480px] lg:h-[540px]" @select="select" />
          <template #fallback><p class="notice h-[420px] sm:h-[520px] lg:h-[620px]">Memuat peta…</p></template>
        </ClientOnly>
        <details v-if="points.length" class="map-key"><summary>Arti warna dan kelompok titik</summary><MapLegend /><p>Warna menunjukkan prioritas pemeriksaan, bukan kepastian kejadian.</p></details>
        <p class="map-privacy"><LandingWorkflowIcon name="lock" class="size-4" /><span>Titik menunjukkan perkiraan lokasi. Foto dan koordinat rinci tetap privat.</span></p>
      </section>

      <aside class="public-map-list" aria-label="Detail dan daftar laporan publik">
        <section v-if="selected" ref="detailSection" tabindex="-1" aria-label="Ringkasan laporan dipilih" class="public-map-selected">
          <button type="button" class="text-link min-h-11 mb-3" @click="select(null)">← Kembali ke daftar</button>
          <p class="font-mono text-xs text-charcoal/75">{{ selected.reportCode }}</p>
          <h2 class="mt-3 text-xl font-semibold text-forest-900">{{ THREAT_CATEGORY_LABELS[selected.category] }}</h2>
          <MapPriorityBadge class="mt-3" :level="selected.priority" />
          <p class="mt-4 body-copy">{{ selected.summary }}</p>
          <dl class="mt-5 space-y-4 text-sm">
            <div><dt class="text-charcoal/75">Waktu kejadian</dt><dd class="mt-1">{{ formatReportDate(selected.incidentTime) }}</dd></div>
            <div><dt class="text-charcoal/75">Status penanganan</dt><dd class="mt-1">{{ REPORT_STATUS_LABELS[selected.status] }}</dd></div>
            <div><dt class="text-charcoal/75">Perkiraan koordinat</dt><dd class="mt-1 font-mono">{{ selected.approximateLatitude }}, {{ selected.approximateLongitude }}</dd><dd class="mt-1 text-xs text-charcoal/75">Dibulatkan sekitar 1 km untuk menjaga privasi pelapor.</dd></div>
            <div><dt class="text-charcoal/75">Dipublikasikan</dt><dd class="mt-1">{{ formatReportDate(selected.publishedAt) }}</dd></div>
          </dl>
          <div class="mt-5 flex flex-wrap gap-3">
            <button type="button" class="button-secondary" @click="copyLink">{{ copied ? 'Tautan disalin' : 'Salin tautan laporan' }}</button>
          </div>
          <p v-if="copyError" role="status" class="form-hint">Tautan belum dapat disalin. Anda dapat menyalin alamat halaman dari browser.</p>
        </section>
        <section v-else>
          <p v-if="selectionMissing" role="status" class="notice mb-4">Laporan publik tersebut tidak ditemukan atau belum dipublikasikan.</p>
          <div class="map-list-heading"><h2 ref="listHeading" tabindex="-1">Daftar laporan</h2><p role="status">{{ data.total.toLocaleString('id-ID') }} laporan{{ hasFilters ? ' sesuai filter' : ' publik' }}</p></div>
          <div v-if="!data.reports.length" class="map-empty"><span class="map-empty-icon"><LandingWorkflowIcon name="clipboard" /></span><h3>{{ hasFilters ? 'Tidak ada hasil yang sesuai' : 'Belum ada laporan publik' }}</h3><p>{{ hasFilters ? 'Coba ubah atau hapus filter untuk melihat laporan lainnya.' : 'Laporan baru tidak langsung muncul di peta. Petugas perlu meninjau dan menyetujui publikasinya terlebih dahulu.' }}</p><button v-if="hasFilters" type="button" class="button-secondary" @click="applyFilters({})">Hapus filter</button><template v-else><NuxtLink to="/report" class="button-primary">Buat laporan</NuxtLink><NuxtLink to="/reports" class="text-link">Pantau laporan saya</NuxtLink></template></div>
          <ul v-else class="mt-3 max-h-[560px] divide-y divide-line overflow-y-auto border-y border-line">
            <li v-for="report in data.reports" :key="report.id">
              <button type="button" class="public-map-list-item" @click="select(report.id)">
                <span class="font-mono text-xs text-charcoal/75">{{ report.reportCode }}</span>
                <span class="mt-1 block text-base font-semibold">{{ THREAT_CATEGORY_LABELS[report.category] }}</span>
                <MapPriorityBadge class="mt-2" :level="report.priority" />
                <span class="mt-2 block text-sm leading-6 text-charcoal/75">{{ formatReportDate(report.incidentTime) }} · {{ REPORT_STATUS_LABELS[report.status] }}</span><span class="public-map-detail-link">Baca ringkasan <span aria-hidden="true">→</span></span>
              </button>
            </li>
          </ul>
          <nav v-if="pageCount > 1" class="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Halaman laporan publik">
            <button type="button" class="button-secondary px-4" :disabled="page <= 1" @click="goToPage(page - 1)">Sebelumnya</button>
            <span>Halaman {{ page }} dari {{ pageCount }}</span>
            <button type="button" class="button-secondary px-4" :disabled="page >= pageCount" @click="goToPage(page + 1)">Berikutnya</button>
          </nav>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.public-map-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; border: 1px solid #D0DCC9; border-radius: 1.25rem; background: #E5EDDF; padding: 1.5rem; }
.public-map-header > div { flex: 1 1 35rem; min-width: 0; }
.public-map-header h1 { margin-top: 0.75rem; font-size: 2rem; line-height: 1.2; font-weight: 600; letter-spacing: -0.03em; color: #173D32; }
.public-map-header div > p:last-child { max-width: 43rem; margin-top: 0.875rem; font-size: 1.0625rem; line-height: 1.875rem; color: #465C49; }
.public-map-filters { margin-top: 1.5rem; border: 1px solid #D4DECE; border-radius: 1rem; background: #EFF3E9; }
.public-map-filters > summary { display: flex; min-height: 4.5rem; align-items: center; justify-content: space-between; gap: 1rem; border-radius: 1rem; padding: 1rem 1.25rem; cursor: pointer; list-style: none; color: #173D32; }
.public-map-filters > summary::-webkit-details-marker { display: none; }
.public-map-filters summary strong { font-size: 1.0625rem; font-weight: 600; line-height: 1.625rem; }
.filter-description { display: block; margin-top: 0.125rem; font-size: 0.875rem; line-height: 1.5rem; color: #52634B; }
.filter-toggle { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 500; color: #465F3D; }
.filter-toggle svg { flex-shrink: 0; }
.public-map-filters[open] .filter-toggle svg { transform: rotate(180deg); }
.public-map-filters :deep(form) { border: 0; border-top: 1px solid #D4DECE; border-radius: 0 0 1rem 1rem; background: transparent; padding: 1.25rem; }
.public-map-filters :deep(form > div) { margin-top: 0; grid-template-columns: minmax(0, 1fr); align-items: end; }
.public-map-filters :deep(form > div > div:last-child) { grid-column: auto; }
.public-map-filters :deep(.form-input) { min-width: 0; border-color: #BECDB7; border-radius: 0.625rem; }
.public-map-workspace { display: grid; min-width: 0; gap: 1.5rem; align-items: start; margin-top: 1.5rem; }
.public-map-canvas { min-width: 0; border: 1px solid #D1DDCB; border-radius: 1rem; background: #F3F6ED; }
.map-canvas-heading { padding: 1.25rem; }
.map-canvas-heading h2, .map-list-heading h2 { font-size: 1.25rem; line-height: 1.75rem; font-weight: 600; color: #173D32; }
.map-canvas-heading p { margin-top: 0.375rem; font-size: 0.9375rem; line-height: 1.625rem; color: #50604B; }
.public-map-canvas :deep(.leaflet-container) { border: 0; border-radius: 0; }
.public-map-canvas :deep(.form-hint) { padding: 0 1.25rem; }
.map-key { margin: 1rem 1.25rem 0; border-bottom: 1px solid #D9E1D2; padding-bottom: 0.75rem; }
.map-key summary { min-height: 2.75rem; align-content: center; cursor: pointer; font-size: 0.9375rem; font-weight: 500; color: #285C48; }
.map-key > p { margin-top: 0.75rem; font-size: 0.875rem; line-height: 1.5rem; color: #50604B; }
.map-privacy { display: flex; align-items: flex-start; gap: 0.5rem; padding: 1rem 1.25rem; font-size: 0.875rem; line-height: 1.5rem; color: #50604B; }
.map-privacy > svg { margin-top: 0.25rem; flex-shrink: 0; }
.public-map-list { min-width: 0; border: 1px solid #D4DECE; border-radius: 1rem; background: #F0F2E8; }
.map-list-heading { border-bottom: 1px solid #D8E0D0; padding: 1.25rem; }
.map-list-heading p { margin-top: 0.375rem; font-size: 0.9375rem; line-height: 1.5rem; color: #52634B; }
.map-empty { padding: 1.5rem 1.25rem; }
.map-empty-icon { display: flex; width: 2.75rem; height: 2.75rem; align-items: center; justify-content: center; border-radius: 0.75rem; background: #DDE7D5; color: #285C48; }
.map-empty h3 { margin-top: 1.25rem; font-size: 1.25rem; font-weight: 600; line-height: 1.75rem; color: #173D32; }
.map-empty > p { margin-top: 0.75rem; font-size: 1rem; line-height: 1.75rem; color: #50604B; }
.map-empty > .button-primary, .map-empty > .button-secondary { margin-top: 1.5rem; width: 100%; }
.map-empty > .text-link { display: flex; min-height: 2.75rem; align-items: center; justify-content: center; margin-top: 0.5rem; font-size: 1rem; }
.public-map-selected { padding: 1.25rem; }
.public-map-selected dl { font-size: 1rem; line-height: 1.75rem; }
.public-map-selected .body-copy { font-size: 1rem; line-height: 1.75rem; }
.public-map-list-item { display: block; width: 100%; min-height: 2.75rem; padding: 1.25rem; text-align: left; color: #173D32; }
.public-map-list-item:hover { background: #E4ECDD; }
.public-map-detail-link { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.875rem; font-size: 0.9375rem; font-weight: 600; color: #285C48; }
.public-map-list nav { flex-wrap: wrap; padding: 0 1.25rem 1.25rem; }
@media (min-width: 40rem) {
  .public-map-header { padding: 2rem; }
  .public-map-header h1 { font-size: 2.5rem; }
  .public-map-header div > p:last-child { font-size: 1.125rem; }
  .public-map-filters > summary { padding: 1rem 1.5rem; }
  .public-map-filters :deep(form > div) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 64rem) {
  .public-map-workspace { grid-template-columns: minmax(0, 1fr) 21rem; }
  .public-map-filters :deep(form > div) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
