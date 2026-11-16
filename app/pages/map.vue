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
async function copyLink() {
  if (!selected.value) return
  try { await navigator.clipboard.writeText(`${window.location.origin}/map?report=${selected.value.id}`); copied.value = true }
  catch { copied.value = false }
}
watch(selectedId, () => { copied.value = false })
</script>

<template>
  <div class="mx-auto w-full max-w-[1360px] px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
    <header class="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p class="eyebrow">Pengamatan yang telah ditinjau</p>
        <h1 class="mt-4 text-3xl font-semibold tracking-tight text-forest-900 sm:text-4xl">Peta laporan masyarakat</h1>
        <p class="mt-4 max-w-2xl body-copy">Ringkasan laporan yang disetujui petugas untuk publik. Titik menunjukkan perkiraan lokasi; koordinat persis tetap privat.</p>
      </div>
      <NuxtLink to="/report" class="button-primary">Laporkan ancaman</NuxtLink>
    </header>

    <MapFilters class="mt-8" :statuses="PUBLIC_REPORT_STATUSES" :values="filters" @apply="applyFilters" />

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat laporan publik…</p>
    <div v-else-if="error" class="notice mt-6" role="alert">
      <p>{{ error.statusCode === 422 ? 'Filter peta tidak valid. Periksa rentang tanggal atau pilihan filter.' : 'Peta laporan belum dapat dimuat.' }}</p>
      <button type="button" class="text-link mt-3 min-h-11" @click="error.statusCode === 422 ? applyFilters({}) : refresh()">{{ error.statusCode === 422 ? 'Hapus filter' : 'Coba kembali' }}</button>
    </div>
    <div v-else-if="data" class="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="min-w-0">
        <ClientOnly>
          <MapThreatMap :points="points" :selected-id="selected?.id" label="Peta lokasi laporan" @select="select" />
          <template #fallback><p class="notice h-[420px] sm:h-[520px] lg:h-[620px]">Memuat peta…</p></template>
        </ClientOnly>
        <MapLegend class="mt-4" />
        <p class="form-hint">Peta berbasis laporan insiden; tidak menampilkan deteksi deforestasi, batas kawasan, atau pemantauan satelit langsung. Prioritas adalah urutan pemeriksaan, bukan tingkat kepastian kejadian.</p>
      </div>

      <aside class="min-w-0" aria-label="Detail dan daftar laporan publik">
        <section v-if="selected" aria-live="polite" class="rounded-lg border border-line bg-white p-5">
          <p class="font-mono text-xs text-charcoal/75">{{ selected.reportCode }}</p>
          <h2 class="mt-3 text-xl font-semibold text-forest-900">{{ THREAT_CATEGORY_LABELS[selected.category] }}</h2>
          <MapPriorityBadge class="mt-3" :level="selected.priority" />
          <p class="mt-4 body-copy">{{ selected.summary }}</p>
          <dl class="mt-5 space-y-4 text-sm">
            <div><dt class="text-charcoal/75">Waktu kejadian</dt><dd class="mt-1">{{ formatReportDate(selected.incidentTime) }}</dd></div>
            <div><dt class="text-charcoal/75">Status verifikasi</dt><dd class="mt-1">{{ REPORT_STATUS_LABELS[selected.status] }}</dd></div>
            <div><dt class="text-charcoal/75">Perkiraan koordinat</dt><dd class="mt-1 font-mono">{{ selected.approximateLatitude }}, {{ selected.approximateLongitude }}</dd><dd class="mt-1 text-xs text-charcoal/75">Dibulatkan sekitar 1 km untuk menjaga privasi pelapor.</dd></div>
            <div><dt class="text-charcoal/75">Dipublikasikan</dt><dd class="mt-1">{{ formatReportDate(selected.publishedAt) }}</dd></div>
          </dl>
          <div class="mt-5 flex flex-wrap gap-3">
            <button type="button" class="button-secondary" @click="copyLink">{{ copied ? 'Tautan disalin' : 'Salin tautan laporan' }}</button>
            <button type="button" class="text-link min-h-11 text-sm" @click="select(null)">Kembali ke daftar</button>
          </div>
        </section>
        <section v-else>
          <p v-if="selectionMissing" role="status" class="notice mb-4">Laporan publik tersebut tidak ditemukan atau belum dipublikasikan.</p>
          <h2 class="text-lg font-semibold text-forest-900">Laporan publik</h2>
          <p class="mt-2 text-sm text-charcoal/75" role="status">{{ data.total.toLocaleString('id-ID') }} laporan{{ hasFilters ? ' sesuai filter' : '' }}</p>
          <p v-if="!data.reports.length" class="mt-4 body-copy">{{ hasFilters ? 'Tidak ada laporan publik yang sesuai filter.' : 'Belum ada laporan yang dipublikasikan.' }}</p>
          <ul v-else class="mt-3 max-h-[560px] divide-y divide-line overflow-y-auto border-y border-line">
            <li v-for="report in data.reports" :key="report.id">
              <button type="button" class="w-full py-4 text-left hover:text-forest-700" @click="select(report.id)">
                <span class="font-mono text-xs text-charcoal/75">{{ report.reportCode }}</span>
                <span class="mt-1 block text-sm font-medium">{{ THREAT_CATEGORY_LABELS[report.category] }}</span>
                <MapPriorityBadge class="mt-2" :level="report.priority" />
                <span class="mt-2 block text-xs leading-5 text-charcoal/75">{{ formatReportDate(report.incidentTime) }} · {{ REPORT_STATUS_LABELS[report.status] }}</span>
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
