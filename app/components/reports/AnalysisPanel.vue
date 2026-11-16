<script setup lang="ts">
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { analysisFailureMessage } from '#shared/constants/analysis'
import type { AnalyzeReportResponse, ReportAnalysis, ReportDetail } from '../../../shared/types/report-api'
import { readApiError } from '~/utils/api-error'
import { formatReportDate } from '~/utils/dates'

const props = defineProps<{
  report: ReportDetail
  analyses: ReportAnalysis[]
  canAnalyze: boolean
  canForceAnalysis: boolean
  refreshReport: () => Promise<unknown>
}>()
const intent = useAnalysisIntent()
const ready = ref(false)
const pending = ref(false)
const message = ref('')
const now = ref(Date.now())
// Officer decisions also increment the revision, but AI output describes the
// report content, so an attempt stays current until the content changes.
const isCurrent = (row: ReportAnalysis) => row.reportRevision >= props.report.contentRevision
const currentAttempts = computed(() => props.analyses.filter(isCurrent))
const latest = computed(() => currentAttempts.value[0])
const successful = computed(() => currentAttempts.value.find(row => row.analysisStatus === 'succeeded'))
const processing = computed(() => Boolean(latest.value && ['pending', 'processing'].includes(latest.value.analysisStatus)))
const expired = computed(() => processing.value && Date.parse(latest.value!.processingExpiresAt || new Date(Date.parse(latest.value!.createdAt) + 120_000).toISOString()) <= now.value)
const canRequest = computed(() => props.canAnalyze && (!processing.value || expired.value))
const riskLabels = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah', uncertain: 'Belum dapat ditentukan' }
const attemptLabels = { pending: 'Menunggu', processing: 'Sedang dianalisis', succeeded: 'Selesai', failed: 'Gagal' }
let timer: ReturnType<typeof setTimeout> | undefined
let polls = 0

function categoryLabel(analysis: ReportAnalysis) {
  return analysis.category === 'uncertain' || !analysis.category ? 'Belum dapat ditentukan' : THREAT_CATEGORY_LABELS[analysis.category]
}
function schedulePoll() {
  clearTimeout(timer)
  if (!ready.value || !processing.value || expired.value || polls >= 24) return
  timer = setTimeout(async () => {
    polls++
    now.value = Date.now()
    try { await props.refreshReport() }
    catch { message.value = 'Status analisis belum dapat diperbarui. Muat ulang untuk memeriksanya.' }
    finally { schedulePoll() }
  }, 5_000)
}
async function analyze(force = false) {
  if (pending.value || !canRequest.value) return
  pending.value = true
  message.value = ''
  try {
    await $fetch<AnalyzeReportResponse>(`/api/reports/${props.report.id}/analyze`, {
      method: 'POST', retry: 0, timeout: 90_000,
      body: { expectedRevision: props.report.revision, force },
    })
    await props.refreshReport()
  }
  catch (error) {
    message.value = readApiError(error, 'Analisis belum dapat dikonfirmasi. Laporan tetap tersimpan; muat ulang untuk memeriksa statusnya.').message
    try { await props.refreshReport() } catch { /* Preserve the safe action error. */ }
  }
  finally { pending.value = false; now.value = Date.now(); schedulePoll() }
}
function consumeSavedReportIntent() {
  if (!ready.value || !intent.value || intent.value.reportId !== props.report.id) return
  const savedRevision = intent.value.revision
  if (savedRevision > props.report.revision) return
  intent.value = null
  if (savedRevision === props.report.revision && props.report.status === 'pending_analysis' && canRequest.value) void analyze()
}
onMounted(() => { ready.value = true; consumeSavedReportIntent(); schedulePoll() })
watch(() => [props.report.id, props.report.revision, intent.value], consumeSavedReportIntent)
watch(() => latest.value?.id, () => { polls = 0; schedulePoll() })
watch(() => latest.value?.analysisStatus, schedulePoll)
onBeforeUnmount(() => { ready.value = false; clearTimeout(timer) })
</script>

