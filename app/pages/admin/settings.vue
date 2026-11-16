<script setup lang="ts">
import type { AdminSettingsResponse } from '../../../shared/types/admin-api'
import { NEARBY_RADIUS_KM, NEARBY_WINDOW_DAYS, PRIORITY_THRESHOLDS, SCORING_WEIGHTS } from '#shared/constants/scoring'
import { readApiError } from '~/utils/api-error'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Pengaturan — RimbaGuard AI', robots: 'noindex' })
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('admin-settings', () => requestFetch<AdminSettingsResponse>('/api/admin/settings'))
const { refresh: refreshSession } = await useAuth()
const ready = ref(false)
onMounted(() => { ready.value = true })
const confirmGlobal = ref(false)
const signingOut = ref<'local' | 'global' | null>(null)
const signOutError = ref('')
const percent = (value: number) => `${Math.round(value * 100)}%`

async function signOut(scope: 'local' | 'global') {
  signingOut.value = scope
  signOutError.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST', body: { scope } })
    await refreshSession()
    await navigateTo('/')
  }
  catch (failure) { signOutError.value = readApiError(failure).message }
  finally { signingOut.value = null }
}
</script>

<template>
  <div class="max-w-4xl">
    <header>
      <p class="eyebrow">Ruang petugas</p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-forest-900 sm:text-4xl">Pengaturan</h1>
      <p class="mt-3 max-w-2xl body-copy">Akun, sesi, keadaan layanan, dan aturan skor yang sedang berlaku. Kunci layanan tidak pernah ditampilkan.</p>
    </header>
    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat pengaturan…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><p>Pengaturan belum dapat dimuat.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <div v-else-if="data" class="mt-8 space-y-6">
      <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="account-title">
        <h2 id="account-title" class="text-lg font-semibold text-forest-900">Akun</h2>
        <dl class="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div><dt class="text-charcoal/75">Nama</dt><dd class="mt-1 font-medium">{{ data.account.fullName || 'Belum diisi' }}</dd></div>
          <div><dt class="text-charcoal/75">Email</dt><dd class="mt-1 break-all font-medium">{{ data.account.email }}</dd></div>
          <div><dt class="text-charcoal/75">Peran</dt><dd class="mt-1 font-medium">Petugas (admin)</dd></div>
        </dl>
        <p class="form-hint">Peran petugas hanya dapat diberikan operator melalui prosedur database, bukan dari aplikasi.</p>
      </section>

      <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="session-title">
        <h2 id="session-title" class="text-lg font-semibold text-forest-900">Sesi</h2>
        <p class="mt-3 text-sm leading-6 text-charcoal/80">Keluar dari semua perangkat mencabut seluruh sesi akun ini, termasuk di perangkat lain. Gunakan bila perangkat hilang atau dipinjam orang lain.</p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="button-secondary" :disabled="!ready || Boolean(signingOut)" @click="signOut('local')">{{ signingOut === 'local' ? 'Keluar…' : 'Keluar dari perangkat ini' }}</button>
          <button v-if="!confirmGlobal" type="button" class="button-secondary" :disabled="!ready || Boolean(signingOut)" @click="confirmGlobal = true">Keluar dari semua perangkat</button>
          <template v-else>
            <button type="button" class="button-primary" :disabled="Boolean(signingOut)" @click="signOut('global')">{{ signingOut === 'global' ? 'Mencabut sesi…' : 'Ya, keluar dari semua perangkat' }}</button>
            <button type="button" class="text-link min-h-11 text-sm" :disabled="Boolean(signingOut)" @click="confirmGlobal = false">Batal</button>
          </template>
        </div>
        <p v-if="signOutError" role="alert" class="form-error">{{ signOutError }}</p>
      </section>

      <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="service-title">
        <h2 id="service-title" class="text-lg font-semibold text-forest-900">Keadaan layanan</h2>
        <dl class="mt-4 space-y-3 text-sm">
          <div class="flex flex-wrap justify-between gap-2"><dt>Database dan autentikasi</dt><dd class="font-medium">{{ data.services.database === 'available' ? 'Tersedia' : 'Tidak dapat dihubungi' }}</dd></div>
          <div class="flex flex-wrap justify-between gap-2"><dt>Analisis AI</dt><dd class="font-medium">{{ data.services.ai.configured ? `Terkonfigurasi · ${data.services.ai.model}` : 'Belum dikonfigurasi' }}</dd></div>
        </dl>
        <p class="form-hint">"Terkonfigurasi" berarti kunci tersedia di server, bukan jaminan kuota atau ketersediaan model saat ini.</p>
        <button type="button" class="text-link mt-2 min-h-11 text-sm" @click="refresh()">Periksa ulang</button>
      </section>

      <section class="rounded-lg border border-line bg-white p-5" aria-labelledby="scoring-title">
        <h2 id="scoring-title" class="text-lg font-semibold text-forest-900">Aturan skor prioritas</h2>
        <p class="mt-3 text-sm leading-6 text-charcoal/85">Versi <span class="font-mono">{{ data.scoring.version }}</span>. Skor = keparahan × {{ percent(SCORING_WEIGHTS.severity) }} + kelengkapan × {{ percent(SCORING_WEIGHTS.completeness) }} + kebaruan × {{ percent(SCORING_WEIGHTS.recency) }} + laporan serupa × {{ percent(SCORING_WEIGHTS.nearby) }}. Tinggi {{ PRIORITY_THRESHOLDS.high }}, sedang {{ PRIORITY_THRESHOLDS.medium }}, rendah {{ PRIORITY_THRESHOLDS.low }}. Laporan serupa dihitung dalam radius {{ NEARBY_RADIUS_KM }} km dan selisih waktu {{ NEARBY_WINDOW_DAYS }} hari.</p>
        <p class="form-hint">Aturan ditetapkan dalam migrasi database dan rincian lengkapnya tampil di setiap detail laporan. Perubahan aturan memerlukan versi migrasi baru agar riwayat skor tetap dapat diaudit.</p>
      </section>
    </div>
  </div>
</template>
