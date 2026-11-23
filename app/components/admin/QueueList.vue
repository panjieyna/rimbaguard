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
    <table class="hidden w-full table-fixed text-left text-base xl:table">
      <caption class="sr-only">{{ caption }}</caption>
      <thead class="border-b border-line bg-[#F3F6EF] text-sm text-forest-900">
        <tr><th scope="col" class="w-[47%] px-6 py-4 font-medium">Laporan</th><th scope="col" class="w-[20%] px-4 py-4 font-medium">Prioritas</th><th scope="col" class="w-[21%] px-4 py-4 font-medium">Status</th><th scope="col" class="px-4 py-4 font-medium"><span class="sr-only">Tindakan</span></th></tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr v-for="report in reports" :key="report.id" class="align-top hover:bg-[#FAFCF8]">
          <td class="px-6 py-5">
            <div class="flex items-start gap-4">
              <AdminEvidencePreview :report-id="report.id" :report-title="report.title" :report-code="report.reportCode" class="mt-1 shrink-0" />
              <div class="min-w-0"><span class="font-mono text-xs text-charcoal/65">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="ml-2 rounded-md bg-sage-100 px-2 py-1 text-xs font-semibold text-forest-900">SIMULASI</span><NuxtLink :to="`/admin/reports/${report.id}`" class="queue-title mt-2 block font-semibold text-forest-900 hover:underline">{{ report.title }}</NuxtLink><span class="mt-2 block text-sm leading-6 text-charcoal/80">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }}</span><span class="block text-xs leading-5 text-charcoal/65">{{ CATEGORY_SOURCE_LABELS[report.categorySource] }}</span><span class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-charcoal/65"><span>{{ report.locationName || 'Lokasi tanpa nama' }}</span><span>{{ formatReportDate(report.createdAt) }}</span></span></div>
            </div>
          </td>
          <td class="px-4 py-5"><MapPriorityBadge class="queue-badge" :level="report.priority?.level ?? null" :stale="report.priority?.stale" /><span class="mt-2 block text-sm tabular-nums text-charcoal/70">{{ report.priority ? `Skor ${score(report.priority.totalScore)} / 100` : 'Skor belum dihitung' }}</span></td>
          <td class="px-4 py-5"><ReportsReportStatus class="queue-badge" :status="report.status" /></td>
          <td class="px-4 py-5"><NuxtLink :to="`/admin/reports/${report.id}`" class="queue-review inline-flex min-h-11 items-center gap-1 rounded-full border border-[#DCE3D8] bg-white px-3 text-sm font-semibold text-forest-700 hover:bg-sage-100" :aria-label="`Tinjau laporan ${report.reportCode}`">Tinjau<AdminIcon name="chevron-right" class="size-4" /></NuxtLink></td>
        </tr>
      </tbody>
    </table>
    <ul class="divide-y divide-line xl:hidden" :aria-label="caption">
      <li v-for="report in reports" :key="report.id" class="px-5 py-5 sm:px-6">
        <div class="mb-4 flex items-center gap-3"><AdminEvidencePreview :report-id="report.id" :report-title="report.title" :report-code="report.reportCode" /><span class="text-sm leading-6 text-charcoal/65">Foto bukti<br>Klik untuk memperbesar</span></div>
        <NuxtLink :to="`/admin/reports/${report.id}`" class="block rounded-md hover:text-forest-700">
          <span class="flex flex-wrap items-center gap-2 text-xs"><span class="font-mono text-charcoal/75">{{ report.reportCode }}</span><span v-if="report.isSimulation" class="rounded bg-sage-100 px-1.5 font-semibold text-forest-900">SIMULASI</span></span>
          <span class="queue-title mt-2 block font-semibold text-forest-900">{{ report.title }}</span>
          <span class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"><MapPriorityBadge :level="report.priority?.level ?? null" :stale="report.priority?.stale" /><span v-if="report.priority" class="text-sm tabular-nums text-charcoal/80">Skor {{ score(report.priority.totalScore) }}</span></span>
          <span class="mt-3 block text-sm leading-6 text-charcoal/75">{{ THREAT_CATEGORY_LABELS[report.effectiveCategory] }}</span><span class="block text-xs leading-5 text-charcoal/65">{{ CATEGORY_SOURCE_LABELS[report.categorySource] }}</span><span class="mt-2 block text-sm leading-6 text-charcoal/65">{{ report.locationName || 'Lokasi tanpa nama' }} · {{ formatReportDate(report.createdAt) }}</span>
          <span class="mt-3 flex flex-wrap items-center justify-between gap-3"><ReportsReportStatus :status="report.status" /><span class="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-forest-700">Tinjau laporan<AdminIcon name="chevron-right" class="size-4" /></span></span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.admin-queue { overflow-wrap: anywhere; }
.admin-queue th { font-size: 0.9375rem; font-weight: 600; }
.queue-title { font-size: 1.125rem; line-height: 1.75rem; letter-spacing: -0.015em; }
.queue-badge { align-items: flex-start; font-size: 0.9375rem; line-height: 1.5rem; }
.queue-review { white-space: nowrap; }
</style>
