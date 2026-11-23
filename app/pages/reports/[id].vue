<script setup lang="ts">
import type { ReportDetailResponse } from '../../../shared/types/report-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { formatReportDate } from '~/utils/dates'
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Detail Laporan — RimbaGuard', robots: 'noindex' })
const route = useRoute()
const id = computed(() => String(route.params.id))
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData(`report-${id.value}`, () => requestFetch<ReportDetailResponse>(`/api/reports/${id.value}`))
const editing = ref(false)
const ready = ref(false)
onMounted(() => { ready.value = true })
const evidenceError = ref(false)
const canEdit = computed(() => data.value?.canEdit === true)
async function saved() { await refresh(); editing.value = false }
</script>

<template>
  <div class="page-container max-w-7xl report-detail py-8 sm:py-10">
    <NuxtLink to="/reports" class="text-link inline-flex min-h-11 items-center text-sm">← Kembali ke daftar laporan</NuxtLink>
    <p v-if="status === 'pending'" role="status" class="mt-8 body-copy">Memuat detail laporan…</p>
    <div v-else-if="error" class="notice mt-8" role="alert"><h1 class="text-xl font-semibold">Detail laporan belum tersedia.</h1><p class="mt-2">Laporan mungkin tidak dapat diakses oleh akun Anda, atau koneksi sedang bermasalah.</p><button type="button" class="text-link mt-4" :disabled="!ready" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data">
      <p v-if="route.query.submitted" role="status" class="notice mt-6">Laporan sudah tersimpan. Nomor laporan Anda: <strong>{{ data.report.reportCode }}</strong>.</p>
      <p v-if="data.report.isSimulation" class="notice mt-6 font-medium">Data simulasi untuk pengujian. Laporan ini dikecualikan dari statistik publik dan peta kejadian.</p>
      <p v-if="data.review" class="notice mt-6">Anda melihat laporan sebagai petugas. <NuxtLink :to="`/admin/reports/${data.report.id}`" class="text-link">Buka halaman tinjauan petugas</NuxtLink> untuk memverifikasi atau menanggapi laporan ini.</p>
      <section v-if="data.reviewerMessage" class="mt-6 rounded-lg border px-5 py-4" :class="data.reviewerMessage.status === 'rejected' ? 'border-alert-red/40 bg-white' : 'border-alert-amber/50 bg-white'" aria-labelledby="reviewer-message">
        <h2 id="reviewer-message" class="font-semibold text-forest-900">{{ data.reviewerMessage.status === 'rejected' ? 'Laporan ditolak petugas' : 'Petugas meminta informasi tambahan' }}</h2>
        <p class="mt-2 whitespace-pre-wrap break-words body-copy">{{ data.reviewerMessage.note }}</p>
        <p class="mt-2 text-xs text-charcoal/75">{{ formatReportDate(data.reviewerMessage.createdAt) }}<template v-if="data.reviewerMessage.status === 'needs_more_information' && canEdit"> · Pilih "Perbaiki informasi" untuk melengkapi laporan. Laporan akan dianalisis ulang setelah disimpan.</template></p>
      </section>
      <header class="report-detail-header mt-6 border-b border-line pb-7"><div class="flex flex-wrap items-center gap-4 text-sm"><span class="font-mono text-charcoal/75">{{ data.report.reportCode }}</span><ReportsReportStatus :status="data.report.status" /></div><h1 class="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-forest-900 sm:text-4xl">{{ data.report.title }}</h1><p class="mt-4 body-copy">{{ THREAT_CATEGORY_LABELS[data.report.category] }} · {{ formatReportDate(data.report.incidentTime) }}</p></header>
      <div v-if="editing" class="mt-10 max-w-3xl"><button type="button" class="text-link mb-7 min-h-11" @click="editing = false">Batal memperbaiki</button><ReportsReportForm :initial="data.report" @saved="saved" /></div>
      <div v-else class="mt-9 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="min-w-0 space-y-9">
          <section><h2 class="text-xl font-semibold text-forest-900">Bukti dan pengamatan</h2><img v-show="!evidenceError" :src="data.evidenceUrl" alt="Foto bukti yang dilampirkan pada laporan" class="mt-5 max-h-[520px] w-full rounded-lg border border-line bg-sage-100 object-contain" @error="evidenceError = true" @load="evidenceError = false"><div v-if="evidenceError" class="notice mt-5" role="status">Foto belum dapat dimuat. <button type="button" class="text-link" @click="evidenceError = false; refresh()">Coba kembali</button></div><p class="mt-5 whitespace-pre-wrap break-words body-copy">{{ data.report.description }}</p><p class="form-hint">Foto bersifat privat. Tautan akses sementara diperbarui saat detail dimuat ulang.</p></section>
          <section class="border-t border-line pt-7"><h2 class="text-xl font-semibold text-forest-900">Lokasi kejadian</h2><p class="mt-3 body-copy">{{ data.report.locationName || 'Lokasi tanpa nama' }}</p><p class="mt-2 font-mono text-sm">{{ data.report.latitude }}, {{ data.report.longitude }}</p><ClientOnly><MapLocationMap :model-value="{ latitude: data.report.latitude, longitude: data.report.longitude }" class="mt-5" /><template #fallback><p class="notice mt-5">Memuat peta lokasi…</p></template></ClientOnly><p class="form-hint">Koordinat persis hanya tersedia bagi pemilik laporan dan petugas.</p></section>
          <ReportsAnalysisPanel :report="data.report" :analyses="data.analyses" :can-analyze="data.canAnalyze" :can-force-analysis="data.canForceAnalysis" :refresh-report="refresh" />
          <ReportsPriorityPanel v-if="data.priorityStatus" :priorities="data.priorities" :status="data.priorityStatus" />
        </div>
        <aside class="report-detail-aside space-y-8">
          <section><h2 class="text-lg font-semibold text-forest-900">Informasi laporan</h2><dl class="mt-5 space-y-4 text-sm"><div><dt class="text-charcoal/75">Dikirim</dt><dd class="mt-1">{{ formatReportDate(data.report.createdAt) }}</dd></div><div><dt class="text-charcoal/75">Terakhir diperbarui</dt><dd class="mt-1">{{ formatReportDate(data.report.updatedAt) }}</dd></div><div><dt class="text-charcoal/75">Visibilitas</dt><dd class="mt-1">{{ data.report.isPublic ? 'Ringkasan disetujui untuk peta publik' : 'Privat · pemilik dan petugas' }}</dd></div></dl><button v-if="canEdit" type="button" class="button-secondary mt-6 w-full" :disabled="!ready" @click="editing = true">Perbaiki informasi</button><button type="button" class="text-link mt-3 min-h-11 text-sm" :disabled="!ready" @click="refresh()">Perbarui status</button></section>
          <section class="border-t border-line pt-7"><h2 class="text-lg font-semibold text-forest-900">Riwayat perkembangan</h2><ReportsTimeline :updates="data.updates" :officer-view="Boolean(data.review)" /></section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.report-detail-header h1 { font-size: clamp(1.875rem,3.2vw,2.5rem); letter-spacing: -0.03em; overflow-wrap: anywhere; }
.report-detail-aside { min-width: 0; align-self: start; border: 1px solid #DCE3D8; border-radius: 0.75rem; background: white; padding: 1.25rem; }
.report-detail :deep(.button-primary), .report-detail :deep(.button-secondary) { border-radius: 999px; }
.report-detail-aside dl { font-size: 0.9375rem; line-height: 1.75rem; }

</style>
