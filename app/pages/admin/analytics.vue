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
  <div class="admin-page">
    <AdminPageHeader title="Analitik laporan" description="Pahami pola laporan, kategori ancaman, dan perkembangan penanganan dalam satu tampilan." />

    <form role="search" method="get" aria-label="Filter analitik" class="admin-filter-bar flex flex-wrap items-end" @submit.prevent="apply">
      <div class="mr-auto flex w-full items-center gap-3 pb-1 xl:w-auto xl:pb-3"><span class="flex size-10 items-center justify-center rounded-xl bg-sage-100 text-forest-700"><AdminIcon name="filter" class="size-5" /></span><div><p class="font-semibold text-forest-900">Tampilkan analitik</p><p class="admin-muted">Pilih periode dan sumber laporan.</p></div></div>
      <div class="min-w-0 flex-[1_1_12rem] xl:w-52 xl:flex-none"><label :for="`${id}-days`" class="form-label">Rentang waktu</label><select :id="`${id}-days`" v-model="form.days" name="days" class="form-input"><option v-for="range in ANALYTICS_RANGES" :key="range" :value="String(range)">{{ ANALYTICS_RANGE_LABELS[range] }}</option></select></div>
      <div class="min-w-0 flex-[1_1_12rem] xl:w-48 xl:flex-none"><label :for="`${id}-dataset`" class="form-label">Data</label><select :id="`${id}-dataset`" v-model="form.dataset" name="dataset" class="form-input"><option v-for="option in ANALYTICS_DATASETS" :key="option" :value="option">{{ ANALYTICS_DATASET_LABELS[option] }}</option></select></div>
      <button type="submit" class="button-primary w-full sm:w-auto">Terapkan <AdminIcon name="arrow-right" class="size-4" /></button>
    </form>
    <p v-if="dataset === 'simulation'" class="notice mt-5 font-medium">Menampilkan data simulasi untuk pengujian dan demo, bukan laporan nyata.</p>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat analitik…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><p>Analitik belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data">
      <section aria-labelledby="state-title">
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="state-title" class="admin-section-title">Kondisi saat ini</h2><p class="admin-muted">Seluruh laporan pada data ini · tanpa batas tanggal</p></div>
        <dl class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatTile label="Total laporan" :value="data.summary.total" icon="reports" />
          <AdminStatTile label="Menunggu verifikasi" :value="data.summary.pendingVerification" icon="clock" tone="amber" :hint="`${data.summary.analysisFailed} analisis gagal · ${data.summary.needsMoreInformation} menunggu informasi pelapor`" />
          <AdminStatTile label="Telah diverifikasi" :value="data.summary.verified" icon="shield" :hint="`Termasuk ${data.summary.inProgress} sedang ditindaklanjuti dan ${data.summary.resolved} selesai`" />
          <AdminStatTile label="Prioritas tinggi aktif" :value="data.summary.highPriority" icon="alert" tone="red" :hint="`${data.summary.rejected} laporan ditolak dihitung terpisah`" />
        </dl>
      </section>

      <section aria-labelledby="range-title">
        <div class="flex flex-wrap items-end justify-between gap-3"><div><h2 id="range-title" class="admin-section-title">{{ ANALYTICS_RANGE_LABELS[data.range.days] }}</h2><p class="admin-muted mt-1">{{ data.range.from }} – {{ data.range.to }} · WIB</p></div><p class="rounded-full border border-line bg-white px-4 py-2 text-sm text-charcoal/75"><strong class="font-semibold text-forest-900">{{ formatCount(data.rangeTotal) }}</strong> laporan masuk</p></div>
        <div v-if="!data.rangeTotal" class="admin-panel admin-empty mt-5"><AdminIcon name="analytics" class="mx-auto mb-3 size-8 text-forest-500" /><p class="font-medium text-forest-900">Belum ada laporan pada periode ini.</p><p class="mt-1">Pilih rentang waktu lain untuk melihat perkembangannya.</p></div>
        <div v-else class="mt-5 space-y-5">
          <div class="admin-panel"><div class="admin-panel-header"><div><h3 class="admin-section-title">{{ bucketTitle }}</h3><p class="admin-muted mt-1">Perkembangan jumlah laporan pada periode pilihan.</p></div><span class="flex items-center gap-2 text-sm text-charcoal/70"><span class="size-2.5 rounded-full bg-[#287A52]" aria-hidden="true" />Jumlah laporan</span></div><div class="p-5 sm:p-6"><ClientOnly><AdminBarChart :title="`${bucketTitle}, ${ANALYTICS_RANGE_LABELS[data.range.days]}`" :labels="buckets.map(item => item.label)" :values="buckets.map(item => item.count)" height-class="h-64 sm:h-72" /><template #fallback><p class="h-64 text-sm text-charcoal/75">Memuat grafik…</p></template></ClientOnly></div></div>
          <div class="grid gap-5 xl:grid-cols-2">
            <div class="admin-panel"><div class="admin-panel-header"><div><h3 class="admin-section-title">Kategori ancaman</h3><p class="admin-muted mt-1">Mengikuti penilaian petugas, AI, lalu pelapor.</p></div></div><div class="p-5 sm:p-6"><ClientOnly><AdminBarChart title="Distribusi kategori ancaman" :labels="categories.map(item => THREAT_CATEGORY_LABELS[item.category])" :values="categories.map(item => item.count)" horizontal tip-labels height-class="h-72" /></ClientOnly></div></div>
            <div class="admin-panel"><div class="admin-panel-header"><div><h3 class="admin-section-title">Status penanganan</h3><p class="admin-muted mt-1">Status terkini dari laporan pada periode ini.</p></div></div><div class="p-5 sm:p-6"><ClientOnly><AdminBarChart title="Distribusi status laporan" :labels="statuses.map(item => REPORT_STATUS_LABELS[item.status])" :values="statuses.map(item => item.count)" horizontal tip-labels height-class="h-96" /></ClientOnly></div></div>
          </div>
        </div>
      </section>

      <details class="admin-panel group">
        <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-semibold text-forest-900 sm:px-6 [&::-webkit-details-marker]:hidden"><span class="flex items-center gap-3"><AdminIcon name="eye" class="size-5 text-forest-500" />Cara membaca angka</span><AdminIcon name="chevron-down" class="size-5 group-open:rotate-180" /></summary>
        <ul class="list-disc space-y-3 border-t border-line py-5 pr-5 pl-10 text-sm leading-7 text-charcoal/80 sm:pr-6 sm:pl-11">
          <li><strong>Telah diverifikasi</strong> mencakup laporan yang kemudian sedang ditindaklanjuti atau selesai; laporan ditolak dihitung terpisah.</li>
          <li><strong>Prioritas tinggi aktif</strong> menghitung laporan yang belum selesai atau ditolak dengan skor prioritas terbaru tinggi.</li>
          <li>Grafik rentang waktu memakai tanggal laporan dikirim dalam WIB. Distribusi status menunjukkan status saat ini dari laporan tersebut.</li>
          <li>Jumlah nol berarti database tidak memiliki laporan yang sesuai, bukan data yang hilang. Bila database tidak dapat dihubungi, halaman menampilkan pesan gagal, bukan angka nol.</li>
        </ul>
      </details>
    </template>
  </div>
</template>
