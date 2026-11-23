<script setup lang="ts">
import type { ReportStatus } from '../../../shared/types/domain'
import { REPORT_STATUS_LABELS } from '#shared/constants/domain'
defineProps<{ status: ReportStatus }>()
</script>

<template>
  <span class="report-status-indicator inline-flex max-w-full items-start gap-2 text-sm leading-6 font-medium text-charcoal">
    <span class="mt-[0.5625rem] size-1.5 shrink-0 rounded-full" :class="status === 'analysis_failed' || status === 'rejected' ? 'bg-alert-red' : status === 'resolved' || status === 'verified' ? 'bg-success' : 'bg-alert-amber'" aria-hidden="true" />
    <span class="min-w-0">{{ REPORT_STATUS_LABELS[status] }}</span>
  </span>
</template>
