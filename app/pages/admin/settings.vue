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
const initials = computed(() => (data.value?.account.fullName || 'Petugas').trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase())
const scoringParts = [
  { label: 'Keparahan', value: SCORING_WEIGHTS.severity },
  { label: 'Kelengkapan laporan', value: SCORING_WEIGHTS.completeness },
  { label: 'Kebaruan kejadian', value: SCORING_WEIGHTS.recency },
  { label: 'Laporan serupa', value: SCORING_WEIGHTS.nearby },
] as const

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
  <div class="admin-page">
    <AdminPageHeader title="Pengaturan" description="Kelola keamanan sesi dan lihat informasi akun, layanan, serta aturan prioritas yang digunakan." />
    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat pengaturan…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><p>Pengaturan belum dapat dimuat.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <div v-else-if="data" class="grid items-start gap-6 xl:grid-cols-2">
      <section class="admin-panel" aria-labelledby="account-title">
        <div class="admin-panel-header"><h2 id="account-title" class="admin-section-title">Akun petugas</h2><AdminIcon name="user" class="size-5 text-forest-500" /></div>
        <div class="p-5 sm:p-6">
          <div class="flex items-center gap-4"><span class="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-sage-100 text-xl font-semibold text-forest-700">{{ initials }}</span><div class="min-w-0"><p class="break-words text-lg leading-7 font-semibold text-forest-900">{{ data.account.fullName || 'Belum diisi' }}</p><p class="mt-1 inline-flex items-center gap-1.5 rounded-full bg-sage-100 px-2.5 py-1 text-xs font-medium text-forest-700"><AdminIcon name="shield" class="size-3.5" />Petugas RimbaGuard</p></div></div>
          <dl class="mt-6 divide-y divide-line text-sm">
            <div class="grid gap-1 py-4 sm:grid-cols-[5rem_minmax(0,1fr)]"><dt class="text-charcoal/70">Nama</dt><dd class="break-words font-medium">{{ data.account.fullName || 'Belum diisi' }}</dd></div>
            <div class="grid gap-1 py-4 sm:grid-cols-[5rem_minmax(0,1fr)]"><dt class="text-charcoal/70">Email</dt><dd class="break-all font-medium">{{ data.account.email }}</dd></div>
            <div class="grid gap-1 py-4 sm:grid-cols-[5rem_minmax(0,1fr)]"><dt class="text-charcoal/70">Peran</dt><dd class="font-medium">Petugas (admin)</dd></div>
          </dl>
          <p class="mt-3 rounded-xl bg-[#F4F6F2] px-4 py-3 text-sm leading-6 text-charcoal/75">Akses petugas diberikan oleh operator. Perubahan peran tidak dilakukan melalui halaman ini.</p>
        </div>
      </section>

      <section class="admin-panel" aria-labelledby="session-title">
        <div class="admin-panel-header"><h2 id="session-title" class="admin-section-title">Keamanan sesi</h2><AdminIcon name="lock" class="size-5 text-forest-500" /></div>
        <div class="p-5 sm:p-6">
          <p class="admin-copy">Tentukan dari perangkat mana akun Anda akan keluar.</p>
          <div class="mt-5 space-y-5">
            <div><h3 class="text-base font-semibold text-forest-900">Perangkat yang sedang digunakan</h3><p class="admin-muted mt-1">Sesi di perangkat lain tetap dapat digunakan.</p><button type="button" class="button-secondary mt-3 w-full sm:w-auto" :disabled="!ready || Boolean(signingOut)" @click="signOut('local')"><AdminIcon name="logout" class="size-4" />{{ signingOut === 'local' ? 'Keluar…' : 'Keluar dari perangkat ini' }}</button></div>
            <div class="border-t border-line pt-5"><h3 class="text-base font-semibold text-forest-900">Semua perangkat</h3><p class="admin-muted mt-1">Mencabut seluruh sesi, termasuk perangkat lain. Gunakan bila perangkat hilang atau dipinjam orang lain.</p>
              <button v-if="!confirmGlobal" type="button" class="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[#E8C9C4] px-4 py-3 text-base font-medium text-[#9D302B] hover:bg-[#FBEFEB] disabled:opacity-50 sm:w-auto" :disabled="!ready || Boolean(signingOut)" @click="confirmGlobal = true">Keluar dari semua perangkat</button>
              <div v-else class="mt-3 rounded-xl border border-[#E8C9C4] bg-[#FFF9F7] p-4"><p class="text-sm leading-6 text-charcoal/80">Anda juga akan keluar dari perangkat ini.</p><div class="mt-3 flex flex-wrap gap-3"><button type="button" class="button-primary" :disabled="Boolean(signingOut)" @click="signOut('global')">{{ signingOut === 'global' ? 'Mencabut sesi…' : 'Ya, keluar dari semua perangkat' }}</button><button type="button" class="text-link min-h-11 text-sm" :disabled="Boolean(signingOut)" @click="confirmGlobal = false">Batal</button></div></div>
            </div>
          </div>
          <p v-if="signOutError" role="alert" class="form-error mt-4">{{ signOutError }}</p>
        </div>
      </section>

      <section class="admin-panel" aria-labelledby="service-title">
        <div class="admin-panel-header"><h2 id="service-title" class="admin-section-title">Keadaan layanan</h2><button type="button" class="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-forest-700 hover:underline underline-offset-4" @click="refresh()"><AdminIcon name="refresh" class="size-4" />Periksa ulang</button></div>
        <div class="p-5 sm:p-6"><dl class="divide-y divide-line text-sm">
          <div class="flex flex-wrap items-center justify-between gap-3 pb-5"><dt class="flex items-center gap-3 font-medium"><span class="flex size-10 items-center justify-center rounded-xl bg-sage-100 text-forest-700"><AdminIcon name="database" class="size-5" /></span>Database dan autentikasi</dt><dd class="rounded-full px-3 py-1 font-medium" :class="data.services.database === 'available' ? 'bg-[#EAF2E7] text-forest-700' : 'bg-[#FBEFEB] text-[#9D302B]'">{{ data.services.database === 'available' ? 'Tersedia' : 'Tidak dapat dihubungi' }}</dd></div>
          <div class="flex flex-wrap items-center justify-between gap-3 pt-5"><dt class="flex items-center gap-3 font-medium"><span class="flex size-10 items-center justify-center rounded-xl bg-sage-100 text-forest-700"><AdminIcon name="leaf" class="size-5" /></span>Analisis AI</dt><dd class="text-right"><span class="rounded-full bg-sage-100 px-3 py-1 font-medium text-forest-700">{{ data.services.ai.configured ? 'Terkonfigurasi' : 'Belum dikonfigurasi' }}</span><span v-if="data.services.ai.configured && data.services.ai.model" class="mt-2 block break-all text-sm text-charcoal/70">{{ data.services.ai.model }}</span></dd></div>
        </dl><p class="mt-5 rounded-xl bg-[#F4F6F2] px-4 py-3 text-sm leading-6 text-charcoal/75">"Terkonfigurasi" berarti kunci tersedia di server, bukan jaminan kuota atau ketersediaan model saat ini.</p></div>
      </section>

      <section class="admin-panel" aria-labelledby="scoring-title">
        <div class="admin-panel-header"><h2 id="scoring-title" class="admin-section-title">Aturan skor prioritas</h2><span class="rounded-lg bg-sage-100 px-2.5 py-1 font-mono text-xs leading-6 text-forest-700">{{ data.scoring.version }}</span></div>
        <div class="p-5 sm:p-6"><p class="admin-muted">Setiap komponen berkontribusi pada total skor sesuai bobot berikut.</p><dl class="mt-4 grid grid-cols-2 gap-3"><div v-for="part in scoringParts" :key="part.label" class="rounded-xl bg-[#F4F6F2] px-4 py-3"><dt class="text-sm leading-6 text-charcoal/75">{{ part.label }}</dt><dd class="mt-1 text-2xl font-semibold tracking-tight text-forest-900">{{ percent(part.value) }}</dd></div></dl>
          <details class="mt-5 border-t border-line pt-2"><summary class="min-h-12 cursor-pointer content-center text-sm font-medium text-forest-700">Lihat penjelasan aturan</summary><div class="space-y-3 pt-2 text-sm leading-7 text-charcoal/80"><p>Ambang prioritas: tinggi {{ PRIORITY_THRESHOLDS.high }}, sedang {{ PRIORITY_THRESHOLDS.medium }}, dan rendah {{ PRIORITY_THRESHOLDS.low }}. Laporan serupa dihitung dalam radius {{ NEARBY_RADIUS_KM }} km dan selisih waktu {{ NEARBY_WINDOW_DAYS }} hari.</p><p>Rincian perhitungan tampil di setiap laporan. Aturan ditetapkan melalui migrasi database; perubahan memerlukan versi baru agar riwayat tetap dapat diaudit.</p></div></details>
        </div>
      </section>
    </div>
  </div>
</template>
