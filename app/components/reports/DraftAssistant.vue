<script setup lang="ts">
import type { AssistantDraft,AssistantDraftResponse } from '../../../shared/types/report-assistant'
import { assistantAnswersSchema,assistantStartSchema } from '#shared/schemas/report-assistant'
import { uploadDeclarationSchema } from '#shared/schemas/reports'
import { formatReportDate } from '~/utils/dates'
import { readApiError } from '~/utils/api-error'

const props=defineProps<{ initialStory?: string; initialFile?: File | null }>()
const emit=defineEmits<{ review:[draft:AssistantDraft,file:File|null]; manual:[input:ReturnType<typeof manualInput>]; busy:[value:boolean]; stage:[value:number] }>()
const story=ref(props.initialStory ?? '')
const file=shallowRef<File|null>(props.initialFile ?? null)
const imageInput=ref<HTMLInputElement>()
const preview=ref('')
const draft=ref<AssistantDraft|null>(null)
const recoverable=ref<AssistantDraft|null>(null)
const answers=reactive<Record<string,string>>({})
const ready=ref(false)
const pending=ref(false)
const progress=ref('')
const message=ref('')
const requestId=ref('')
const upload=useEvidenceUpload()
let receipt: { uploadId:string;evidencePath:string } | null=null
let disposed=false
const expired=computed(()=>draft.value ? Date.parse(draft.value.expiresAt)<=Date.now() : false)
const failure=computed(()=>{
  const messages:Record<string,string>={
    AI_TIMEOUT:'AI belum merespons dalam batas waktu. Draf Anda tersimpan; coba lagi sebentar.',
    AI_QUOTA_EXCEEDED:'Layanan AI sedang dibatasi. Tunggu sebentar atau lanjutkan dengan formulir manual.',
    AI_INVALID_OUTPUT:'Jawaban AI belum memenuhi format. Coba kembali atau gunakan formulir manual.',
    AI_NOT_CONFIGURED:'Asisten AI belum dikonfigurasi. Anda tetap dapat mengisi formulir sendiri.',
    AI_EVIDENCE_UNAVAILABLE:'Foto belum dapat dibaca untuk membantu laporan. Pilih ulang foto atau gunakan formulir manual.',
  }
  return messages[draft.value?.errorCode ?? ''] ?? 'Asisten belum dapat menyelesaikan pembacaan foto. Draf Anda tetap tersimpan; coba lagi atau isi formulir sendiri.'
})
watch(pending,value=>emit('busy',value))
watch(draft,value=>emit('stage',value?.result ? 2 : 1))
function setDraft(value:AssistantDraft) {
  draft.value=value; story.value=value.story
  for (const key of Object.keys(answers)) delete answers[key]
  for (const question of value.result?.questions ?? []) answers[question.id]=value.answers.find(answer=>answer.id===question.id)?.text ?? ''
  if (value.status==='ready') nextTick(()=>document.getElementById('assistant-reading-heading')?.focus())
}
function manualInput() {
  return {story:story.value,file:file.value,evidencePath:draft.value?.evidencePath ?? receipt?.evidencePath ?? '',evidenceUrl:draft.value?.evidenceUrl ?? null}
}
defineExpose({manualInput})
onMounted(async()=>{
  ready.value=true; requestId.value=crypto.randomUUID()
  if(file.value) preview.value=URL.createObjectURL(file.value)
  try {
    const saved=await $fetch<{draft:AssistantDraft|null}>('/api/report-assistant')
    if(!disposed) recoverable.value=saved.draft
  } catch { /* Restore availability never blocks a new source or manual reporting. */ }
})
onBeforeUnmount(()=>{disposed=true;if(preview.value) URL.revokeObjectURL(preview.value)})
function choose(event:Event) {
  message.value=''; upload.reset();receipt=null;draft.value=null;requestId.value=crypto.randomUUID()
  if(preview.value) URL.revokeObjectURL(preview.value)
  preview.value='';file.value=null
  const selected=(event.target as HTMLInputElement).files?.[0]
  if(!selected) return
  const result=uploadDeclarationSchema.safeParse({fileName:selected.name,mimeType:selected.type,size:selected.size})
  if(!result.success){message.value=result.error.issues[0]?.message ?? 'Foto tidak valid.';return}
  file.value=selected;preview.value=URL.createObjectURL(selected)
}
async function reload() {
  if(!draft.value || pending.value) return
  pending.value=true;message.value='';progress.value='Memeriksa draf tersimpan…'
  try { const result=await $fetch<AssistantDraftResponse>(`/api/report-assistant/${draft.value.id}`);if(!disposed) setDraft(result.draft) }
  catch(error){message.value=readApiError(error,'Draf belum dapat dimuat. Coba kembali.').message}
  finally{pending.value=false;progress.value=''}
}
async function start() {
  if(pending.value || !ready.value) return
  message.value=''
  const validStory=assistantStartSchema.shape.story.safeParse(story.value)
  if(!validStory.success){message.value=validStory.error.issues[0]?.message ?? 'Lengkapi cerita Anda.';return}
  if(!file.value && !draft.value){message.value='Pilih foto untuk dibaca asisten.';imageInput.value?.focus();return}
  if(expired.value){message.value='Masa berlaku foto berakhir. Mulai ulang dengan memilih foto kembali.';return}
  pending.value=true
  try {
    if(file.value && !receipt && !draft.value) receipt=await upload.upload(file.value,text=>{progress.value=text})
    const uploadId=draft.value?.uploadId ?? receipt?.uploadId
    if(!uploadId) throw new Error('MISSING_RECEIPT')
    progress.value='AI sedang membaca foto dan cerita Anda…'
    const response=await $fetch<AssistantDraftResponse>('/api/report-assistant',{method:'POST',retry:0,timeout:65_000,body:{id:draft.value?.id ?? requestId.value,uploadId,story:validStory.data}})
    if(!disposed){setDraft(response.draft);recoverable.value=null}
  }
  catch(error) {
    const failed=readApiError(error,'Asisten belum dapat dihubungi. Cerita Anda tetap ada; periksa draf tersimpan atau coba kembali.')
    message.value=failed.message
    // The request may have committed before a network interruption. Recover only
    // our stable ID; never invent a successful result or issue a hidden AI retry.
    try {const saved=await $fetch<AssistantDraftResponse>(`/api/report-assistant/${draft.value?.id ?? requestId.value}`);if(!disposed) setDraft(saved.draft)} catch { /* The source remains editable. */ }
  }
  finally{pending.value=false;progress.value=''}
}
async function prepareReview() {
  if(pending.value || !draft.value?.result) return
  message.value=''
  const input=assistantAnswersSchema.safeParse({expectedVersion:draft.value.version,answers:draft.value.result.questions.map(question=>({id:question.id,text:answers[question.id] ?? ''}))})
  if(!input.success){message.value=input.error.issues[0]?.message ?? 'Periksa jawaban Anda.';return}
  pending.value=true;progress.value='Menyimpan jawaban dan menyiapkan draf…'
  try {
    const response=await $fetch<AssistantDraftResponse>(`/api/report-assistant/${draft.value.id}/answers`,{method:'PUT',retry:0,body:input.data})
    if(!disposed){setDraft(response.draft);emit('review',response.draft,file.value)}
  } catch(error){message.value=readApiError(error,'Jawaban belum dapat disimpan. Coba kembali.').message}
  finally{pending.value=false;progress.value=''}
}
function restart() {
  draft.value=null;recoverable.value=null;receipt=null;upload.reset();requestId.value=crypto.randomUUID();message.value=''
  // Keep the user's source and original File; a fresh receipt replaces expired evidence.
}
</script>

