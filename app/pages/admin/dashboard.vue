<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Ruang Petugas — RimbaGuard AI', robots: 'noindex' })
</script>

<template>
  <div class="page-container py-14 sm:py-20">
    <p class="eyebrow">Ruang petugas</p>
    <h1 class="mt-4 text-4xl font-semibold text-forest-900">Laporan siap diperiksa.</h1>
    <p class="mt-5 max-w-2xl body-copy">Anda dapat melihat laporan dan bukti melalui daftar yang dilindungi akses petugas. Verifikasi dan pengelolaan tindak lanjut akan ditambahkan pada fase administrasi.</p>
    <div class="mt-8 flex flex-wrap gap-4"><NuxtLink to="/reports" class="button-primary">Buka daftar laporan</NuxtLink><NuxtLink to="/map" class="button-secondary">Lihat peta publik</NuxtLink></div>
  </div>
</template>
