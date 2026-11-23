<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Akun Saya — RimbaGuard', robots: 'noindex' })
const { data: session } = await useAuth()
// Officers manage the same account from their own workspace.
if (session.value?.user?.role === 'admin') await navigateTo('/admin/settings', { replace: true })
const user = computed(() => session.value?.user ?? null)
</script>

<template>
  <div class="page-container py-12 sm:py-16">
    <div class="border-b border-line pb-8">
      <p class="eyebrow">Ruang akun</p>
      <h1 class="mt-3 text-4xl font-semibold tracking-tight text-forest-900">Akun saya</h1>
      <p class="mt-4 max-w-2xl body-copy">Atur foto profil, nama, dan kata sandi Anda, serta perangkat yang sedang masuk.</p>
    </div>

    <!-- One column: every section follows the previous one down the page. -->
    <div v-if="user" class="account-page">
      <AccountProfileHero :user="user" role-label="Pelapor RimbaGuard" />
      <AccountCard heading-id="account-profile" icon="user" title="Profil" description="Nama yang tampil di akun Anda.">
        <AccountNameForm :user="user" />
      </AccountCard>
      <AccountCard heading-id="account-password" icon="key" title="Kata sandi" description="Gunakan kata sandi yang kuat dan tidak dipakai di layanan lain.">
        <AccountPasswordForm :email="user.email" />
      </AccountCard>
      <AccountCard heading-id="account-session" icon="lock" title="Sesi dan perangkat" description="Tentukan dari perangkat mana akun ini keluar.">
        <AccountSessionActions />
      </AccountCard>
    </div>
  </div>
</template>

<style scoped>
.account-page { display: grid; gap: 1.5rem; margin-top: 2rem; }
</style>
