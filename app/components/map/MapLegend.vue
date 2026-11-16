<script setup lang="ts">
import { PRIORITY_MARKERS } from '#shared/constants/scoring'
const entries = (['high', 'medium', 'low', 'none'] as const).map(level => PRIORITY_MARKERS[level])
</script>

<template>
  <div class="text-xs leading-5 text-charcoal/80">
    <h2 class="sr-only">Keterangan peta</h2>
    <ul class="flex flex-wrap gap-x-5 gap-y-2">
      <li v-for="entry in entries" :key="entry.letter" class="inline-flex items-center gap-2">
        <span class="grid size-5 place-items-center rounded-full text-[11px] font-bold" :style="{ backgroundColor: entry.color, color: entry.text }" aria-hidden="true">{{ entry.letter }}</span>{{ entry.label }}
      </li>
      <li class="inline-flex items-center gap-2"><span class="grid size-5 place-items-center rounded-full border-2 border-white bg-charcoal/70 text-[10px] font-bold text-white shadow" aria-hidden="true">3</span>Kelompok laporan berdekatan (warna = prioritas tertinggi)</li>
    </ul>
  </div>
</template>
