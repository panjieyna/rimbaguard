<script setup lang="ts">
import type { AccountUserResponse, SessionUser } from '../../../shared/types/domain'
import { profileUpdateSchema } from '#shared/schemas/account'
import { getFieldErrors, readApiError } from '~/utils/api-error'

const props = withDefaults(defineProps<{ user: SessionUser; hint?: string; emailHint?: string }>(), {
  hint: 'Nama ini tampil di akun Anda dan di samping foto profil.',
  emailHint: 'Dipakai untuk masuk dan tidak dapat diubah di sini.',
})
const emit = defineEmits<{ updated: [user: SessionUser] }>()

const id = useId()
const fullName = ref(props.user.fullName)
const saving = ref(false)
const fieldError = ref('')
const formError = ref('')
const saved = ref(false)
watch(() => props.user.fullName, (value) => { if (!saving.value) fullName.value = value })
const changed = computed(() => fullName.value.trim() !== props.user.fullName.trim())
const describedBy = computed(() => [`${id}-hint`, fieldError.value ? `${id}-error` : ''].filter(Boolean).join(' '))

async function submit() {
  saved.value = false
  fieldError.value = ''
  formError.value = ''
  const parsed = profileUpdateSchema.safeParse({ fullName: fullName.value })
  if (!parsed.success) {
    fieldError.value = getFieldErrors(parsed.error).fullName?.[0] ?? 'Periksa kembali nama Anda.'
    return
  }
  saving.value = true
  try {
    const response = await $fetch<AccountUserResponse>('/api/account/profile', { method: 'PATCH', body: parsed.data })
    fullName.value = response.user.fullName
    saved.value = true
    await refreshNuxtData('auth-session')
    emit('updated', response.user)
  }
  catch (failure) {
    const problem = readApiError(failure, 'Nama belum dapat disimpan. Coba kembali.')
    fieldError.value = problem.fields.fullName?.[0] ?? ''
    if (!fieldError.value) formError.value = problem.message
  }
  finally { saving.value = false }
}
</script>

<template>
  <form novalidate class="name-form" @submit.prevent="submit">
    <div class="name-form-fields">
      <div>
        <label :for="`${id}-name`" class="form-label">Nama lengkap</label>
        <input :id="`${id}-name`" v-model="fullName" type="text" name="name" autocomplete="name" maxlength="100" required class="form-input" :aria-invalid="Boolean(fieldError)" :aria-describedby="describedBy" @input="saved = false">
        <p :id="`${id}-hint`" class="form-hint">{{ hint }}</p>
        <p v-if="fieldError" :id="`${id}-error`" class="form-error">{{ fieldError }}</p>
      </div>
      <div>
        <label :for="`${id}-email`" class="form-label">Email</label>
        <input :id="`${id}-email`" type="email" :value="user.email" readonly class="form-input name-form-readonly" :aria-describedby="`${id}-email-hint`">
        <p :id="`${id}-email-hint`" class="form-hint">{{ emailHint }}</p>
      </div>
    </div>
    <div class="name-form-footer">
      <button type="submit" class="button-primary" :disabled="saving || !changed">{{ saving ? 'Menyimpan…' : 'Simpan nama' }}</button>
      <p v-if="saved" role="status" class="name-form-success"><AdminIcon name="check" class="size-4" />Nama berhasil diperbarui.</p>
    </div>
    <p v-if="formError" role="alert" class="form-error">{{ formError }}</p>
  </form>
</template>

<style scoped>
.name-form { display: grid; min-width: 0; gap: 1.25rem; container-type: inline-size; }
.name-form-fields { display: grid; gap: 1.25rem; }
.name-form-readonly { background: #F4F6F2; color: #4F5B53; cursor: default; }
.name-form-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1rem; }
.name-form-success { display: flex; width: fit-content; align-items: center; gap: 0.5rem; border-radius: 0.625rem; background: #EDF5EA; padding: 0.5rem 0.75rem; font-size: 0.9375rem; line-height: 1.5rem; color: #24543B; }
@container (min-width: 40rem) {
  .name-form-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 1.5rem; }
}
</style>
