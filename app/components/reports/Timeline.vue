<script setup lang="ts">
import type { ReportTimelineEvent } from '../../../shared/types/report-api'
import { REPORT_STATUS_LABELS } from '#shared/constants/domain'
import { auditEventLabel } from '#shared/constants/workflow'
import { analysisFailureMessage } from '#shared/constants/analysis'
import { formatReportDate } from '~/utils/dates'
defineProps<{ updates: ReportTimelineEvent[]; officerView?: boolean }>()
const actorLabels = { user: 'Pelapor', admin: 'Petugas', system: 'Sistem' } as const
</script>

<template>
  <ol v-if="updates.length" class="mt-5 space-y-5 border-l border-line pl-4">
    <li v-for="update in updates" :key="update.id">
      <p class="text-sm font-medium">{{ auditEventLabel(update.action, update.newStatus) }}</p>
      <p v-if="update.action !== 'status_changed' && update.action !== 'report_created'" class="mt-1 text-xs text-charcoal/75">Status laporan: {{ REPORT_STATUS_LABELS[update.newStatus] }}</p>
      <p class="mt-1 text-xs leading-5 text-charcoal/75">{{ formatReportDate(update.createdAt) }}<template v-if="officerView"> · {{ update.actorName || actorLabels[update.actorType] }}</template></p>
      <p v-if="update.note" class="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{{ update.action === 'ai_analysis_failed' && /^AI_[A-Z_]+$/.test(update.note) ? analysisFailureMessage(update.note) : update.note }}</p>
      <p v-if="officerView && update.action === 'admin_note'" class="mt-1 text-xs text-charcoal/70">Internal · tidak terlihat oleh pelapor</p>
    </li>
  </ol>
  <p v-else class="mt-4 form-hint">Belum ada pembaruan.</p>
</template>
