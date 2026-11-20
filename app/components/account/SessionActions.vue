<script setup lang="ts">
import { readApiError } from '~/utils/api-error'

const ready = ref(false)
onMounted(() => { ready.value = true })
const confirmGlobal = ref(false)
const signingOut = ref<'local' | 'global' | null>(null)
const error = ref('')

async function signOut(scope: 'local' | 'global') {
  signingOut.value = scope
  error.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST', body: { scope } })
    await refreshNuxtData('auth-session')
    await navigateTo('/')
  }
  catch (failure) { error.value = readApiError(failure).message }
  finally { signingOut.value = null }
}
</script>

<template>
  <div class="session-actions">
    <div class="session-row">
      <div class="session-copy">
        <p class="session-title">Perangkat ini</p>
        <p class="session-text">Keluar hanya dari browser ini. Perangkat lain tetap masuk.</p>
      </div>
      <button type="button" class="button-secondary" :disabled="!ready || Boolean(signingOut)" @click="signOut('local')"><AdminIcon name="logout" class="size-4" />{{ signingOut === 'local' ? 'Keluar…' : 'Keluar dari perangkat ini' }}</button>
    </div>

    <div class="session-row is-danger">
      <div class="session-copy">
        <p class="session-title">Semua perangkat</p>
        <p class="session-text">Mencabut semua sesi, termasuk di ponsel atau komputer lain. Gunakan bila perangkat hilang atau pernah dipinjam orang lain.</p>
      </div>
      <button v-if="!confirmGlobal" type="button" class="session-danger" :disabled="!ready || Boolean(signingOut)" @click="confirmGlobal = true">Keluar dari semua perangkat</button>
    </div>
    <div v-if="confirmGlobal" class="session-confirm" role="group" aria-label="Konfirmasi keluar dari semua perangkat">
      <p>Anda juga akan keluar dari perangkat ini. Lanjutkan?</p>
      <div class="session-confirm-actions">
        <button type="button" class="session-danger is-solid" :disabled="Boolean(signingOut)" @click="signOut('global')">{{ signingOut === 'global' ? 'Mencabut sesi…' : 'Ya, keluar dari semua perangkat' }}</button>
        <button type="button" class="button-secondary" :disabled="Boolean(signingOut)" @click="confirmGlobal = false">Batal</button>
      </div>
    </div>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.session-actions { display: grid; min-width: 0; gap: 1rem; container-type: inline-size; }
.session-row { display: grid; gap: 0.875rem; }
.session-row + .session-row { border-top: 1px solid #EDF1EB; padding-top: 1rem; }
.session-title { font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; }
.session-text { margin-top: 0.125rem; font-size: 0.9375rem; line-height: 1.5rem; color: #5C665F; }
.session-danger { display: inline-flex; min-height: 3rem; align-items: center; justify-content: center; border: 1px solid #E8C9C4; border-radius: 0.75rem; background: #FFFFFF; padding: 0.625rem 1rem; font-size: 1rem; font-weight: 500; color: #9D302B; }
.session-danger:hover:not(:disabled) { background: #FBEFEB; }
.session-danger.is-solid { border-color: #9D302B; background: #9D302B; color: #FFFFFF; }
.session-danger.is-solid:hover:not(:disabled) { background: #85251F; }
.session-danger:disabled { opacity: 0.5; }
.session-confirm { border: 1px solid #E8C9C4; border-radius: 0.875rem; background: #FFF9F7; padding: 1rem; font-size: 0.9375rem; line-height: 1.5rem; color: #4F3A37; }
.session-confirm-actions { display: flex; flex-wrap: wrap; gap: 0.625rem; margin-top: 0.75rem; }
@container (min-width: 34rem) {
  .session-row { grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 1.25rem; }
}
</style>