<template>
  <section class="border-t border-line pt-7" aria-labelledby="analysis-heading" :aria-busy="pending || (processing && !expired)">
    <h2 id="analysis-heading" class="text-xl font-semibold text-forest-900">Analisis awal AI</h2>
    <p class="form-hint">Analisis membantu pemeriksaan awal. Validitas laporan dan tindak lanjut tetap memerlukan verifikasi petugas.</p>
    <p v-if="pending || (processing && !expired)" role="status" class="notice mt-4">Foto dan pengamatan sedang dianalisis. Laporan sudah tersimpan; status dapat diperiksa kembali setelah halaman dibuka ulang.</p>
    <p v-else-if="expired" role="status" class="notice mt-4">Proses sebelumnya belum selesai dalam batas waktunya. Coba lagi untuk memulai percobaan baru.</p>
    <p v-if="message" role="alert" class="form-error mt-4">{{ message }}</p>
    <p v-if="latest?.analysisStatus === 'failed'" role="status" class="notice mt-4">{{ analysisFailureMessage(latest.errorCode) }}</p>

    <div v-if="successful" class="mt-6 space-y-5">
      <p v-if="latest?.id !== successful.id" class="form-hint">Hasil berhasil sebelumnya untuk isi laporan ini ditampilkan di bawah.</p>
      <dl class="grid gap-5 sm:grid-cols-2">
        <div><dt class="text-sm text-charcoal/75">Kategori indikasi</dt><dd class="mt-1 font-medium">{{ categoryLabel(successful) }}</dd></div>
        <div><dt class="text-sm text-charcoal/75">Risiko menurut model</dt><dd class="mt-1 font-medium">{{ successful.riskLevel ? riskLabels[successful.riskLevel] : 'Belum tersedia' }}</dd></div>
      </dl>
      <div><h3 class="text-sm font-semibold">Pengamatan visual</h3><p class="mt-2 whitespace-pre-wrap body-copy">{{ successful.visualObservation }}</p></div>
      <div><h3 class="text-sm font-semibold">Indikator yang disebut model</h3><ul v-if="successful.detectedIndicators.length" class="mt-2 list-disc space-y-1 pl-5 text-sm leading-6"><li v-for="(indicator, index) in successful.detectedIndicators" :key="index">{{ indicator }}</li></ul><p v-else class="mt-2 body-copy">Model tidak menyebut indikator visual yang cukup jelas.</p></div>
      <div><h3 class="text-sm font-semibold">Ringkasan alasan</h3><p class="mt-2 whitespace-pre-wrap body-copy">{{ successful.reasoningSummary }}</p></div>
      <div class="notice"><h3 class="font-semibold">Saran pemeriksaan</h3><p class="mt-2 whitespace-pre-wrap">{{ successful.recommendation }}</p></div>
      <p v-if="successful.confidence !== null" class="form-hint">Skor keyakinan model: {{ Math.round(successful.confidence * 100) }}%. Ini merupakan penilaian diri model yang belum terkalibrasi secara statistik.</p>
      <p class="form-hint">Hasil ini tetap memerlukan verifikasi manusia.</p>
    </div>
    <p v-else-if="!pending && !processing && latest?.analysisStatus !== 'failed'" class="mt-4 body-copy">Isi laporan saat ini belum memiliki hasil analisis. Foto dan laporan tetap tersimpan secara privat.</p>

    <button v-if="canRequest" type="button" class="button-secondary mt-5" :disabled="pending || !ready" @click="analyze(canForceAnalysis && Boolean(successful || !['pending_analysis', 'analysis_failed'].includes(report.status)))">{{ pending ? 'Menganalisis…' : successful ? 'Analisis ulang' : latest ? 'Coba analisis lagi' : 'Analisis bukti' }}</button>
    <details v-if="analyses.length" class="mt-6 border-t border-line pt-4">
      <summary class="min-h-11 cursor-pointer content-center text-sm font-medium">Riwayat percobaan analisis ({{ analyses.length }})</summary>
      <ol class="mt-4 space-y-5">
        <li v-for="attempt in analyses" :key="attempt.id" class="border-l border-line pl-4 text-sm leading-6">
          <p class="font-medium">{{ attemptLabels[attempt.analysisStatus] }} · Revisi {{ attempt.reportRevision }}{{ isCurrent(attempt) ? ' · isi laporan saat ini' : ' · sebelum laporan diperbaiki' }}</p>
          <p class="text-charcoal/75">{{ formatReportDate(attempt.completedAt || attempt.createdAt) }}</p>
          <p v-if="attempt.analysisStatus === 'failed'" class="mt-1">{{ analysisFailureMessage(attempt.errorCode) }}</p>
          <p v-if="!isCurrent(attempt) && attempt.analysisStatus === 'succeeded'" class="mt-1 whitespace-pre-wrap">{{ attempt.visualObservation }}</p>
          <p class="mt-1 text-xs text-charcoal/70">{{ attempt.modelName }} · {{ attempt.promptVersion }}</p>
        </li>
      </ol>
    </details>
  </section>
</template>
