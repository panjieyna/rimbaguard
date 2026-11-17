<script setup lang="ts">
import type { AdminQueueResponse } from '../../../../shared/types/admin-api'
import { THREAT_CATEGORIES, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { MAP_DATASETS, MAP_DATASET_LABELS, MAP_PRIORITY_FILTERS, MAP_PRIORITY_FILTER_LABELS } from '#shared/constants/scoring'
import { QUEUE_SCOPES, QUEUE_SCOPE_LABELS } from '#shared/constants/workflow'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Laporan Masuk — RimbaGuard AI', robots: 'noindex' })
const route = useRoute()
const KEYS = ['scope', 'category', 'priority', 'dataset'] as const
// A string key changes only when the filters change.
const filterKey = computed(() => {
  const values: Record<string, string> = {}
  for (const key of KEYS) if (typeof route.query[key] === 'string' && route.query[key]) values[key] = route.query[key] as string
  values.page = String(Math.max(1, Number.parseInt(String(route.query.page ?? '1'), 10) || 1))
  return JSON.stringify(values)
})
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('admin-queue',
  () => requestFetch<AdminQueueResponse>('/api/admin/reports', { query: JSON.parse(filterKey.value) }), { watch: [filterKey] })

const id = useId()
const blank = () => ({ scope: 'active', category: '', priority: '', dataset: 'all' })
const form = reactive(blank())
watch(filterKey, (key) => { Object.assign(form, blank(), JSON.parse(key)) }, { immediate: true })
const page = computed(() => Number(JSON.parse(filterKey.value).page))
const pageCount = computed(() => data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1)
const filtered = computed(() => form.category || form.priority || form.scope !== 'active' || form.dataset !== 'all')

function query(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => value && !(key === 'scope' && value === 'active') && !(key === 'dataset' && value === 'all') && !(key === 'page' && value === '1')))
}
async function apply() { await navigateTo({ path: '/admin/reports', query: query({ ...form }) }) }
async function reset() { Object.assign(form, blank()); await apply() }
async function goToPage(next: number) { await navigateTo({ path: '/admin/reports', query: query({ ...form, page: String(next) }) }) }
</script>

<template>
  <div class="admin-page">
    <AdminPageHeader title="Laporan masuk" description="Temukan laporan yang perlu diperiksa, lalu tinjau bukti dan tentukan tindak lanjutnya.">
      <NuxtLink to="/admin/map" class="button-secondary"><AdminIcon name="map" class="size-5" />Lihat di peta</NuxtLink>
    </AdminPageHeader>

    <form role="search" method="get" aria-label="Filter antrean laporan" class="admin-filter-bar grid sm:grid-cols-2 xl:grid-cols-4" @submit.prevent="apply">
      <div class="flex items-center gap-2 sm:col-span-2 xl:col-span-4"><AdminIcon name="filter" class="size-5 text-forest-700" /><h2 class="admin-section-title">Saring laporan</h2></div>
      <div><label :for="`${id}-scope`" class="form-label">Cakupan</label><select :id="`${id}-scope`" v-model="form.scope" name="scope" class="form-input"><option v-for="scope in QUEUE_SCOPES" :key="scope" :value="scope">{{ QUEUE_SCOPE_LABELS[scope] }}</option></select></div>
      <div><label :for="`${id}-category`" class="form-label">Kategori</label><select :id="`${id}-category`" v-model="form.category" name="category" class="form-input"><option value="">Semua kategori</option><option v-for="category in THREAT_CATEGORIES" :key="category" :value="category">{{ THREAT_CATEGORY_LABELS[category] }}</option></select></div>
      <div><label :for="`${id}-priority`" class="form-label">Prioritas</label><select :id="`${id}-priority`" v-model="form.priority" name="priority" class="form-input"><option value="">Semua prioritas</option><option v-for="priority in MAP_PRIORITY_FILTERS" :key="priority" :value="priority">{{ MAP_PRIORITY_FILTER_LABELS[priority] }}</option></select></div>
      <div><label :for="`${id}-dataset`" class="form-label">Data</label><select :id="`${id}-dataset`" v-model="form.dataset" name="dataset" class="form-input"><option v-for="option in MAP_DATASETS" :key="option" :value="option">{{ MAP_DATASET_LABELS[option] }}</option></select></div>
      <div class="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 sm:col-span-2 xl:col-span-4"><p class="admin-muted">Laporan dengan skor tertinggi ditampilkan lebih dulu.</p><div class="flex gap-2"><button type="button" class="button-secondary" @click="reset">Atur ulang</button><button type="submit" class="button-primary">Terapkan filter</button></div></div>
    </form>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat antrean…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><p>{{ error.statusCode === 422 ? 'Filter antrean tidak valid.' : 'Antrean belum dapat dimuat. Periksa koneksi atau sesi Anda.' }}</p><button type="button" class="text-link mt-3 min-h-11" @click="error.statusCode === 422 ? reset() : refresh()">{{ error.statusCode === 422 ? 'Atur ulang filter' : 'Coba kembali' }}</button></div>
    <template v-else-if="data">
      <p v-if="data.refresh.status !== 'fresh'" role="status" class="notice mt-6">Sebagian skor prioritas belum dapat diperbarui; urutan memakai perhitungan terakhir.</p>
      <section class="admin-panel overflow-hidden" aria-labelledby="queue-list-title">
        <div class="admin-panel-header"><div><h2 id="queue-list-title" class="admin-section-title">Daftar laporan</h2><p class="admin-muted mt-1" role="status">{{ data.total.toLocaleString('id-ID') }} laporan{{ filtered ? ' sesuai filter' : ' aktif' }}</p></div><span class="rounded-full bg-sage-100 px-3 py-1 text-sm text-forest-700">Urutan prioritas</span></div>
        <div v-if="!data.reports.length" class="admin-empty"><AdminIcon name="reports" class="mx-auto mb-3 size-8 text-forest-500" /><p>{{ filtered ? 'Tidak ada laporan yang sesuai filter.' : 'Tidak ada laporan aktif yang menunggu penanganan.' }}</p><button v-if="filtered" type="button" class="text-link mt-3 min-h-11" @click="reset">Atur ulang filter</button></div>
        <AdminQueueList v-else :reports="data.reports" caption="Antrean laporan berdasarkan prioritas" />
      </section>
      <nav v-if="pageCount > 1" class="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Halaman antrean">
        <button type="button" class="button-secondary px-4" :disabled="page <= 1" @click="goToPage(page - 1)">Sebelumnya</button>
        <span>Halaman {{ page }} dari {{ pageCount }}</span>
        <button type="button" class="button-secondary px-4" :disabled="page >= pageCount" @click="goToPage(page + 1)">Berikutnya</button>
      </nav>
    </template>
  </div>
</template>