<template>
  <section class="draft-assistant" aria-labelledby="assistant-title" :aria-busy="pending">
    <header class="assistant-heading"><span class="assistant-icon"><LandingWorkflowIcon name="analysis" /></span><div><p class="assistant-eyebrow">Asisten Pelaporan AI</p><h2 id="assistant-title">Mulai dari foto dan cerita Anda.</h2><p>AI membantu membaca foto dan menanyakan informasi yang berguna. Anda tetap memeriksa draf sebelum mengirim.</p></div></header>

    <div v-if="recoverable && !draft" class="assistant-restore"><p><strong>Draf sebelumnya masih tersedia.</strong> Buka kembali cerita, foto, dan hasil pemrosesan yang tersimpan.</p><div><button type="button" class="button-secondary" :disabled="pending" @click="setDraft(recoverable); recoverable=null">Lanjutkan draf</button><button type="button" class="text-link" :disabled="pending" @click="recoverable=null">Mulai baru</button></div></div>

    <fieldset v-if="!draft" class="assistant-source" :disabled="pending || !ready">
      <legend class="sr-only">Foto dan cerita untuk asisten</legend>
      <div><label for="assistant-photo" class="form-label">Foto pengamatan</label><input id="assistant-photo" ref="imageInput" type="file" accept="image/jpeg,image/png,image/webp" class="form-input" aria-describedby="assistant-photo-hint" @change="choose"><p id="assistant-photo-hint" class="form-hint">JPEG, PNG atau WebP, maksimal 5 MB. Foto disimpan privat.</p></div>
      <img v-if="preview" :src="preview" alt="Pratinjau foto untuk asisten pelaporan" class="assistant-photo">
      <div><label for="assistant-story" class="form-label">Ceritakan apa yang Anda lihat</label><textarea id="assistant-story" v-model="story" rows="4" minlength="20" maxlength="1500" class="form-input" placeholder="Misalnya: Saya menemukan beberapa batang pohon tumbang di dekat jalur hutan. Saya tidak melihat proses penebangannya." aria-describedby="assistant-story-hint" /><p id="assistant-story-hint" class="form-hint">Minimal 20 karakter. Ceritakan yang Anda ketahui; tidak perlu menebak penyebabnya.</p></div>
      <button type="button" class="button-primary" @click="start">Baca foto dan bantu laporan <span aria-hidden="true">→</span></button>
    </fieldset>

    <template v-else>
      <div class="assistant-saved"><p>Draf privat tersimpan sampai {{ formatReportDate(draft.expiresAt) }}.</p><button type="button" class="text-link" :disabled="pending" @click="restart">Ubah foto atau cerita</button></div>
      <div v-if="draft.status==='submitted'"><p>Laporan dari draf ini sudah dikirim.</p><NuxtLink :to="`/reports/${draft.reportId}`" class="button-primary mt-4">Buka laporan</NuxtLink></div>
      <div v-else-if="expired" role="status" class="notice"><p>Masa berlaku foto draf berakhir. Cerita Anda tetap dapat digunakan pada formulir manual, atau pilih foto untuk memulai kembali.</p><button type="button" class="text-link mt-3" @click="restart">Mulai kembali</button></div>
      <div v-else-if="draft.status==='processing'" role="status" class="notice"><p>Foto masih diproses atau permintaan sebelumnya terhenti. Periksa hasil tersimpan; coba lagi setelah sekitar 90 detik bila belum selesai.</p><div class="assistant-actions"><button type="button" class="button-secondary" :disabled="pending" @click="reload">Periksa status</button><button type="button" class="text-link" :disabled="pending" @click="start">Coba lagi</button></div></div>
      <div v-else-if="draft.status==='failed'" role="status" class="notice"><p>{{ failure }}</p><button type="button" class="button-secondary mt-4" :disabled="pending" @click="start">Coba baca kembali</button></div>
      <template v-else-if="draft.result">
        <div class="assistant-evidence"><img v-if="preview || draft.evidenceUrl" :src="preview || draft.evidenceUrl!" alt="Foto pengamatan yang digunakan asisten" class="assistant-photo"><div><h3 id="assistant-reading-heading" tabindex="-1">Pembacaan foto oleh AI</h3><ul v-if="draft.result.visual_observations.length"><li v-for="observation in draft.result.visual_observations" :key="observation">{{ observation }}</li></ul><p v-else>AI belum dapat menyebutkan pengamatan visual yang cukup jelas.</p><p class="assistant-limitations">{{ draft.result.limitations }}</p></div></div>
        <details class="assistant-story-review"><summary>Ringkasan cerita Anda oleh AI</summary><p>{{ draft.result.reported_summary }}</p><p class="form-hint">Draf laporan akan memakai cerita dan jawaban Anda, bukan mengubah interpretasi AI menjadi kesaksian Anda.</p></details>
        <fieldset class="assistant-questions" :disabled="pending"><legend>{{ draft.result.questions.length ? 'Bantu lengkapi informasi ini' : 'Informasi siap diperiksa' }}</legend><p>Jawab sesuai yang Anda ketahui. Jika tidak tahu, pilih tombol di bawah pertanyaan. Anda tidak perlu kembali mendekati kejadian.</p><div v-for="(question,index) in draft.result.questions" :key="question.id" class="assistant-question"><label :for="`assistant-answer-${question.id}`" class="form-label">{{ index+1 }}. {{ question.text }}</label><p :id="`assistant-reason-${question.id}`">{{ question.reason }}</p><textarea :id="`assistant-answer-${question.id}`" v-model="answers[question.id]" class="form-input" rows="3" maxlength="500" :aria-describedby="`assistant-reason-${question.id}`" /><button type="button" class="text-link" @click="answers[question.id]='Saya tidak tahu.'">Saya tidak tahu</button></div><button type="button" class="button-primary" @click="prepareReview">Periksa draf laporan <span aria-hidden="true">→</span></button></fieldset>
      </template>
    </template>
    <p v-if="pending" role="status" class="assistant-progress">{{ progress }}</p>
    <p v-if="message" role="alert" class="form-error">{{ message }}</p>
    <footer class="assistant-footer"><span>Anda juga dapat melapor tanpa bantuan AI.</span><button type="button" class="text-link" :disabled="pending || !ready" @click="emit('manual',manualInput())">Isi formulir sendiri</button></footer>
  </section>
