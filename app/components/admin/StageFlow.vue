<script setup lang="ts">
import type { ReportStatus } from '#shared/types/domain'
import { REPORT_STATUS_LABELS } from '#shared/constants/domain'
import { STATUS_DISPLAY_ORDER } from '#shared/constants/workflow'
import { formatCount, handlingStages, stageLabelOf, type HandlingStage } from '~/utils/analytics'

const props = defineProps<{
  /** Accessible name of the figure and its table. */
  title: string
  counts: { status: ReportStatus; count: number }[]
}>()

const flow = computed(() => handlingStages(props.counts))
const rows = computed(() => STATUS_DISPLAY_ORDER.map(status => ({ status, count: props.counts.find(row => row.status === status)?.count ?? 0 })))
// Amber asks for attention, solid forest means done; empty stages recede.
const tone = (stage: HandlingStage) => stage.count === 0 ? 'empty' : stage.key === 'undecided' ? 'attention' : stage.key === 'resolved' ? 'done' : 'active'
</script>

<template>
  <figure class="stage-flow">
    <figcaption class="sr-only">{{ title }}</figcaption>
    <ol class="stage-list" role="list">
      <li v-for="(stage, index) in flow.stages" :key="stage.key" class="stage" :data-tone="tone(stage)">
        <span class="stage-marker" aria-hidden="true">{{ index + 1 }}</span>
        <div class="stage-body">
          <div class="stage-head">
            <p class="stage-label"><span class="sr-only">Tahap {{ index + 1 }}: </span>{{ stage.label }}</p>
            <p class="stage-count"><strong>{{ formatCount(stage.count) }}</strong> laporan</p>
          </div>
          <p class="stage-description">{{ stage.description }}</p>
          <ul v-if="stage.details.length" class="stage-details" role="list" :aria-label="`Rincian tahap ${stage.label.toLowerCase()}`">
            <li v-for="detail in stage.details" :key="detail.status">{{ formatCount(detail.count) }} {{ REPORT_STATUS_LABELS[detail.status].toLowerCase() }}</li>
          </ul>
        </div>
      </li>
    </ol>

    <p class="stage-rejected">
      <span class="stage-rejected-marker" aria-hidden="true">×</span>
      <span v-if="flow.rejected"><strong>{{ formatCount(flow.rejected) }} laporan</strong> ditolak petugas dan tidak dilanjutkan.</span>
      <span v-else>Tidak ada laporan yang ditolak.</span>
    </p>

    <details class="stage-table">
      <summary><span>Lihat rincian per status</span><AdminIcon name="chevron-down" class="table-chevron size-4" /></summary>
      <table>
        <caption class="sr-only">{{ title }}, rincian per status</caption>
        <thead><tr><th scope="col">Status</th><th scope="col" class="stage-column">Tahap</th><th scope="col" class="table-count">Jumlah</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.status"><th scope="row">{{ REPORT_STATUS_LABELS[row.status] }}<span class="stage-subline">Tahap: {{ stageLabelOf(row.status) }}</span></th><td class="stage-column">{{ stageLabelOf(row.status) }}</td><td class="table-count">{{ formatCount(row.count) }}</td></tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>

