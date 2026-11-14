<script setup lang="ts">
import type { ReportListResponse } from '../../../shared/types/report-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { formatReportDate } from '~/utils/dates'
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Laporan Saya — RimbaGuard AI', robots: 'noindex' })
const { data: session } = await useAuth()
const page = ref(1)
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('reports-list', () => requestFetch<ReportListResponse>('/api/reports', { query: { page: page.value, pageSize: 10 } }), { watch: [page] })
</script>

<template>
  <div class="page-container py-12 sm:py-16">
    <div class="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-8">
      <div><p class="eyebrow">Ruang laporan</p><h1 class="mt-3 text-4xl font-semibold tracking-tight text-forest-900">{{ session?.user?.role === 'admin' ? 'Semua laporan' : 'Laporan saya' }}</h1><p class="mt-4 body-copy">Ikuti status pemeriksaan dan lengkapi informasi ketika diperlukan.</p></div>
      <NuxtLink to="/report" class="button-primary">Buat laporan</NuxtLink>
    </div>
    <p v-if="status === 'pending'" role="status" class="py-10 body-copy">Memuat laporan…</p>
    <div v-else-if="error" role="alert" class="notice mt-8"><p>Laporan belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3" @click="refresh()">Coba kembali</button></div>
    <div v-else-if="data && !data.reports.length" class="max-w-xl py-14"><h2 class="text-2xl font-semibold text-forest-900">Belum ada laporan.</h2><p class="mt-3 body-copy">Saat Anda menemukan indikasi ancaman, kirimkan informasi dan foto melalui formulir pelaporan.</p><NuxtLink to="/report" class="text-link mt-5 inline-flex min-h-11 items-center">Mulai laporan pertama</NuxtLink></div>
    <template v-else-if="data">
      <p class="py-5 text-sm text-charcoal/75">{{ data.total }} laporan dapat diakses</p>
      <ul class="divide-y divide-line border-y border-line">
        <li v-for="report in data.reports" :key="report.id" class="grid gap-4 py-6 sm:grid-cols-[1fr_auto]">
          <div><div class="flex flex-wrap gap-3 text-xs text-charcoal/75"><span class="font-mono">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="font-semibold text-[#855818]">Data simulasi</span><span>{{ THREAT_CATEGORY_LABELS[report.category] }}</span></div><NuxtLink :to="`/reports/${report.id}`" class="mt-2 inline-block text-xl font-semibold text-forest-900 hover:underline">{{ report.title }}</NuxtLink><p class="mt-2 text-sm text-charcoal/75">{{ report.locationName || 'Lokasi tanpa nama' }} · {{ formatReportDate(report.incidentTime) }}</p></div>
          <div class="flex items-start sm:pt-1"><ReportsReportStatus :status="report.status" /></div>
        </li>
      </ul>
      <nav class="mt-7 flex items-center justify-between gap-4" aria-label="Halaman laporan"><button type="button" class="button-secondary" :disabled="page <= 1" @click="page--">Sebelumnya</button><span class="text-sm">Halaman {{ page }} dari {{ Math.max(1, Math.ceil(data.total / data.pageSize)) }}</span><button type="button" class="button-secondary" :disabled="page * data.pageSize >= data.total" @click="page++">Berikutnya</button></nav>
    </template>
  </div>
</template>
