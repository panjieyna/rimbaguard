<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Laporkan Ancaman — RimbaGuard AI', robots: 'noindex' })
const { data: session } = await useAuth()
</script>

<template>
  <div class="page-container py-12 sm:py-16">
    <div class="max-w-3xl">
      <p class="eyebrow">Laporan masyarakat</p>
      <h1 class="mt-4 text-4xl font-semibold tracking-tight text-forest-900 sm:text-5xl">Sampaikan yang Anda lihat.</h1>
      <p class="mt-5 body-copy">Lengkapi informasi, foto, dan lokasi agar petugas dapat memeriksa dugaan ancaman terhadap hutan.</p>
      <p v-if="session?.simulationMode" role="status" class="notice mt-6">Akun ini menggunakan mode simulasi. Laporan ditandai sebagai data pengujian dan dikecualikan dari statistik serta peta publik.</p>
      <div class="mt-10"><ReportsReportForm @saved="id => navigateTo(`/reports/${id}?submitted=1`)" /></div>
    </div>
  </div>
</template>
