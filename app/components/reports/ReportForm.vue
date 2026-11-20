<script setup lang="ts">
import { createReportSchema, uploadDeclarationSchema } from '#shared/schemas/reports'
import { THREAT_CATEGORIES, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import type { ReportDetail, ReportCreatedResponse as ReportCreateResponse } from '../../../shared/types/report-api'
import type { AssistantDraft } from '../../../shared/types/report-assistant'
import { getFieldErrors, readApiError } from '~/utils/api-error'
import { localDateTime } from '~/utils/dates'

const props = defineProps<{ initial?: ReportDetail }>()
const emit = defineEmits<{ saved: [id: string] }>()
const form = reactive({
  title: props.initial?.title ?? '', category: props.initial?.category ?? '',
  description: props.initial?.description ?? '', locationName: props.initial?.locationName ?? '',
  latitude: props.initial ? String(props.initial.latitude) : '', longitude: props.initial ? String(props.initial.longitude) : '', incidentTime: '',
})
const fields = ref<Record<string, string[]>>({})
const message = ref('')
const uploadMessage = ref('')
const locationMessage = ref('')
const file = shallowRef<File | null>(null)
const preview = ref('')
const pending = ref(false)
const locating = ref(false)
const progress = ref('')
const ready = ref(false)
const assistantMode = ref(!props.initial)
const assistantBusy = ref(false)
const assistantStep = ref(1)
const assistantDraft = shallowRef<AssistantDraft|null>(null)
const reviewConfirmed = ref(false)
const evidenceUpload = useEvidenceUpload()
let disposed = false
const analysisIntent = useAnalysisIntent()
const evidencePath = ref(props.initial?.evidencePath ?? '')
let submissionKey = ''
const point = computed({
  get() {
    if (String(form.latitude).trim() === '' || String(form.longitude).trim() === '') return null
    const latitude = Number(form.latitude), longitude = Number(form.longitude)
    return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null
  },
  set(value: { latitude: number; longitude: number } | null) {
    if (value) { form.latitude = String(value.latitude); form.longitude = String(value.longitude) }
  },
})
onMounted(() => { form.incidentTime = localDateTime(props.initial ? new Date(props.initial.incidentTime) : new Date()); submissionKey = crypto.randomUUID(); ready.value = true })
onBeforeUnmount(() => { disposed = true; if (preview.value) URL.revokeObjectURL(preview.value) })

function chooseImage(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  uploadMessage.value = ''
  evidenceUpload.reset()
  assistantDraft.value=null; reviewConfirmed.value=false
  if (preview.value) { URL.revokeObjectURL(preview.value); preview.value = '' }
  file.value = null
  evidencePath.value = props.initial?.evidencePath ?? ''
  if (!selected) return
  const result = uploadDeclarationSchema.safeParse({ fileName: selected.name, mimeType: selected.type, size: selected.size })
  if (!result.success) { uploadMessage.value = result.error.issues[0]?.message || 'Foto tidak valid.'; return }
  file.value = selected
  evidencePath.value = ''
  preview.value = URL.createObjectURL(selected)
}
function locate() {
  if (locating.value || pending.value) return
  locationMessage.value = ''
  if (!window.isSecureContext) { locationMessage.value = 'Lokasi otomatis memerlukan koneksi HTTPS. Pilih titik pada peta atau isi koordinat.'; return }
  if (!navigator.geolocation) { locationMessage.value = 'Browser tidak mendukung GPS. Pilih titik pada peta atau isi koordinat.'; return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(position => {
    if (disposed) return
    point.value = { latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) }
    locationMessage.value = `Lokasi perangkat diperoleh (akurasi sekitar ${Math.round(position.coords.accuracy)} meter). Pastikan titik sesuai lokasi kejadian.`
    locating.value = false
  }, error => {
    if (disposed) return
    locationMessage.value = error.code === 1 ? 'Izin lokasi ditolak. Izinkan lokasi melalui pengaturan browser, atau pilih titik pada peta.' : error.code === 3 ? 'Pencarian lokasi terlalu lama. Coba kembali, pilih titik pada peta, atau isi koordinat.' : 'Lokasi belum dapat diperoleh. Pastikan layanan lokasi perangkat aktif, atau pilih titik pada peta.'
    locating.value = false
  }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 })
}

