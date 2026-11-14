<script setup lang="ts">
import { registerSchema } from '#shared/schemas/auth'
import type { SessionUser } from '../../shared/types/domain'
import { getFieldErrors, readApiError } from '~/utils/api-error'
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
  <section class="page-container py-14 sm:py-20">
    <div class="mx-auto max-w-md">
      <p class="eyebrow">Mulai berkontribusi</p>
      <h1 class="mt-4 text-4xl font-semibold tracking-tight text-forest-900">Jaga hutan, bersama.</h1>
      <p class="mt-4 body-copy">Buat akun untuk menyampaikan laporan dan memantau tindak lanjutnya.</p>
      <div v-if="confirmationSent" class="notice mt-8" role="status">
        <h2 class="text-lg font-semibold text-forest-900">Periksa email Anda</h2>
        <p class="mt-2">Jika pendaftaran dapat diproses, tautan konfirmasi akan dikirim ke email yang Anda masukkan. Periksa folder spam juga.</p>
        <NuxtLink to="/login" class="text-link mt-4 inline-block">Kembali ke halaman masuk</NuxtLink>
      </div>
      <form v-else class="mt-8 space-y-5" novalidate :aria-busy="pending" @submit.prevent="submit">
        <div><label for="fullName" class="form-label">Nama lengkap</label><input id="fullName" v-model="form.fullName" class="form-input" autocomplete="name" required :aria-invalid="Boolean(fields.fullName)" :aria-describedby="fields.fullName ? 'name-error' : undefined"><p v-if="fields.fullName" id="name-error" class="form-error">{{ fields.fullName[0] }}</p></div>
        <div><label for="email" class="form-label">Email</label><input id="email" v-model="form.email" class="form-input" type="email" autocomplete="email" inputmode="email" required :aria-invalid="Boolean(fields.email)" :aria-describedby="fields.email ? 'email-error' : undefined"><p v-if="fields.email" id="email-error" class="form-error">{{ fields.email[0] }}</p></div>
        <div><label for="password" class="form-label">Kata sandi</label><input id="password" v-model="form.password" class="form-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required :aria-invalid="Boolean(fields.password)" aria-describedby="password-hint password-error"><p id="password-hint" class="form-hint">Gunakan minimal 12 karakter.</p><p v-if="fields.password" id="password-error" class="form-error">{{ fields.password[0] }}</p></div>
        <p v-if="message" role="alert" class="form-error">{{ message }}</p>
        <button type="submit" class="button-primary w-full" :disabled="pending || !ready">{{ pending ? 'Membuat akun…' : 'Buat akun' }}</button>
        <p class="text-xs leading-5 text-charcoal/75">Identitas dan bukti Anda disimpan secara privat. Publikasi laporan memerlukan peninjauan petugas.</p>
      </form>
      <p class="mt-7 text-sm text-charcoal/80">Sudah memiliki akun? <NuxtLink to="/login" class="text-link">Masuk</NuxtLink></p>
    </div>
  </section>
</template>
