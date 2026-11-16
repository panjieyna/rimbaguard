<script setup lang="ts">
import { readApiError } from '~/utils/api-error'
const { data: session, refresh } = await useAuth()
const route = useRoute()
const menuOpen = ref(false)
const ready = ref(false)
const loggingOut = ref(false)
const logoutError = ref('')
onMounted(() => { ready.value = true })
watch(() => route.fullPath, () => { menuOpen.value = false })

const links = [
  { to: '/admin/dashboard', label: 'Ringkasan' },
  { to: '/admin/reports', label: 'Laporan' },
  { to: '/admin/map', label: 'Peta' },
  { to: '/admin/analytics', label: 'Analitik' },
  { to: '/admin/settings', label: 'Pengaturan' },
] as const

async function logout() {
  loggingOut.value = true
  logoutError.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST', body: {} })
    await refresh()
    await navigateTo('/')
  }
  catch (error) { logoutError.value = readApiError(error).message }
  finally { loggingOut.value = false }
}
</script>

<template>
  <div class="min-h-dvh bg-warm-white lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
    <a href="#main-content" class="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Lewati ke konten utama</a>
    <header class="flex items-center justify-between gap-4 border-b border-line bg-white px-5 py-4 lg:hidden">
      <LayoutAppBrand />
      <button type="button" class="button-secondary px-3 py-2" :disabled="!ready" :aria-expanded="menuOpen" aria-controls="admin-navigation" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Tutup' : 'Menu' }}</button>
    </header>
    <aside id="admin-navigation" class="flex-col border-b border-line bg-white px-5 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:border-r lg:border-b-0 lg:px-6" :class="menuOpen ? 'flex' : 'hidden'">
      <div class="hidden lg:block"><LayoutAppBrand /></div>
      <p class="eyebrow lg:mt-8">Ruang petugas</p>
      <nav class="mt-4" aria-label="Navigasi petugas">
        <ul class="space-y-1">
          <li v-for="link in links" :key="link.to">
            <NuxtLink :to="link.to" class="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-charcoal hover:bg-sage-100" active-class="bg-sage-100 text-forest-900 font-semibold">{{ link.label }}</NuxtLink>
          </li>
        </ul>
      </nav>
      <div class="mt-8 border-t border-line pt-5 text-sm lg:mt-auto">
        <p v-if="session?.user" class="font-medium leading-snug">{{ session.user.fullName || 'Petugas' }}</p>
        <p v-if="session?.user" class="mt-1 break-all text-xs text-charcoal/75">{{ session.user.email }}</p>
        <NuxtLink to="/" class="text-link mt-3 flex min-h-11 items-center">Situs publik</NuxtLink>
        <button type="button" class="button-secondary mt-2 w-full" :disabled="loggingOut || !ready" @click="logout">{{ loggingOut ? 'Keluar…' : 'Keluar' }}</button>
        <p v-if="logoutError" role="alert" class="form-error">{{ logoutError }}</p>
      </div>
    </aside>
    <main id="main-content" class="min-w-0 px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><slot /></main>
  </div>
</template>
