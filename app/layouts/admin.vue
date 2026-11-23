<script setup lang="ts">
import { readApiError } from '~/utils/api-error'
import type { AdminIconName } from '~/types/admin-ui'
const { data: session, refresh } = await useAuth()
const route = useRoute()
const menuOpen = ref(false)
const ready = ref(false)
const loggingOut = ref(false)
const logoutError = ref('')
// Show a sign-out error once, next to the control that was used.
const logoutOrigin = ref<'menu' | 'sidebar'>('sidebar')
const menuButton = ref<HTMLButtonElement>()
const accountMenu = ref<HTMLDetailsElement>()
const displayName = computed(() => session.value?.user?.fullName || 'Petugas RimbaGuard')

function closeAccount(restoreFocus = false) {
  if (!accountMenu.value?.open) return
  accountMenu.value.open = false
  if (restoreFocus) accountMenu.value.querySelector('summary')?.focus()
}
function dismissAccount(event: PointerEvent) {
  if (event.target instanceof Node && !accountMenu.value?.contains(event.target)) closeAccount()
}
function escapeMenu(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (accountMenu.value?.open) closeAccount(true)
  else if (menuOpen.value) { menuOpen.value = false; menuButton.value?.focus() }
}
onMounted(() => {
  ready.value = true
  document.addEventListener('keydown', escapeMenu)
  document.addEventListener('pointerdown', dismissAccount)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', escapeMenu)
  document.removeEventListener('pointerdown', dismissAccount)
})
watch(() => route.fullPath, () => { menuOpen.value = false; closeAccount() })

const links: { to: string; label: string; icon: AdminIconName }[] = [
  { to: '/admin/dashboard', label: 'Ringkasan', icon: 'dashboard' },
  { to: '/admin/reports', label: 'Laporan', icon: 'reports' },
  { to: '/admin/map', label: 'Peta', icon: 'map' },
  { to: '/admin/analytics', label: 'Analitik', icon: 'analytics' },
  { to: '/admin/settings', label: 'Pengaturan', icon: 'settings' },
]
const active = (path: string) => route.path === path || (path === '/admin/reports' && route.path.startsWith('/admin/reports/'))
const currentSection = computed(() => links.find(link => active(link.to))?.label || 'Ruang petugas')

