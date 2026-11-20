<script setup lang="ts">
const props = defineProps<{ reportId: string; reportTitle: string; reportCode: string }>()
const id = useId()
const dialog = ref<HTMLDialogElement>()
const trigger = ref<HTMLButtonElement>()
const thumbnail = ref<HTMLImageElement>()
const ready = ref(false)
const thumbnailState = ref<'loading' | 'ready' | 'error'>('loading')
const fullState = ref<'loading' | 'ready' | 'error'>('loading')
const showFullImage = ref(false)
const thumbnailRetry = ref(0)
const fullRetry = ref(0)

function evidenceUrl(size: 'thumbnail' | 'full', retry: number) {
  return `/api/admin/reports/${encodeURIComponent(props.reportId)}/evidence?size=${size}${retry ? `&retry=${retry}` : ''}`
}
const thumbnailUrl = computed(() => evidenceUrl('thumbnail', thumbnailRetry.value))
const fullUrl = computed(() => evidenceUrl('full', fullRetry.value))

function open() {
  if (!ready.value || thumbnailState.value !== 'ready' || !dialog.value || dialog.value.open) return
  fullState.value = 'loading'
  fullRetry.value = 0
  dialog.value.showModal()
  showFullImage.value = true
}
function close() { dialog.value?.close() }
function afterClose() {
  showFullImage.value = false
  fullState.value = 'loading'
  if (trigger.value?.isConnected && trigger.value.getClientRects().length) trigger.value.focus()
}
function closeBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}
function retryThumbnail() { thumbnailState.value = 'loading'; thumbnailRetry.value++ }
function retryFull() { fullState.value = 'loading'; fullRetry.value++ }

onMounted(() => {
  ready.value = true
  // The SSR image can finish before Vue attaches its load listener.
  if (thumbnail.value?.complete) thumbnailState.value = thumbnail.value.naturalWidth > 0 ? 'ready' : 'error'
})
watch(() => props.reportId, () => {
  close()
  showFullImage.value = false
  thumbnailState.value = 'loading'
  fullState.value = 'loading'
  thumbnailRetry.value = 0
  fullRetry.value = 0
})
onBeforeUnmount(() => { dialog.value?.close() })
</script>

<template>
  <div class="evidence-preview">
    <button v-if="thumbnailState !== 'error'" ref="trigger" type="button" class="evidence-trigger group relative block overflow-hidden rounded-xl border border-line bg-[#EEF2EB] text-forest-900 disabled:cursor-default" :disabled="!ready || thumbnailState !== 'ready'" :aria-busy="thumbnailState === 'loading'" :aria-label="thumbnailState === 'loading' ? `Memuat foto… ${reportCode}` : `Lihat foto laporan ${reportCode}`" aria-haspopup="dialog" :aria-controls="`${id}-photo`" @click="open">
      <img ref="thumbnail" :key="thumbnailUrl" :src="thumbnailUrl" alt="" width="320" height="240" loading="lazy" decoding="async" class="h-full w-full object-cover" :class="thumbnailState === 'ready' ? 'opacity-100' : 'opacity-0'" @load="thumbnailState = 'ready'" @error="thumbnailState = 'error'">
      <span v-if="thumbnailState === 'loading'" class="absolute inset-0 flex items-center justify-center px-2 text-xs leading-5 text-charcoal/65">Memuat foto…</span>
      <span v-else class="evidence-trigger-label flex items-center justify-center gap-1.5 px-2 py-1 text-xs leading-5 font-medium text-white"><AdminIcon name="eye" class="size-3.5" />Lihat foto</span>
    </button>
    <div v-else class="flex min-h-24 flex-col items-center justify-center rounded-xl border border-line bg-[#F4F6F2] px-2 py-2 text-center" role="status">
      <p class="text-xs leading-5 text-charcoal/70">Foto belum dapat dimuat.</p>
      <button type="button" class="min-h-11 text-xs font-medium text-forest-700 underline underline-offset-4" :aria-label="`Coba kembali memuat foto laporan ${reportCode}`" @click="retryThumbnail">Coba kembali</button>
    </div>

    <dialog :id="`${id}-photo`" ref="dialog" class="evidence-dialog m-auto max-h-[90dvh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-line bg-white p-0 text-charcoal" :aria-labelledby="`${id}-title`" @click="closeBackdrop" @close="afterClose">
      <header class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4 sm:px-6">
        <div class="min-w-0"><p class="text-xs leading-5 font-mono text-charcoal/65">{{ reportCode }}</p><h2 :id="`${id}-title`" class="mt-1 break-words text-lg leading-7 font-semibold text-forest-900">{{ reportTitle }}</h2></div>
        <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-forest-900 hover:bg-sage-100" aria-label="Tutup pratinjau foto" autofocus @click="close"><svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </header>
      <div class="evidence-full-stage bg-[#F4F6F2]" :aria-busy="fullState === 'loading'">
        <img v-if="showFullImage" v-show="fullState === 'ready'" :key="fullUrl" :src="fullUrl" :alt="`Foto bukti laporan ${reportTitle}`" decoding="async" class="evidence-full-image" @load="fullState = 'ready'" @error="fullState = 'error'">
        <p v-if="fullState === 'loading'" role="status" class="text-sm leading-6 text-charcoal/70">Memuat foto bukti…</p>
        <div v-else-if="fullState === 'error'" role="status" class="text-center"><p class="text-base leading-7 text-charcoal/80">Foto bukti belum dapat dimuat.</p><button type="button" class="button-secondary mt-4" @click="retryFull">Coba kembali</button></div>
      </div>
      <p class="border-t border-line px-5 py-3 text-sm leading-6 text-charcoal/70 sm:px-6">Foto bukti yang dilampirkan pelapor.</p>
    </dialog>
  </div>
</template>

<style scoped>
.evidence-preview { width: 7rem; flex-shrink: 0; }
.evidence-trigger { width: 100%; aspect-ratio: 4 / 3; }
.evidence-trigger > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.evidence-trigger-label { position: absolute; inset: auto 0 0; background: rgb(23 61 50 / 88%); }
.evidence-trigger:hover .evidence-trigger-label { background: #173D32; }
.evidence-dialog { position: fixed; inset: 0; margin: auto; width: min(64rem, calc(100vw - 2rem)); max-height: 90dvh; height: fit-content; }
.evidence-full-stage { display: flex; position: relative; align-items: center; justify-content: center; height: 65dvh; min-height: 12rem; padding: 0.75rem; }
.evidence-full-image { width: 100%; height: 100%; object-fit: contain; }
.evidence-dialog::backdrop { background: rgb(10 25 18 / 72%); }
@media (min-width: 40rem) {
  .evidence-preview { width: 8rem; }
  .evidence-full-stage { padding: 1.25rem; }
}
</style>
