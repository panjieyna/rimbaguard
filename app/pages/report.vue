<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Laporkan Ancaman — RimbaGuard AI', robots: 'noindex' })
const { data: session } = await useAuth()
</script>

<template>
  <div class="page-container compose-page">
    <header class="compose-header">
      <p class="eyebrow">Laporan masyarakat</p>
      <h1>Sampaikan yang Anda lihat.</h1>
      <p class="compose-intro">Mulai dengan foto dan cerita singkat. Asisten AI membantu menyiapkan draf; Anda memeriksa isinya dan melengkapi lokasi sebelum mengirim.</p>
      <p v-if="session?.simulationMode" role="status" class="notice mt-6">Akun ini menggunakan mode simulasi. Laporan ditandai sebagai data pengujian dan dikecualikan dari statistik serta peta publik.</p>
    </header>
    <div class="compose-layout">
      <ReportsReportForm @saved="id => navigateTo(`/reports/${id}?submitted=1`)" />
    </div>
  </div>
</template>

<style scoped>
.compose-page { padding-top: 2.5rem; padding-bottom: 4rem; }
.compose-header { border: 1px solid #D0DCC9; border-radius: 1.25rem; background: #E5EDDF; padding: 1.5rem; }
.compose-header h1 { margin-top: 0.75rem; font-size: 2.125rem; line-height: 1.2; letter-spacing: -0.035em; font-weight: 600; color: #173D32; }
.compose-intro { max-width: 46rem; margin-top: 1rem; font-size: 1.0625rem; line-height: 1.75rem; color: #465C49; }
.compose-layout { min-width: 0; margin-top: 2rem; }
@media (min-width: 40rem) {
  .compose-page { padding-top: 3rem; }
  .compose-header { padding: 2rem; }
  .compose-header h1 { font-size: 2.75rem; }
  .compose-intro { font-size: 1.125rem; line-height: 1.875rem; }
}
</style>
