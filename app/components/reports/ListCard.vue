<script setup lang="ts">
import type { ReportSummary } from '../../../shared/types/report-api'
import { REPORT_STATUS_LABELS, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { formatReportDate } from '~/utils/dates'

const props = defineProps<{ report: ReportSummary }>()
const photo = ref<HTMLImageElement>()
const photoState = ref<'loading' | 'ready' | 'error'>('loading')
const photoUrl = computed(() => `/api/reports/${encodeURIComponent(props.report.id)}/thumbnail`)
const tone = computed(() => {
  if (['analysis_failed', 'rejected'].includes(props.report.status)) return 'red'
  if (['verified', 'resolved', 'in_progress'].includes(props.report.status)) return 'green'
  return 'amber'
})
onMounted(() => {
  // A cached/SSR image can finish loading before Vue attaches the listener.
  if (photo.value?.complete) photoState.value = photo.value.naturalWidth > 0 ? 'ready' : 'error'
})
watch(() => props.report.id, () => { photoState.value = 'loading' })
</script>

<template>
  <NuxtLink :to="`/reports/${report.id}`" class="report-card">
    <div class="report-photo" :aria-busy="photoState === 'loading'">
      <img v-if="photoState !== 'error'" ref="photo" :key="photoUrl" :src="photoUrl" :alt="`Foto bukti: ${report.title}`" width="384" height="288" loading="lazy" decoding="async" :class="{ 'photo-ready': photoState === 'ready' }" @load="photoState = 'ready'" @error="photoState = 'error'">
      <span v-if="photoState === 'loading'" class="report-photo-message">Memuat foto…</span>
      <span v-else-if="photoState === 'error'" class="report-photo-message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg><span>Foto belum dapat dimuat.</span><span class="report-photo-hint">Buka detail laporan untuk mencoba lagi.</span></span>
    </div>
    <div class="report-card-content">
    <div class="report-card-top">
      <div class="report-reference"><span>{{ report.reportCode }}</span><span v-if="report.isSimulation" class="report-simulation">Data simulasi</span></div>
      <span class="report-status" :data-tone="tone"><span aria-hidden="true" />{{ REPORT_STATUS_LABELS[report.status] }}</span>
    </div>
    <p class="report-category">{{ THREAT_CATEGORY_LABELS[report.category] }}</p>
    <h2 class="report-title">{{ report.title }}</h2>
    <dl class="report-metadata">
      <div><dt><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>Lokasi kejadian</dt><dd>{{ report.locationName || 'Lokasi tanpa nama' }}</dd></div>
      <div><dt><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>Waktu kejadian</dt><dd>{{ formatReportDate(report.incidentTime) }}</dd></div>
    </dl>
    <div class="report-card-footer"><span>Lihat detail laporan</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></div>
    </div>
  </NuxtLink>
</template>

<style scoped>
.report-card { display: grid; gap: 1.25rem; min-width: 0; border: 1px solid #DCE3D8; border-radius: 0.75rem; background: white; padding: 1.25rem; color: #173D32; overflow-wrap: anywhere; }
.report-card:hover { border-color: #94AC99; background: #F8FAF5; }
.report-card:hover .report-title { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.25rem; }
.report-card-content { min-width: 0; }
.report-photo { position: relative; align-self: start; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border: 1px solid #E5E8E3; border-radius: 0.5rem; background: #F1F4EE; }
.report-photo > img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; opacity: 0; }
.report-photo > img.photo-ready { opacity: 1; }
.report-photo-message { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.375rem; padding: 1rem; text-align: center; font-size: 0.875rem; line-height: 1.5rem; color: #526057; }
.report-photo-message > svg { width: 1.5rem; height: 1.5rem; margin-bottom: 0.25rem; }
.report-photo-hint { max-width: 13rem; font-size: 0.8125rem; line-height: 1.25rem; }
.report-card-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.875rem; }
.report-reference { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; font-size: 0.8125rem; line-height: 1.5rem; color: #526057; }
.report-reference > span:first-child { font-family: ui-monospace, monospace; }
.report-simulation { font-family: inherit; font-weight: 600; color: #78551E; }
.report-status { display: inline-flex; align-items: center; gap: 0.5rem; border: 1px solid #E6D7B6; border-radius: 999px; background: #FBF4E5; padding: 0.25rem 0.75rem; font-size: 0.9375rem; font-weight: 600; line-height: 1.5rem; color: #735019; }
.report-status > span { width: 0.4375rem; height: 0.4375rem; flex-shrink: 0; border-radius: 50%; background: currentColor; }
.report-status[data-tone="green"] { border-color: #D4E2D2; background: #EDF5EA; color: #285C3C; }
.report-status[data-tone="red"] { border-color: #E8CFC9; background: #FBEFEB; color: #8A3B31; }
.report-category { margin-top: 1rem; font-size: 0.9375rem; line-height: 1.5rem; font-weight: 500; color: #285C48; }
.report-title { max-width: 52rem; margin-top: 0.375rem; font-size: 1.375rem; line-height: 1.4; font-weight: 600; letter-spacing: -0.02em; }
.report-metadata { display: grid; gap: 1rem; margin-top: 1.25rem; }
.report-metadata > div { min-width: 0; }
.report-metadata svg { width: 1.125rem; height: 1.125rem; flex-shrink: 0; color: #526057; }
.report-metadata dt { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; line-height: 1.5rem; color: #526057; }
.report-metadata dd { margin-top: 0.125rem; padding-left: 1.625rem; font-size: 1rem; line-height: 1.625rem; color: #334D3C; }
.report-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.25rem; font-size: 0.9375rem; line-height: 1.5rem; font-weight: 600; color: #285C48; }
.report-card-footer svg { width: 1.25rem; height: 1.25rem; flex-shrink: 0; }
@media (min-width: 40rem) {
  .report-card { padding: 1.5rem; }
  .report-title { font-size: 1.5rem; }
  .report-metadata { grid-template-columns: minmax(0,1fr) minmax(0,1fr); max-width: 52rem; gap: 2rem; }
}
@media (min-width: 48rem) {
  .report-card { grid-template-columns: 12.5rem minmax(0,1fr); gap: 1.5rem; }
}
@media (min-width: 64rem) {
  .report-card { grid-template-columns: 15rem minmax(0,1fr); }
}
</style>