async function submit() {
  if (pending.value || locating.value || !ready.value || assistantMode.value) return
  message.value = ''
  if (assistantDraft.value && !reviewConfirmed.value) {
    message.value='Periksa seluruh isian dan konfirmasikan draf sebelum mengirim.'
    return
  }
  const incident = new Date(form.incidentTime)
  const input = {
    title: form.title, category: form.category, description: form.description,
    evidencePath: evidencePath.value || '00000000-0000-4000-8000-000000000000/sealed/00000000-0000-4000-8000-000000000000.jpg',
    latitude: String(form.latitude).trim() === '' ? undefined : Number(form.latitude), longitude: String(form.longitude).trim() === '' ? undefined : Number(form.longitude),
    incidentTime: Number.isFinite(incident.getTime()) ? incident.toISOString() : '',
    ...(form.locationName.trim() ? { locationName: form.locationName } : {}),
  }
  const validated = createReportSchema().safeParse(input)
  fields.value = validated.success ? {} : getFieldErrors(validated.error)
  if (!file.value && !evidencePath.value) fields.value.evidencePath = ['Tambahkan foto bukti.']
  if (uploadMessage.value) fields.value.evidencePath = [uploadMessage.value]
  if (!validated.success || Object.keys(fields.value).length) return
  pending.value = true
  try {
    if (file.value && !evidencePath.value) {
      const finalized = await evidenceUpload.upload(file.value,text=>{progress.value=text})
      evidencePath.value = finalized.evidencePath
    }
    progress.value = 'Menyimpan laporan…'
    const body = { ...validated.data, evidencePath: evidencePath.value }
    if (props.initial) {
      const result = await $fetch<{ report: ReportDetail }>(`/api/reports/${props.initial.id}`, { method: 'PATCH', retry: 0, timeout: 45_000, body: { ...body, expectedRevision: props.initial.revision } })
      analysisIntent.value = { reportId: result.report.id, revision: result.report.revision }
      emit('saved', result.report.id)
    }
    else {
      const result = await $fetch<ReportCreateResponse>('/api/reports', { method: 'POST', retry: 0, timeout: 45_000, headers: { 'Idempotency-Key': submissionKey || crypto.randomUUID() }, body: { ...body, ...(assistantDraft.value ? { assistant: { draftId:assistantDraft.value.id,expectedVersion:assistantDraft.value.version,confirmed:reviewConfirmed.value } } : {}) } })
      analysisIntent.value = { reportId: result.report.id, revision: result.report.revision }
      emit('saved', result.report.id)
    }
  }
  catch (error) {
    const failure = readApiError(error, 'Penyimpanan laporan belum dapat dikonfirmasi. Isian Anda tetap tersedia; silakan coba lagi.')
    message.value = failure.message; fields.value = failure.fields
    if (failure.code === 'EVIDENCE_EXPIRED') {
      evidencePath.value=''; evidenceUpload.reset(); assistantDraft.value=null; reviewConfirmed.value=false
      message.value='Batas waktu foto berakhir. Pilih ulang foto atau mulai bantuan AI kembali. Isian Anda tetap tersedia.'
    }
  }
  finally { pending.value = false; progress.value = '' }
}

function showReview(draft:AssistantDraft,originalFile:File|null) {
  assistantDraft.value=draft; assistantMode.value=false; assistantBusy.value=false; assistantStep.value=3
  form.title=draft.result?.suggested_title ?? ''
  form.description=draft.description
  form.category=draft.result?.suggested_category && draft.result.suggested_category!=='uncertain' ? draft.result.suggested_category : ''
  file.value=originalFile; evidencePath.value=draft.evidencePath
  if(preview.value) URL.revokeObjectURL(preview.value)
  preview.value=originalFile ? URL.createObjectURL(originalFile) : draft.evidenceUrl ?? ''
  reviewConfirmed.value=false; fields.value={};message.value=''
  nextTick(()=>document.getElementById('report-review-heading')?.focus())
}
function showManual(input:{story:string;file:File|null;evidencePath:string;evidenceUrl:string|null}) {
  form.description=input.story;file.value=input.file;evidencePath.value=input.evidencePath
  if(preview.value) URL.revokeObjectURL(preview.value)
  preview.value=input.file ? URL.createObjectURL(input.file) : input.evidenceUrl ?? ''
  assistantMode.value=false;assistantBusy.value=false;assistantDraft.value=null;reviewConfirmed.value=false
}
watch(form,()=>{ reviewConfirmed.value=false })
</script>

