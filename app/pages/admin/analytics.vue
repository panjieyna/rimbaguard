<script setup lang="ts">
import type { AdminAnalytics } from '../../../shared/types/admin-api'
import { REPORT_STATUS_LABELS, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { ANALYTICS_DATASETS, ANALYTICS_DATASET_LABELS, ANALYTICS_RANGES, ANALYTICS_RANGE_LABELS, STATUS_DISPLAY_ORDER } from '#shared/constants/workflow'
import { formatCount, timeBuckets } from '~/utils/analytics'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Analitik — RimbaGuard AI', robots: 'noindex' })
const route = useRoute()
const days = computed(() => (ANALYTICS_RANGES as readonly number[]).includes(Number(route.query.days)) ? Number(route.query.days) : 30)
const dataset = computed(() => route.query.dataset === 'simulation' ? 'simulation' : 'real')
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('admin-analytics',
  () => requestFetch<AdminAnalytics>('/api/admin/analytics', { query: { days: days.value, dataset: dataset.value } }), { watch: [days, dataset] })

const id = useId()
const form = reactive({ days: '30', dataset: 'real' })
watch([days, dataset], ([nextDays, nextDataset]) => { form.days = String(nextDays); form.dataset = nextDataset }, { immediate: true })
async function apply() {
  await navigateTo({ path: '/admin/analytics', query: { ...(form.days !== '30' ? { days: form.days } : {}), ...(form.dataset !== 'real' ? { dataset: form.dataset } : {}) } })
}

const buckets = computed(() => data.value ? timeBuckets(data.value.daily, data.value.range.days) : [])
const bucketTitle = computed(() => !data.value ? '' : data.value.range.days <= 30 ? 'Laporan masuk per hari' : data.value.range.days <= 90 ? 'Laporan masuk per minggu' : 'Laporan masuk per bulan')
const categories = computed(() => [...(data.value?.categoryCounts ?? [])].sort((a, b) => b.count - a.count))
const statuses = computed(() => STATUS_DISPLAY_ORDER.map(item => ({ status: item, count: data.value?.statusCounts.find(row => row.status === item)?.count ?? 0 })))
</script>

<template>
  <div class="max-w-6xl">
    <header>
      <p class="eyebrow">Ruang petugas</p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-forest-900 sm:text-4xl">Analitik laporan</h1>
      <p class="mt-3 max-w-2xl body-copy">Grafik dihitung langsung dari database. Laporan nyata dan data simulasi tidak pernah digabung.</p>
    </header>

    <form role="search" method="get" aria-label="Filter analitik" class="mt-7 flex flex-wrap items-end gap-4 rounded-lg border border-line bg-white p-4" @submit.prevent="apply">
      <div class="min-w-48 flex-1 sm:flex-none"><label :for="`${id}-days`" class="form-label">Rentang waktu</label><select :id="`${id}-days`" v-model="form.days" name="days" class="form-input"><option v-for="range in ANALYTICS_RANGES" :key="range" :value="String(range)">{{ ANALYTICS_RANGE_LABELS[range] }}</option></select></div>
      <div class="min-w-48 flex-1 sm:flex-none"><label :for="`${id}-dataset`" class="form-label">Data</label><select :id="`${id}-dataset`" v-model="form.dataset" name="dataset" class="form-input"><option v-for="option in ANALYTICS_DATASETS" :key="option" :value="option">{{ ANALYTICS_DATASET_LABELS[option] }}</option></select></div>
      <button type="submit" class="button-primary">Terapkan</button>
    </form>
    <p v-if="dataset === 'simulation'" class="notice mt-5 font-medium">Menampilkan data simulasi untuk pengujian dan demo, bukan laporan nyata.</p>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat analitik…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><p>Analitik belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data">
      <section class="mt-8" aria-labelledby="state-title">
        <h2 id="state-title" class="text-xl font-semibold text-forest-900">Kondisi saat ini</h2>
        <p class="mt-1 text-sm text-charcoal/75">Semua laporan pada data ini, tanpa batas tanggal.</p>
        <dl class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatTile label="Total laporan" :value="data.summary.total" />
          <AdminStatTile label="Menunggu verifikasi" :value="data.summary.pendingVerification" :hint="`${data.summary.analysisFailed} analisis gagal · ${data.summary.needsMoreInformation} menunggu informasi pelapor`" />
          <AdminStatTile label="Telah diverifikasi" :value="data.summary.verified" :hint="`Termasuk ${data.summary.inProgress} sedang ditindaklanjuti dan ${data.summary.resolved} selesai`" />
          <AdminStatTile label="Prioritas tinggi aktif" :value="data.summary.highPriority" :hint="`${data.summary.rejected} laporan ditolak tidak dihitung`" />
        </dl>
      </section>

      <section class="mt-10" aria-labelledby="range-title">
        <h2 id="range-title" class="text-xl font-semibold text-forest-900">{{ ANALYTICS_RANGE_LABELS[data.range.days] }}</h2>
        <p class="mt-1 text-sm text-charcoal/75">{{ formatCount(data.rangeTotal) }} laporan dikirim {{ data.range.from }} sampai {{ data.range.to }} (WIB).</p>
        <p v-if="!data.rangeTotal" class="notice mt-4">Belum ada laporan masuk pada rentang ini, sehingga grafik belum dapat ditampilkan.</p>
        <div v-else class="mt-5 space-y-5">
          <div class="min-w-0 rounded-lg border border-line bg-white p-5"><h3 class="text-sm font-semibold">{{ bucketTitle }}</h3><ClientOnly><AdminBarChart class="mt-3" :title="`${bucketTitle}, ${ANALYTICS_RANGE_LABELS[data.range.days]}`" :labels="buckets.map(item => item.label)" :values="buckets.map(item => item.count)" height-class="h-64" /><template #fallback><p class="mt-3 h-64 text-sm text-charcoal/75">Memuat grafik…</p></template></ClientOnly></div>
          <div class="grid gap-5 lg:grid-cols-2">
            <div class="min-w-0 rounded-lg border border-line bg-white p-5"><h3 class="text-sm font-semibold">Distribusi kategori ancaman</h3><p class="text-xs text-charcoal/70">Kategori yang dinilai: koreksi petugas, lalu AI, lalu pilihan pelapor.</p><ClientOnly><AdminBarChart class="mt-3" title="Distribusi kategori ancaman" :labels="categories.map(item => THREAT_CATEGORY_LABELS[item.category])" :values="categories.map(item => item.count)" horizontal tip-labels height-class="h-60" /></ClientOnly></div>
            <div class="min-w-0 rounded-lg border border-line bg-white p-5"><h3 class="text-sm font-semibold">Distribusi status laporan</h3><p class="text-xs text-charcoal/70">Status saat ini dari laporan yang dikirim pada rentang ini.</p><ClientOnly><AdminBarChart class="mt-3" title="Distribusi status laporan" :labels="statuses.map(item => REPORT_STATUS_LABELS[item.status])" :values="statuses.map(item => item.count)" horizontal tip-labels height-class="h-80" /></ClientOnly></div>
          </div>
        </div>
      </section>

      <section class="mt-10 border-t border-line pt-7 text-sm leading-6 text-charcoal/85" aria-labelledby="definitions-title">
        <h2 id="definitions-title" class="text-lg font-semibold text-forest-900">Definisi angka</h2>
        <ul class="mt-3 list-disc space-y-1 pl-5">
          <li><strong>Telah diverifikasi</strong> mencakup laporan yang kemudian sedang ditindaklanjuti atau selesai; laporan ditolak dihitung terpisah.</li>
          <li><strong>Prioritas tinggi aktif</strong> menghitung laporan yang belum selesai atau ditolak dengan skor prioritas terbaru tinggi.</li>
          <li>Grafik rentang waktu memakai tanggal laporan dikirim dalam WIB. Distribusi status menunjukkan status saat ini dari laporan tersebut.</li>
          <li>Jumlah nol berarti database tidak memiliki laporan yang sesuai, bukan data yang hilang. Bila database tidak dapat dihubungi, halaman menampilkan pesan gagal, bukan angka nol.</li>
        </ul>
      </section>
    </template>
  </div>
</template>