async function logout(origin: 'menu' | 'sidebar') {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutOrigin.value = origin
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
  <div class="admin-workspace admin-shell min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
    <a href="#main-content" class="sr-only z-50 rounded-lg bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Lewati ke konten utama</a>
    <header class="admin-mobile-header flex items-center justify-between gap-4 border-b border-line bg-white px-5 py-4 lg:hidden">
      <LayoutAppBrand />
      <button ref="menuButton" type="button" class="button-secondary px-4 py-2" :disabled="!ready" :aria-expanded="menuOpen" aria-controls="admin-navigation" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Tutup' : 'Menu' }}</button>
    </header>
    <aside id="admin-navigation" class="admin-sidebar flex-col bg-forest-900 px-5 py-6 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:overflow-y-auto lg:px-5 lg:py-7" :class="menuOpen ? 'flex' : 'hidden'">
      <div class="hidden lg:block"><LayoutAppBrand inverted /></div>
      <p class="px-3 text-xs leading-6 font-medium tracking-[0.12em] text-white/70 uppercase lg:mt-9">Ruang petugas</p>
      <nav class="mt-4" aria-label="Navigasi petugas">
        <ul class="space-y-2">
          <li v-for="link in links" :key="link.to">
            <NuxtLink :to="link.to" class="flex min-h-12 items-center gap-3 rounded-full px-4 py-3 text-base font-medium focus-visible:outline-white" :class="active(link.to) ? 'bg-[#EAF0E9] text-forest-900' : 'text-white/85 hover:bg-white/10 hover:text-white'" :aria-current="active(link.to) ? 'page' : undefined"><AdminIcon :name="link.icon" class="size-5" /><span>{{ link.label }}</span><AdminIcon v-if="active(link.to)" name="chevron-right" class="ml-auto size-4" /></NuxtLink>
          </li>
        </ul>
      </nav>
      <div class="mt-8 border-t border-white/15 pt-5 lg:mt-auto">
        <NuxtLink to="/admin/settings" class="flex items-center gap-3 rounded-lg p-2 hover:bg-white/10 focus-visible:outline-white"><UiUserAvatar :name="session?.user?.fullName || 'Petugas'" :src="session?.user?.avatarUrl" tone="glass" /><span class="min-w-0"><span class="block truncate text-sm font-medium">{{ session?.user?.fullName || 'Petugas RimbaGuard' }}</span><span class="mt-0.5 block text-xs leading-5 text-white/70">Akun petugas</span><span class="sr-only">, buka pengaturan akun</span></span></NuxtLink>
        <NuxtLink to="/" class="mt-3 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm text-white/85 hover:bg-white/10 focus-visible:outline-white"><AdminIcon name="external" class="size-4" />Situs publik</NuxtLink>
        <button type="button" class="mt-2 flex min-h-12 w-full items-center gap-3 rounded-full border border-white/25 px-4 text-left text-base font-medium text-white hover:bg-white/10 focus-visible:outline-white disabled:opacity-50" :disabled="loggingOut || !ready" @click="logout('sidebar')"><AdminIcon name="logout" class="size-5" />{{ loggingOut ? 'Keluar…' : 'Keluar' }}</button>
        <p v-if="logoutError && logoutOrigin === 'sidebar'" role="alert" class="mt-3 rounded-lg bg-white px-3 py-2 text-sm leading-6 text-[#9D302B]">{{ logoutError }}</p>
      </div>
    </aside>
    <div class="min-w-0">
      <header class="admin-topbar hidden min-h-20 items-center justify-between gap-5 border-b border-line px-7 lg:flex xl:px-8">
        <p class="flex items-center gap-3 text-sm"><span class="text-[#526057]">Ruang petugas</span><span aria-hidden="true" class="text-[#9BAC9D]">/</span><span class="font-medium text-forest-900">{{ currentSection }}</span></p>
        <!-- Account menu: same disclosure pattern as the public header's "Akun saya". -->
        <details ref="accountMenu" class="group relative">
          <summary role="button" class="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-full border border-[#DCE3D8] bg-white px-4 py-1.5 hover:bg-sage-100 group-open:bg-sage-100 [&::-webkit-details-marker]:hidden">
            <span class="hidden text-right text-sm leading-5 xl:block"><span class="block max-w-56 truncate font-medium text-charcoal">{{ displayName }}</span><span class="text-charcoal/75">Petugas RimbaGuard</span></span>
            <UiUserAvatar :name="displayName" :src="session?.user?.avatarUrl" />
            <AdminIcon name="chevron-down" class="size-4 text-charcoal/60 group-open:rotate-180" />
            <span class="sr-only">Menu akun</span>
          </summary>
          <div class="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-line bg-white p-2 shadow-[0_12px_32px_rgb(23_61_50/0.14)]">
            <div class="flex items-center gap-3 px-3 py-3">
              <UiUserAvatar :name="displayName" :src="session?.user?.avatarUrl" />
              <div class="min-w-0">
                <p class="break-words text-base font-semibold leading-6 text-forest-900">{{ displayName }}</p>
                <p class="truncate text-sm leading-5 text-charcoal/75">{{ session?.user?.email }}</p>
              </div>
            </div>
            <div class="my-1 border-t border-line" />
            <!-- Close at once on click; the route change alone waits until the next page has loaded. -->
            <NuxtLink to="/admin/settings" class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium text-forest-900 hover:bg-sage-100" @click="closeAccount()"><AdminIcon name="user" class="size-5" />Pengaturan akun</NuxtLink>
            <NuxtLink to="/" class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium text-forest-900 hover:bg-sage-100" @click="closeAccount()"><AdminIcon name="external" class="size-5" />Situs publik</NuxtLink>
            <div class="my-1 border-t border-line" />
            <button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-base font-medium text-[#9D302B] hover:bg-[#FBEFEB] disabled:opacity-50" :disabled="loggingOut || !ready" @click="logout('menu')"><AdminIcon name="logout" class="size-5" />{{ loggingOut ? 'Keluar…' : 'Keluar' }}</button>
            <p v-if="logoutError && logoutOrigin === 'menu'" role="alert" class="mx-1 mt-2 rounded-lg bg-[#FBEFEB] px-3 py-2 text-sm leading-6 text-[#8E2A24]">{{ logoutError }}</p>
          </div>
        </details>
      </header>
      <main id="main-content" class="min-w-0 px-5 py-7 sm:px-7 sm:py-8 xl:px-8" tabindex="-1"><div class="mx-auto max-w-[1440px]"><slot /></div></main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell { background: #F8F9F5; }
.admin-topbar { position: sticky; top: 0; z-index: 30; background: #FAFAF7; }
.admin-mobile-header { position: sticky; top: 0; z-index: 30; background: #FAFAF7; }
.admin-sidebar { scrollbar-width: thin; scrollbar-color: #688476 #173D32; }
</style>
