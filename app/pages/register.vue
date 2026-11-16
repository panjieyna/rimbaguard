<script setup lang="ts">
import { registerSchema } from '#shared/schemas/auth'
import type { SessionUser } from '../../shared/types/domain'
import { getFieldErrors, readApiError } from '~/utils/api-error'
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Daftar — RimbaGuard AI', robots: 'noindex' })
const { data: session, refresh } = await useAuth()
if (session.value?.user) await navigateTo('/reports')
const form = reactive({ fullName: '', email: '', password: '' })
const fields = ref<Record<string, string[]>>({})
const message = ref('')
const pending = ref(false)
const confirmationSent = ref(false)
const ready = ref(false)
onMounted(() => { ready.value = true })
async function submit() {
  message.value = ''
  const parsed = registerSchema.safeParse(form)
  fields.value = parsed.success ? {} : getFieldErrors(parsed.error)
  if (!parsed.success) return
  pending.value = true
  try {
    const result = await $fetch<{ requiresEmailConfirmation: boolean; user: SessionUser | null }>('/api/auth/register', { method: 'POST', body: parsed.data })
    form.password = ''
    if (result.requiresEmailConfirmation) confirmationSent.value = true
    else { await refresh(); await navigateTo('/reports') }
  }
  catch (error) { const failure = readApiError(error); message.value = failure.message; fields.value = failure.fields }
  finally { pending.value = false }
}
</script>

<template>
  <section aria-labelledby="register-title">
      <p class="eyebrow">Mulai berkontribusi</p>
      <h1 id="register-title" class="mt-3 text-[2rem] leading-tight font-semibold tracking-[-0.025em] text-forest-900 sm:text-[2.25rem]">Jaga hutan, bersama.</h1>
      <p class="mt-4 text-base leading-7 text-charcoal/80">Buat akun untuk menyampaikan laporan dan memantau tindak lanjutnya.</p>
      <div v-if="confirmationSent" class="notice mt-8" role="status">
        <h2 class="text-lg font-semibold text-forest-900">Periksa email Anda</h2>
        <p class="mt-2">Jika pendaftaran dapat diproses, tautan konfirmasi akan dikirim ke email yang Anda masukkan. Periksa folder spam juga.</p>
        <NuxtLink to="/login" class="text-link mt-4 inline-block">Kembali ke halaman masuk</NuxtLink>
      </div>
      <form v-else class="mt-8 space-y-5" novalidate :aria-busy="pending || !ready" @submit.prevent="submit">
        <div><label for="fullName" class="form-label">Nama lengkap</label><input id="fullName" v-model="form.fullName" class="form-input min-h-13" autocomplete="name" required :aria-invalid="Boolean(fields.fullName)" :aria-describedby="fields.fullName ? 'name-error' : undefined"><p v-if="fields.fullName" id="name-error" class="form-error">{{ fields.fullName[0] }}</p></div>
        <div><label for="email" class="form-label">Email</label><input id="email" v-model="form.email" class="form-input min-h-13" type="email" autocomplete="email" inputmode="email" required :aria-invalid="Boolean(fields.email)" :aria-describedby="fields.email ? 'email-error' : undefined"><p v-if="fields.email" id="email-error" class="form-error">{{ fields.email[0] }}</p></div>
        <div><label for="password" class="form-label">Kata sandi</label><UiPasswordInput id="password" v-model="form.password" autocomplete="new-password" :minlength="12" :maxlength="128" :invalid="Boolean(fields.password)" :described-by="fields.password ? 'password-hint password-error' : 'password-hint'" /><p id="password-hint" class="form-hint">Gunakan minimal 12 karakter.</p><p v-if="fields.password" id="password-error" class="form-error">{{ fields.password[0] }}</p></div>
        <p v-if="message" role="alert" class="form-error">{{ message }}</p>
        <button type="submit" class="button-primary min-h-13 w-full font-semibold" :disabled="pending || !ready">{{ pending ? 'Membuat akun…' : 'Buat akun' }}</button>
        <p class="text-sm leading-6 text-charcoal/75">Identitas dan bukti Anda disimpan secara privat. Publikasi laporan memerlukan peninjauan petugas.</p>
      </form>
      <p class="mt-7 border-t border-line pt-6 text-base leading-7 text-charcoal/80">Sudah memiliki akun? <NuxtLink to="/login" class="text-link inline-flex min-h-11 items-center">Masuk</NuxtLink></p>
  </section>
</template>
