<script setup lang="ts">
import type { AdminMapResponse } from '../../../shared/types/map-api'
import type { MapFilterValues, ThreatMapPoint } from '~/types/map'
import { REPORT_STATUSES, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { CATEGORY_SOURCE_LABELS } from '#shared/constants/scoring'
import { formatReportDate } from '~/utils/dates'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Peta Petugas — RimbaGuard AI', robots: 'noindex' })
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
  <div class="w-full max-w-[1440px]">
    <header class="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p class="eyebrow">Ruang petugas</p>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-forest-900 sm:text-4xl">Peta prioritas laporan</h1>
        <p class="mt-3 max-w-3xl body-copy">Semua laporan masuk, termasuk yang belum diverifikasi. Warna dan huruf menunjukkan prioritas pemeriksaan dari aturan skor v1; titik bukan lokasi kejadian yang telah dipastikan.</p>
      </div>
      <NuxtLink to="/admin/reports" class="button-secondary">Lihat antrean laporan</NuxtLink>
    </header>

    <MapFilters class="mt-7" :statuses="REPORT_STATUSES" :values="filters" show-dataset @apply="applyFilters" />

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat peta petugas…</p>
    <div v-else-if="error" class="notice mt-6" role="alert">
      <p>{{ error.statusCode === 422 ? 'Filter peta tidak valid. Periksa rentang tanggal atau pilihan filter.' : error.statusCode === 403 ? 'Akses ini hanya tersedia bagi petugas.' : 'Peta petugas belum dapat dimuat.' }}</p>
      <button type="button" class="text-link mt-3 min-h-11" @click="error.statusCode === 422 ? applyFilters({}) : refresh()">{{ error.statusCode === 422 ? 'Hapus filter' : 'Coba kembali' }}</button>
    </div>
    <template v-else-if="data">
      <p v-if="data.refresh.status === 'busy'" role="status" class="notice mt-6">Skor prioritas sedang diperbarui oleh proses lain. Data di bawah memakai perhitungan terakhir; muat ulang sebentar lagi.</p>
      <p v-else-if="data.refresh.status === 'failed'" role="status" class="notice mt-6">Sebagian skor prioritas belum dapat diperbarui. Laporan bertanda "menunggu pembaruan" memakai perhitungan terakhir.</p>
      <p v-else-if="data.refresh.remaining" role="status" class="notice mt-6">{{ data.refresh.remaining }} skor masih menunggu pembaruan. Muat ulang untuk melanjutkan.</p>

      <div class="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div class="min-w-0">
          <ClientOnly>
            <MapThreatMap :points="points" :selected-id="selected?.id" label="Peta prioritas laporan petugas" height-class="h-[460px] sm:h-[600px] xl:h-[720px]" @select="select" />
            <template #fallback><p class="notice h-[460px] sm:h-[600px] xl:h-[720px]">Memuat peta…</p></template>
          </ClientOnly>
          <MapLegend class="mt-4" />
          <p class="form-hint">Koordinat persis hanya untuk petugas. Laporan berdekatan membantu urutan pemeriksaan dan bukan konfirmasi bahwa kejadian benar terjadi.</p>
        </div>

        <aside class="min-w-0" aria-label="Detail dan daftar laporan">
          <section v-if="selected" aria-live="polite" class="rounded-lg border border-line bg-white p-5">
            <div class="flex flex-wrap items-center gap-2 text-xs"><span class="font-mono text-charcoal/75">{{ selected.reportCode }}</span><span v-if="selected.isSimulation" class="rounded bg-sage-100 px-2 py-0.5 font-semibold text-forest-900">SIMULASI</span><span v-if="selected.isPublic" class="rounded bg-sage-100 px-2 py-0.5 text-forest-900">Dipublikasikan</span></div>
            <h2 class="mt-3 text-lg font-semibold leading-snug text-forest-900">{{ selected.title }}</h2>
            <MapPriorityBadge class="mt-3" :level="selected.priority?.level ?? null" :stale="selected.priority?.stale" />
            <p v-if="selected.priority" class="mt-1 text-xs text-charcoal/75">Skor {{ selected.priority.totalScore.toLocaleString('id-ID') }} dari 100 · dihitung {{ formatReportDate(selected.priority.calculatedAt) }}</p>
            <dl class="mt-5 space-y-4 text-sm">
              <div><dt class="text-charcoal/75">Kategori ancaman</dt><dd class="mt-1">{{ THREAT_CATEGORY_LABELS[selected.effectiveCategory] }}</dd><dd class="mt-1 text-xs text-charcoal/75">{{ CATEGORY_SOURCE_LABELS[selected.categorySource] }}</dd></div>
              <div><dt class="text-charcoal/75">Status verifikasi</dt><dd class="mt-1"><ReportsReportStatus :status="selected.status" /></dd><dd v-if="UNVERIFIED.has(selected.status)" class="mt-1 text-xs text-charcoal/75">Belum diverifikasi petugas.</dd></div>
              <div><dt class="text-charcoal/75">Waktu kejadian</dt><dd class="mt-1">{{ formatReportDate(selected.incidentTime) }}</dd></div>
              <div><dt class="text-charcoal/75">Lokasi</dt><dd class="mt-1">{{ selected.locationName || 'Lokasi tanpa nama' }}</dd><dd class="mt-1 font-mono text-xs">{{ selected.latitude }}, {{ selected.longitude }}</dd></div>
              <div><dt class="text-charcoal/75">Deskripsi singkat</dt><dd class="mt-1 leading-6">{{ selected.excerpt }}</dd></div>
            </dl>
            <div class="mt-5 flex flex-wrap gap-3">
              <NuxtLink :to="`/admin/reports/${selected.id}`" class="button-primary">Lihat detail</NuxtLink>
              <button type="button" class="text-link min-h-11 text-sm" @click="select(null)">Kembali ke daftar</button>
            </div>
          </section>
          <section v-else>
            <h2 class="text-lg font-semibold text-forest-900">Antrean di peta</h2>
            <p class="mt-2 text-sm text-charcoal/75" role="status">{{ data.total.toLocaleString('id-ID') }} laporan{{ hasFilters ? ' sesuai filter' : '' }}<template v-if="simulationCount"> · {{ simulationCount }} data simulasi</template> · diurutkan dari skor tertinggi</p>
            <p v-if="!data.reports.length" class="mt-4 body-copy">{{ hasFilters ? 'Tidak ada laporan yang sesuai filter.' : 'Belum ada laporan masuk.' }}</p>
            <ul v-else class="mt-3 max-h-[640px] divide-y divide-line overflow-y-auto border-y border-line">
              <li v-for="report in data.reports" :key="report.id">
                <button type="button" class="w-full py-4 text-left hover:text-forest-700" @click="select(report.id)">
                  <span class="flex flex-wrap items-center gap-2 text-xs"><span class="font-mono text-charcoal/75">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="rounded bg-sage-100 px-1.5 font-semibold text-forest-900">SIMULASI</span></span>
                  <span class="mt-1 block text-sm font-medium leading-snug">{{ report.title }}</span>
                  <MapPriorityBadge class="mt-2" :level="report.priority?.level ?? null" :stale="report.priority?.stale" />
                  <span class="mt-2 block text-xs leading-5 text-charcoal/75">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }} · {{ formatReportDate(report.incidentTime) }}</span>
                </button>
              </li>
            </ul>
            <nav v-if="pageCount > 1" class="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Halaman laporan peta">
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
