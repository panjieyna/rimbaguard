<script setup lang="ts">
import { formatCount } from '~/utils/analytics'
import type { AdminIconName } from '~/types/admin-ui'
withDefaults(defineProps<{ label: string; value: number; hint?: string; to?: string; icon?: AdminIconName; tone?: 'forest' | 'amber' | 'red' }>(), { icon: 'reports', tone: 'forest' })
</script>

<template>
  <div class="admin-panel admin-stat flex h-full flex-col p-5 sm:p-6">
    <dt class="admin-stat-label flex min-h-12 items-center justify-between gap-3 text-sm leading-6 font-semibold text-forest-900"><span>{{ label }}</span><span class="flex size-10 shrink-0 items-center justify-center rounded-xl" :class="tone === 'amber' ? 'bg-[#F8EEDB] text-[#8A5B16]' : tone === 'red' ? 'bg-[#F8E8E5] text-[#A44238]' : 'bg-sage-100 text-forest-700'"><AdminIcon :name="icon" class="size-5" /></span></dt>
    <dd class="admin-stat-value mt-5 leading-none font-semibold tracking-tight text-forest-900">{{ formatCount(value) }}</dd>
    <dd v-if="hint" class="mt-4 text-sm leading-7 text-charcoal/85">{{ hint }}</dd>
    <dd v-if="to" class="mt-auto pt-4"><NuxtLink :to="to" class="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-forest-700 hover:underline underline-offset-4">Lihat laporan<AdminIcon name="arrow-right" class="size-4" /></NuxtLink></dd>
  </div>
</template>

<style scoped>
.admin-stat { border-top: 3px solid #A8C0A0; }
.admin-stat-label { font-size: 1rem; }
.admin-stat-value { font-size: 3rem; }
</style>
