<script setup lang="ts">
import { readApiError } from '~/utils/api-error'
const { data: session, refresh } = await useAuth()
const route = useRoute()
const isHome = computed(() => route.path === '/')
const navigationLinkClass = computed(() => isHome.value ? 'text-white hover:underline underline-offset-4 focus-visible:outline-white' : 'hover:text-forest-700')
const activeLinkClass = computed(() => isHome.value ? 'font-semibold underline underline-offset-4' : 'font-semibold text-forest-700')
const loggingOut = ref(false)
const logoutError = ref('')
const menuOpen = ref(false)
const ready = ref(false)
const accountMenu = ref<HTMLDetailsElement>()
const mobileMenuButton = ref<HTMLButtonElement>()

function closeAccount(restoreFocus = false) {
  if (!accountMenu.value?.open) return
  accountMenu.value.open = false
  if (restoreFocus) accountMenu.value.querySelector('summary')?.focus()
}
function dismissAccount(event: PointerEvent) {
  if (event.target instanceof Node && !accountMenu.value?.contains(event.target)) closeAccount()
}
function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (accountMenu.value?.open) closeAccount(true)
  else if (menuOpen.value) {
    menuOpen.value = false
    mobileMenuButton.value?.focus()
  }
}
function toggleNavigation() {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) closeAccount()
}
onMounted(() => {
  ready.value = true
  document.addEventListener('pointerdown', dismissAccount)
  document.addEventListener('keydown', handleEscape)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissAccount)
  document.removeEventListener('keydown', handleEscape)
})
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST', body: {} })
    await refresh()
    menuOpen.value = false
    closeAccount()
    await navigateTo('/')
  }
  catch (error) { logoutError.value = readApiError(error).message }
  finally { loggingOut.value = false }
}
watch(() => route.fullPath, () => {
  menuOpen.value = false
  closeAccount()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a href="#main-content" class="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Lewati ke konten utama</a>
    <header :class="isHome ? 'relative z-40 -mb-12 px-4 pt-5 sm:px-6' : 'border-b border-line'">
      <div class="flex flex-wrap items-center justify-between py-4" :class="isHome ? 'mx-auto min-h-24 w-full max-w-7xl gap-3 rounded-[2rem] bg-forest-900 px-4 text-white sm:gap-4 sm:px-8 xl:rounded-full' : 'page-container min-h-20 gap-4'">
        <LayoutAppBrand :inverted="isHome" />
        <button ref="mobileMenuButton" type="button" class="button-secondary px-4 py-2 xl:hidden" :class="isHome ? 'rounded-full border-white focus-visible:outline-white' : ''" :disabled="!ready" :aria-expanded="menuOpen" aria-controls="public-header-menu" @click="toggleNavigation">{{ menuOpen ? 'Tutup' : 'Menu' }}</button>
        <div id="public-header-menu" :class="[menuOpen ? 'flex' : 'hidden', 'w-full flex-col gap-5 xl:flex xl:w-auto xl:flex-row xl:items-center xl:gap-5']">
          <nav id="public-navigation" class="flex flex-col gap-1 text-base xl:flex-row xl:items-center xl:gap-4" aria-label="Navigasi utama">
            <NuxtLink to="/map" class="min-h-12 content-center rounded-sm py-2" :class="navigationLinkClass" :active-class="activeLinkClass">Peta laporan</NuxtLink>
            <NuxtLink to="/about" class="min-h-12 content-center rounded-sm py-2" :class="navigationLinkClass" :active-class="activeLinkClass">Tentang</NuxtLink>
            <template v-if="session?.user">
              <NuxtLink to="/reports" class="min-h-12 content-center rounded-sm py-2" :class="navigationLinkClass" :active-class="activeLinkClass">Laporan saya</NuxtLink>
              <NuxtLink v-if="session.user.role === 'admin'" to="/admin/dashboard" class="min-h-12 content-center rounded-sm py-2" :class="navigationLinkClass">Ruang petugas</NuxtLink>
            </template>
            <NuxtLink v-else to="/login" class="min-h-12 content-center rounded-sm py-2" :class="navigationLinkClass" :active-class="activeLinkClass">Masuk</NuxtLink>
            <NuxtLink to="/report" class="mt-2 xl:mt-0" :class="isHome ? 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-base font-semibold text-forest-900 hover:bg-sage-100 focus-visible:outline-white' : 'button-primary'">Laporkan ancaman <span aria-hidden="true">↗</span></NuxtLink>
          </nav>
          <div v-if="session?.user" class="border-t pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5" :class="isHome ? 'border-white/25' : 'border-line'">
            <details ref="accountMenu" class="group relative">
              <summary role="button" class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 border px-4 py-2 text-base font-medium [&::-webkit-details-marker]:hidden" :class="isHome ? 'rounded-full border-white/25 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white' : 'rounded-lg border-line bg-white text-forest-900 hover:bg-sage-100'">
                <span class="flex items-center gap-2.5">
                  <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" /></svg>
                  Akun saya
                </span>
                <svg class="size-4 shrink-0 group-open:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
              </summary>
              <div class="mt-2 rounded-lg border border-line bg-white text-charcoal xl:absolute xl:right-0 xl:z-30 xl:w-72">
                <div class="px-4 py-4">
                  <p class="text-sm text-charcoal/75">Anda masuk sebagai</p>
                  <p class="mt-1 break-words text-base font-semibold leading-6 text-forest-900">{{ session.user.fullName || 'Pengguna RimbaGuard' }}</p>
                </div>
                <div class="border-t border-line p-2">
                  <button type="button" class="flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-3 text-left text-base font-medium text-[#9D302B] hover:bg-[#FBEFEB] disabled:opacity-50" :disabled="loggingOut || !ready" @click="logout">
                    <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M10 4H4v16h6M8 12h12m-4-4 4 4-4 4" /></svg>
                    {{ loggingOut ? 'Keluar…' : 'Keluar' }}
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
      <p v-if="logoutError" role="alert" :class="isHome ? 'form-error mx-auto mt-3 w-full max-w-7xl rounded-lg border border-line bg-white px-5 py-3' : 'page-container form-error pb-4'">{{ logoutError }}</p>
    </header>
    <main id="main-content" class="flex-1" tabindex="-1"><slot /></main>
    <footer class="border-t border-line py-7">
      <div class="page-container grid gap-5 text-sm leading-6 sm:grid-cols-2">
        <div><p class="font-medium">© 2026 RimbaGuard AI</p><p class="mt-1">Protecting Forests Through Intelligence and Community Action.</p></div>
        <p class="max-w-md sm:justify-self-end sm:text-right">Laporan merupakan informasi awal. Analisis AI membantu pemeriksaan dan tetap memerlukan verifikasi petugas.</p>
      </div>
    </footer>
  </div>
</template>
