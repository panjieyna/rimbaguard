<script setup lang="ts">
import type { PasswordChangeResponse } from '../../../shared/types/domain'
import { passwordChangeSchema } from '#shared/schemas/account'
import { getFieldErrors, readApiError } from '~/utils/api-error'

const props = defineProps<{ email: string }>()

const id = useId()
const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const errors = ref<Record<string, string>>({})
const formError = ref('')
const success = ref('')
const saving = ref(false)

// Live checklist: everyone can see what is still missing before submitting.
const rules = computed(() => [
  { key: 'length', label: 'Minimal 12 karakter', met: form.newPassword.length >= 12 },
  { key: 'different', label: 'Berbeda dari kata sandi saat ini', met: Boolean(form.newPassword) && form.newPassword !== form.currentPassword },
  { key: 'match', label: 'Kedua kata sandi baru sama', met: Boolean(form.confirmPassword) && form.confirmPassword === form.newPassword },
])
const describedBy = (field: string, extra = '') => [extra, errors.value[field] ? `${id}-${field}-error` : ''].filter(Boolean).join(' ') || undefined
watch(() => [form.currentPassword, form.newPassword, form.confirmPassword], () => { success.value = '' })

async function submit() {
  errors.value = {}
  formError.value = ''
  success.value = ''
  const parsed = passwordChangeSchema.safeParse({ currentPassword: form.currentPassword, newPassword: form.newPassword })
  const found: Record<string, string> = {}
  if (!parsed.success) {
    for (const [field, messages] of Object.entries(getFieldErrors(parsed.error))) if (messages[0]) found[field] ??= messages[0]
  }
  if (form.confirmPassword !== form.newPassword) found.confirmPassword = 'Ulangi kata sandi baru dengan tepat.'
  if (!parsed.success || Object.keys(found).length) {
    errors.value = found
    return
  }
  saving.value = true
  try {
    const response = await $fetch<PasswordChangeResponse>('/api/account/password', { method: 'POST', body: parsed.data })
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    await nextTick()
    success.value = response.otherSessionsSignedOut
      ? 'Kata sandi berhasil diganti. Perangkat lain sudah dikeluarkan, perangkat ini tetap masuk.'
      : 'Kata sandi berhasil diganti.'
  }
  catch (failure) {
    const problem = readApiError(failure, 'Kata sandi belum dapat diganti. Coba kembali.')
    const fields: Record<string, string> = {}
    for (const [field, messages] of Object.entries(problem.fields)) if (messages[0]) fields[field] = messages[0]
    errors.value = fields
    if (!Object.keys(fields).length) formError.value = problem.message
  }
  finally { saving.value = false }
}
</script>

<template>
  <form novalidate class="password-form" @submit.prevent="submit">
    <!-- Lets password managers attach the new password to the right account. -->
    <input type="email" name="username" autocomplete="username" :value="props.email" class="hidden" readonly tabindex="-1" aria-hidden="true">

    <div class="password-form-fields">
      <div class="password-form-current">
        <label :for="`${id}-current`" class="form-label">Kata sandi saat ini</label>
        <UiPasswordInput :id="`${id}-current`" v-model="form.currentPassword" autocomplete="current-password" :maxlength="128" :invalid="Boolean(errors.currentPassword)" :described-by="describedBy('currentPassword')" />
        <p v-if="errors.currentPassword" :id="`${id}-currentPassword-error`" class="form-error">{{ errors.currentPassword }}</p>
      </div>
      <div>
        <label :for="`${id}-new`" class="form-label">Kata sandi baru</label>
        <UiPasswordInput :id="`${id}-new`" v-model="form.newPassword" autocomplete="new-password" :minlength="12" :maxlength="128" :invalid="Boolean(errors.newPassword)" :described-by="describedBy('newPassword', `${id}-rules`)" />
        <p v-if="errors.newPassword" :id="`${id}-newPassword-error`" class="form-error">{{ errors.newPassword }}</p>
      </div>
      <div>
        <label :for="`${id}-confirm`" class="form-label">Ulangi kata sandi baru</label>
        <UiPasswordInput :id="`${id}-confirm`" v-model="form.confirmPassword" autocomplete="new-password" :maxlength="128" :invalid="Boolean(errors.confirmPassword)" :described-by="describedBy('confirmPassword')" />
        <p v-if="errors.confirmPassword" :id="`${id}-confirmPassword-error`" class="form-error">{{ errors.confirmPassword }}</p>
      </div>
    </div>

    <ul :id="`${id}-rules`" class="password-rules" role="list" aria-label="Syarat kata sandi baru">
      <li v-for="rule in rules" :key="rule.key" :data-met="rule.met">
        <span class="password-rule-mark" aria-hidden="true"><AdminIcon v-if="rule.met" name="check" class="size-3.5" /></span>
        {{ rule.label }}<span class="sr-only">{{ rule.met ? ': terpenuhi' : ': belum terpenuhi' }}</span>
      </li>
    </ul>

    <div class="password-form-footer">
      <button type="submit" class="button-primary" :disabled="saving"><AdminIcon name="key" class="size-4" />{{ saving ? 'Mengganti…' : 'Ganti kata sandi' }}</button>
      <p class="password-form-note">Setelah diganti, perangkat lain otomatis dikeluarkan.</p>
    </div>
    <p v-if="success" role="status" class="password-form-success"><AdminIcon name="check" class="size-4" />{{ success }}</p>
    <p v-if="formError" role="alert" class="form-error">{{ formError }}</p>
  </form>
</template>

<style scoped>
.password-form { display: grid; min-width: 0; gap: 1.25rem; container-type: inline-size; }
.password-form-fields { display: grid; gap: 1.25rem; }
.password-rules { display: grid; gap: 0.5rem; margin: 0; border-radius: 0.875rem; background: #F4F6F2; padding: 0.875rem 1rem; list-style: none; }
.password-rules li { display: flex; align-items: center; gap: 0.625rem; font-size: 0.9375rem; line-height: 1.5rem; color: #4F5B53; }
.password-rules li[data-met="true"] { color: #24543B; }
.password-rule-mark { display: flex; width: 1.25rem; height: 1.25rem; flex-shrink: 0; align-items: center; justify-content: center; border: 1.5px solid #AEBAAF; border-radius: 999px; color: #FFFFFF; }
.password-rules li[data-met="true"] .password-rule-mark { border-color: #287A52; background: #287A52; }
.password-form-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1rem; }
.password-form-note { font-size: 0.875rem; line-height: 1.375rem; color: #5C665F; }
.password-form-success { display: flex; width: fit-content; align-items: flex-start; gap: 0.5rem; border-radius: 0.625rem; background: #EDF5EA; padding: 0.5rem 0.75rem; font-size: 0.9375rem; line-height: 1.5rem; color: #24543B; }
.password-form-success :deep(svg) { margin-top: 0.25rem; }
/* Medium: current password on its own row, the two new fields side by side. Wide: all three in one row. */
@container (min-width: 34rem) {
  .password-form-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 1.5rem; }
  .password-form-current { grid-column: 1 / -1; }
  .password-rules { grid-template-columns: repeat(3, minmax(0, auto)); justify-content: start; column-gap: 1.5rem; }
}
@container (min-width: 56rem) {
  .password-form-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .password-form-current { grid-column: auto; }
}
</style>
