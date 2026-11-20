<script setup lang="ts">
import { formatCount } from '~/utils/analytics'
import type { AdminIconName } from '~/types/admin-ui'
withDefaults(defineProps<{ label: string; value: number; hint?: string; to?: string; icon?: AdminIconName; tone?: 'forest' | 'amber' | 'red' }>(), { icon: 'reports', tone: 'forest' })
</script>

<template>
  <div class="admin-stat-tile">
    <dt class="stat-label"><span>{{ label }}</span><span class="stat-icon" :data-tone="tone"><AdminIcon :name="icon" class="size-5" /></span></dt>
    <dd class="stat-value">{{ formatCount(value) }}</dd>
    <dd v-if="hint" class="stat-hint">{{ hint }}</dd>
    <dd v-if="to" class="stat-action"><NuxtLink :to="to" class="stat-link">Lihat laporan<AdminIcon name="arrow-right" class="size-4" /></NuxtLink></dd>
  </div>
</template>

<style scoped>
.admin-stat-tile {
  display: flex;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  border: 1px solid #C8D5C6;
  border-radius: 1rem;
  background: #E1E9DE;
  padding: 1.25rem;
  color: #173D32;
}
.stat-label {
  display: flex;
  min-height: 3.5rem;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.625rem;
}
.stat-label > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.stat-icon {
  display: flex;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: #CEDCCB;
  color: #285C48;
}
.stat-icon[data-tone="amber"] { background: #E9DCC2; color: #75501C; }
.stat-icon[data-tone="red"] { background: #E8D2CB; color: #8E3E34; }
.stat-value {
  margin-top: 1rem;
  font-size: 2.75rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.035em;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.stat-hint { margin-top: 0.875rem; font-size: 1rem; line-height: 1.625rem; color: #46564C; }
.stat-action { margin-top: auto; padding-top: 1rem; }
.stat-link {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5rem;
  color: #285C48;
  text-underline-offset: 0.25rem;
}
.stat-link:hover { text-decoration-line: underline; }
@media (min-width: 40rem) {
  .stat-value { font-size: 3rem; }
}
</style>
