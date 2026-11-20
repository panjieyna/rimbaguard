<script setup lang="ts">
import type { AdminDashboardResponse } from '../../../shared/types/admin-api'
import { REPORT_STATUS_LABELS, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { ANALYTICS_DATASETS, ANALYTICS_DATASET_LABELS, STATUS_DISPLAY_ORDER } from '#shared/constants/workflow'
import { timeBuckets } from '~/utils/analytics'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Ringkasan Petugas — RimbaGuard AI', robots: 'noindex' })
const route = useRoute()
const dataset = computed(() => route.query.dataset === 'simulation' ? 'simulation' : 'real')
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('admin-dashboard',
  () => requestFetch<AdminDashboardResponse>('/api/admin/dashboard', { query: { dataset: dataset.value } }), { watch: [dataset] })

const summary = computed(() => data.value?.analytics.summary)
const daily = computed(() => data.value ? timeBuckets(data.value.analytics.daily, 30) : [])
const categories = computed(() => [...(data.value?.analytics.categoryCounts ?? [])].sort((a, b) => b.count - a.count))
const statuses = computed(() => STATUS_DISPLAY_ORDER.map(status => ({ status, count: data.value?.analytics.statusCounts.find(item => item.status === status)?.count ?? 0 })))
const rangeEmpty = computed(() => data.value?.analytics.rangeTotal === 0)
const queueLink = (query: Record<string, string>) => ({ path: '/admin/reports', query: { ...query, ...(dataset.value === 'simulation' ? { dataset: 'simulation' } : {}) } })
</script>


<template>
  <div class="admin-page">
    <AdminPageHeader title="Ringkasan" description="Pantau laporan masuk, tentukan prioritas pemeriksaan, dan ikuti perkembangan penanganan.">
      <nav aria-label="Pilihan data" class="inline-flex max-w-full rounded-xl border border-line bg-white p-1">
        <NuxtLink v-for="option in ANALYTICS_DATASETS" :key="option" :to="{ query: option === 'real' ? {} : { dataset: option } }" class="flex min-h-11 items-center rounded-lg px-4 text-sm font-medium" :class="dataset === option ? 'bg-forest-900 text-white' : 'text-charcoal/75 hover:bg-sage-100'" :aria-current="dataset === option ? 'page' : undefined">{{ ANALYTICS_DATASET_LABELS[option] }}</NuxtLink>
      </nav>
    </AdminPageHeader>
    <p v-if="dataset === 'simulation'" class="notice font-medium">Menampilkan data simulasi untuk pengujian dan demo. Angka ini tidak termasuk laporan nyata.</p>

    <p v-if="status === 'pending' && !data" role="status" class="notice">Memuat ringkasan…</p>
    <div v-else-if="error" role="alert" class="notice"><p>Ringkasan belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data && summary">
      <p v-if="data.refresh.status !== 'fresh'" role="status" class="notice">Sebagian skor prioritas belum dapat diperbarui; urutan memakai perhitungan terakhir.</p>
      <section aria-labelledby="summary-title">
        <h2 id="summary-title" class="sr-only">Kondisi laporan saat ini</h2>
        <dl class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[87.5rem]:grid-cols-5">
          <AdminStatTile label="Total laporan" :value="summary.total" hint="Seluruh laporan pada pilihan data ini." icon="reports" />
          <AdminStatTile label="Menunggu verifikasi" :value="summary.pendingVerification" hint="Siap diperiksa petugas." icon="clock" tone="amber" :to="`/admin/reports?scope=pending_verification${dataset === 'simulation' ? '&dataset=simulation' : ''}`" />
          <AdminStatTile label="Prioritas tinggi" :value="summary.highPriority" hint="Laporan aktif yang perlu didahulukan." icon="alert" tone="red" :to="`/admin/reports?priority=high${dataset === 'simulation' ? '&dataset=simulation' : ''}`" />
          <AdminStatTile label="Telah diverifikasi" :value="summary.verified" hint="Termasuk ditindaklanjuti dan selesai." icon="shield" />
          <AdminStatTile label="Selesai ditangani" :value="summary.resolved" :hint="`${summary.rejected} laporan ditolak dicatat terpisah.`" icon="check" />
        </dl>
      </section>

      <div v-if="summary.analysisFailed" class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E8D9B9] bg-[#FCF7EB] px-5 py-4">
        <p class="flex items-start gap-3 text-sm leading-6 text-[#75501C]"><AdminIcon name="alert" class="mt-0.5 size-5" /><span><strong>{{ summary.analysisFailed }} laporan perlu tinjauan manual.</strong> Analisis AI belum berhasil; bukti tetap dapat diperiksa.</span></p>
        <NuxtLink :to="queueLink({ scope: 'analysis_failed' })" class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#75501C] hover:underline">Tinjau laporan<AdminIcon name="arrow-right" class="size-4" /></NuxtLink>
      </div>

      <section class="admin-panel overflow-hidden" aria-labelledby="queue-title">
        <div class="admin-panel-header">
          <div><h2 id="queue-title" class="admin-section-title">Antrean prioritas</h2><p class="admin-muted mt-1">{{ data.queueTotal.toLocaleString('id-ID') }} laporan aktif · lima teratas berdasarkan skor</p></div>
          <NuxtLink :to="queueLink({})" class="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-forest-700 hover:underline">Lihat semua laporan<AdminIcon name="arrow-right" class="size-4" /></NuxtLink>
        </div>
        <div v-if="!data.queue.length" class="admin-empty"><AdminIcon name="check" class="mx-auto mb-3 size-8 text-forest-500" /><p class="font-medium text-forest-900">Antrean aktif kosong</p><p class="mt-1">Tidak ada laporan aktif yang menunggu penanganan.</p></div>
        <AdminQueueList v-else :reports="data.queue" caption="Lima laporan aktif dengan prioritas tertinggi" />
      </section>

      <section aria-labelledby="charts-title">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="charts-title" class="admin-section-title">Laporan masuk 30 hari terakhir</h2><p class="admin-muted mt-1">{{ data.analytics.rangeTotal.toLocaleString('id-ID') }} laporan · {{ data.analytics.range.from }} – {{ data.analytics.range.to }} WIB</p></div>
          <NuxtLink :to="{ path: '/admin/analytics', query: dataset === 'simulation' ? { dataset } : {} }" class="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-forest-700 hover:underline">Buka analitik<AdminIcon name="arrow-right" class="size-4" /></NuxtLink>
        </div>
        <div v-if="rangeEmpty" class="admin-panel admin-empty"><AdminIcon name="analytics" class="mx-auto mb-3 size-8 text-forest-500" /><p>Belum ada laporan masuk dalam 30 hari terakhir.</p><p class="admin-muted mt-1">Grafik akan muncul setelah ada laporan pada rentang ini.</p></div>
        <div v-else class="grid gap-5 xl:grid-cols-2">
          <div class="admin-panel p-5 sm:p-6 xl:col-span-2"><div class="mb-6 flex items-center justify-between gap-4"><h3 class="text-base font-semibold text-forest-900">Laporan per hari</h3><span class="admin-muted">30 hari terakhir</span></div><ClientOnly><AdminBarChart title="Laporan masuk per hari, 30 hari terakhir" :labels="daily.map(item => item.label)" :values="daily.map(item => item.count)" height-class="h-64" /><template #fallback><p class="h-64 text-sm text-charcoal/75">Memuat grafik…</p></template></ClientOnly></div>
          <div class="admin-panel p-5 sm:p-6"><h3 class="text-base font-semibold text-forest-900">Kategori ancaman</h3><p class="admin-muted mt-1">Kategori petugas, AI, atau pelapor sesuai hasil terbaru.</p><ClientOnly><AdminBarChart class="mt-5" title="Distribusi kategori ancaman, 30 hari terakhir" :labels="categories.map(item => THREAT_CATEGORY_LABELS[item.category])" :values="categories.map(item => item.count)" horizontal tip-labels height-class="h-64" /></ClientOnly></div>
          <div class="admin-panel p-5 sm:p-6"><h3 class="text-base font-semibold text-forest-900">Status penanganan</h3><p class="admin-muted mt-1">Status terkini dari laporan dalam rentang ini.</p><ClientOnly><AdminBarChart class="mt-5" title="Distribusi status laporan, 30 hari terakhir" :labels="statuses.map(item => REPORT_STATUS_LABELS[item.status])" :values="statuses.map(item => item.count)" horizontal tip-labels height-class="h-80" /></ClientOnly></div>
        </div>
      </section>

      <section class="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-[#D9E4D5] bg-[#EAF0E9] p-5 sm:p-6" aria-labelledby="actions-title">
        <div><h2 id="actions-title" class="text-lg font-semibold text-forest-900">Lanjutkan pemeriksaan</h2><p class="mt-1 text-sm leading-6 text-forest-900/75">Buka antrean verifikasi atau lihat sebaran laporan.</p></div>
        <div class="flex flex-wrap gap-3"><NuxtLink :to="{ path: '/admin/map', query: dataset === 'simulation' ? { dataset } : {} }" class="button-secondary"><AdminIcon name="map" class="size-5" />Buka peta ancaman</NuxtLink><NuxtLink :to="queueLink({ scope: 'pending_verification' })" class="button-primary">Kelola verifikasi<AdminIcon name="arrow-right" class="size-4" /></NuxtLink></div>
      </section>
    </template>
  </div>
</template>
