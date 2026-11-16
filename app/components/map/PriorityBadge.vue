<script setup lang="ts">
import type { PriorityLevel } from '../../../shared/types/domain'
import { PRIORITY_MARKERS } from '#shared/constants/scoring'
const props = defineProps<{ level: PriorityLevel | null; stale?: boolean }>()
const marker = computed(() => PRIORITY_MARKERS[props.level ?? 'none'])
</script>

<template>
  <span class="inline-flex items-center gap-2 text-sm font-medium text-charcoal">
    <span class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold" :style="{ backgroundColor: marker.color, color: marker.text }" aria-hidden="true">{{ marker.letter }}</span>
    <span>{{ marker.label }}<span v-if="stale" class="font-normal text-charcoal/75"> · menunggu pembaruan</span></span>
  </span>
</template>
