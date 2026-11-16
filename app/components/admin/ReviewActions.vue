<script setup lang="ts">
import type { ReportDetail, ReportReview } from '../../../shared/types/report-api'
import type { ReportStatus, ThreatCategory } from '../../../shared/types/domain'
import { THREAT_CATEGORIES, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { REPORTER_NOTE_STATUSES, STATUS_ACTION_LABELS, type AdminTargetStatus } from '#shared/constants/workflow'
import { readApiError } from '~/utils/api-error'
import { formatReportDate } from '~/utils/dates'

// The page reloads the report after every action; actions stay disabled until
// the fresh revision arrives, so a follow-up action never uses a stale revision.
const props = defineProps<{ report: ReportDetail; review: ReportReview; refreshReport: () => Promise<unknown> }>()
const id = useId()
const ready = ref(false)
onMounted(() => { ready.value = true })

type Action = 'status' | 'publish' | 'withdraw' | 'category' | 'note'
const busy = ref<Action | null>(null)
const success = ref('')
const failure = ref<{ action: Action; message: string; fields: Record<string, string[]> } | null>(null)

const selectedStatus = ref<AdminTargetStatus | null>(null)
const statusNote = ref('')
const publicSummary = ref('')
const withdrawalNote = ref('')
const category = ref<ThreatCategory | ''>('')
const categoryNote = ref('')
const internalNote = ref('')
watch(() => [props.report.revision, props.review.publicSummary, props.review.officerCategory] as const, () => {
  publicSummary.value = props.review.publicSummary ?? ''
  category.value = props.review.officerCategory ?? ''
}, { immediate: true })

const noteForReporter = computed(() => selectedStatus.value !== null && REPORTER_NOTE_STATUSES.includes(selectedStatus.value))
const isPublished = computed(() => props.report.isPublic)

async function run(action: Action, request: () => Promise<unknown>, message: string, reset: () => void) {
  if (busy.value) return
  busy.value = action
  success.value = ''
  failure.value = null
  try {
    await request()
  }
  catch (error) {
    const result = readApiError(error, 'Tindakan belum berhasil. Laporan tidak berubah; silakan coba lagi.')
    failure.value = { action, message: result.message, fields: result.fields }
    // Conflicts mean someone else changed the report: show the latest state.
    if (result.code === 'REPORT_CONFLICT' || result.code === 'REPORT_NOT_PUBLIC') await reload()
    busy.value = null
    return
  }
  reset()
  await reload()
  success.value = message
  busy.value = null
}

async function reload() {
  try { await props.refreshReport() }
  catch { failure.value = { action: busy.value ?? 'status', message: 'Tindakan tersimpan, tetapi laporan belum dapat dimuat ulang. Muat ulang halaman.', fields: {} } }
}

function chooseStatus(status: ReportStatus) { selectedStatus.value = status as AdminTargetStatus; statusNote.value = ''; failure.value = null }
function submitStatus() {
  const status = selectedStatus.value
  if (!status) return
  void run('status', () => $fetch(`/api/admin/reports/${props.report.id}/status`, {
    method: 'PATCH', body: { expectedRevision: props.report.revision, status, note: statusNote.value || undefined },
  }), `Status diperbarui: ${STATUS_ACTION_LABELS[status].toLowerCase()} berhasil.`, () => { selectedStatus.value = null; statusNote.value = '' })
}
function submitPublication() {
  void run('publish', () => $fetch(`/api/admin/reports/${props.report.id}/publication`, {
    method: 'PUT', body: { expectedRevision: props.report.revision, publicSummary: publicSummary.value },
  }), isPublished.value ? 'Ringkasan publik diperbarui.' : 'Ringkasan dipublikasikan ke peta publik.', () => {})
}
function submitWithdrawal() {
  void run('withdraw', () => $fetch(`/api/admin/reports/${props.report.id}/publication`, {
    method: 'DELETE', body: { expectedRevision: props.report.revision, note: withdrawalNote.value },
  }), 'Publikasi ditarik dari peta publik.', () => { withdrawalNote.value = '' })
}
function submitCategory() {
  void run('category', () => $fetch(`/api/admin/reports/${props.report.id}/category`, {
    method: 'PATCH', body: { expectedRevision: props.report.revision, category: category.value || null, note: categoryNote.value || undefined },
  }), 'Kategori petugas disimpan. Skor prioritas dihitung ulang.', () => { categoryNote.value = '' })
}
function submitNote() {
  void run('note', () => $fetch(`/api/admin/reports/${props.report.id}/notes`, {
    method: 'POST', body: { note: internalNote.value },
  }), 'Catatan internal disimpan.', () => { internalNote.value = '' })
}
const fieldError = (action: Action, field: string) => failure.value?.action === action ? failure.value.fields[field]?.[0] : undefined
</script>

<template>
  <div class="space-y-6">
    <p v-if="success" role="status" class="notice">{{ success }}</p>

    <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="status-actions">
      <h2 id="status-actions" class="text-lg font-semibold text-forest-900">Verifikasi dan penanganan</h2>
      <p v-if="!review.allowedTransitions.length" class="mt-3 text-sm leading-6 text-charcoal/80">
        {{ report.status === 'pending_analysis' ? 'Tunggu hasil analisis AI, atau minta analisis ulang. Tinjauan manual tersedia setelah analisis selesai atau gagal.'
          : report.status === 'needs_more_information' ? 'Menunggu pelapor melengkapi informasi. Laporan akan kembali dianalisis setelah diperbaiki.'
            : 'Status ini sudah final. Tidak ada perubahan status lanjutan.' }}
      </p>
      <div v-else class="mt-4 flex flex-wrap gap-2">
        <button v-for="status in review.allowedTransitions" :key="status" type="button" class="min-h-11" :class="selectedStatus === status ? 'button-primary' : 'button-secondary'" :aria-pressed="selectedStatus === status" :disabled="!ready || Boolean(busy)" @click="chooseStatus(status)">{{ STATUS_ACTION_LABELS[status as AdminTargetStatus] }}</button>
      </div>
      <form v-if="selectedStatus" class="mt-4" @submit.prevent="submitStatus">
        <label :for="`${id}-status-note`" class="form-label">{{ noteForReporter ? 'Alasan atau permintaan untuk pelapor' : 'Catatan petugas (opsional)' }}</label>
        <textarea :id="`${id}-status-note`" v-model="statusNote" class="form-input min-h-24" maxlength="2000" :required="noteForReporter" :aria-invalid="Boolean(fieldError('status', 'note'))" :aria-describedby="`${id}-status-hint`" />
        <p :id="`${id}-status-hint`" class="form-hint">{{ noteForReporter ? 'Catatan ini terlihat oleh pelapor. Minimal 5 karakter; jangan memuat data internal.' : 'Catatan ini hanya terlihat oleh petugas.' }}</p>
        <p v-if="fieldError('status', 'note')" class="form-error">{{ fieldError('status', 'note') }}</p>
        <div class="mt-3 flex flex-wrap gap-2"><button type="submit" class="button-primary" :disabled="Boolean(busy)">{{ busy === 'status' ? 'Menyimpan…' : `Konfirmasi: ${STATUS_ACTION_LABELS[selectedStatus]}` }}</button><button type="button" class="button-secondary" :disabled="Boolean(busy)" @click="selectedStatus = null">Batal</button></div>
      </form>
      <p v-if="failure?.action === 'status'" role="alert" class="form-error">{{ failure.message }}</p>
    </section>

    <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="publication-actions">
      <h2 id="publication-actions" class="text-lg font-semibold text-forest-900">Publikasi peta publik</h2>
      <p v-if="review.publication === 'simulation'" class="mt-3 text-sm leading-6 text-charcoal/80">Data simulasi tidak dapat dipublikasikan ke peta publik.</p>
      <p v-else-if="review.publication === 'status' && !isPublished" class="mt-3 text-sm leading-6 text-charcoal/80">Publikasi tersedia setelah laporan diverifikasi. Laporan yang ditolak atau belum diperiksa tetap privat.</p>
      <template v-else>
        <p class="mt-3 text-sm leading-6 text-charcoal/80">{{ isPublished ? `Dipublikasikan sejak ${formatReportDate(review.publishedAt!)}.` : 'Belum dipublikasikan.' }} Publik hanya melihat ringkasan ini, kategori, status, waktu, dan koordinat yang dibulatkan sekitar 1 km.</p>
        <form class="mt-4" @submit.prevent="submitPublication">
          <label :for="`${id}-summary`" class="form-label">Ringkasan publik</label>
          <textarea :id="`${id}-summary`" v-model="publicSummary" class="form-input min-h-28" minlength="10" maxlength="500" required :aria-invalid="Boolean(fieldError('publish', 'publicSummary'))" :aria-describedby="`${id}-summary-hint`" />
          <p :id="`${id}-summary-hint`" class="form-hint">10–500 karakter. Jangan sertakan identitas pelapor, koordinat persis, atau catatan internal. {{ publicSummary.trim().length }}/500</p>
          <p v-if="fieldError('publish', 'publicSummary')" class="form-error">{{ fieldError('publish', 'publicSummary') }}</p>
          <button type="submit" class="button-primary mt-3" :disabled="Boolean(busy)">{{ busy === 'publish' ? 'Menyimpan…' : isPublished ? 'Perbarui ringkasan publik' : 'Publikasikan ke peta publik' }}</button>
        </form>
        <p v-if="failure?.action === 'publish'" role="alert" class="form-error">{{ failure.message }}</p>
      </template>
      <form v-if="isPublished" class="mt-5 border-t border-line pt-4" @submit.prevent="submitWithdrawal">
        <label :for="`${id}-withdraw`" class="form-label">Alasan menarik publikasi</label>
        <textarea :id="`${id}-withdraw`" v-model="withdrawalNote" class="form-input min-h-20" minlength="5" maxlength="2000" required :aria-invalid="Boolean(fieldError('withdraw', 'note'))" />
        <p class="form-hint">Hanya terlihat oleh petugas. Ringkasan disimpan sebagai draf.</p>
        <button type="submit" class="button-secondary mt-3" :disabled="Boolean(busy)">{{ busy === 'withdraw' ? 'Menarik…' : 'Tarik dari peta publik' }}</button>
        <p v-if="failure?.action === 'withdraw'" role="alert" class="form-error">{{ failure.message }}</p>
      </form>
    </section>

    <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="category-actions">
      <h2 id="category-actions" class="text-lg font-semibold text-forest-900">Kategori petugas</h2>
      <p class="mt-3 text-sm leading-6 text-charcoal/80">Pilihan pelapor: {{ THREAT_CATEGORY_LABELS[report.category] }}. Koreksi petugas menggantikan kategori AI dan pelapor dalam skor prioritas.</p>
      <form class="mt-4" @submit.prevent="submitCategory">
        <label :for="`${id}-category`" class="form-label">Kategori menurut petugas</label>
        <select :id="`${id}-category`" v-model="category" class="form-input"><option value="">Tanpa koreksi (AI/pelapor)</option><option v-for="item in THREAT_CATEGORIES" :key="item" :value="item">{{ THREAT_CATEGORY_LABELS[item] }}</option></select>
        <label :for="`${id}-category-note`" class="form-label mt-3">Alasan (opsional)</label>
        <input :id="`${id}-category-note`" v-model="categoryNote" class="form-input" maxlength="1800">
        <button type="submit" class="button-secondary mt-3" :disabled="Boolean(busy) || (category || null) === review.officerCategory">{{ busy === 'category' ? 'Menyimpan…' : 'Simpan kategori' }}</button>
        <p v-if="failure?.action === 'category'" role="alert" class="form-error">{{ failure.message }}</p>
      </form>
    </section>

    <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="note-actions">
      <h2 id="note-actions" class="text-lg font-semibold text-forest-900">Catatan internal</h2>
      <form class="mt-3" @submit.prevent="submitNote">
        <label :for="`${id}-note`" class="form-label">Catatan untuk sesama petugas</label>
        <textarea :id="`${id}-note`" v-model="internalNote" class="form-input min-h-20" minlength="5" maxlength="2000" required :aria-invalid="Boolean(fieldError('note', 'note'))" />
        <p class="form-hint">Tidak pernah terlihat oleh pelapor atau publik.</p>
        <p v-if="fieldError('note', 'note')" class="form-error">{{ fieldError('note', 'note') }}</p>
        <button type="submit" class="button-secondary mt-3" :disabled="Boolean(busy)">{{ busy === 'note' ? 'Menyimpan…' : 'Tambah catatan' }}</button>
        <p v-if="failure?.action === 'note'" role="alert" class="form-error">{{ failure.message }}</p>
      </form>
    </section>
  </div>
</template>
