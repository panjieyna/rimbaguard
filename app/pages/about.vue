<script setup lang="ts">
useSeoMeta({ title: 'Tentang — RimbaGuard AI' })
const steps = [
  { title: 'Laporan masyarakat', description: 'Foto, deskripsi, waktu kejadian, dan lokasi membantu petugas memahami indikasi ancaman.' },
  { title: 'Analisis dan prioritas', description: 'AI membantu membaca bukti. Aturan penilaian yang transparan membantu menentukan urutan pemeriksaan.' },
  { title: 'Verifikasi petugas', description: 'Petugas meninjau laporan dan mencatat verifikasi serta perkembangan tindak lanjut.' },
]
</script>

<template>
  <article class="page-container max-w-4xl py-16 sm:py-24">
    <p class="eyebrow">Tentang RimbaGuard AI</p>
    <h1 class="mt-5 text-4xl leading-tight font-semibold tracking-tight text-forest-900 sm:text-5xl">Dari kepedulian menjadi informasi yang dapat ditindaklanjuti.</h1>
    <p class="mt-7 body-copy">RimbaGuard AI dirancang untuk membantu masyarakat dan petugas konservasi mengelola laporan dugaan ancaman terhadap hutan. Keputusan mengenai validitas laporan tetap berada pada manusia.</p>
    <ol class="mt-10 divide-y divide-line border-y border-line">
      <li v-for="(step, index) in steps" :key="step.title" class="grid gap-3 py-7 sm:grid-cols-[48px_1fr]">
        <span class="font-medium text-forest-700" aria-hidden="true">0{{ index + 1 }}</span>
        <div><h2 class="text-xl font-semibold text-forest-900">{{ step.title }}</h2><p class="mt-2 body-copy">{{ step.description }}</p></div>
      </li>
    </ol>
    <p class="mt-8 body-copy">Identitas pelapor dan bukti foto disimpan secara privat. Ringkasan pada peta publik memerlukan peninjauan petugas, dengan koordinat yang ditampilkan sebagai perkiraan.</p>
    <NuxtLink to="/" class="text-link mt-7 inline-flex min-h-11 items-center">Kembali ke beranda</NuxtLink>
  </article>
</template>
