<script setup lang="ts">
import type { ReportSummary } from '../../../shared/types/report-api'
import { REPORT_STATUS_LABELS, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { formatReportDate } from '~/utils/dates'

const props = defineProps<{ report: ReportSummary }>()
const tone = computed(() => {
  if (['analysis_failed', 'rejected'].includes(props.report.status)) return 'red'
  if (['verified', 'resolved', 'in_progress'].includes(props.report.status)) return 'green'
  return 'amber'
})
</script>

<template>
  <NuxtLink :to="`/reports/${report.id}`" class="report-card">
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
  </NuxtLink>
</template>

<style scoped>
.report-card { display: block; min-width: 0; border: 1px solid #D2DECD; border-radius: 1rem; background: #F0F4EB; padding: 1.25rem; color: #173D32; overflow-wrap: anywhere; }
.report-card:hover { border-color: #819D7F; background: #EAF0E4; }
.report-card:hover .report-title { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.25rem; }
.report-card-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.875rem; }
.report-reference { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; font-size: 0.8125rem; line-height: 1.5rem; color: #50614F; }
.report-reference > span:first-child { font-family: ui-monospace, monospace; }
.report-simulation { font-family: inherit; font-weight: 600; color: #78551E; }
.report-status { display: inline-flex; align-items: center; gap: 0.5rem; border: 1px solid #DBCCA8; border-radius: 0.5rem; background: #F2E9D6; padding: 0.375rem 0.75rem; font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #735019; }
.report-status > span { width: 0.4375rem; height: 0.4375rem; flex-shrink: 0; border-radius: 50%; background: currentColor; }
.report-status[data-tone="green"] { border-color: #C2D6BE; background: #DFEBDC; color: #285C3C; }
.report-status[data-tone="red"] { border-color: #E1C6BE; background: #F1E3DD; color: #8A3B31; }
.report-category { margin-top: 1.25rem; font-size: 0.9375rem; line-height: 1.5rem; font-weight: 500; color: #476742; }
.report-title { max-width: 52rem; margin-top: 0.5rem; font-size: 1.375rem; line-height: 1.45; font-weight: 600; letter-spacing: -0.02em; }
.report-metadata { display: grid; gap: 1rem; margin-top: 1.5rem; }
.report-metadata > div { min-width: 0; }
.report-metadata svg { width: 1.25rem; height: 1.25rem; margin-top: 0.1875rem; flex-shrink: 0; color: #5A7653; }
.report-metadata dt { display: flex; align-items: center; gap: 0.625rem; font-size: 0.8125rem; line-height: 1.375rem; color: #576751; }
.report-metadata dd { margin-top: 0.125rem; padding-left: 1.875rem; font-size: 1rem; line-height: 1.625rem; color: #334D3C; }
.report-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid #D5DFCE; padding-top: 1rem; font-size: 1rem; line-height: 1.5rem; font-weight: 600; color: #285C48; }
.report-card-footer svg { width: 1.25rem; height: 1.25rem; flex-shrink: 0; }
@media (min-width: 40rem) {
  .report-card { padding: 1.5rem 1.75rem; }
  .report-title { font-size: 1.5rem; }
  .report-metadata { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); max-width: 52rem; gap: 2rem; }
}
</style>