<template>
  <form novalidate class="report-form" :aria-busy="pending" @submit.prevent="submit">
    <ol v-if="!initial && (assistantMode || assistantDraft)" class="report-steps" aria-label="Tahapan bantuan AI"><li :aria-current="assistantStep===1 ? 'step' : undefined"><span>1</span>Foto dan cerita</li><li :aria-current="assistantStep===2 ? 'step' : undefined"><span>2</span>Lengkapi informasi</li><li :aria-current="assistantStep===3 ? 'step' : undefined"><span>3</span>Periksa dan kirim</li></ol>
    <ReportsDraftAssistant v-if="assistantMode" :initial-story="form.description" :initial-file="file" @busy="assistantBusy=$event" @stage="assistantStep=$event" @review="showReview" @manual="showManual" />
    <template v-else>
    <div v-if="!initial" class="report-review-intro"><div><h2 v-if="assistantDraft" id="report-review-heading" tabindex="-1">Draf siap Anda periksa.</h2><h2 v-else>Isi laporan sesuai pengamatan Anda.</h2><p>{{ assistantDraft ? 'Periksa judul, kategori dan cerita, lalu lengkapi waktu serta lokasi kejadian. Laporan belum dikirim ke petugas.' : 'Lengkapi informasi, foto dan lokasi. Bantuan AI tersedia bila Anda membutuhkannya.' }}</p></div><button type="button" class="text-link" :disabled="pending" @click="assistantMode=true; assistantStep=1">{{ assistantDraft ? 'Kembali ke asisten' : 'Gunakan bantuan AI' }}</button></div>
    <p v-if="assistantDraft?.result?.suggested_category === 'uncertain'" class="notice">AI belum dapat menyarankan kategori dengan cukup jelas. Pilih kategori yang paling sesuai dengan pengamatan Anda; petugas akan memeriksanya kembali.</p>
    <fieldset id="report-information" :disabled="pending || !ready" class="form-section">
      <legend class="section-legend"><span aria-hidden="true">01</span>Informasi kejadian</legend>
      <div><label for="report-title" class="form-label">Judul laporan</label><input id="report-title" v-model="form.title" class="form-input" maxlength="160" required :aria-invalid="Boolean(fields.title)" aria-describedby="title-error"><p v-if="fields.title" id="title-error" class="form-error">{{ fields.title[0] }}</p></div>
      <div><label for="report-category" class="form-label">Kategori ancaman</label><select id="report-category" v-model="form.category" class="form-input" required :aria-invalid="Boolean(fields.category)" aria-describedby="category-error"><option disabled value="">Pilih kategori</option><option v-for="category in THREAT_CATEGORIES" :key="category" :value="category">{{ THREAT_CATEGORY_LABELS[category] }}</option></select><p v-if="fields.category" id="category-error" class="form-error">{{ fields.category[0] }}</p></div>
      <div><label for="report-description" class="form-label">Deskripsi kejadian</label><textarea id="report-description" v-model="form.description" class="form-input min-h-40 resize-y" minlength="20" maxlength="4000" required :aria-invalid="Boolean(fields.description)" aria-describedby="description-hint description-error" /><p id="description-hint" class="form-hint">Jelaskan apa yang Anda lihat. Hindari menyertakan identitas pribadi orang lain.</p><p v-if="fields.description" id="description-error" class="form-error">{{ fields.description[0] }}</p></div>
      <div><label for="incident-time" class="form-label">Waktu kejadian</label><input id="incident-time" v-model="form.incidentTime" type="datetime-local" class="form-input" required :aria-invalid="Boolean(fields.incidentTime)" aria-describedby="incident-hint incident-error"><p id="incident-hint" class="form-hint">Menggunakan zona waktu perangkat Anda. Waktu kejadian tidak boleh di masa depan.</p><p v-if="fields.incidentTime" id="incident-error" class="form-error">{{ fields.incidentTime[0] }}</p></div>
    </fieldset>
    <fieldset id="report-evidence" :disabled="pending || !ready" class="form-section evidence-section">
      <legend class="section-legend"><span aria-hidden="true">02</span>Bukti foto</legend>
      <div><label for="evidence-image" class="form-label">Foto bukti{{ initial || evidencePath ? ' pengganti (opsional)' : '' }}</label><input id="evidence-image" type="file" accept="image/jpeg,image/png,image/webp" class="form-input file:mr-4 file:rounded file:border-0 file:bg-sage-100 file:px-3 file:py-1 file:text-forest-900" :required="!initial && !evidencePath" :aria-invalid="Boolean(fields.evidencePath || uploadMessage)" aria-describedby="image-hint image-error" @change="chooseImage"><p id="image-hint" class="form-hint">JPEG, PNG, atau WebP; maksimal 5 MB. Bukti hanya dapat dilihat pemilik laporan dan petugas.</p><p v-if="uploadMessage || fields.evidencePath" id="image-error" class="form-error">{{ uploadMessage || fields.evidencePath?.[0] }}</p><p v-if="evidencePath && !initial" class="form-hint">Foto yang digunakan asisten sudah disiapkan. Pilih pengganti hanya jika ingin mengganti bukti.</p></div>
      <img v-if="preview" :src="preview" alt="Pratinjau foto yang dipilih untuk laporan" class="max-h-64 max-w-full rounded-lg border border-line object-contain">
      <p v-else-if="initial" class="form-hint">Foto yang sudah tersimpan akan dipertahankan jika Anda tidak memilih pengganti.</p>
    </fieldset>
    <fieldset id="report-location" :disabled="pending || !ready" class="form-section location-section">
      <legend class="section-legend"><span aria-hidden="true">03</span>Lokasi kejadian</legend>
      <p class="section-description">Sedang berada di lokasi kejadian? Gunakan lokasi Anda, lalu pastikan titik pada peta sudah sesuai.</p>
      <div class="location-action"><button type="button" class="button-primary locate-button" :disabled="locating" :aria-busy="locating" aria-describedby="location-permission" @click="locate"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>{{ locating ? 'Mencari lokasi…' : 'Gunakan lokasi saya' }}</button><p id="location-permission">Browser akan meminta izin lokasi. Anda juga bisa langsung memilih titik pada peta.</p></div>
      <p v-if="locationMessage" role="status" class="location-feedback">{{ locationMessage }}</p>
      <p class="map-instruction"><strong>{{ point ? 'Titik kejadian sudah dipilih' : 'Pilih titik kejadian' }}</strong><span>Klik atau ketuk peta untuk {{ point ? 'mengubah titik.' : 'menentukan lokasi.' }} Lokasi kejadian bisa berbeda dari lokasi perangkat.</span></p>
      <ClientOnly><MapLocationMap v-model="point" selectable /><template #fallback><p class="notice">Memuat pemilih lokasi… Koordinat juga dapat diisi secara manual.</p></template></ClientOnly>
      <div class="grid gap-5 sm:grid-cols-2">
        <div><label for="latitude" class="form-label">Lintang</label><input id="latitude" v-model="form.latitude" type="number" step="any" min="-90" max="90" class="form-input" required :aria-invalid="Boolean(fields.latitude)" aria-describedby="latitude-error"><p v-if="fields.latitude" id="latitude-error" class="form-error">{{ fields.latitude[0] }}</p></div>
        <div><label for="longitude" class="form-label">Bujur</label><input id="longitude" v-model="form.longitude" type="number" step="any" min="-180" max="180" class="form-input" required :aria-invalid="Boolean(fields.longitude)" aria-describedby="longitude-error"><p v-if="fields.longitude" id="longitude-error" class="form-error">{{ fields.longitude[0] }}</p></div>
      </div>
      <div><label for="location-name" class="form-label">Nama lokasi (opsional)</label><input id="location-name" v-model="form.locationName" class="form-input" maxlength="160" :aria-invalid="Boolean(fields.locationName)" aria-describedby="location-name-error"><p v-if="fields.locationName" id="location-name-error" class="form-error">{{ fields.locationName[0] }}</p></div>
    </fieldset>
    <div class="report-submit">
      <label v-if="assistantDraft" class="report-confirmation"><input v-model="reviewConfirmed" type="checkbox" :disabled="pending || locating"><span>Saya telah memeriksa draf, foto, waktu, dan lokasi. Isinya sesuai dengan informasi yang saya ketahui.</span></label>
      <p v-if="message" role="alert" class="form-error mb-5">{{ message }}</p>
      <button type="submit" class="button-primary min-w-48" :disabled="pending || locating || !ready">{{ pending ? progress : initial ? 'Simpan perbaikan' : 'Kirim laporan' }}<svg v-if="!pending" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></button>
      <p class="form-hint max-w-2xl">Laporan disimpan terlebih dahulu dan tetap memerlukan pemeriksaan petugas. Hindari mendekati kejadian berbahaya untuk mengumpulkan bukti.</p>
    </div>
    </template>
  </form>
