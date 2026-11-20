<script setup lang="ts">
import { formatCount, formatPercent } from '~/utils/analytics'

interface DistributionItem {
  key: string
  label: string
  value: number
}

const props = withDefaults(defineProps<{
  /** Accessible name of the figure and its table. */
  title: string
  items: DistributionItem[]
  /** The whole that each bar is a share of. */
  total: number
  unit?: string
  /** Column heading for the item names in the table view. */
  itemHeading?: string
  /** Short source note shown under the list. */
  note?: string
}>(), { unit: 'laporan', itemHeading: 'Kelompok', note: undefined })

// Largest first; zero rows fold into one sentence so the list shows only what happened.
const ranked = computed(() => props.items.filter(item => item.value > 0).sort((a, b) => b.value - a.value))
const absent = computed(() => props.items.filter(item => item.value === 0))
const shareWidth = (value: number) => props.total > 0 ? `${Math.min(100, value / props.total * 100)}%` : '0%'
</script>

<template>
  <figure class="distribution-chart">
    <figcaption class="sr-only">{{ title }}. Total {{ formatCount(total) }} {{ unit }}.</figcaption>
    <ul v-if="ranked.length" class="distribution-list" role="list">
      <li v-for="item in ranked" :key="item.key" class="distribution-row">
        <div class="distribution-label-row">
          <span class="distribution-label">{{ item.label }}</span>
          <span class="distribution-count"><strong>{{ formatCount(item.value) }}</strong> {{ unit }}<span class="distribution-share">{{ formatPercent(item.value, total) }}</span></span>
        </div>
        <div class="distribution-track" aria-hidden="true">
          <div class="distribution-mark" :style="{ width: shareWidth(item.value) }" />
        </div>
      </li>
    </ul>
    <p v-if="absent.length" class="distribution-absent"><strong>Tidak ada {{ unit }}:</strong> {{ absent.map(item => item.label).join(', ') }}.</p>
    <p v-if="note" class="distribution-note">{{ note }}</p>

    <details class="distribution-table">
      <summary><span>Lihat data sebagai tabel</span><AdminIcon name="chevron-down" class="table-chevron size-4" /></summary>
      <table>
        <caption class="sr-only">{{ title }}</caption>
        <thead><tr><th scope="col">{{ itemHeading }}</th><th scope="col" class="table-count">Jumlah</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="item.key"><th scope="row">{{ item.label }}</th><td class="table-count">{{ formatCount(item.value) }} ({{ formatPercent(item.value, total) }})</td></tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>

<style scoped>
.distribution-chart { min-width: 0; container-type: inline-size; }
.distribution-list { margin: 0; padding: 0; list-style: none; }
.distribution-row { padding: 0.875rem 0; border-bottom: 1px solid #E5EAE2; }
.distribution-row:first-child { padding-top: 0; }
.distribution-row:last-child { border-bottom: 0; }
.distribution-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.distribution-label { min-width: 0; font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; overflow-wrap: anywhere; }
.distribution-count { display: inline-flex; flex-shrink: 0; align-items: baseline; gap: 0.25rem; font-size: 0.9375rem; line-height: 1.5rem; white-space: nowrap; color: #46564C; }
.distribution-count strong { font-size: 1.125rem; font-weight: 650; color: #173D32; }
.distribution-share { margin-left: 0.375rem; border-radius: 999px; background: #E6EEE3; padding: 0 0.5rem; font-size: 0.875rem; font-weight: 600; color: #285C48; font-variant-numeric: tabular-nums; }
.distribution-track { height: 0.5rem; margin-top: 0.5rem; overflow: hidden; border-radius: 999px; background: #E3EBE1; }
.distribution-mark { min-width: 0.375rem; height: 100%; border-radius: inherit; background: #287A52; }
.distribution-absent { margin-top: 0.875rem; border-radius: 0.75rem; background: #F4F6F2; padding: 0.75rem 1rem; font-size: 0.9375rem; line-height: 1.5rem; color: #46564C; }
.distribution-absent strong { font-weight: 600; color: #173D32; }
.distribution-note { margin-top: 0.875rem; font-size: 0.875rem; line-height: 1.375rem; color: #5C665F; }
.distribution-table { margin-top: 1rem; border-top: 1px solid #E5E8E3; padding-top: 0.5rem; }
.distribution-table summary { display: flex; min-height: 2.75rem; cursor: pointer; align-items: center; justify-content: space-between; gap: 0.75rem; list-style: none; font-size: 0.9375rem; font-weight: 600; line-height: 1.5rem; color: #285C48; }
.distribution-table summary::-webkit-details-marker { display: none; }
.distribution-table summary:hover > span { text-decoration: underline; text-underline-offset: 0.25rem; }
.distribution-table[open] .table-chevron { transform: rotate(180deg); }
.distribution-table table { width: 100%; margin-top: 0.5rem; border-collapse: collapse; text-align: left; font-size: 0.9375rem; line-height: 1.5rem; }
.distribution-table th, .distribution-table td { border-bottom: 1px solid #E5EAE2; padding: 0.625rem 0.75rem; overflow-wrap: anywhere; }
.distribution-table thead { background: #F4F6F2; color: #46564C; }
.distribution-table thead th { font-weight: 600; }
.distribution-table tbody th { font-weight: 400; color: #242B28; }
/* Number columns shrink to their content and never break mid-word; names take the rest. */
.distribution-table .table-count { width: 1%; overflow-wrap: normal; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 25rem) {
  .distribution-label-row { flex-direction: column; gap: 0.125rem; }
}
/* Wide panels: one line per category (name | bar | figures), bars aligned on one baseline. */
@container (min-width: 36rem) {
  .distribution-row { display: grid; grid-template-columns: minmax(9rem, 16rem) minmax(0, 1fr) 9.5rem; align-items: center; column-gap: 1.5rem; padding: 0.75rem 0; }
  .distribution-row:first-child { padding-top: 0.25rem; }
  .distribution-label-row { display: contents; }
  .distribution-label { grid-row: 1; grid-column: 1; }
  .distribution-track { grid-row: 1; grid-column: 2; height: 0.625rem; margin-top: 0; }
  .distribution-count { grid-row: 1; grid-column: 3; justify-content: flex-end; }
}
</style>
