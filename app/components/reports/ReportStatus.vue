<script setup lang="ts">
import type { ReportStatus } from '../../../shared/types/domain'
import { REPORT_STATUS_LABELS } from '#shared/constants/domain'
defineProps<{ status: ReportStatus }>()
</script>

<template>
  <span class="inline-flex items-center gap-2 text-sm font-medium text-charcoal"><span class="size-1.5 rounded-full" :class="status === 'analysis_failed' || status === 'rejected' ? 'bg-alert-red' : status === 'resolved' || status === 'verified' ? 'bg-success' : 'bg-alert-amber'" aria-hidden="true" />{{ REPORT_STATUS_LABELS[status] }}</span>
</template>
