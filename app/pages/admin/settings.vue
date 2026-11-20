<script setup lang="ts">
import type { AdminSettingsResponse } from '../../../shared/types/admin-api'
import { NEARBY_RADIUS_KM, NEARBY_WINDOW_DAYS, PRIORITY_THRESHOLDS, SCORING_WEIGHTS } from '#shared/constants/scoring'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Pengaturan — RimbaGuard AI', robots: 'noindex' })
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('admin-settings', () => requestFetch<AdminSettingsResponse>('/api/admin/settings'))
// The session is the single source of the account shown here, so the header,
// sidebar and this page change together after an edit.
const { data: session } = await useAuth()
const user = computed(() => session.value?.user ?? null)
const percent = (value: number) => `${Math.round(value * 100)}%`
const scoringParts = [
  { label: 'Keparahan', value: SCORING_WEIGHTS.severity },
  { label: 'Kelengkapan laporan', value: SCORING_WEIGHTS.completeness },
  { label: 'Kebaruan kejadian', value: SCORING_WEIGHTS.recency },
  { label: 'Laporan serupa', value: SCORING_WEIGHTS.nearby },
] as const
</script>

<template>
  <div class="admin-page">
    <AdminPageHeader title="Pengaturan" description="Atur foto profil, nama, kata sandi, dan sesi akun Anda. Pantau juga keadaan layanan dan aturan prioritas." />
    <template v-if="user">
      <!-- One column: every section follows the previous one down the page. -->
      <AccountProfileHero :user="user" role-label="Petugas RimbaGuard" />

      <AccountCard heading-id="settings-profile" icon="user" title="Profil" description="Nama yang tampil di ruang petugas dan pada riwayat tindakan laporan.">
        <AccountNameForm :user="user" hint="Nama ini tampil di ruang petugas dan pada riwayat tindakan laporan." email-hint="Dipakai untuk masuk. Email dan peran petugas diatur oleh operator." />
      </AccountCard>

      <AccountCard heading-id="settings-password" icon="key" title="Kata sandi" description="Gunakan kata sandi yang kuat dan tidak dipakai di layanan lain.">
        <AccountPasswordForm :email="user.email" />
      </AccountCard>

      <AccountCard heading-id="settings-session" icon="lock" title="Sesi dan perangkat" description="Tentukan dari perangkat mana akun ini keluar.">
        <AccountSessionActions />
      </AccountCard>

      <AccountCard heading-id="settings-services" icon="database" title="Keadaan layanan" description="Koneksi yang dibutuhkan ruang petugas.">
        <template #actions><button type="button" class="settings-text-button" :disabled="status === 'pending'" @click="refresh()"><AdminIcon name="refresh" class="size-4" />{{ status === 'pending' ? 'Memeriksa…' : 'Periksa ulang' }}</button></template>
        <p v-if="status === 'pending' && !data" role="status" class="settings-muted">Memeriksa layanan…</p>
        <div v-else-if="error" role="alert" class="settings-muted"><p>Keadaan layanan belum dapat dimuat.</p><button type="button" class="text-link mt-2 min-h-11" @click="refresh()">Coba kembali</button></div>
        <template v-else-if="data">
          <ul class="service-list" role="list">
            <li class="service-row">
              <span class="service-icon" aria-hidden="true"><AdminIcon name="database" class="size-5" /></span>
              <span class="service-name">Database dan autentikasi</span>
              <span class="service-pill" :data-state="data.services.database === 'available' ? 'good' : 'bad'"><span class="service-dot" aria-hidden="true" />{{ data.services.database === 'available' ? 'Tersedia' : 'Tidak dapat dihubungi' }}</span>
            </li>
            <li class="service-row">
              <span class="service-icon" aria-hidden="true"><AdminIcon name="leaf" class="size-5" /></span>
              <span class="service-name">Analisis AI<span v-if="data.services.ai.configured && data.services.ai.model" class="service-model">{{ data.services.ai.model }}</span></span>
              <span class="service-pill" :data-state="data.services.ai.configured ? 'good' : 'idle'"><span class="service-dot" aria-hidden="true" />{{ data.services.ai.configured ? 'Terkonfigurasi' : 'Belum dikonfigurasi' }}</span>
            </li>
          </ul>
          <p class="settings-note">"Terkonfigurasi" berarti kunci tersedia di server, bukan jaminan kuota atau ketersediaan model saat ini.</p>
        </template>
      </AccountCard>

      <AccountCard heading-id="settings-scoring" icon="analytics" title="Aturan skor prioritas" description="Bobot setiap komponen dalam total skor laporan.">
        <template v-if="data" #actions><span class="settings-version">{{ data.scoring.version }}</span></template>
        <div class="weight-area">
          <ul class="weight-list" role="list">
            <li v-for="part in scoringParts" :key="part.label">
              <div class="weight-row"><span>{{ part.label }}</span><strong>{{ percent(part.value) }}</strong></div>
              <div class="weight-track" aria-hidden="true"><div class="weight-fill" :style="{ width: percent(part.value) }" /></div>
            </li>
          </ul>
        </div>
        <details class="settings-details">
          <summary><span>Lihat penjelasan aturan</span><AdminIcon name="chevron-down" class="settings-chevron size-4" /></summary>
          <div class="settings-details-body">
            <p>Ambang prioritas: tinggi {{ PRIORITY_THRESHOLDS.high }}, sedang {{ PRIORITY_THRESHOLDS.medium }}, dan rendah {{ PRIORITY_THRESHOLDS.low }}. Laporan serupa dihitung dalam radius {{ NEARBY_RADIUS_KM }} km dan selisih waktu {{ NEARBY_WINDOW_DAYS }} hari.</p>
            <p>Rincian perhitungan tampil di setiap laporan. Aturan ditetapkan melalui migrasi database; perubahan memerlukan versi baru agar riwayat tetap dapat diaudit.</p>
          </div>
        </details>
      </AccountCard>
    </template>
  </div>
