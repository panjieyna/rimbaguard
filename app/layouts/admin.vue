<template>
  <div class="min-h-dvh bg-warm-white lg:grid lg:grid-cols-[240px_1fr]">
    <aside class="border-b border-line p-6 lg:border-r lg:border-b-0">
      <LayoutAppBrand />
      <p class="mt-6 text-sm text-charcoal/80">Ruang kerja petugas konservasi</p>
      <slot name="navigation" />
    </aside>
    <main id="main-content" class="min-w-0 px-5 py-8 sm:px-8 lg:p-12"><slot /></main>
  </div>
</template>
