<script setup lang="ts">
defineProps<{
  name: 'camera' | 'analysis' | 'clipboard' | 'shield' | 'leaf' | 'community' | 'lock'
}>()
</script>

<template>
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true" focusable="false">
    <g v-if="name === 'camera'">
      <path d="m8 6 1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Z" />
      <circle cx="12" cy="13" r="4" />
      <path d="M17.5 9h.5" />
    </g>
    <g v-else-if="name === 'analysis'">
      <path d="M12 6a3 3 0 0 0-5.8-1A3.7 3.7 0 0 0 4 11a4 4 0 0 0 2 7.3 3 3 0 0 0 6-.3V6Zm0 0a3 3 0 0 1 5.8-1A3.7 3.7 0 0 1 20 11a4 4 0 0 1-2 7.3 3 3 0 0 1-6-.3" />
      <path d="M6.2 5A3 3 0 0 0 8 8m-4 3a3 3 0 0 1 4 2m-2 5.3A3 3 0 0 1 8 16m9.8-11A3 3 0 0 1 16 8m4 3a3 3 0 0 0-4 2m2 5.3a3 3 0 0 0-2-2.3" />
    </g>
    <g v-else-if="name === 'clipboard'">
      <path d="M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
      <rect x="9" y="2" width="6" height="5" rx="1.5" />
      <path d="M8 12h8m-8 4h6" />
    </g>
    <g v-else-if="name === 'shield'">
      <path d="m12 3 8 3v6c0 5-3.7 7.7-8 10-4.3-2.3-8-5-8-10V6l8-3Z" />
      <path d="M12 7v10" />
    </g>
    <g v-else-if="name === 'leaf'">
      <path d="M20 3c.5 6.5-1 13-7 15-3 1-6-.5-7-3.5C3.5 7.5 12 5 20 3Z" />
      <path d="M4 21 16 9m-6 6v-4m0 4h4" />
    </g>
    <g v-else-if="name === 'community'">
      <circle cx="12" cy="7" r="3" />
      <path d="M6 21v-2a6 6 0 0 1 12 0v2M5 6a2.5 2.5 0 0 0 0 5m14-5a2.5 2.5 0 0 1 0 5M2 19v-1a4 4 0 0 1 3-3.9M22 19v-1a4 4 0 0 0-3-3.9" />
    </g>
    <g v-else-if="name === 'lock'">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </g>
  </svg>
</template>
