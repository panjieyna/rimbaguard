<script setup lang="ts">
import { loginSchema } from '#shared/schemas/auth'
import type { SessionUser } from '../../shared/types/domain'
import { getFieldErrors, readApiError } from '~/utils/api-error'
useSeoMeta({ title: 'Masuk — RimbaGuard AI', robots: 'noindex' })
const route = useRoute()
const { data: session, refresh } = await useAuth()
if (session.value?.user) await navigateTo(session.value.user.role === 'admin' ? '/admin/dashboard' : '/reports')
const form = reactive({ email: '', password: '' })
const fields = ref<Record<string, string[]>>({})
const message = ref(route.query.error === 'confirmation_failed' ? 'Tautan konfirmasi tidak valid atau sudah kedaluwarsa. Silakan periksa email Anda.' : '')
const pending = ref(false)
const ready = ref(false)
onMounted(() => { ready.value = true })
async function submit() {
  message.value = ''
  const parsed = loginSchema.safeParse(form)
  fields.value = parsed.success ? {} : getFieldErrors(parsed.error)
  if (!parsed.success) return
  pending.value = true
  try {
    const result = await $fetch<{ user: SessionUser; redirectTo: string }>('/api/auth/login', { method: 'POST', body: parsed.data, query: { next: typeof route.query.next === 'string' ? route.query.next : undefined } })
    form.password = ''
    await refresh()
    await navigateTo(result.redirectTo)
  }
  catch (error) { const failure = readApiError(error, 'Tidak dapat masuk. Periksa koneksi lalu coba kembali.'); message.value = failure.message; fields.value = failure.fields }
  finally { pending.value = false }
}
</script>

<template>
  <section class="page-container py-14 sm:py-20">
    <div class="mx-auto max-w-md">
      <p class="eyebrow">Selamat datang kembali</p>
      <h1 class="mt-4 text-4xl font-semibold tracking-tight text-forest-900">Masuk ke RimbaGuard.</h1>
      <p class="mt-4 body-copy">Kirim laporan dan ikuti perkembangan pemeriksaannya melalui akun Anda.</p>
      <p v-if="route.query.registered" role="status" class="notice mt-6">Akun siap digunakan. Silakan masuk.</p>
      <form class="mt-8 space-y-5" novalidate :aria-busy="pending || !ready" @submit.prevent="submit">
        <div><label for="email" class="form-label">Email</label><input id="email" v-model="form.email" class="form-input" type="email" autocomplete="email" inputmode="email" required :aria-invalid="Boolean(fields.email)" :aria-describedby="fields.email ? 'email-error' : undefined"><p v-if="fields.email" id="email-error" class="form-error">{{ fields.email[0] }}</p></div>
        <div><label for="password" class="form-label">Kata sandi</label><input id="password" v-model="form.password" class="form-input" type="password" autocomplete="current-password" required :aria-invalid="Boolean(fields.password)" :aria-describedby="fields.password ? 'password-error' : undefined"><p v-if="fields.password" id="password-error" class="form-error">{{ fields.password[0] }}</p></div>
        <p v-if="message" role="alert" class="form-error">{{ message }}</p>
        <button type="submit" class="button-primary w-full" :disabled="pending || !ready">{{ pending ? 'Memeriksa akun…' : 'Masuk' }}</button>
      </form>
      <p class="mt-7 text-sm text-charcoal/80">Belum memiliki akun? <NuxtLink to="/register" class="text-link">Daftar</NuxtLink></p>
    </div>
  </section>
</template>
