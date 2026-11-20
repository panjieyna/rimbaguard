<script setup lang="ts">
import type { AccountUserResponse, SessionUser } from '../../../shared/types/domain'
import { readApiError } from '~/utils/api-error'
import { AvatarImageError, prepareAvatar, type PreparedAvatar } from '~/utils/avatar-image'

const props = defineProps<{ user: SessionUser; roleLabel: string }>()
const emit = defineEmits<{ updated: [user: SessionUser] }>()

const id = useId()
const fileInput = ref<HTMLInputElement>()
const changeButton = ref<HTMLButtonElement>()
const preview = ref<PreparedAvatar | null>(null)
const busy = ref<'preparing' | 'saving' | 'removing' | null>(null)
const confirmRemove = ref(false)
const message = ref('')
const error = ref('')
const ready = ref(false)
onMounted(() => { ready.value = true })

function choose() {
  message.value = ''
  error.value = ''
  confirmRemove.value = false
  fileInput.value?.click()
}

async function selected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = '' // The same file can be chosen again after cancelling.
  if (!file) return
  busy.value = 'preparing'
  try { preview.value = await prepareAvatar(file) }
  catch (failure) { error.value = failure instanceof AvatarImageError ? failure.message : 'Foto tidak dapat dibuka. Pilih foto lain.' }
  finally { busy.value = null }
}

function cancelPreview() {
  preview.value = null
  nextTick(() => changeButton.value?.focus())
}

async function finish(request: Promise<AccountUserResponse>, done: string, fallback: string) {
  error.value = ''
  try {
    const response = await request
    preview.value = null
    confirmRemove.value = false
    message.value = done
    await refreshNuxtData('auth-session')
    emit('updated', response.user)
  }
  catch (failure) { error.value = readApiError(failure, fallback).message }
  finally { busy.value = null }
}

function save() {
  if (!preview.value || busy.value) return
  busy.value = 'saving'
  return finish($fetch<AccountUserResponse>('/api/account/avatar', { method: 'PUT', body: { image: preview.value.base64 } }), 'Foto profil berhasil diperbarui.', 'Foto profil belum dapat disimpan.')
}

function remove() {
  if (busy.value) return
  busy.value = 'removing'
  return finish($fetch<AccountUserResponse>('/api/account/avatar', { method: 'DELETE', body: {} }), 'Foto profil dihapus.', 'Foto profil belum dapat dihapus.')
}
</script>

