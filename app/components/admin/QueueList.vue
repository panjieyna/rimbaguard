<script setup lang="ts">
import type { AdminMapReport } from '../../../shared/types/map-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { CATEGORY_SOURCE_LABELS } from '#shared/constants/scoring'
import { formatReportDate } from '~/utils/dates'
defineProps<{ reports: AdminMapReport[]; caption: string }>()
const score = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
</script>

<template>
  <div>
    <!-- Table from 1024 px; stacked rows below so nothing scrolls sideways on phones. -->
    <table class="hidden w-full text-left text-sm lg:table">
      <caption class="sr-only">{{ caption }}</caption>
      <thead class="border-b border-line text-xs text-charcoal/75">
        <tr><th scope="col" class="py-2 pr-4 font-medium">Laporan</th><th scope="col" class="py-2 pr-4 font-medium">Kategori</th><th scope="col" class="py-2 pr-4 font-medium">Lokasi</th><th scope="col" class="py-2 pr-4 font-medium">Prioritas</th><th scope="col" class="py-2 pr-4 text-right font-medium">Skor</th><th scope="col" class="py-2 pr-4 font-medium">Dikirim</th><th scope="col" class="py-2 pr-4 font-medium">Status</th><th scope="col" class="py-2 font-medium"><span class="sr-only">Tindakan</span></th></tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr v-for="report in reports" :key="report.id" class="align-top">
          <td class="py-3 pr-4"><span class="font-mono text-xs text-charcoal/75">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="ml-2 rounded bg-sage-100 px-1.5 text-xs font-semibold text-forest-900">SIMULASI</span><span class="mt-1 block max-w-64 font-medium leading-snug">{{ report.title }}</span></td>
          <td class="py-3 pr-4">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }}<span class="block text-xs text-charcoal/70">{{ CATEGORY_SOURCE_LABELS[report.categorySource] }}</span></td>
          <td class="py-3 pr-4">{{ report.locationName || 'Lokasi tanpa nama' }}</td>
          <td class="py-3 pr-4"><MapPriorityBadge :level="report.priority?.level ?? null" :stale="report.priority?.stale" /></td>
          <td class="py-3 pr-4 text-right tabular-nums">{{ report.priority ? score(report.priority.totalScore) : '–' }}</td>
          <td class="py-3 pr-4 whitespace-nowrap">{{ formatReportDate(report.createdAt) }}</td>
          <td class="py-3 pr-4"><ReportsReportStatus :status="report.status" /></td>
          <td class="py-3"><NuxtLink :to="`/admin/reports/${report.id}`" class="button-secondary px-4 py-2" :aria-label="`Tinjau laporan ${report.reportCode}`">Tinjau</NuxtLink></td>
        </tr>
      </tbody>
    </table>
    <ul class="divide-y divide-line border-y border-line lg:hidden" :aria-label="caption">
      <li v-for="report in reports" :key="report.id" class="py-4">
        <NuxtLink :to="`/admin/reports/${report.id}`" class="block hover:text-forest-700">
          <span class="flex flex-wrap items-center gap-2 text-xs"><span class="font-mono text-charcoal/75">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="rounded bg-sage-100 px-1.5 font-semibold text-forest-900">SIMULASI</span></span>
          <span class="mt-1 block font-medium leading-snug">{{ report.title }}</span>
          <span class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"><MapPriorityBadge :level="report.priority?.level ?? null" :stale="report.priority?.stale" /><span v-if="report.priority" class="text-sm tabular-nums text-charcoal/80">Skor {{ score(report.priority.totalScore) }}</span></span>
          <span class="mt-2 block text-xs leading-5 text-charcoal/75">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }} · {{ report.locationName || 'Lokasi tanpa nama' }} · {{ formatReportDate(report.createdAt) }}</span>
          <span class="mt-2 block"><ReportsReportStatus :status="report.status" /></span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