</template>

<style scoped>
.draft-assistant { min-width: 0; border: 1px solid #DCE3D8; border-radius: 0.75rem; background: white; padding: 1.25rem; color: #173D32; }
.assistant-heading { display: flex; gap: 0.875rem; align-items: flex-start; }
.assistant-icon { display: none; width: 2.5rem; height: 2.5rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: #EAF0E9; color: #285C48; }
.assistant-eyebrow { font-size: 0.875rem; font-weight: 600; line-height: 1.5rem; color: #46643F; }
.assistant-heading h2 { margin-top: 0.25rem; font-size: 1.5rem; line-height: 1.3; font-weight: 600; letter-spacing: -0.025em; }
.assistant-heading div > p:last-child { max-width: 48rem; margin-top: 0.75rem; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.assistant-source,.assistant-questions { display: grid; min-width: 0; gap: 1.25rem; margin-top: 1.5rem; }
.assistant-photo { display: block; width: 100%; max-height: 20rem; border: 1px solid #DCE3D8; border-radius: 0.5rem; object-fit: contain; background: #F7F9F4; }
.assistant-source input[type=file] { border-style: dashed; background: #FAFAF7; padding: 1rem; }
.assistant-source input[type=file]::file-selector-button { min-height: 2.75rem; margin-right: 0.75rem; border: 0; border-radius: 0.5rem; background: #DDE8D5; padding: 0.5rem 0.75rem; font-weight: 600; color: #173D32; cursor: pointer; }
.assistant-source .button-primary,.assistant-questions > .button-primary { justify-self: start; }
.assistant-restore,.assistant-saved { margin-top: 1.5rem; border: 1px solid #DCE3D8; border-radius: 0.5rem; padding: 1rem; background: #F6F8F3; font-size: 0.9375rem; line-height: 1.625rem; }
.assistant-restore > div,.assistant-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin-top: 0.75rem; }
.assistant-saved { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1.5rem; }
.assistant-evidence { display: grid; min-width: 0; gap: 1.25rem; }
.assistant-evidence h3 { font-size: 1.125rem; font-weight: 600; line-height: 1.75rem; }
.assistant-evidence ul { list-style: disc; padding-left: 1.25rem; margin-top: 0.75rem; }
.assistant-evidence li,.assistant-evidence p { font-size: 1rem; line-height: 1.75rem; }
.assistant-limitations { margin-top: 0.75rem; color: #52634A; }
.assistant-story-review { margin-top: 1.5rem; border-block: 1px solid #D0DDC8; padding-block: 0.5rem; }
.assistant-story-review summary { min-height: 2.75rem; align-content: center; cursor: pointer; font-weight: 500; }
.assistant-story-review > p { margin-top: 0.5rem; line-height: 1.75rem; }
.assistant-questions legend { margin-bottom: 0.75rem; font-size: 1.25rem; font-weight: 600; line-height: 1.75rem; }
.assistant-questions > p { font-size: 1rem; line-height: 1.75rem; color: #465C43; }
.assistant-question > p { margin-bottom: 0.75rem; font-size: 0.9375rem; line-height: 1.625rem; color: #52634A; }
.assistant-question > button { min-height: 2.75rem; margin-top: 0.25rem; }
.assistant-progress { margin-top: 1.5rem; border-left: 3px solid #61815A; padding-left: 0.875rem; line-height: 1.75rem; }
.assistant-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 1.5rem; border-top: 1px solid #D0DDC8; padding-top: 1rem; font-size: 0.9375rem; line-height: 1.625rem; color: #52634A; }
.assistant-footer button { min-height: 2.75rem; }
@media (min-width: 40rem) { .draft-assistant { padding: 1.75rem; } .assistant-icon { display: flex; } .assistant-evidence { grid-template-columns: minmax(0,0.85fr) minmax(0,1.15fr); } }
@media (max-width: 39.999rem) { .assistant-source .button-primary,.assistant-questions > .button-primary { justify-self: stretch; } .assistant-heading { display: block; } }
</style>
