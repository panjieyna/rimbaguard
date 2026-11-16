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
  <div class="max-w-6xl">
    <header class="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p class="eyebrow">Ruang petugas</p>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-forest-900 sm:text-4xl">Ringkasan</h1>
        <p class="mt-3 max-w-2xl body-copy">Kondisi laporan saat ini, antrean prioritas, dan laporan masuk 30 hari terakhir. Semua angka dihitung langsung dari database.</p>
      </div>
      <nav aria-label="Pilihan data" class="inline-flex rounded-lg border border-line bg-white p-1">
        <NuxtLink v-for="option in ANALYTICS_DATASETS" :key="option" :to="{ query: option === 'real' ? {} : { dataset: option } }" class="flex min-h-11 items-center rounded-md px-4 text-sm font-medium" :class="dataset === option ? 'bg-forest-900 text-white' : 'text-charcoal hover:bg-sage-100'" :aria-current="dataset === option ? 'page' : undefined">{{ ANALYTICS_DATASET_LABELS[option] }}</NuxtLink>
      </nav>
    </header>
    <p v-if="dataset === 'simulation'" class="notice mt-6 font-medium">Menampilkan data simulasi untuk pengujian dan demo. Angka ini tidak termasuk laporan nyata.</p>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-8">Memuat ringkasan…</p>
    <div v-else-if="error" role="alert" class="notice mt-8"><p>Ringkasan belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data && summary">
      <p v-if="data.refresh.status !== 'fresh'" role="status" class="notice mt-6">Sebagian skor prioritas belum dapat diperbarui; urutan memakai perhitungan terakhir.</p>

      <section class="mt-8" aria-labelledby="summary-title">
        <h2 id="summary-title" class="sr-only">Kondisi laporan saat ini</h2>
        <dl class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <AdminStatTile label="Total laporan" :value="summary.total" hint="Semua laporan pada data ini." />
          <AdminStatTile label="Menunggu verifikasi" :value="summary.pendingVerification" :hint="summary.analysisFailed ? `Ditambah ${summary.analysisFailed} laporan dengan analisis gagal yang perlu ditinjau manual.` : 'Siap ditinjau petugas.'" :to="`/admin/reports?scope=pending_verification${dataset === 'simulation' ? '&dataset=simulation' : ''}`" />
          <AdminStatTile label="Prioritas tinggi" :value="summary.highPriority" hint="Laporan aktif dengan skor terbaru tinggi." :to="`/admin/reports?priority=high${dataset === 'simulation' ? '&dataset=simulation' : ''}`" />
          <AdminStatTile label="Telah diverifikasi" :value="summary.verified" hint="Termasuk yang sedang ditindaklanjuti dan selesai." />
          <AdminStatTile label="Selesai ditangani" :value="summary.resolved" :hint="`${summary.rejected} laporan ditolak dihitung terpisah.`" />
        </dl>
      </section>

      <section class="mt-10" aria-labelledby="queue-title">
        <div class="flex flex-wrap items-end justify-between gap-3"><div><h2 id="queue-title" class="text-xl font-semibold text-forest-900">Antrean prioritas</h2><p class="mt-1 text-sm text-charcoal/75">{{ data.queueTotal }} laporan aktif · lima teratas berdasarkan skor</p></div><NuxtLink :to="queueLink({})" class="text-link inline-flex min-h-11 items-center text-sm">Lihat semua laporan</NuxtLink></div>
        <p v-if="!data.queue.length" class="mt-4 body-copy">Tidak ada laporan aktif yang menunggu penanganan.</p>
        <AdminQueueList v-else class="mt-4" :reports="data.queue" caption="Lima laporan aktif dengan prioritas tertinggi" />
      </section>

      <section class="mt-10" aria-labelledby="charts-title">
        <div class="flex flex-wrap items-end justify-between gap-3"><div><h2 id="charts-title" class="text-xl font-semibold text-forest-900">Laporan masuk 30 hari terakhir</h2><p class="mt-1 text-sm text-charcoal/75">{{ data.analytics.rangeTotal }} laporan dikirim {{ data.analytics.range.from }} sampai {{ data.analytics.range.to }} (WIB)</p></div><NuxtLink :to="{ path: '/admin/analytics', query: dataset === 'simulation' ? { dataset } : {} }" class="text-link inline-flex min-h-11 items-center text-sm">Buka analitik</NuxtLink></div>
        <p v-if="rangeEmpty" class="notice mt-4">Belum ada laporan masuk dalam 30 hari terakhir, sehingga grafik belum dapat ditampilkan.</p>
        <div v-else class="mt-5 grid gap-5 lg:grid-cols-2">
          <div class="min-w-0 rounded-lg border border-line bg-white p-5 lg:col-span-2"><h3 class="text-sm font-semibold">Laporan per hari</h3><ClientOnly><AdminBarChart class="mt-3" title="Laporan masuk per hari, 30 hari terakhir" :labels="daily.map(item => item.label)" :values="daily.map(item => item.count)" height-class="h-56" /><template #fallback><p class="mt-3 h-56 text-sm text-charcoal/75">Memuat grafik…</p></template></ClientOnly></div>
          <div class="min-w-0 rounded-lg border border-line bg-white p-5"><h3 class="text-sm font-semibold">Distribusi kategori ancaman</h3><p class="text-xs text-charcoal/70">Kategori yang dinilai: petugas, lalu AI, lalu pelapor.</p><ClientOnly><AdminBarChart class="mt-3" title="Distribusi kategori ancaman, 30 hari terakhir" :labels="categories.map(item => THREAT_CATEGORY_LABELS[item.category])" :values="categories.map(item => item.count)" horizontal tip-labels height-class="h-56" /></ClientOnly></div>
          <div class="min-w-0 rounded-lg border border-line bg-white p-5"><h3 class="text-sm font-semibold">Distribusi status laporan</h3><p class="text-xs text-charcoal/70">Status saat ini dari laporan yang masuk dalam rentang ini.</p><ClientOnly><AdminBarChart class="mt-3" title="Distribusi status laporan, 30 hari terakhir" :labels="statuses.map(item => REPORT_STATUS_LABELS[item.status])" :values="statuses.map(item => item.count)" horizontal tip-labels height-class="h-80" /></ClientOnly></div>
        </div>
      </section>

      <section class="mt-10" aria-labelledby="actions-title">
        <h2 id="actions-title" class="text-xl font-semibold text-forest-900">Tindakan cepat</h2>
        <div class="mt-4 flex flex-wrap gap-3">
          <NuxtLink :to="queueLink({ scope: 'all' })" class="button-secondary">Lihat semua laporan</NuxtLink>
          <NuxtLink :to="{ path: '/admin/map', query: dataset === 'simulation' ? { dataset } : {} }" class="button-secondary">Buka peta ancaman</NuxtLink>
          <NuxtLink :to="queueLink({ priority: 'high' })" class="button-secondary">Tinjau prioritas tinggi</NuxtLink>
          <NuxtLink :to="queueLink({ scope: 'pending_verification' })" class="button-primary">Kelola verifikasi</NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
