<script setup lang="ts">
const props = withDefaults(defineProps<{
  name?: string | null
  src?: string | null
  /** xs 28 px, sm 36 px, md 40 px, lg 64 px, xl 112 px */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** sage on light surfaces; glass on the forest sidebar or the home header */
  tone?: 'sage' | 'glass'
}>(), { name: '', src: null, size: 'md', tone: 'sage' })

const failed = ref(false)
const image = ref<HTMLImageElement>()
watch(() => props.src, () => { failed.value = false })
// An image that failed before hydration never fires @error on the client.
onMounted(() => { if (image.value?.complete && image.value.naturalWidth === 0) failed.value = true })
const initials = computed(() => (props.name ?? '').trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase())
</script>

<template>
  <!-- Decorative: the person's name is always written next to it. -->
  <span class="user-avatar" :data-size="size" :data-tone="tone" aria-hidden="true">
    <img v-if="src && !failed" ref="image" :src="src" alt="" width="256" height="256" decoding="async" @error="failed = true">
    <span v-else-if="initials">{{ initials }}</span>
    <AdminIcon v-else name="user" class="user-avatar-icon" />
  </span>
</template>

<style scoped>
.user-avatar { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; overflow: hidden; border-radius: 999px; background: #EAF0E9; font-weight: 650; line-height: 1; color: #285C48; user-select: none; }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.user-avatar[data-tone="glass"] { background: rgb(255 255 255 / 0.16); color: #FFFFFF; }
.user-avatar[data-size="xs"] { width: 1.75rem; height: 1.75rem; font-size: 0.6875rem; }
.user-avatar[data-size="sm"] { width: 2.25rem; height: 2.25rem; font-size: 0.8125rem; }
.user-avatar[data-size="md"] { width: 2.5rem; height: 2.5rem; font-size: 0.875rem; }
.user-avatar[data-size="lg"] { width: 4rem; height: 4rem; font-size: 1.25rem; }
.user-avatar[data-size="xl"] { width: 7rem; height: 7rem; font-size: 2.25rem; letter-spacing: -0.02em; }
.user-avatar-icon { width: 55%; height: 55%; }
</style>