</template>

<style scoped>
.report-form { display: grid; min-width: 0; gap: 1.75rem; }
.report-steps { display: grid; gap: 0.75rem; font-size: 0.9375rem; line-height: 1.5rem; color: #52634A; }
.report-steps > li { display: flex; align-items: center; justify-content: center; gap: 0.5rem; min-width: 0; text-align: center; }
.report-steps span { display: inline-flex; width: 1.75rem; height: 1.75rem; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; background: #E4ECDD; font-weight: 600; }
.report-steps [aria-current=step] { font-weight: 600; color: #173D32; }
.report-steps [aria-current=step] > span { background: #285C48; color: white; }
.report-review-intro { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; }
.report-review-intro > div { flex: 1 1 28rem; }
.report-review-intro h2 { font-size: 1.375rem; font-weight: 600; line-height: 1.875rem; color: #173D32; }
.report-review-intro p { margin-top: 0.5rem; font-size: 1rem; line-height: 1.75rem; color: #50604B; }
.report-review-intro button { min-height: 2.75rem; }
.report-confirmation { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 1.25rem; font-size: 1rem; line-height: 1.75rem; color: #244736; cursor: pointer; }
.report-confirmation input { width: 1.25rem; height: 1.25rem; flex-shrink: 0; margin-top: 0.25rem; accent-color: #285C48; }
.form-section { min-width: 0; margin: 0; border: 1px solid #D1DDCB; border-radius: 1rem; background: #F0F4EB; padding: 1rem 1.25rem 1.5rem; scroll-margin-top: 2rem; }
.form-section > div, .form-section > p { margin-top: 1.25rem; }
.section-legend { max-width: 100%; padding: 0.375rem 0.5rem; font-size: 1.25rem; line-height: 1.875rem; font-weight: 600; color: #173D32; }
.section-legend > span { display: inline-flex; width: 2rem; height: 2rem; align-items: center; justify-content: center; margin-right: 0.625rem; border-radius: 0.5rem; background: #D6E4CF; font-size: 0.875rem; vertical-align: middle; }
.report-form :deep(.form-label) { font-size: 1rem; font-weight: 600; color: #244736; }
.report-form :deep(.form-input) { min-width: 0; min-height: 3.25rem; border-color: #BBCAB5; border-radius: 0.625rem; font-size: 1rem; }
.report-form :deep(.form-input[aria-invalid="true"]) { border-color: #C64C45; }
.report-form :deep(textarea.form-input) { min-height: 10rem; }
.report-form :deep(.form-hint) { font-size: 0.875rem; line-height: 1.5rem; color: #50604B; }
.evidence-section { background: #F3F3E9; }
.report-form input[type="file"] { border-style: dashed; background: #FAFBF7; padding: 1.125rem; line-height: 1.75rem; }
.report-form input[type="file"]::file-selector-button { cursor: pointer; min-height: 2.75rem; margin-bottom: 0.375rem; border-radius: 0.5rem; background: #DDE8D6; padding: 0.5rem 0.875rem; font-weight: 600; }
.evidence-section > img { margin-top: 1.25rem; width: 100%; max-height: 20rem; background: #E5EADA; }
.section-description { font-size: 1rem; line-height: 1.75rem; color: #465B45; }
.location-action { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; border: 1px solid #CBD9C4; border-radius: 0.75rem; background: #E2EBDA; padding: 1rem; }
.locate-button { flex-shrink: 0; }
.location-action > p { flex: 1 1 13rem; font-size: 0.875rem; line-height: 1.5rem; color: #405B3B; }
.location-feedback { border-left: 3px solid #61815A; padding: 0.625rem 0.875rem; font-size: 1rem; line-height: 1.75rem; color: #314C32; }
.map-instruction { font-size: 0.9375rem; line-height: 1.625rem; color: #50604B; }
.map-instruction > strong { display: block; margin-bottom: 0.25rem; color: #285C48; font-weight: 600; }
.report-submit { border: 1px solid #D1DDCB; border-radius: 1rem; background: #E5EDDF; padding: 1.5rem; }
.report-submit > .form-hint { margin-top: 1rem; }
@media (min-width: 40rem) {
  .report-steps { grid-template-columns: repeat(3,minmax(0,1fr)); gap: 1rem; }
  .form-section { padding: 1rem 1.75rem 1.75rem; }
  .section-legend { font-size: 1.375rem; line-height: 2rem; }
}
@media (max-width: 39.999rem) {
  .locate-button, .report-submit > button { width: 100%; }
  .report-form input[type="datetime-local"] { max-width: 100%; }
}
</style>
