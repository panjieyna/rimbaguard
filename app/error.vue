<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()
const message = computed(() => props.error.statusCode === 404 ? 'Halaman yang Anda cari belum tersedia.' : 'Halaman belum dapat dimuat. Silakan coba lagi.')
</script>

<template>
  <div class="page-container flex min-h-dvh flex-col justify-center py-16">
    <p class="eyebrow">RimbaGuard AI · {{ error.statusCode }}</p>
    <h1 class="mt-5 text-3xl font-semibold text-forest-900">{{ message }}</h1>
    <button class="button-primary mt-8 self-start" type="button" @click="clearError({ redirect: '/' })">Kembali ke beranda</button>
  </div>
</template>
