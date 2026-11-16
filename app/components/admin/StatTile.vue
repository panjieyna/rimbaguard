<script setup lang="ts">
import { formatCount } from '~/utils/analytics'
defineProps<{ label: string; value: number; hint?: string; to?: string }>()
</script>

<template>
  <div class="rounded-lg border border-line bg-white p-5">
    <dt class="text-sm font-medium text-charcoal/80">{{ label }}</dt>
    <dd class="mt-2 text-3xl font-semibold tracking-tight text-forest-900">{{ formatCount(value) }}</dd>
    <dd v-if="hint" class="mt-2 text-xs leading-5 text-charcoal/75">{{ hint }}</dd>
    <dd v-if="to" class="mt-2"><NuxtLink :to="to" class="text-link inline-flex min-h-11 items-center text-sm">Lihat laporan</NuxtLink></dd>
  </div>
</template>
