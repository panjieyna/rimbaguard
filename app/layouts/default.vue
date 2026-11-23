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
const headerScrolled = ref(false)
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
function updateHeader() { headerScrolled.value = window.scrollY > 24 }
onMounted(() => {
  ready.value = true
  updateHeader()
  window.addEventListener('scroll', updateHeader, { passive: true })
  document.addEventListener('pointerdown', dismissAccount)
  document.addEventListener('keydown', handleEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateHeader)
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
    <a href="#main-content" class="sr-only z-[100] bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Lewati ke konten utama</a>
    <header class="public-header" :class="{ 'public-header--home': isHome, 'public-header--solid': headerScrolled || menuOpen }">
      <div class="public-header-inner page-container">
        <LayoutAppBrand :inverted="isHome" />
        <button ref="mobileMenuButton" type="button" class="public-menu-button xl:hidden" :disabled="!ready" :aria-expanded="menuOpen" aria-controls="public-header-menu" @click="toggleNavigation"><span>{{ menuOpen ? 'Tutup' : 'Menu' }}</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path v-if="menuOpen" d="m6 6 12 12M18 6 6 18" /><path v-else d="M4 7h16M4 12h16M4 17h16" /></svg></button>
        <div id="public-header-menu" class="public-header-menu" :class="[menuOpen ? 'flex' : 'hidden', 'xl:flex']">
          <nav id="public-navigation" class="public-navigation" aria-label="Navigasi utama">
            <NuxtLink to="/" class="public-nav-link" :class="navigationLinkClass" :exact-active-class="activeLinkClass">Beranda</NuxtLink>
            <NuxtLink to="/map" class="public-nav-link" :class="navigationLinkClass" :active-class="activeLinkClass">Peta laporan</NuxtLink>
            <NuxtLink to="/about" class="public-nav-link" :class="navigationLinkClass" :active-class="activeLinkClass">Tentang</NuxtLink>
            <template v-if="session?.user">
              <NuxtLink to="/reports" class="public-nav-link" :class="navigationLinkClass" :active-class="activeLinkClass">Laporan saya</NuxtLink>
              <NuxtLink v-if="session.user.role === 'admin'" to="/admin/dashboard" class="public-nav-link" :class="navigationLinkClass">Ruang petugas</NuxtLink>
            </template>
            <NuxtLink v-else to="/login" class="public-nav-link" :class="navigationLinkClass" :active-class="activeLinkClass">Masuk</NuxtLink>
            <NuxtLink to="/report" class="public-report-link">Laporkan ancaman <span aria-hidden="true">↗</span></NuxtLink>
          </nav>
          <div v-if="session?.user" class="border-t pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5" :class="isHome ? 'border-white/25' : 'border-line'">
            <details ref="accountMenu" class="group relative">
              <summary role="button" class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 border px-4 py-2 text-base font-medium [&::-webkit-details-marker]:hidden" :class="isHome ? 'rounded-full border-white/25 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white' : 'rounded-lg border-line bg-white text-forest-900 hover:bg-sage-100'">
                <span class="flex items-center gap-2.5">
                  <UiUserAvatar :name="session.user.fullName || 'Pengguna'" :src="session.user.avatarUrl" size="xs" :tone="isHome ? 'glass' : 'sage'" />
                  Akun saya
                </span>
                <svg class="size-4 shrink-0 group-open:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
              </summary>
              <div class="mt-2 rounded-lg border border-line bg-white text-charcoal xl:absolute xl:right-0 xl:z-30 xl:w-72">
                <div class="flex items-center gap-3 px-4 py-4">
                  <UiUserAvatar :name="session.user.fullName || 'Pengguna'" :src="session.user.avatarUrl" />
                  <div class="min-w-0">
                    <p class="text-sm text-charcoal/75">Anda masuk sebagai</p>
                    <p class="mt-0.5 break-words text-base font-semibold leading-6 text-forest-900">{{ session.user.fullName || 'Pengguna RimbaGuard' }}</p>
                  </div>
                </div>
                <div class="border-t border-line p-2">
                  <NuxtLink :to="session.user.role === 'admin' ? '/admin/settings' : '/account'" class="flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-3 text-left text-base font-medium text-forest-900 hover:bg-sage-100">
                    <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" /></svg>
                    Pengaturan akun
                  </NuxtLink>
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
      <p v-if="logoutError" role="alert" class="page-container form-error bg-warm-white py-3">{{ logoutError }}</p>
    </header>
    <main id="main-content" class="flex-1" tabindex="-1"><slot /></main>
    <footer class="border-t border-line py-7">
      <div class="page-container grid gap-5 text-sm leading-6 sm:grid-cols-2">
        <div><p class="font-medium">© 2026 RimbaGuard</p><p class="mt-1">Protecting Forests Through Intelligence and Community Action.</p></div>
        <p class="max-w-md sm:justify-self-end sm:text-right">Laporan merupakan informasi awal. Analisis AI membantu pemeriksaan dan tetap memerlukan verifikasi petugas.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.public-header { position: sticky; z-index: 50; top: 0; border-bottom: 1px solid #E5E8E3; background: #FAFAF7; color: #173D32; }
.public-header--home { position: fixed; right: 0; left: 0; border-color: transparent; background: transparent; color: white; }
.public-header--home.public-header--solid { border-color: #315749; background: #12372B; }
.public-header-inner { display: flex; max-width: 80rem; min-height: 5rem; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0 1rem; padding-block: 1rem; }
.public-header :deep(a[aria-label="RimbaGuard, beranda"]) { min-height: 3rem; flex-shrink: 0; }
.public-menu-button { display: inline-flex; min-height: 3rem; align-items: center; justify-content: center; gap: 0.625rem; border: 1px solid #D2DDD0; border-radius: 9999px; padding: 0.5rem 1rem; font-size: 0.9375rem; font-weight: 500; }
.public-header--home .public-menu-button { border-color: rgb(255 255 255 / 50%); }
.public-header--home .public-menu-button:focus-visible, .public-header--home .public-nav-link:focus-visible, .public-header--home .public-report-link:focus-visible, .public-header--home :deep(summary:focus-visible), .public-header--home :deep(a[aria-label="RimbaGuard, beranda"]:focus-visible) { outline-color: white; }
.public-header-menu { width: 100%; max-height: calc(100svh - 5rem); flex-direction: column; gap: 1.25rem; overflow-y: auto; padding: 0.5rem 0 1.5rem; }
.public-navigation { display: flex; flex-direction: column; gap: 0.25rem; font-size: 1rem; line-height: 1.5rem; font-weight: 500; }
.public-nav-link { display: inline-flex; min-height: 3rem; align-items: center; padding: 0.625rem 0; text-underline-offset: 0.5rem; }
.public-report-link { display: inline-flex; min-height: 3rem; align-items: center; justify-content: center; gap: 0.625rem; margin-top: 0.5rem; border: 1px solid #173D32; border-radius: 9999px; background: #173D32; padding: 0.625rem 1.25rem; color: white; font-size: 0.9375rem; line-height: 1.5rem; font-weight: 600; }
.public-report-link:hover { background: #285C48; }
.public-header--home .public-report-link { border-color: white; background: white; color: #173D32; }
.public-header--home .public-report-link:hover { background: #EAF0E9; }
@media (min-width: 80rem) {
  .public-header-inner { min-height: 5.5rem; flex-wrap: nowrap; gap: 1.5rem; padding-block: 0; }
  .public-menu-button { display: none; }
  .public-header-menu { width: auto; max-height: none; flex-direction: row; align-items: center; gap: 1.25rem; overflow: visible; padding: 0; }
  .public-navigation { flex-direction: row; align-items: center; gap: 1.5rem; font-size: 0.9375rem; }
  .public-report-link { margin-top: 0; }
}
@media (max-width: 24rem) {
  .public-header-inner { column-gap: 0.5rem; }
  .public-header :deep(a[aria-label="RimbaGuard, beranda"]) { gap: 0.375rem; }
  .public-header :deep(a[aria-label="RimbaGuard, beranda"] > span) { font-size: 1rem; }
  .public-menu-button { gap: 0.375rem; padding-inline: 0.75rem; }
}
</style>
