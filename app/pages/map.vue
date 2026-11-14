<script setup lang="ts">
import type { PublicMapReport } from '../../shared/types/domain'
import { THREAT_CATEGORY_LABELS, REPORT_STATUS_LABELS } from '#shared/constants/domain'
import { formatReportDate } from '~/utils/dates'
useSeoMeta({ title: 'Peta Laporan — RimbaGuard AI' })
const route = useRoute()
const { data, status, error, refresh } = await useFetch<{ reports: PublicMapReport[]; limited: boolean; limit: number }>('/api/public/map', { key: 'public-map' })
const selected = computed(() => data.value?.reports.find(report => report.id === route.query.report))
async function select(id: string) { await navigateTo({ path: '/map', query: { report: id } }, { replace: true }) }
</script>

<template>
  <div class="page-container py-10 sm:py-12">
    <header class="flex flex-wrap items-end justify-between gap-5"><div><p class="eyebrow">Pengamatan yang telah ditinjau</p><h1 class="mt-4 text-3xl font-semibold tracking-tight text-forest-900 sm:text-4xl">Peta laporan masyarakat</h1><p class="mt-4 max-w-2xl body-copy">Ringkasan laporan yang disetujui untuk publik. Titik menunjukkan perkiraan lokasi, dengan koordinat persis tetap privat.</p></div><NuxtLink to="/report" class="button-primary">Laporkan ancaman</NuxtLink></header>
    <p v-if="status === 'pending'" role="status" class="notice mt-8">Memuat laporan publik…</p>
    <div v-else-if="error" class="notice mt-8" role="alert"><p>Peta laporan belum dapat dimuat.</p><button type="button" class="text-link mt-3" @click="refresh()">Coba kembali</button></div>
    <div v-else-if="data" class="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div class="min-w-0"><ClientOnly><MapLocationMap :reports="data.reports" :selected-id="selected?.id" @select="select" /><template #fallback><p class="notice min-h-80">Memuat peta…</p></template></ClientOnly><p class="form-hint">Peta berbasis laporan insiden; tidak menampilkan deteksi deforestasi atau pemantauan satelit langsung.</p><p v-if="data.limited" role="status" class="notice mt-3">Menampilkan {{ data.limit }} laporan publik terbaru.</p></div>
      <aside class="min-w-0">
        <section v-if="selected" aria-live="polite"><p class="font-mono text-xs text-charcoal/75">{{ selected.reportCode }}</p><h2 class="mt-3 text-xl font-semibold text-forest-900">{{ THREAT_CATEGORY_LABELS[selected.category] }}</h2><p class="mt-4 body-copy">{{ selected.summary }}</p><dl class="mt-5 space-y-4 text-sm"><div><dt class="text-charcoal/70">Waktu kejadian</dt><dd class="mt-1">{{ formatReportDate(selected.incidentTime) }}</dd></div><div><dt class="text-charcoal/70">Status</dt><dd class="mt-1">{{ REPORT_STATUS_LABELS[selected.status] }}</dd></div><div><dt class="text-charcoal/70">Perkiraan koordinat</dt><dd class="mt-1 font-mono">{{ selected.approximateLatitude }}, {{ selected.approximateLongitude }}</dd></div></dl><NuxtLink to="/map" class="text-link mt-5 inline-flex min-h-11 items-center text-sm">Kembali ke daftar</NuxtLink></section>
        <section v-else><h2 class="text-lg font-semibold text-forest-900">Laporan publik</h2><p v-if="!data.reports.length" class="mt-4 body-copy">Belum ada laporan yang dipublikasikan.</p><p v-else class="mt-3 form-hint">Pilih titik pada peta atau laporan pada daftar untuk membaca ringkasan.</p><ul class="mt-4 max-h-[400px] divide-y divide-line overflow-y-auto"><li v-for="report in data.reports" :key="report.id"><button type="button" class="w-full py-4 text-left hover:text-forest-700" @click="select(report.id)"><span class="font-mono text-xs text-charcoal/70">{{ report.reportCode }}</span><span class="mt-1 block text-sm font-medium">{{ THREAT_CATEGORY_LABELS[report.category] }}</span><span class="mt-2 block text-xs leading-5 text-charcoal/70">{{ formatReportDate(report.incidentTime) }}</span></button></li></ul></section>
      </aside>
    </div>
  </div>
</template>
