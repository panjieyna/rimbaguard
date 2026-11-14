<script setup lang="ts">
const { data, status, error, refresh } = await useFetch('/api/health', { key: 'service-status' })
</script>

<template>
  <section aria-labelledby="service-status-title" class="border-t border-line pt-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h2 id="service-status-title" class="text-lg font-semibold text-forest-900">Ketersediaan layanan</h2>
      <button type="button" class="text-link min-h-11 text-sm disabled:opacity-50" :disabled="status === 'pending'" @click="refresh()">Periksa kembali</button>
    </div>
    <p v-if="status === 'pending'" role="status" class="mt-4 body-copy">Memeriksa layanan…</p>
    <p v-else-if="error" role="alert" class="mt-4 body-copy">Status layanan belum dapat dimuat. Silakan periksa kembali.</p>
    <template v-else-if="data">
      <p class="mt-3 body-copy">{{ data.mode === 'setup' ? 'Layanan pelaporan belum tersedia karena koneksi database belum dikonfigurasi.' : 'Konfigurasi database tersedia. Koneksi dan kebijakan akses tetap perlu diverifikasi sebelum pelaporan diaktifkan.' }}</p>
      <dl class="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt class="font-medium">Database dan autentikasi</dt><dd class="mt-1 text-charcoal/80">{{ data.services.supabase === 'configured' ? 'Terkonfigurasi · belum diverifikasi' : 'Belum terhubung' }}</dd></div>
        <div><dt class="font-medium">Analisis AI</dt><dd class="mt-1 text-charcoal/80">{{ data.services.gemini === 'configured' ? 'Terkonfigurasi · integrasi belum diaktifkan' : 'Belum terhubung' }}</dd></div>
      </dl>
    </template>
  </section>
</template>