<style scoped>
.stage-flow { min-width: 0; container-type: inline-size; }
.stage-list { margin: 0; padding: 0; list-style: none; }
.stage { position: relative; display: grid; grid-template-columns: 2.25rem minmax(0, 1fr); column-gap: 0.875rem; padding-bottom: 1.25rem; }
.stage:last-child { padding-bottom: 0; }
/* The connector makes the order visible: each stage leads to the next. */
.stage:not(:last-child)::before { content: ''; position: absolute; top: 2.5rem; bottom: 0.25rem; left: calc(1.125rem - 1px); width: 2px; border-radius: 2px; background: #D7E2D3; }
.stage-marker { display: flex; width: 2.25rem; height: 2.25rem; align-items: center; justify-content: center; border-radius: 999px; background: #DCE7DA; font-size: 0.9375rem; font-weight: 700; color: #285C48; }
.stage[data-tone="attention"] .stage-marker { background: #F3E6CA; color: #75501C; }
.stage[data-tone="done"] .stage-marker { background: #285C48; color: #FFFFFF; }
.stage[data-tone="empty"] .stage-marker { background: #ECEEEB; color: #5C665F; }
.stage-body { min-width: 0; padding-top: 0.25rem; }
.stage-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.125rem 1rem; }
.stage-label { min-width: 0; font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; overflow-wrap: anywhere; }
.stage-count { display: inline-flex; align-items: baseline; gap: 0.25rem; font-size: 0.9375rem; line-height: 1.5rem; white-space: nowrap; color: #46564C; }
.stage-count strong { font-size: 1.25rem; font-weight: 650; color: #173D32; }
.stage[data-tone="empty"] .stage-label,
.stage[data-tone="empty"] .stage-count strong { color: #46564C; }
.stage-description { margin-top: 0.125rem; font-size: 0.9375rem; line-height: 1.5rem; color: #5C665F; }
.stage-details { display: flex; flex-wrap: wrap; gap: 0.375rem; margin: 0.5rem 0 0; padding: 0; list-style: none; }
.stage-details li { border: 1px solid #E1E7DE; border-radius: 999px; background: #F4F6F2; padding: 0.125rem 0.625rem; font-size: 0.875rem; line-height: 1.375rem; color: #46564C; }
.stage-rejected { display: flex; align-items: center; gap: 0.875rem; margin-top: 1.25rem; border-top: 1px solid #E5E8E3; padding-top: 1rem; font-size: 0.9375rem; line-height: 1.5rem; color: #46564C; }
.stage-rejected strong { font-weight: 650; color: #173D32; }
.stage-rejected-marker { display: flex; width: 2.25rem; height: 2.25rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 999px; background: #ECEEEB; font-size: 1.125rem; font-weight: 600; color: #5C665F; }
.stage-table { margin-top: 1rem; border-top: 1px solid #E5E8E3; padding-top: 0.5rem; }
.stage-table summary { display: flex; min-height: 2.75rem; cursor: pointer; align-items: center; justify-content: space-between; gap: 0.75rem; list-style: none; font-size: 0.9375rem; font-weight: 600; line-height: 1.5rem; color: #285C48; }
.stage-table summary::-webkit-details-marker { display: none; }
.stage-table summary:hover > span { text-decoration: underline; text-underline-offset: 0.25rem; }
.stage-table[open] .table-chevron { transform: rotate(180deg); }
.stage-table table { width: 100%; margin-top: 0.5rem; border-collapse: collapse; text-align: left; font-size: 0.9375rem; line-height: 1.5rem; }
.stage-table th, .stage-table td { border-bottom: 1px solid #E5EAE2; padding: 0.625rem 0.75rem; overflow-wrap: anywhere; }
.stage-table thead { background: #F4F6F2; color: #46564C; }
.stage-table thead th { font-weight: 600; }
.stage-table tbody th { font-weight: 400; color: #242B28; }
.stage-table tbody td { color: #46564C; }
.stage-table .table-count { width: 1%; overflow-wrap: normal; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; color: #242B28; }
/* Narrow panels: three columns cannot fit whole words, so the stage moves under the status. */
.stage-subline { display: none; }
@container (max-width: 30rem) {
  .stage-table .stage-column { display: none; }
  .stage-subline { display: block; margin-top: 0.125rem; font-size: 0.875rem; line-height: 1.375rem; color: #5C665F; }
}
/* Wide panels: the four stages side by side, read left to right like a tracker. */
@container (min-width: 46rem) {
  .stage-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 1.5rem; }
  .stage { display: flex; flex-direction: column; padding-bottom: 0; }
  .stage:not(:last-child)::before { top: calc(1.125rem - 1px); right: -1rem; bottom: auto; left: 2.75rem; width: auto; height: 2px; }
  .stage-body { padding-top: 0.75rem; }
  .stage-head { flex-direction: column; align-items: flex-start; gap: 0.125rem; }
  .stage-count strong { font-size: 1.5rem; }
}
</style>
