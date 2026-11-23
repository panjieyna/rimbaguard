<script setup lang="ts">
import type { ReportDetailResponse } from '../../../../shared/types/report-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { formatReportDate } from '~/utils/dates'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Tinjau Laporan — RimbaGuard', robots: 'noindex' })
const route = useRoute()
const id = computed(() => String(route.params.id))
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData(`admin-report-${id.value}`,
  () => requestFetch<ReportDetailResponse>(`/api/admin/reports/${id.value}`))
const evidenceError = ref(false)
const ready = ref(false)
onMounted(() => { ready.value = true })
</script>

<template>
  <div class="max-w-6xl">
    <NuxtLink to="/admin/reports" class="text-link inline-flex min-h-11 items-center text-sm">← Kembali ke antrean</NuxtLink>
    <p v-if="status === 'pending' && !data" role="status" class="mt-6 body-copy">Memuat laporan…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><h1 class="text-xl font-semibold">Laporan belum dapat dimuat.</h1><p class="mt-2">{{ error.statusCode === 404 ? 'Laporan tidak ditemukan.' : 'Periksa koneksi atau sesi Anda.' }}</p><button type="button" class="text-link mt-3 min-h-11" :disabled="!ready" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data && data.review">
      <p v-if="data.report.isSimulation" class="notice mt-5 font-medium">Data simulasi untuk pengujian. Dikecualikan dari statistik nyata dan tidak dapat dipublikasikan.</p>
      <header class="mt-6 border-b border-line pb-7">
        <div class="flex flex-wrap items-center gap-3 text-sm"><span class="font-mono text-charcoal/75">{{ data.report.reportCode }}</span><ReportsReportStatus :status="data.report.status" /><span v-if="data.report.isPublic" class="rounded bg-sage-100 px-2 py-0.5 text-xs font-medium text-forest-900">Dipublikasikan</span></div>
        <h1 class="mt-3 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-forest-900">{{ data.report.title }}</h1>
        <dl class="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt class="inline text-charcoal/75">Kategori pelapor: </dt><dd class="inline">{{ THREAT_CATEGORY_LABELS[data.report.category] }}</dd></div>
          <div v-if="data.review.officerCategory"><dt class="inline text-charcoal/75">Koreksi petugas: </dt><dd class="inline">{{ THREAT_CATEGORY_LABELS[data.review.officerCategory] }}</dd></div>
          <div><dt class="inline text-charcoal/75">Waktu kejadian: </dt><dd class="inline">{{ formatReportDate(data.report.incidentTime) }}</dd></div>
          <div><dt class="inline text-charcoal/75">Dikirim: </dt><dd class="inline">{{ formatReportDate(data.report.createdAt) }}</dd></div>
          <div><dt class="inline text-charcoal/75">Revisi: </dt><dd class="inline">{{ data.report.revision }}</dd></div>
        </dl>
      </header>

      <div class="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div class="min-w-0 space-y-9">
          <section aria-labelledby="evidence-title"><h2 id="evidence-title" class="text-xl font-semibold text-forest-900">Bukti dan deskripsi</h2><img v-show="!evidenceError" :src="data.evidenceUrl" alt="Foto bukti yang dilampirkan pelapor" class="mt-5 max-h-[520px] w-full rounded-lg border border-line bg-sage-100 object-contain" @error="evidenceError = true" @load="evidenceError = false"><div v-if="evidenceError" class="notice mt-5" role="status">Foto belum dapat dimuat. <button type="button" class="text-link" @click="evidenceError = false; refresh()">Coba kembali</button></div><p class="mt-5 whitespace-pre-wrap break-words body-copy">{{ data.report.description }}</p></section>
          <section class="border-t border-line pt-7" aria-labelledby="location-title"><h2 id="location-title" class="text-xl font-semibold text-forest-900">Lokasi kejadian</h2><p class="mt-3 body-copy">{{ data.report.locationName || 'Lokasi tanpa nama' }}</p><p class="mt-2 font-mono text-sm">{{ data.report.latitude }}, {{ data.report.longitude }}</p><ClientOnly><MapLocationMap :model-value="{ latitude: data.report.latitude, longitude: data.report.longitude }" class="mt-5" /><template #fallback><p class="notice mt-5">Memuat peta lokasi…</p></template></ClientOnly><p class="form-hint">Titik dari pelapor; belum tentu lokasi kejadian yang telah dipastikan. <NuxtLink :to="{ path: '/admin/map', query: { report: data.report.id, dataset: data.report.isSimulation ? 'simulation' : 'real' } }" class="text-link">Lihat di peta prioritas</NuxtLink></p></section>
          <ReportsAnalysisPanel :report="data.report" :analyses="data.analyses" :can-analyze="data.canAnalyze" :can-force-analysis="data.canForceAnalysis" :refresh-report="refresh" />
          <ReportsPriorityPanel v-if="data.priorityStatus" :priorities="data.priorities" :status="data.priorityStatus" />
        </div>
        <aside class="min-w-0 space-y-8" aria-label="Tindakan petugas dan riwayat">
          <AdminReviewActions :report="data.report" :review="data.review" :refresh-report="refresh" />
          <section aria-labelledby="audit-title"><h2 id="audit-title" class="text-lg font-semibold text-forest-900">Riwayat dan audit</h2><p class="form-hint">Setiap tindakan penting tercatat beserta pelaku, status, catatan, dan waktunya.</p><ReportsTimeline :updates="data.updates" officer-view /></section>
        </aside>
      </div>
    </template>
  </div>
</template>