</template>

<style scoped>
.settings-note { display: flex; align-items: flex-start; gap: 0.5rem; margin-top: 1.25rem; border-radius: 0.75rem; background: #F4F6F2; padding: 0.75rem 1rem; font-size: 0.875rem; line-height: 1.375rem; color: #4F5B53; }
.settings-note :deep(svg) { margin-top: 0.125rem; color: #4B8065; }
.settings-muted { font-size: 0.9375rem; line-height: 1.5rem; color: #4F5B53; }
.settings-text-button { display: inline-flex; min-height: 2.75rem; align-items: center; gap: 0.5rem; border-radius: 0.625rem; padding: 0 0.625rem; font-size: 0.9375rem; font-weight: 600; color: #285C48; }
.settings-text-button:hover:not(:disabled) { background: #EAF0E9; }
.settings-text-button:disabled { opacity: 0.6; }
.settings-version { border-radius: 0.5rem; background: #EAF0E9; padding: 0.25rem 0.625rem; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.8125rem; line-height: 1.25rem; color: #285C48; }

.service-list { display: grid; margin: 0; padding: 0; list-style: none; }
.service-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0.5rem 0.875rem; padding: 0.875rem 0; }
.service-row:first-child { padding-top: 0; }
.service-row + .service-row { border-top: 1px solid #EDF1EB; }
.service-icon { display: flex; width: 2.5rem; height: 2.5rem; align-items: center; justify-content: center; border-radius: 0.75rem; background: #F4F6F2; color: #285C48; }
.service-name { display: grid; font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; }
.service-model { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.8125rem; font-weight: 400; color: #5C665F; overflow-wrap: anywhere; }
.service-pill { display: inline-flex; width: fit-content; grid-column: 2; align-items: center; gap: 0.5rem; border-radius: 999px; background: #EDF5EA; padding: 0.25rem 0.75rem; font-size: 0.875rem; font-weight: 600; line-height: 1.375rem; color: #24543B; }
.service-pill[data-state="bad"] { background: #FBEFEB; color: #8E2A24; }
.service-pill[data-state="idle"] { background: #F1F3EF; color: #4F5B53; }
.service-dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: currentColor; }
@media (min-width: 30rem) {
  .service-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .service-pill { grid-column: auto; }
}

.weight-area { container-type: inline-size; }
.weight-list { display: grid; gap: 1rem; margin: 0; padding: 0; list-style: none; }
@container (min-width: 44rem) {
  .weight-list { grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 2rem; }
}
@container (min-width: 26rem) and (max-width: 43.99rem) {
  .weight-list { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 1.5rem; }
}
.weight-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; font-size: 0.9375rem; line-height: 1.5rem; color: #4F5B53; }
.weight-row strong { font-size: 1.125rem; font-weight: 650; color: #173D32; }
.weight-track { height: 0.5rem; margin-top: 0.375rem; overflow: hidden; border-radius: 999px; background: #E3EBE1; }
.weight-fill { height: 100%; border-radius: inherit; background: #287A52; }
.settings-details { margin-top: 1.25rem; border-top: 1px solid #EDF1EB; padding-top: 0.5rem; }
.settings-details summary { display: flex; min-height: 2.75rem; cursor: pointer; align-items: center; justify-content: space-between; gap: 0.75rem; list-style: none; font-size: 0.9375rem; font-weight: 600; color: #285C48; }
.settings-details summary::-webkit-details-marker { display: none; }
.settings-details summary:hover > span { text-decoration: underline; text-underline-offset: 0.25rem; }
.settings-details[open] .settings-chevron { transform: rotate(180deg); }
.settings-details-body { display: grid; gap: 0.75rem; padding-top: 0.5rem; font-size: 0.9375rem; line-height: 1.625rem; color: #4F5B53; }
</style>
