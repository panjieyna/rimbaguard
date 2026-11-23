<script setup lang="ts">
import { formatCount } from '~/utils/analytics'
import type { AdminIconName } from '~/types/admin-ui'
withDefaults(defineProps<{ label: string; value: number; hint?: string; to?: string; icon?: AdminIconName; tone?: 'forest' | 'amber' | 'red'; featured?: boolean }>(), { icon: 'reports', tone: 'forest', featured: false })
</script>

<template>
  <div class="admin-stat-tile" :data-tone="tone" :class="{ 'stat-featured': featured }">
    <dt class="stat-label"><span>{{ label }}</span><span class="stat-icon" :data-tone="tone"><AdminIcon :name="icon" class="size-5" /></span></dt>
    <dd class="stat-value">{{ formatCount(value) }}</dd>
    <dd v-if="hint" class="stat-hint">{{ hint }}</dd>
    <dd v-if="to" class="stat-action"><NuxtLink :to="to" class="stat-link">Lihat laporan<AdminIcon name="arrow-right" class="size-4" /></NuxtLink></dd>
  </div>
</template>

<style scoped>
.admin-stat-tile {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.625rem 1rem;
  min-width: 0;
  height: 100%;
  border: 1px solid #D4DFD0;
  border-radius: 0.75rem;
  background: #EAF0E5;
  padding: 1.25rem;
  color: #173D32;
}
.stat-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.625rem;
}
.stat-label > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.stat-icon {
  display: flex;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #DCE7D6;
  color: #285C48;
}
.admin-stat-tile[data-tone="amber"] { border-color: #E5DDC8; background: #F3F0E5; }
.admin-stat-tile[data-tone="red"] { border-color: #E8DCD3; background: #F4ECE6; }
.stat-icon[data-tone="amber"] { background: #EAE0C7; color: #75501C; }
.stat-icon[data-tone="red"] { background: #EAD9D0; color: #8E3E34; }
.stat-value {
  align-self: center;
  font-size: 2.5rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.035em;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.stat-hint { grid-column: 1 / -1; font-size: 1rem; line-height: 1.5rem; color: #46564C; }
.stat-action { grid-column: 1 / -1; }
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
  .admin-stat-tile { display: flex; flex-direction: column; gap: 0; }
  .stat-label { min-height: 3.25rem; align-items: flex-start; }
  .stat-value { align-self: flex-start; margin-top: 0.75rem; font-size: 3rem; }
  .stat-hint { margin-top: 0.625rem; }
  .stat-action { margin-top: auto; padding-top: 0.375rem; }
}
.admin-stat-tile.stat-featured { border-color: #173D32; background: #173D32; color: white; }
.stat-featured .stat-icon { background: rgb(255 255 255 / 12%); color: #EAF0E9; }
.stat-featured .stat-hint { color: #DCE7DB; }
</style>
