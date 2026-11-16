<script setup lang="ts">
import { createReportSchema, uploadDeclarationSchema } from '#shared/schemas/reports'
import { THREAT_CATEGORIES, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import type { ReportDetail, UploadAuthorizedResponse as UploadAuthorization, ReportCreatedResponse as ReportCreateResponse } from '../../../shared/types/report-api'
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
const analysisIntent = useAnalysisIntent()
const evidencePath = ref(props.initial?.evidencePath ?? '')
let submissionKey = ''
let authorizedUpload: UploadAuthorization | null = null
let uploadFinished = false
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
onBeforeUnmount(() => { if (preview.value) URL.revokeObjectURL(preview.value) })

function chooseImage(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  uploadMessage.value = ''
  authorizedUpload = null
  uploadFinished = false
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
  locationMessage.value = ''
  if (!navigator.geolocation) { locationMessage.value = 'Browser tidak mendukung GPS. Pilih titik pada peta atau isi koordinat.'; return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(position => {
    point.value = { latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) }
    locationMessage.value = `Lokasi perangkat diperoleh (akurasi sekitar ${Math.round(position.coords.accuracy)} meter). Pastikan titik sesuai lokasi kejadian.`
    locating.value = false
  }, error => {
    locationMessage.value = error.code === 1 ? 'Izin lokasi ditolak. Pilih titik pada peta atau isi koordinat.' : 'Lokasi belum dapat diperoleh. Pilih titik pada peta atau isi koordinat.'
    locating.value = false
  }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 })
}

async function submit() {
  message.value = ''
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
      progress.value = 'Menyiapkan unggahan…'
      authorizedUpload ??= await $fetch<UploadAuthorization>('/api/uploads/authorize', { method: 'POST', retry: 0, timeout: 30_000, body: { fileName: file.value.name, mimeType: file.value.type, size: file.value.size } })
      if (!uploadFinished) {
        progress.value = 'Mengunggah foto…'
        let response: Response
        try {
          response = await fetch(authorizedUpload.signedUrl, { method: 'PUT', headers: { 'content-type': file.value.type, 'x-upsert': 'false' }, body: file.value, signal: AbortSignal.timeout(60_000) })
        }
        catch {
          authorizedUpload = null
          throw new Error('UPLOAD_FAILED')
        }
        if (!response.ok) { authorizedUpload = null; throw new Error('UPLOAD_FAILED') }
        uploadFinished = true
      }
      progress.value = 'Memeriksa foto…'
      const finalized = await $fetch<{ evidencePath: string }>('/api/uploads/finalize', { method: 'POST', retry: 0, timeout: 45_000, body: { uploadId: authorizedUpload.uploadId } })
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
      const result = await $fetch<ReportCreateResponse>('/api/reports', { method: 'POST', retry: 0, timeout: 45_000, headers: { 'Idempotency-Key': submissionKey || crypto.randomUUID() }, body })
      analysisIntent.value = { reportId: result.report.id, revision: result.report.revision }
      emit('saved', result.report.id)
    }
  }
  catch (error) {
    const failure = readApiError(error, 'Penyimpanan laporan belum dapat dikonfirmasi. Isian Anda tetap tersedia; silakan coba lagi.')
    message.value = failure.message; fields.value = failure.fields
    if (failure.code === 'EVIDENCE_EXPIRED' && file.value) { evidencePath.value = ''; authorizedUpload = null; uploadFinished = false }
  }
  finally { pending.value = false; progress.value = '' }
}
</script>

