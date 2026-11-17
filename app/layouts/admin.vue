<script setup lang="ts">
import { readApiError } from '~/utils/api-error'
import type { AdminIconName } from '~/types/admin-ui'
const { data: session, refresh } = await useAuth()
const route = useRoute()
const menuOpen = ref(false)
const ready = ref(false)
const loggingOut = ref(false)
const logoutError = ref('')
const menuButton = ref<HTMLButtonElement>()
const initials = computed(() => (session.value?.user?.fullName || 'Petugas').trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase())
function escapeMenu(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value) { menuOpen.value = false; menuButton.value?.focus() }
}
onMounted(() => { ready.value = true; document.addEventListener('keydown', escapeMenu) })
onBeforeUnmount(() => document.removeEventListener('keydown', escapeMenu))
watch(() => route.fullPath, () => { menuOpen.value = false })

const links: { to: string; label: string; icon: AdminIconName }[] = [
  { to: '/admin/dashboard', label: 'Ringkasan', icon: 'dashboard' },
  { to: '/admin/reports', label: 'Laporan', icon: 'reports' },
  { to: '/admin/map', label: 'Peta', icon: 'map' },
  { to: '/admin/analytics', label: 'Analitik', icon: 'analytics' },
  { to: '/admin/settings', label: 'Pengaturan', icon: 'settings' },
]
const active = (path: string) => route.path === path || (path === '/admin/reports' && route.path.startsWith('/admin/reports/'))

async function logout() {
  if (loggingOut.value) return
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
  <div class="admin-workspace min-h-dvh bg-[#F4F6F2] lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
    <a href="#main-content" class="sr-only z-50 rounded-lg bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Lewati ke konten utama</a>
    <header class="flex items-center justify-between gap-4 border-b border-line bg-white px-5 py-4 lg:hidden">
      <LayoutAppBrand />
      <button ref="menuButton" type="button" class="button-secondary px-4 py-2" :disabled="!ready" :aria-expanded="menuOpen" aria-controls="admin-navigation" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Tutup' : 'Menu' }}</button>
    </header>
    <aside id="admin-navigation" class="flex-col bg-forest-900 px-5 py-6 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:overflow-y-auto lg:px-6 lg:py-8" :class="menuOpen ? 'flex' : 'hidden'">
      <div class="hidden lg:block"><LayoutAppBrand inverted /></div>
      <p class="px-3 text-xs leading-6 font-medium tracking-[0.12em] text-white/70 uppercase lg:mt-10">Ruang petugas</p>
      <nav class="mt-4" aria-label="Navigasi petugas">
        <ul class="space-y-2">
          <li v-for="link in links" :key="link.to">
            <NuxtLink :to="link.to" class="flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold focus-visible:outline-white" :class="active(link.to) ? 'bg-[#EAF0E9] text-forest-900' : 'text-white/90 hover:bg-white/10 hover:text-white'" :aria-current="active(link.to) ? 'page' : undefined"><AdminIcon :name="link.icon" class="size-5" /><span>{{ link.label }}</span><AdminIcon v-if="active(link.to)" name="chevron-right" class="ml-auto size-4" /></NuxtLink>
          </li>
        </ul>
      </nav>
      <div class="mt-8 border-t border-white/15 pt-5 lg:mt-auto">
        <NuxtLink to="/admin/settings" class="flex items-center gap-3 rounded-lg p-2 hover:bg-white/10 focus-visible:outline-white" aria-label="Pengaturan akun petugas"><span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">{{ initials }}</span><span class="min-w-0"><span class="block truncate text-sm font-medium">{{ session?.user?.fullName || 'Petugas RimbaGuard' }}</span><span class="mt-0.5 block text-xs leading-5 text-white/70">Akun petugas</span></span></NuxtLink>
        <NuxtLink to="/" class="mt-3 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm text-white/85 hover:bg-white/10 focus-visible:outline-white"><AdminIcon name="external" class="size-4" />Situs publik</NuxtLink>
        <button type="button" class="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/25 px-3 text-left text-base font-medium text-white hover:bg-white/10 focus-visible:outline-white disabled:opacity-50" :disabled="loggingOut || !ready" @click="logout"><AdminIcon name="logout" class="size-5" />{{ loggingOut ? 'Keluar…' : 'Keluar' }}</button>
        <p v-if="logoutError" role="alert" class="mt-3 rounded-lg bg-white px-3 py-2 text-sm leading-6 text-[#9D302B]">{{ logoutError }}</p>
      </div>
    </aside>
    <div class="min-w-0">
      <header class="hidden min-h-20 items-center justify-between gap-5 border-b border-line bg-white px-8 lg:flex xl:px-10">
        <div class="flex items-center gap-3"><span class="flex size-9 items-center justify-center rounded-xl bg-sage-100 text-forest-700"><AdminIcon name="leaf" class="size-5" /></span><p class="text-base font-medium text-forest-900">Ruang petugas</p></div>
        <NuxtLink to="/admin/settings" class="flex min-h-12 items-center gap-3 rounded-xl px-3 py-1 hover:bg-sage-100" aria-label="Buka pengaturan akun"><span class="hidden text-right text-sm leading-5 xl:block"><span class="block max-w-56 truncate font-medium text-charcoal">{{ session?.user?.fullName || 'Petugas' }}</span><span class="text-charcoal/65">Petugas RimbaGuard</span></span><span class="flex size-10 items-center justify-center rounded-full bg-sage-100 text-sm font-semibold text-forest-700">{{ initials }}</span></NuxtLink>
      </header>
      <main id="main-content" class="min-w-0 px-4 py-7 sm:px-7 sm:py-8 xl:px-10" tabindex="-1"><div class="mx-auto max-w-[1440px]"><slot /></div></main>
    </div>
  </div>
</template>
