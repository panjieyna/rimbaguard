<script setup lang="ts">
import type { AdminIconName } from '~/types/admin-ui'
defineProps<{ name: AdminIconName }>()
const paths: Record<AdminIconName, string> = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  reports: 'M7 3h10l4 4v14H3V3h4 M16 3v5h5 M7 12h10 M7 16h7',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6z M9 3v15 M15 6v15',
  analytics: 'M4 3v17h17 M8 15v-4 M13 15V7 M18 15V4',
  settings: 'M4 7h16 M4 17h16 M9 4v6 M15 14v6',
  'arrow-right': 'M4 12h16 m-6-6 6 6-6 6',
  external: 'M14 3h7v7 M21 3 11 13 M10 5H4v15h15v-6',
  logout: 'M10 4H4v16h6 M9 12h12 m-5-5 5 5-5 5',
  'chevron-right': 'm9 5 7 7-7 7',
  'chevron-down': 'm5 9 7 7 7-7',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  alert: 'm12 3 10 18H2L12 3z M12 9v5 M12 17v.5',
  shield: 'm12 3 8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3z m-4 9 3 3 5-6',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 m-1 5 6 6',
  filter: 'M3 5h18 M6 12h12 M9 19h6',
  refresh: 'M20 7V3l-3 3 M4 17v4l3-3 M20 10a8 8 0 0 0-13-4 M4 14a8 8 0 0 0 13 4',
  database: 'M21 6c0 2-4 3-9 3S3 8 3 6s4-3 9-3 9 1 9 3z M3 6v12c0 2 4 3 9 3s9-1 9-3V6 M3 12c0 2 4 3 9 3s9-1 9-3',
  leaf: 'M20 3c1 9-3 15-8 15-4 0-6-2-6-6 0-5 7-7 14-9z M4 21 16 9',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  lock: 'M5 10h14v11H5V10z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
}
</script>

<template>
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true" focusable="false"><path :d="paths[name]" /></svg>
</template>
