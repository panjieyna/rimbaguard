<script setup lang="ts">
import type { ReportDetailResponse } from '../../../shared/types/report-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import {
  CATEGORY_SOURCE_LABELS, COMPLETENESS_RULES, NEARBY_RADIUS_KM, NEARBY_RULES, NEARBY_WINDOW_DAYS,
  PRIORITY_THRESHOLDS, RECENCY_RULES, SCORING_WEIGHTS, THREAT_SEVERITY,
} from '#shared/constants/scoring'
import { formatReportDate } from '~/utils/dates'

const props = defineProps<{ priorities: ReportDetailResponse['priorities']; status: NonNullable<ReportDetailResponse['priorityStatus']> }>()
const current = computed(() => props.priorities[0] ?? null)
const history = computed(() => props.priorities.slice(1))
const number = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const components = computed(() => current.value ? [
  { label: 'Tingkat keparahan kategori', score: current.value.threatSeverity, weight: SCORING_WEIGHTS.severity },
  { label: 'Kelengkapan informasi', score: current.value.evidenceCompleteness, weight: SCORING_WEIGHTS.completeness },
  { label: 'Kebaruan kejadian', score: current.value.recencyScore, weight: SCORING_WEIGHTS.recency },
  { label: `Laporan serupa di sekitar (${current.value.nearbyReportsCount})`, score: current.value.nearbyReportsScore, weight: SCORING_WEIGHTS.nearby },
] : [])
</script>

<template>
  <section class="border-t border-line pt-7" aria-labelledby="priority-title">
    <h2 id="priority-title" class="text-xl font-semibold text-forest-900">Prioritas pemeriksaan</h2>
    <p class="mt-2 form-hint">Hanya terlihat oleh petugas. Skor membantu urutan pemeriksaan, bukan bukti bahwa kejadian benar terjadi atau melanggar hukum.</p>
    <p v-if="status.refresh === 'busy'" role="status" class="notice mt-4">Skor sedang diperbarui oleh proses lain; nilai di bawah adalah perhitungan terakhir.</p>
    <p v-else-if="status.refresh === 'failed'" role="status" class="notice mt-4">Skor belum dapat diperbarui; nilai di bawah adalah perhitungan terakhir.</p>
    <p v-else-if="status.stale && current" role="status" class="notice mt-4">Laporan berubah setelah perhitungan terakhir. Muat ulang untuk memperbarui skor.</p>
    <p v-if="!current" class="mt-4 body-copy">Skor prioritas belum dihitung. Muat ulang halaman untuk mencoba lagi.</p>
    <template v-else>
      <div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <MapPriorityBadge :level="current.priorityLevel" :stale="status.stale" />
        <p class="text-2xl font-semibold text-forest-900">{{ number(current.totalScore) }}<span class="text-sm font-normal text-charcoal/75"> / 100</span></p>
      </div>
      <p class="mt-4 body-copy">{{ current.explanation }}</p>
      <dl class="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div><dt class="text-charcoal/75">Kategori yang dinilai</dt><dd class="mt-1">{{ THREAT_CATEGORY_LABELS[current.effectiveCategory] }} · {{ CATEGORY_SOURCE_LABELS[current.categorySource] }}</dd></div>
        <div><dt class="text-charcoal/75">Dihitung</dt><dd class="mt-1">{{ formatReportDate(current.calculatedAt) }} · revisi {{ current.reportRevision }} · {{ current.scoringVersion }}</dd></div>
      </dl>
      <table class="mt-6 w-full text-left text-sm">
        <caption class="sr-only">Komponen skor prioritas</caption>
        <thead class="border-b border-line text-xs text-charcoal/75"><tr><th scope="col" class="py-2 font-medium">Komponen</th><th scope="col" class="py-2 text-right font-medium">Nilai</th><th scope="col" class="py-2 text-right font-medium">Bobot</th><th scope="col" class="py-2 text-right font-medium">Kontribusi</th></tr></thead>
        <tbody class="divide-y divide-line">
          <tr v-for="item in components" :key="item.label"><th scope="row" class="py-2.5 font-normal">{{ item.label }}</th><td class="py-2.5 text-right">{{ number(item.score) }}</td><td class="py-2.5 text-right">{{ number(item.weight * 100) }}%</td><td class="py-2.5 text-right font-medium">{{ number(item.score * item.weight) }}</td></tr>
        </tbody>
      </table>
    </template>
    <details class="mt-6 rounded-lg border border-line bg-white px-4 py-3 text-sm">
      <summary class="min-h-11 cursor-pointer content-center font-medium">Aturan skor v1</summary>
      <div class="mt-3 space-y-4 leading-6 text-charcoal/85">
        <p>Skor = keparahan × 35% + kelengkapan × 25% + kebaruan × 20% + laporan serupa × 20%. Tinggi {{ PRIORITY_THRESHOLDS.high }}, sedang {{ PRIORITY_THRESHOLDS.medium }}, rendah {{ PRIORITY_THRESHOLDS.low }}.</p>
        <p>Keparahan awal: <span v-for="(score, category, index) in THREAT_SEVERITY" :key="category">{{ index ? '; ' : '' }}{{ THREAT_CATEGORY_LABELS[category] }} {{ score }}</span>. Nilai ini bobot produk awal, bukan tingkat bahaya ilmiah.</p>
        <p>Kelengkapan: <span v-for="(rule, index) in COMPLETENESS_RULES" :key="rule.label">{{ index ? '; ' : '' }}{{ rule.label }} {{ rule.points }}</span>.</p>
        <p>Kebaruan: <span v-for="(rule, index) in RECENCY_RULES" :key="rule.label">{{ index ? '; ' : '' }}{{ rule.label }} {{ rule.score }}</span>.</p>
        <p>Laporan serupa: kategori sama, radius {{ NEARBY_RADIUS_KM }} km, waktu kejadian berselisih paling lama {{ NEARBY_WINDOW_DAYS }} hari, tidak ditolak, dan berada pada jenis data yang sama (nyata atau simulasi). Jumlah <span v-for="(rule, index) in NEARBY_RULES" :key="rule.count">{{ index ? '; ' : '' }}{{ rule.count }} → {{ rule.score }}</span>.</p>
        <p>Kategori yang dinilai: koreksi petugas, lalu hasil AI yang tervalidasi dan tidak "tidak pasti", lalu pilihan pelapor sebagai kategori sementara.</p>
      </div>
    </details>
    <details v-if="history.length" class="mt-3 rounded-lg border border-line bg-white px-4 py-3 text-sm">
      <summary class="min-h-11 cursor-pointer content-center font-medium">Riwayat perhitungan ({{ history.length }})</summary>
      <ol class="mt-3 space-y-3">
        <li v-for="item in history" :key="item.id"><p class="font-medium">{{ number(item.totalScore) }} · {{ THREAT_CATEGORY_LABELS[item.effectiveCategory] }} · revisi {{ item.reportRevision }}</p><p class="text-xs text-charcoal/75">{{ formatReportDate(item.calculatedAt) }} · {{ CATEGORY_SOURCE_LABELS[item.categorySource] }} · {{ item.nearbyReportsCount }} laporan serupa</p></li>
      </ol>
    </details>
  </section>
</template>
