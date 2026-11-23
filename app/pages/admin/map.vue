<script setup lang="ts">
import type { AdminMapResponse } from '../../../shared/types/map-api'
import type { MapFilterValues, ThreatMapPoint } from '~/types/map'
import { REPORT_STATUSES, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { CATEGORY_SOURCE_LABELS } from '#shared/constants/scoring'
import { formatReportDate } from '~/utils/dates'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Peta Petugas — RimbaGuard', robots: 'noindex' })
const route = useRoute()
const FILTER_KEYS = ['category', 'priority', 'status', 'from', 'to', 'dataset'] as const
const UNVERIFIED = new Set(['pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information'])

// String keys keep these objects stable while only ?report= changes.
const filterKey = computed(() => {
  const values: MapFilterValues = {}
  for (const key of FILTER_KEYS) if (typeof route.query[key] === 'string' && route.query[key]) values[key] = route.query[key] as string
  return JSON.stringify(values)
})
const filters = computed<MapFilterValues>(() => JSON.parse(filterKey.value))
const page = computed(() => Math.max(1, Number.parseInt(String(route.query.page ?? '1'), 10) || 1))
const hasFilters = computed(() => Object.keys(filters.value).some(key => key !== 'dataset' || filters.value.dataset !== 'all'))
// A string key changes only when filters change, not when a report is selected.
const queryKey = computed(() => JSON.stringify({ ...filters.value, page: page.value }))
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('admin-map',
  () => requestFetch<AdminMapResponse>('/api/admin/map', { query: JSON.parse(queryKey.value) }),
  { watch: [queryKey] })

const selectedId = computed(() => typeof route.query.report === 'string' ? route.query.report : null)
const selected = computed(() => data.value?.reports.find(report => report.id === selectedId.value) ?? null)
const points = computed<ThreatMapPoint[]>(() => (data.value?.reports ?? []).map(report => ({
  id: report.id, latitude: report.latitude, longitude: report.longitude, priority: report.priority?.level ?? null,
  label: `${report.reportCode}${report.isSimulation ? ' (simulasi)' : ''} · ${THREAT_CATEGORY_LABELS[report.effectiveCategory]}`,
})))
const pageCount = computed(() => data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1)
const simulationCount = computed(() => data.value?.reports.filter(report => report.isSimulation).length ?? 0)

async function applyFilters(values: MapFilterValues) { await navigateTo({ path: '/admin/map', query: values }, { replace: true }) }
async function select(id: string | null) { await navigateTo({ path: '/admin/map', query: { ...route.query, report: id ?? undefined } }, { replace: true }) }
async function goToPage(next: number) { await navigateTo({ path: '/admin/map', query: { ...route.query, page: next > 1 ? String(next) : undefined, report: undefined } }) }
</script>

<template>
  <div class="admin-page">
    <AdminPageHeader title="Peta prioritas laporan" description="Jelajahi lokasi laporan dan pilih titik untuk melihat informasi awal serta prioritas pemeriksaannya.">
      <NuxtLink to="/admin/reports" class="button-secondary"><AdminIcon name="reports" class="size-5" />Lihat antrean laporan</NuxtLink>
    </AdminPageHeader>

    <div class="admin-map-filters"><MapFilters :statuses="REPORT_STATUSES" :values="filters" show-dataset @apply="applyFilters" /></div>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat peta petugas…</p>
    <div v-else-if="error" class="notice mt-6" role="alert">
      <p>{{ error.statusCode === 422 ? 'Filter peta tidak valid. Periksa rentang tanggal atau pilihan filter.' : error.statusCode === 403 ? 'Akses ini hanya tersedia bagi petugas.' : 'Peta petugas belum dapat dimuat.' }}</p>
      <button type="button" class="text-link mt-3 min-h-11" @click="error.statusCode === 422 ? applyFilters({}) : refresh()">{{ error.statusCode === 422 ? 'Hapus filter' : 'Coba kembali' }}</button>
    </div>
    <template v-else-if="data">
      <p v-if="data.refresh.status === 'busy'" role="status" class="notice mt-6">Skor prioritas sedang diperbarui oleh proses lain. Data di bawah memakai perhitungan terakhir; muat ulang sebentar lagi.</p>
      <p v-else-if="data.refresh.status === 'failed'" role="status" class="notice mt-6">Sebagian skor prioritas belum dapat diperbarui. Laporan bertanda "menunggu pembaruan" memakai perhitungan terakhir.</p>
      <p v-else-if="data.refresh.remaining" role="status" class="notice mt-6">{{ data.refresh.remaining }} skor masih menunggu pembaruan. Muat ulang untuk melanjutkan.</p>

      <div class="grid items-start gap-5 min-[87.5rem]:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="admin-panel min-w-0 overflow-hidden">
          <div class="admin-panel-header"><div><h2 class="admin-section-title">Sebaran laporan</h2><p class="admin-muted mt-1">Pilih titik atau kelompok titik pada peta.</p></div><span class="rounded-full bg-sage-100 px-3 py-1 text-sm font-medium text-forest-700">{{ data.total.toLocaleString('id-ID') }} laporan</span></div>
          <div class="p-3 sm:p-4">
          <ClientOnly>
            <MapThreatMap :points="points" :selected-id="selected?.id" label="Peta prioritas laporan petugas" height-class="h-[360px] sm:h-[500px] 2xl:h-[640px]" @select="select" />
            <template #fallback><p class="notice h-[360px] sm:h-[500px] 2xl:h-[640px]">Memuat peta…</p></template>
          </ClientOnly>
          <MapLegend class="mt-4" />
          <p class="mt-4 border-t border-line pt-4 text-sm leading-6 text-charcoal/70">Koordinat persis hanya untuk petugas. Warna menunjukkan prioritas pemeriksaan; laporan yang berdekatan belum memastikan kejadian benar terjadi.</p>
          </div>
        </div>

        <aside class="min-w-0" aria-label="Detail dan daftar laporan">
          <section v-if="selected" aria-live="polite" class="admin-panel p-5 sm:p-6">
            <button type="button" class="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-forest-700 hover:underline" @click="select(null)"><AdminIcon name="chevron-down" class="size-4 rotate-90" />Kembali ke daftar</button>
            <div class="flex flex-wrap items-center gap-2 text-xs"><span class="font-mono text-charcoal/75">{{ selected.reportCode }}</span><span v-if="selected.isSimulation" class="rounded bg-sage-100 px-2 py-0.5 font-semibold text-forest-900">SIMULASI</span><span v-if="selected.isPublic" class="rounded bg-sage-100 px-2 py-0.5 text-forest-900">Dipublikasikan</span></div>
            <h2 class="mt-3 text-lg font-semibold leading-snug text-forest-900">{{ selected.title }}</h2>
            <MapPriorityBadge class="mt-3" :level="selected.priority?.level ?? null" :stale="selected.priority?.stale" />
            <p v-if="selected.priority" class="mt-2 text-sm leading-6 text-charcoal/70">Skor {{ selected.priority.totalScore.toLocaleString('id-ID') }} dari 100 · dihitung {{ formatReportDate(selected.priority.calculatedAt) }}</p>
            <dl class="mt-5 space-y-4 border-t border-line pt-5 text-base">
              <div><dt class="text-charcoal/75">Kategori ancaman</dt><dd class="mt-1">{{ THREAT_CATEGORY_LABELS[selected.effectiveCategory] }}</dd><dd class="mt-1 text-xs text-charcoal/75">{{ CATEGORY_SOURCE_LABELS[selected.categorySource] }}</dd></div>
              <div><dt class="text-charcoal/75">Status verifikasi</dt><dd class="mt-1"><ReportsReportStatus :status="selected.status" /></dd><dd v-if="UNVERIFIED.has(selected.status)" class="mt-1 text-xs text-charcoal/75">Belum diverifikasi petugas.</dd></div>
              <div><dt class="text-charcoal/75">Waktu kejadian</dt><dd class="mt-1">{{ formatReportDate(selected.incidentTime) }}</dd></div>
              <div><dt class="text-charcoal/75">Lokasi</dt><dd class="mt-1">{{ selected.locationName || 'Lokasi tanpa nama' }}</dd><dd class="mt-1 font-mono text-xs">{{ selected.latitude }}, {{ selected.longitude }}</dd></div>
              <div><dt class="text-charcoal/75">Deskripsi singkat</dt><dd class="mt-1 leading-6">{{ selected.excerpt }}</dd></div>
            </dl>
            <div class="mt-5 flex flex-wrap gap-3">
              <NuxtLink :to="`/admin/reports/${selected.id}`" class="button-primary">Lihat detail</NuxtLink>
            </div>
          </section>
          <section v-else class="admin-panel overflow-hidden">
            <div class="admin-panel-header"><div><h2 class="admin-section-title">Antrean di peta</h2><p class="admin-muted mt-1" role="status">{{ data.total.toLocaleString('id-ID') }} laporan{{ hasFilters ? ' sesuai filter' : '' }}<template v-if="simulationCount"> · {{ simulationCount }} data simulasi</template></p><p class="admin-muted">Diurutkan dari skor tertinggi.</p></div></div>
            <p v-if="!data.reports.length" class="admin-empty">{{ hasFilters ? 'Tidak ada laporan yang sesuai filter.' : 'Belum ada laporan masuk.' }}</p>
            <ul v-else class="max-h-[620px] divide-y divide-line overflow-y-auto">
              <li v-for="report in data.reports" :key="report.id">
                <button type="button" class="w-full px-5 py-5 text-left hover:bg-sage-100/40 focus-visible:-outline-offset-4 sm:px-6" @click="select(report.id)">
                  <span class="flex flex-wrap items-center gap-2 text-xs"><span class="font-mono text-charcoal/75">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="rounded bg-sage-100 px-1.5 font-semibold text-forest-900">SIMULASI</span></span>
                  <span class="mt-2 block text-base font-semibold leading-7 text-forest-900">{{ report.title }}</span>
                  <MapPriorityBadge class="mt-2" :level="report.priority?.level ?? null" :stale="report.priority?.stale" />
                  <span class="mt-2 block text-sm leading-6 text-charcoal/75">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }}</span><span class="mt-1 block text-sm leading-6 text-charcoal/65">{{ formatReportDate(report.incidentTime) }}</span><span class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-forest-700">Lihat di peta<AdminIcon name="chevron-right" class="size-4" /></span>
                </button>
              </li>
            </ul>
            <nav v-if="pageCount > 1" class="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 text-sm" aria-label="Halaman laporan peta">
              <button type="button" class="button-secondary px-4" :disabled="page <= 1" @click="goToPage(page - 1)">Sebelumnya</button>
              <span>Halaman {{ page }} dari {{ pageCount }}</span>
              <button type="button" class="button-secondary px-4" :disabled="page >= pageCount" @click="goToPage(page + 1)">Berikutnya</button>
            </nav>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.admin-map-filters :deep(form) { border-radius: 1rem; padding: 1.25rem; background: white; }
@media (min-width: 64rem) {
  .admin-map-filters :deep(form > div:nth-child(2)) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .admin-map-filters :deep(form > div:nth-child(2) > div:last-child) {
    grid-column: 1 / -1;
    justify-content: flex-end;
    border-top: 1px solid var(--color-line);
    padding-top: 1rem;
  }
}
</style>