<template>
  <section class="profile-hero" :aria-labelledby="`${id}-name`">
    <div class="profile-hero-body">
      <div class="profile-hero-avatar">
        <img v-if="preview" :src="preview.dataUrl" alt="" class="profile-hero-preview">
        <UiUserAvatar v-else :name="user.fullName" :src="user.avatarUrl" size="xl" />
      </div>

      <div class="profile-hero-identity">
        <h2 :id="`${id}-name`" class="profile-hero-name">{{ user.fullName || 'Nama belum diisi' }}</h2>
        <div class="profile-hero-meta">
          <span class="profile-hero-email"><AdminIcon name="mail" class="size-4" />{{ user.email }}</span>
          <span class="profile-hero-role"><AdminIcon name="shield" class="size-3.5" />{{ roleLabel }}</span>
        </div>
      </div>

      <div class="profile-hero-actions">
        <template v-if="preview">
          <button type="button" class="button-primary" :disabled="Boolean(busy)" @click="save"><AdminIcon name="check" class="size-4" />{{ busy === 'saving' ? 'Menyimpan…' : 'Simpan foto' }}</button>
          <button type="button" class="button-secondary" :disabled="Boolean(busy)" @click="cancelPreview">Batal</button>
        </template>
        <template v-else-if="confirmRemove">
          <button type="button" class="profile-hero-danger is-solid" :disabled="Boolean(busy)" @click="remove">{{ busy === 'removing' ? 'Menghapus…' : 'Ya, hapus foto' }}</button>
          <button type="button" class="button-secondary" :disabled="Boolean(busy)" @click="confirmRemove = false">Batal</button>
        </template>
        <template v-else>
          <button ref="changeButton" type="button" class="button-secondary" :disabled="!ready || Boolean(busy)" @click="choose"><AdminIcon name="camera" class="size-4" />{{ busy === 'preparing' ? 'Menyiapkan…' : user.avatarUrl ? 'Ganti foto' : 'Unggah foto' }}</button>
          <button v-if="user.avatarUrl" type="button" class="profile-hero-danger" :disabled="!ready || Boolean(busy)" @click="confirmRemove = true; message = ''; error = ''"><AdminIcon name="trash" class="size-4" />Hapus foto</button>
        </template>
        <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" tabindex="-1" aria-hidden="true" @change="selected">
      </div>

      <div class="profile-hero-notes">
        <p v-if="preview" class="profile-hero-hint is-preview">Ini pratinjau. Foto belum tersimpan sampai Anda menekan <strong>Simpan foto</strong>.</p>
        <p v-else-if="confirmRemove" class="profile-hero-hint">Foto akan dihapus dan diganti inisial nama Anda.</p>
        <p v-else class="profile-hero-hint">JPG, PNG, atau WebP hingga 15 MB. Foto dipotong persegi dan disimpan tanpa data lokasi.</p>
        <p v-if="message" role="status" class="profile-hero-success"><AdminIcon name="check" class="size-4" />{{ message }}</p>
        <p v-if="error" role="alert" class="profile-hero-error">{{ error }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-hero { min-width: 0; border: 1px solid #E1E7DE; border-radius: 1rem; background: #FFFFFF; box-shadow: 0 1px 2px rgb(23 61 50 / 0.04); }
.profile-hero-body { display: grid; gap: 1rem; padding: 1.25rem; }
/* Flex keeps the inline avatar off a text line (no gap under it); the photo
   fills the whole circle and only a 1 px ring outside it marks the edge. */
.profile-hero-avatar { display: flex; width: fit-content; align-self: start; border-radius: 999px; box-shadow: 0 0 0 1px #D7E2D3, 0 4px 14px rgb(23 61 50 / 0.10); }
.profile-hero-preview { display: block; width: 7rem; height: 7rem; border-radius: 999px; object-fit: cover; }
.profile-hero-identity { min-width: 0; }
.profile-hero-name { font-size: 1.5rem; font-weight: 650; letter-spacing: -0.015em; line-height: 2rem; color: #173D32; overflow-wrap: anywhere; }
.profile-hero-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; margin-top: 0.5rem; }
.profile-hero-email { display: inline-flex; min-width: 0; align-items: center; gap: 0.375rem; font-size: 0.9375rem; line-height: 1.5rem; color: #4F5B53; overflow-wrap: anywhere; }
.profile-hero-role { display: inline-flex; align-items: center; gap: 0.375rem; border-radius: 999px; background: #EAF0E9; padding: 0.1875rem 0.75rem; font-size: 0.8125rem; font-weight: 600; line-height: 1.25rem; color: #285C48; }
.profile-hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem; }
.profile-hero-danger { display: inline-flex; min-height: 3rem; align-items: center; justify-content: center; gap: 0.5rem; border: 1px solid #E8C9C4; border-radius: 0.75rem; background: #FFFFFF; padding: 0.625rem 1rem; font-size: 1rem; font-weight: 500; color: #9D302B; }
.profile-hero-danger:hover:not(:disabled) { background: #FBEFEB; }
.profile-hero-danger.is-solid { border-color: #9D302B; background: #9D302B; color: #FFFFFF; }
.profile-hero-danger.is-solid:hover:not(:disabled) { background: #85251F; }
.profile-hero-danger:disabled { opacity: 0.5; }
.profile-hero-notes { display: grid; gap: 0.625rem; }
.profile-hero-hint { font-size: 0.875rem; line-height: 1.375rem; color: #5C665F; }
.profile-hero-hint.is-preview { width: fit-content; border-radius: 0.625rem; background: #FBF4E5; padding: 0.5rem 0.75rem; color: #6A4A17; }
.profile-hero-success { display: flex; width: fit-content; align-items: center; gap: 0.5rem; border-radius: 0.625rem; background: #EDF5EA; padding: 0.5rem 0.75rem; font-size: 0.9375rem; line-height: 1.5rem; color: #24543B; }
.profile-hero-error { width: fit-content; border-radius: 0.625rem; background: #FBEFEB; padding: 0.5rem 0.75rem; font-size: 0.9375rem; line-height: 1.5rem; color: #8E2A24; }
@media (min-width: 48rem) {
  .profile-hero-body { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 1.5rem; padding: 1.5rem 1.75rem; }
  .profile-hero-avatar { grid-row: span 2; align-self: center; }
  .profile-hero-actions { justify-content: flex-end; }
  .profile-hero-notes { grid-column: 2 / -1; }
}
</style>
