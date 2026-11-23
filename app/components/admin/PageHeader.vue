<script setup lang="ts">
defineProps<{ title: string; description?: string; eyebrow?: string }>()
</script>

<template>
  <header class="admin-page-header">
    <div class="min-w-0">
      <p v-if="eyebrow" class="admin-eyebrow mb-2">{{ eyebrow }}</p>
      <h1 class="admin-page-title">{{ title }}</h1>
      <p v-if="description" class="admin-page-description">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="flex max-w-full flex-wrap items-center gap-3"><slot /></div>
  </header>
</template>
