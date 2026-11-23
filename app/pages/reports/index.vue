<script setup lang="ts">
import type { ReportListResponse } from '../../../shared/types/report-api'
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Laporan Saya — RimbaGuard', robots: 'noindex' })
const { data: session } = await useAuth()
const page = ref(1)
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('reports-list', () => requestFetch<ReportListResponse>('/api/reports', { query: { page: page.value, pageSize: 10 } }), { watch: [page] })
</script>

<template>
  <div class="page-container max-w-7xl reports-page">
    <div class="reports-header">
      <div><p class="eyebrow">Ruang laporan</p><h1>{{ session?.user?.role === 'admin' ? 'Semua laporan' : 'Laporan saya' }}</h1><p class="reports-intro">Ikuti status pemeriksaan dan lengkapi informasi ketika diperlukan.</p></div>
      <NuxtLink to="/report" class="button-primary reports-create"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Buat laporan</NuxtLink>
    </div>
    <p v-if="status === 'pending'" role="status" class="py-10 body-copy">Memuat laporan…</p>
    <div v-else-if="error" role="alert" class="notice mt-8"><p>Laporan belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3" @click="refresh()">Coba kembali</button></div>
    <div v-else-if="data && !data.reports.length" class="reports-empty"><h2 class="text-2xl font-semibold text-forest-900">Belum ada laporan.</h2><p class="mt-3 body-copy">Saat Anda menemukan indikasi ancaman, kirimkan informasi dan foto melalui formulir pelaporan.</p><NuxtLink to="/report" class="button-primary mt-5">Mulai laporan pertama</NuxtLink></div>
    <template v-else-if="data">
      <section class="reports-history" aria-labelledby="history-title">
      <div class="reports-list-heading"><div><h2 id="history-title">Riwayat laporan</h2><p>Pilih laporan untuk melihat detail dan perkembangan pemeriksaan.</p></div><span class="reports-total">{{ data.total.toLocaleString('id-ID') }} laporan dapat diakses</span></div>
      <ul class="reports-list">
        <li v-for="report in data.reports" :key="report.id"><ReportsListCard :report="report" /></li>
      </ul>
      <nav class="reports-pagination" aria-label="Halaman laporan"><button type="button" class="button-secondary" :disabled="page <= 1" @click="page--">Sebelumnya</button><span aria-live="polite">Halaman <strong>{{ page }}</strong> dari {{ Math.max(1, Math.ceil(data.total / data.pageSize)) }}</span><button type="button" class="button-secondary" :disabled="page * data.pageSize >= data.total" @click="page++">Berikutnya</button></nav>
      </section>
    </template>
  </div>
</template>

<style scoped>
.reports-page { padding-top: 2rem; padding-bottom: 3rem; }
.reports-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; }
.reports-header > div { flex: 1 1 28rem; min-width: 0; }
.reports-header h1 { margin-top: 0.75rem; font-size: clamp(2rem,3.2vw,2.5rem); font-weight: 600; line-height: 1.2; letter-spacing: -0.03em; color: #173D32; }
.reports-intro { margin-top: 0.875rem; max-width: 40rem; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.reports-create { flex-shrink: 0; border-radius: 999px; }
.reports-history { margin-top: 2rem; }
.reports-list-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; border-top: 1px solid #DCE3D8; padding-top: 1.5rem; }
.reports-list-heading h2 { font-size: 1.25rem; font-weight: 600; line-height: 1.875rem; color: #173D32; }
.reports-list-heading p { margin-top: 0.375rem; font-size: 1rem; line-height: 1.625rem; color: #526057; }
.reports-total { font-size: 0.9375rem; font-weight: 500; line-height: 1.5rem; color: #285C48; }
.reports-list { display: grid; gap: 1rem; }
.reports-list > li { min-width: 0; }
.reports-empty { margin-top: 2rem; border: 1px solid #DCE3D8; border-radius: 0.75rem; background: white; padding: 2rem 1.5rem; }
.reports-empty p { max-width: 40rem; }
.reports-empty .button-primary { border-radius: 999px; }
.reports-pagination { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid #DCE3D8; padding-top: 1.5rem; }
.reports-pagination > span { grid-row: 1; grid-column: 1 / -1; text-align: center; font-size: 1rem; color: #526057; }
.reports-pagination .button-secondary { border-radius: 999px; background: white; }
@media (min-width: 40rem) {
  .reports-page { padding-top: 2.5rem; padding-bottom: 4rem; }
  .reports-intro { font-size: 1.125rem; line-height: 1.875rem; }
  .reports-pagination { grid-template-columns: auto 1fr auto; }
  .reports-pagination > span { grid-row: auto; grid-column: auto; }
}
</style>
