<script setup lang="ts">
import type { AdminMapReport } from '../../../shared/types/map-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { CATEGORY_SOURCE_LABELS } from '#shared/constants/scoring'
import { formatReportDate } from '~/utils/dates'
defineProps<{ reports: AdminMapReport[]; caption: string }>()
const score = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
</script>

<template>
  <div class="admin-queue">
    <!-- Group secondary metadata so the queue remains readable in an admin workspace. -->
    <table class="hidden w-full table-fixed text-left text-sm xl:table">
      <caption class="sr-only">{{ caption }}</caption>
      <thead class="queue-heading border-b border-line">
        <tr><th scope="col" class="w-[47%] px-6 py-4 font-medium">Laporan</th><th scope="col" class="w-[20%] px-4 py-4 font-medium">Prioritas</th><th scope="col" class="w-[21%] px-4 py-4 font-medium">Status</th><th scope="col" class="px-4 py-4 font-medium"><span class="sr-only">Tindakan</span></th></tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr v-for="report in reports" :key="report.id" class="align-top hover:bg-[#FAFCF8]">
          <td class="px-6 py-5">
            <div class="flex items-start gap-4">
              <AdminEvidencePreview :report-id="report.id" :report-title="report.title" :report-code="report.reportCode" class="mt-1 shrink-0" />
              <div class="min-w-0"><span class="queue-meta font-mono">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="ml-2 rounded-md bg-sage-100 px-2 py-1 text-xs font-semibold text-forest-900">SIMULASI</span><NuxtLink :to="`/admin/reports/${report.id}`" class="queue-title mt-2 block hover:underline">{{ report.title }}</NuxtLink><span class="queue-category mt-2 block">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }}</span><span class="queue-meta block">{{ CATEGORY_SOURCE_LABELS[report.categorySource] }}</span><span class="queue-meta mt-2 flex flex-wrap gap-x-3 gap-y-1"><span>{{ report.locationName || 'Lokasi tanpa nama' }}</span><span>{{ formatReportDate(report.createdAt) }}</span></span></div>
            </div>
          </td>
          <td class="px-4 py-5"><MapPriorityBadge class="queue-badge" :level="report.priority?.level ?? null" :stale="report.priority?.stale" /><span class="queue-score mt-2 block tabular-nums">{{ report.priority ? `Skor ${score(report.priority.totalScore)} / 100` : 'Skor belum dihitung' }}</span></td>
          <td class="px-4 py-5"><ReportsReportStatus class="queue-badge queue-status" :status="report.status" /></td>
          <td class="px-4 py-5"><NuxtLink :to="`/admin/reports/${report.id}`" class="queue-action inline-flex min-h-12 items-center gap-1 hover:underline" :aria-label="`Tinjau laporan ${report.reportCode}`">Tinjau<AdminIcon name="chevron-right" class="size-4" /></NuxtLink></td>
        </tr>
      </tbody>
    </table>
    <ul class="divide-y divide-line xl:hidden" :aria-label="caption">
      <li v-for="report in reports" :key="report.id" class="px-5 py-5 sm:px-6">
        <div class="mb-4 flex items-center gap-3"><AdminEvidencePreview :report-id="report.id" :report-title="report.title" :report-code="report.reportCode" /><span class="queue-meta">Foto bukti<br>Klik untuk memperbesar</span></div>
        <NuxtLink :to="`/admin/reports/${report.id}`" class="block rounded-md hover:text-forest-700">
          <span class="flex flex-wrap items-center gap-2"><span class="queue-meta font-mono">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="rounded bg-sage-100 px-1.5 text-xs font-semibold text-forest-900">SIMULASI</span></span>
          <span class="queue-title mt-2 block">{{ report.title }}</span>
          <span class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"><MapPriorityBadge class="queue-badge" :level="report.priority?.level ?? null" :stale="report.priority?.stale" /><span v-if="report.priority" class="queue-score tabular-nums">Skor {{ score(report.priority.totalScore) }}</span></span>
          <span class="queue-category mt-3 block">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }}</span><span class="queue-meta block">{{ CATEGORY_SOURCE_LABELS[report.categorySource] }}</span><span class="queue-meta mt-2 block">{{ report.locationName || 'Lokasi tanpa nama' }} · {{ formatReportDate(report.createdAt) }}</span>
          <span class="mt-3 flex flex-wrap items-center justify-between gap-3"><ReportsReportStatus class="queue-badge queue-status" :status="report.status" /><span class="queue-action inline-flex min-h-11 items-center gap-1">Tinjau laporan<AdminIcon name="chevron-right" class="size-4" /></span></span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.queue-heading { background: #EDF3E9; color: #173D32; }
.queue-heading th { font-size: 1rem; line-height: 1.5rem; font-weight: 600; }
.queue-title { font-size: 1.125rem; line-height: 1.75rem; font-weight: 600; color: #173D32; }
.queue-category { font-size: 1rem; line-height: 1.625rem; color: #343F38; }
.queue-meta { font-size: 0.875rem; line-height: 1.5rem; color: #526058; }
.queue-score { font-size: 1rem; line-height: 1.625rem; color: #46564C; }
.queue-action { font-size: 1rem; line-height: 1.5rem; font-weight: 600; color: #285C48; }
.admin-queue :deep(.queue-badge) { font-size: 1rem; line-height: 1.625rem; font-weight: 500; }
.admin-queue :deep(.queue-status > span:first-child) { width: 0.5rem; height: 0.5rem; flex-shrink: 0; }
</style>
