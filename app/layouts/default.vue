<script setup lang="ts">
import { readApiError } from '~/utils/api-error'
const { data: session, refresh } = await useAuth()
const route = useRoute()
const loggingOut = ref(false)
const logoutError = ref('')
const menuOpen = ref(false)
const ready = ref(false)
onMounted(() => { ready.value = true })
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
watch(() => route.fullPath, () => { menuOpen.value = false })
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a href="#main-content" class="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Lewati ke konten utama</a>
    <header class="border-b border-line">
      <div class="page-container flex min-h-20 flex-wrap items-center justify-between gap-4 py-4">
        <LayoutAppBrand />
        <button type="button" class="button-secondary px-3 py-2 lg:hidden" :disabled="!ready" :aria-expanded="menuOpen" aria-controls="public-navigation" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Tutup' : 'Menu' }}</button>
        <nav id="public-navigation" :class="[menuOpen ? 'flex' : 'hidden', 'w-full flex-col gap-1 text-sm lg:flex lg:w-auto lg:flex-row lg:items-center lg:gap-5']" aria-label="Navigasi utama">
          <NuxtLink to="/map" class="min-h-11 content-center py-2 hover:text-forest-700" active-class="font-semibold text-forest-700">Peta laporan</NuxtLink>
          <NuxtLink to="/about" class="min-h-11 content-center py-2 hover:text-forest-700" active-class="font-semibold text-forest-700">Tentang</NuxtLink>
          <template v-if="session?.user">
            <NuxtLink to="/reports" class="min-h-11 content-center py-2 hover:text-forest-700" active-class="font-semibold text-forest-700">Laporan saya</NuxtLink>
            <NuxtLink v-if="session.user.role === 'admin'" to="/admin/dashboard" class="min-h-11 content-center py-2 hover:text-forest-700">Ruang petugas</NuxtLink>
            <button type="button" class="min-h-11 py-2 text-left hover:text-forest-700 disabled:opacity-50" :disabled="loggingOut" @click="logout">{{ loggingOut ? 'Keluar…' : 'Keluar' }}</button>
          </template>
          <NuxtLink v-else to="/login" class="min-h-11 content-center py-2 hover:text-forest-700" active-class="font-semibold text-forest-700">Masuk</NuxtLink>
          <NuxtLink to="/report" class="button-primary mt-2 lg:mt-0">Laporkan ancaman <span aria-hidden="true">↗</span></NuxtLink>
        </nav>
      </div>
      <p v-if="logoutError" role="alert" class="page-container form-error pb-4">{{ logoutError }}</p>
    </header>
    <main id="main-content" class="flex-1" tabindex="-1"><slot /></main>
    <footer class="border-t border-line py-7">
      <div class="page-container grid gap-5 text-xs leading-5 sm:grid-cols-2">
        <div><p class="font-medium">© 2026 RimbaGuard AI</p><p class="mt-1">Protecting Forests Through Intelligence and Community Action.</p></div>
        <p class="max-w-md sm:justify-self-end sm:text-right">Laporan merupakan informasi awal. Analisis AI membantu pemeriksaan dan tetap memerlukan verifikasi petugas.</p>
      </div>
    </footer>
  </div>
</template>
