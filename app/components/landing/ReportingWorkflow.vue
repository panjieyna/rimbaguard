<script setup lang="ts">
const steps = [
  {
    number: '01',
    icon: 'camera',
    title: 'Kirim pengamatan Anda',
    description: 'Unggah foto, pilih lokasi, lalu ceritakan apa yang Anda lihat.',
  },
  {
    number: '02',
    icon: 'analysis',
    title: 'AI membantu analisis awal',
    description: 'Informasi ditata untuk mengenali dugaan ancaman. Hasilnya tetap perlu diperiksa petugas.',
  },
  {
    number: '03',
    icon: 'clipboard',
    title: 'Petugas meninjau laporan',
    description: 'Petugas memeriksa bukti dan mencatat keputusan. Pantau perkembangannya melalui Laporan saya.',
  },
] as const

const assurances = [
  { icon: 'shield', title: 'Bukti tetap privat', description: 'Foto dan titik rinci hanya untuk Anda dan petugas.' },
  { icon: 'leaf', title: 'Berawal dari pengamatan', description: 'Laporan Anda menjadi informasi awal untuk diperiksa.' },
  { icon: 'community', title: 'Perkembangan bisa dipantau', description: 'Lihat catatan penanganan melalui Laporan saya.' },
] as const

const section = ref<HTMLElement>()
const entered = ref(false)
let observer: IntersectionObserver | undefined

