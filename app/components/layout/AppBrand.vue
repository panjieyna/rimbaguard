<script setup lang="ts">
defineProps<{ inverted?: boolean }>()
</script>

<template>
  <NuxtLink to="/" class="inline-flex items-center gap-2.5" :class="inverted ? 'text-white focus-visible:outline-white' : 'text-forest-900'" aria-label="RimbaGuard, beranda">
    <svg viewBox="0 0 32 32" fill="none" class="size-8 shrink-0" aria-hidden="true">
      <path d="M16 2 28 7v8c0 7-5 12-12 15C9 27 4 22 4 15V7L16 2Z" stroke="currentColor" stroke-width="1.6" />
      <path d="m16 8-6 10h4v6h4v-6h4L16 8Z" fill="currentColor" />
    </svg>
    <span class="text-lg font-semibold tracking-tight">RimbaGuard</span>
  </NuxtLink>
</template>
