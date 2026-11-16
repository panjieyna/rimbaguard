<template>
  <div class="grid min-h-dvh bg-white lg:grid-cols-2">
    <a href="#main-content" class="sr-only z-50 rounded-lg bg-white p-3 text-forest-900 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Lewati ke konten utama</a>

    <aside class="relative isolate m-3 overflow-hidden rounded-[1.5rem] bg-forest-900 text-white sm:m-4 lg:sticky lg:top-4 lg:h-[calc(100svh-2rem)] lg:self-start" aria-label="RimbaGuard">
      <img src="/images/rainforest-panorama-2172.webp" alt="" aria-hidden="true" width="2172" height="724" fetchpriority="high" class="absolute inset-0 -z-20 h-full w-full object-cover object-[62%_center]">
      <div class="auth-shade absolute inset-0 -z-10" aria-hidden="true" />
      <div class="flex min-h-48 flex-col justify-between gap-8 p-6 sm:p-8 lg:h-full lg:min-h-0 lg:p-10 xl:p-12">
        <LayoutAppBrand inverted />

        <div class="max-w-lg lg:mt-auto lg:pb-10">
          <p class="mb-4 hidden text-sm leading-6 font-medium tracking-[0.12em] text-white/90 uppercase lg:block">Kepedulian lokal. Perlindungan bersama.</p>
          <h2 class="max-w-md text-2xl leading-[1.18] font-semibold tracking-[-0.025em] sm:text-3xl lg:text-[2.5rem] xl:text-[2.75rem]">Kepedulian Anda,<br>awal perlindungan.</h2>
          <p class="mt-5 hidden max-w-sm text-base leading-7 text-white/90 lg:block">Bantu petugas memahami dugaan ancaman terhadap hutan melalui foto dan pengamatan Anda.</p>
        </div>

        <div class="hidden items-start gap-3 border-t border-white/20 pt-6 text-sm leading-6 text-white/90 lg:flex">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="mt-0.5 size-5 shrink-0" aria-hidden="true"><path d="m12 3 8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
          <p>Foto dan lokasi rinci disimpan privat.<br>Laporan ditinjau oleh petugas.</p>
        </div>
      </div>
    </aside>

    <div class="flex min-w-0 flex-col px-6 pt-2 pb-5 sm:px-10 sm:pt-4 lg:px-12 lg:pt-7 lg:pb-6 xl:px-20">
      <NuxtLink to="/" class="inline-flex min-h-11 items-center gap-2 self-start text-sm leading-6 font-medium text-forest-700 hover:text-forest-900 hover:underline underline-offset-4">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="size-4" aria-hidden="true"><path d="m8 5-5 5 5 5M3 10h14" /></svg>
        Kembali ke beranda
      </NuxtLink>

      <main id="main-content" class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-7 sm:py-10 lg:py-12" tabindex="-1">
        <slot />
      </main>

      <footer class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-4 text-sm leading-6 text-charcoal/70">
        <p>© 2026 RimbaGuard AI</p>
        <NuxtLink to="/about" class="inline-flex min-h-11 items-center text-forest-700 hover:underline underline-offset-4">Tentang RimbaGuard</NuxtLink>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.auth-shade {
  background: linear-gradient(180deg, rgb(6 29 21 / 72%) 0%, rgb(6 29 21 / 52%) 35%, rgb(6 29 21 / 88%) 100%);
}
</style>