onMounted(() => {
  if (!section.value || !('IntersectionObserver' in window)
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) {
      entered.value = true
      observer?.disconnect()
    }
  }, { threshold: 0.12 })
  observer.observe(section.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section ref="section" class="reporting-workflow relative isolate overflow-hidden bg-[#FCFDF9] py-12 sm:py-16" :class="{ 'has-entered': entered }" aria-labelledby="how-it-works">
    <div class="page-container relative max-w-7xl">
      <div class="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:gap-x-12 lg:gap-y-5">
        <div class="relative z-10 lg:col-start-2 lg:row-start-1">
          <p class="inline-flex rounded-full border border-forest-500/25 bg-sage-100/65 px-3 py-1 text-xs leading-5 font-semibold tracking-wide text-forest-700 uppercase">Alur RimbaGuard</p>
          <h2 id="how-it-works" class="mt-4 max-w-xl text-3xl leading-[1.16] font-semibold tracking-tight text-forest-900 sm:text-[2.5rem]">Dari ponsel Anda,<br class="hidden sm:block"> untuk <span class="text-[#3C7A49]">hutan kita.</span></h2>
          <p class="mt-4 max-w-xl text-base leading-7 text-charcoal/80">Ceritakan pengamatan Anda. AI membantu analisis awal, lalu petugas memeriksa laporan dan mencatat tindak lanjutnya.</p>
        </div>

        <div class="workflow-illustration relative isolate flex min-w-0 flex-col items-center justify-end pt-8 pb-2 sm:pt-12 lg:col-start-1 lg:row-start-1 lg:row-span-3 lg:pt-12 lg:pb-0">
          <img src="/images/workflow-forest.webp" alt="" aria-hidden="true" width="1000" height="1250" loading="lazy" decoding="async" class="workflow-landscape pointer-events-none absolute -z-10 max-w-none object-cover object-left-bottom">
          <img src="/images/reporting-character.webp" alt="" aria-hidden="true" width="371" height="1200" loading="lazy" decoding="async" class="workflow-character relative h-96 w-auto max-w-full object-contain sm:h-[28rem] lg:h-[35rem] lg:translate-x-7">
          <div class="workflow-invitation relative mt-5 flex max-w-64 items-start gap-3 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 lg:absolute lg:bottom-32 lg:-left-5 lg:mt-0 lg:max-w-56">
            <LandingWorkflowIcon name="leaf" class="mt-1 size-5 shrink-0 text-forest-500" />
            <div><p class="text-sm leading-6 font-semibold text-forest-900">Mari jaga hutan kita.</p><p class="mt-1 text-sm leading-5 text-charcoal/75">Mulai dengan mencatat apa yang Anda lihat.</p></div>
          </div>
        </div>

        <ol class="workflow-steps relative z-10 space-y-1 lg:col-start-2 lg:row-start-2" aria-label="Tahapan pelaporan RimbaGuard">
          <li v-for="step in steps" :key="step.number" class="workflow-step relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 rounded-2xl p-3 sm:grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] sm:gap-x-3 sm:p-4">
            <span class="relative z-10 row-span-2 flex size-12 items-center justify-center rounded-2xl bg-[#E5F0E3] text-[#3C7A49] sm:size-14">
              <LandingWorkflowIcon :name="step.icon" class="size-7" />
            </span>
            <span aria-hidden="true" class="hidden size-6 items-center justify-center rounded-full bg-[#D8E9D5] text-xs leading-6 font-semibold text-forest-700 sm:mt-1 sm:flex">{{ step.number }}</span>
            <div class="min-w-0 sm:col-start-3">
              <h3 class="text-lg leading-7 font-semibold text-forest-900"><span class="mr-2 text-sm text-forest-700 sm:hidden">{{ step.number }}</span>{{ step.title }}</h3>
              <p class="mt-1 text-base leading-6 text-charcoal/80">{{ step.description }}</p>
            </div>
          </li>
        </ol>

        <div class="relative z-10 lg:col-start-2 lg:row-start-3 lg:pl-4">
          <div class="max-w-md">
            <NuxtLink to="/report" class="button-primary min-h-13 w-full rounded-xl font-semibold">Mulai buat laporan <span aria-hidden="true">↗</span></NuxtLink>
            <p class="mt-2 flex items-center justify-center gap-2 rounded-xl bg-sage-100/70 px-3 py-2 text-sm leading-6 text-forest-700"><LandingWorkflowIcon name="lock" class="size-4 shrink-0" /><span>Foto dan lokasi rinci Anda disimpan privat.</span></p>
          </div>
        </div>
      </div>

      <ul class="relative z-10 mt-10 grid divide-y divide-line rounded-2xl border border-line bg-white px-5 py-2 sm:px-6 lg:grid-cols-3 lg:divide-x lg:divide-y-0 lg:py-6" aria-label="Tentang laporan Anda">
        <li v-for="item in assurances" :key="item.title" class="flex items-start gap-4 py-5 lg:px-5 lg:py-0 first:lg:pl-0 last:lg:pr-0">
          <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#E5F0E3] text-[#3C7A49]"><LandingWorkflowIcon :name="item.icon" class="size-6" /></span>
          <div><h3 class="text-base leading-6 font-semibold text-forest-900">{{ item.title }}</h3><p class="mt-1 text-sm leading-6 text-charcoal/75">{{ item.description }}</p></div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.workflow-landscape {
  bottom: -1rem;
  left: 50%;
  width: calc(100% + 6rem);
  height: calc(100% + 1rem);
  transform: translateX(-50%);
  mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
}

.workflow-steps::before {
  position: absolute;
  top: 3rem;
  bottom: 3rem;
  left: 2.25rem;
  border-left: 1px dashed #A5C2A0;
  content: '';
  transform-origin: top;
}

@media (min-width: 640px) {
  .workflow-steps::before { left: 2.75rem; }
}

@media (min-width: 1024px) {
  .workflow-landscape {
    bottom: -11rem;
    left: auto;
    right: -5rem;
    width: calc(100% + 15rem);
    height: calc(100% + 17rem);
    transform: none;
    mask-image: linear-gradient(to right, #000 70%, transparent);
  }
  .workflow-illustration::after {
    position: absolute;
    right: -5rem;
    bottom: -11rem;
    left: -10rem;
    z-index: -1;
    height: 6rem;
    background: linear-gradient(to bottom, transparent, #FCFDF9);
    content: '';
    pointer-events: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .has-entered .workflow-character {
    animation: character-arrives 700ms ease-out both;
  }
  .has-entered .workflow-steps::before {
    animation: workflow-connects 650ms ease-out both;
  }
}

@keyframes character-arrives {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes workflow-connects {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
</style>