<template>
  <form novalidate class="space-y-10" :aria-busy="pending" @submit.prevent="submit">
    <fieldset :disabled="pending || !ready" class="space-y-5">
      <legend class="mb-5 text-xl font-semibold text-forest-900">Informasi kejadian</legend>
      <div><label for="report-title" class="form-label">Judul laporan</label><input id="report-title" v-model="form.title" class="form-input" maxlength="160" required :aria-invalid="Boolean(fields.title)" aria-describedby="title-error"><p v-if="fields.title" id="title-error" class="form-error">{{ fields.title[0] }}</p></div>
      <div><label for="report-category" class="form-label">Kategori ancaman</label><select id="report-category" v-model="form.category" class="form-input" required :aria-invalid="Boolean(fields.category)" aria-describedby="category-error"><option disabled value="">Pilih kategori</option><option v-for="category in THREAT_CATEGORIES" :key="category" :value="category">{{ THREAT_CATEGORY_LABELS[category] }}</option></select><p v-if="fields.category" id="category-error" class="form-error">{{ fields.category[0] }}</p></div>
      <div><label for="report-description" class="form-label">Deskripsi kejadian</label><textarea id="report-description" v-model="form.description" class="form-input min-h-40 resize-y" minlength="20" maxlength="4000" required :aria-invalid="Boolean(fields.description)" aria-describedby="description-hint description-error" /><p id="description-hint" class="form-hint">Jelaskan apa yang Anda lihat. Hindari menyertakan identitas pribadi orang lain.</p><p v-if="fields.description" id="description-error" class="form-error">{{ fields.description[0] }}</p></div>
      <div><label for="incident-time" class="form-label">Waktu kejadian</label><input id="incident-time" v-model="form.incidentTime" type="datetime-local" class="form-input" required :aria-invalid="Boolean(fields.incidentTime)" aria-describedby="incident-hint incident-error"><p id="incident-hint" class="form-hint">Menggunakan zona waktu perangkat Anda. Waktu kejadian tidak boleh di masa depan.</p><p v-if="fields.incidentTime" id="incident-error" class="form-error">{{ fields.incidentTime[0] }}</p></div>
    </fieldset>
    <fieldset :disabled="pending || !ready" class="space-y-5 border-t border-line pt-8">
      <legend class="mb-5 text-xl font-semibold text-forest-900">Bukti foto</legend>
      <div><label for="evidence-image" class="form-label">Foto bukti{{ initial ? ' pengganti (opsional)' : '' }}</label><input id="evidence-image" type="file" accept="image/jpeg,image/png,image/webp" class="form-input file:mr-4 file:rounded file:border-0 file:bg-sage-100 file:px-3 file:py-1 file:text-forest-900" :required="!initial" :aria-invalid="Boolean(fields.evidencePath || uploadMessage)" aria-describedby="image-hint image-error" @change="chooseImage"><p id="image-hint" class="form-hint">JPEG, PNG, atau WebP; maksimal 5 MB. Bukti hanya dapat dilihat pemilik laporan dan petugas.</p><p v-if="uploadMessage || fields.evidencePath" id="image-error" class="form-error">{{ uploadMessage || fields.evidencePath?.[0] }}</p></div>
      <img v-if="preview" :src="preview" alt="Pratinjau foto yang dipilih untuk laporan" class="max-h-64 max-w-full rounded-lg border border-line object-contain">
      <p v-else-if="initial" class="form-hint">Foto yang sudah tersimpan akan dipertahankan jika Anda tidak memilih pengganti.</p>
    </fieldset>
    <fieldset :disabled="pending || !ready" class="space-y-5 border-t border-line pt-8">
      <legend class="mb-5 text-xl font-semibold text-forest-900">Lokasi kejadian</legend>
      <p class="body-copy">Pilih titik kejadian, yang dapat berbeda dari lokasi Anda saat ini. Koordinat persis disimpan secara privat.</p>
      <button type="button" class="button-secondary" :disabled="locating" @click="locate">{{ locating ? 'Mencari lokasi…' : 'Gunakan lokasi perangkat' }}</button>
      <p v-if="locationMessage" role="status" class="form-hint">{{ locationMessage }}</p>
      <ClientOnly><MapLocationMap v-model="point" selectable /><template #fallback><p class="notice">Memuat pemilih lokasi… Koordinat juga dapat diisi secara manual.</p></template></ClientOnly>
      <div class="grid gap-5 sm:grid-cols-2">
        <div><label for="latitude" class="form-label">Lintang</label><input id="latitude" v-model="form.latitude" type="number" step="any" min="-90" max="90" class="form-input" required :aria-invalid="Boolean(fields.latitude)" aria-describedby="latitude-error"><p v-if="fields.latitude" id="latitude-error" class="form-error">{{ fields.latitude[0] }}</p></div>
        <div><label for="longitude" class="form-label">Bujur</label><input id="longitude" v-model="form.longitude" type="number" step="any" min="-180" max="180" class="form-input" required :aria-invalid="Boolean(fields.longitude)" aria-describedby="longitude-error"><p v-if="fields.longitude" id="longitude-error" class="form-error">{{ fields.longitude[0] }}</p></div>
      </div>
      <div><label for="location-name" class="form-label">Nama lokasi (opsional)</label><input id="location-name" v-model="form.locationName" class="form-input" maxlength="160" :aria-invalid="Boolean(fields.locationName)" aria-describedby="location-name-error"><p v-if="fields.locationName" id="location-name-error" class="form-error">{{ fields.locationName[0] }}</p></div>
    </fieldset>
    <div class="border-t border-line pt-7">
      <p v-if="message" role="alert" class="form-error mb-5">{{ message }}</p>
      <button type="submit" class="button-primary min-w-48" :disabled="pending || !ready">{{ pending ? progress : initial ? 'Simpan perbaikan' : 'Kirim laporan' }}</button>
      <p class="form-hint max-w-2xl">Laporan disimpan terlebih dahulu dan tetap memerlukan pemeriksaan petugas. Hindari mendekati kejadian berbahaya untuk mengumpulkan bukti.</p>
    </div>
  </form>
</template>
