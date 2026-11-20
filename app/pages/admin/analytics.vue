<script setup lang="ts">
import type { AdminAnalytics } from '../../../shared/types/admin-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { ANALYTICS_DATASETS, ANALYTICS_DATASET_LABELS, ANALYTICS_RANGES, ANALYTICS_RANGE_LABELS } from '#shared/constants/workflow'
import type { AdminIconName } from '~/types/admin-ui'
import { bucketWording, formatCount, formatDateRange, handlingStages, peakBuckets, timeBuckets } from '~/utils/analytics'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Analitik — RimbaGuard AI', robots: 'noindex' })
const route = useRoute()
const days = computed(() => (ANALYTICS_RANGES as readonly number[]).includes(Number(route.query.days)) ? Number(route.query.days) : 30)
const dataset = computed(() => route.query.dataset === 'simulation' ? 'simulation' : 'real')
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData('admin-analytics',
  () => requestFetch<AdminAnalytics>('/api/admin/analytics', { query: { days: days.value, dataset: dataset.value } }), { watch: [days, dataset] })

const id = useId()
const form = reactive({ days: '30', dataset: 'real' })
watch([days, dataset], ([nextDays, nextDataset]) => { form.days = String(nextDays); form.dataset = nextDataset }, { immediate: true })
async function apply() {
  await navigateTo({ path: '/admin/analytics', query: { ...(form.days !== '30' ? { days: form.days } : {}), ...(form.dataset !== 'real' ? { dataset: form.dataset } : {}) } })
}

const rangeName = computed(() => data.value ? ANALYTICS_RANGE_LABELS[data.value.range.days] : '')
const wording = computed(() => bucketWording(data.value?.range.days ?? 30))
const buckets = computed(() => data.value ? timeBuckets(data.value.daily, data.value.range.days) : [])
const categoryItems = computed(() => (data.value?.categoryCounts ?? []).map(item => ({ key: item.category, label: THREAT_CATEGORY_LABELS[item.category], value: item.count })))

interface Segment { text: string; strong?: boolean }
interface Insight { key: string; icon: AdminIconName; tone: 'forest' | 'amber' | 'muted'; segments: Segment[] }

/** The period in plain sentences, so nobody has to decode a chart to get the gist. */
const insights = computed<Insight[]>(() => {
  const current = data.value
  if (!current?.rangeTotal) return []
  const total = current.rangeTotal
  const reports = (count: number) => `${formatCount(count)} laporan`

  const peak = peakBuckets(buckets.value)
  const at = wording.value.at
  const volume: Segment[] = [{ text: reports(total), strong: true }, { text: ` masuk selama ${rangeName.value.toLowerCase()}.` }]
  if (peak.labels.length === 1) {
    const single = total === 1 || peak.max === total
    volume.push({ text: total === 1 ? ` Laporan itu masuk ${at} ` : single ? ` Semuanya masuk ${at} ` : ` Paling banyak ${at} ` }, { text: peak.labels[0]!, strong: true }, { text: single ? '.' : ` (${reports(peak.max)}).` })
  } else if (peak.labels.length === 2) {
    volume.push({ text: ` Paling banyak ${at} ` }, { text: peak.labels[0]!, strong: true }, { text: ' dan ' }, { text: peak.labels[1]!, strong: true }, { text: ` (masing-masing ${reports(peak.max)}).` })
  } else if (peak.labels.length > 2) {
    volume.push({ text: ` Paling banyak ${reports(peak.max)} dalam satu ${wording.value.unit}.` })
  }

  const ranked = current.categoryCounts.filter(item => item.count > 0).sort((a, b) => b.count - a.count)
  const top = ranked.filter(item => item.count === ranked[0]?.count)
  const name = (index: number) => THREAT_CATEGORY_LABELS[top[index]!.category]
  const topCount = top[0]?.count ?? 0
  const category: Segment[] = top.length === 1 && topCount === total
    ? [{ text: total === 1 ? 'Laporan itu tentang ' : 'Semua laporan tentang ' }, { text: name(0), strong: true }, { text: '.' }]
    : top.length === 1
      ? [{ text: 'Ancaman yang paling sering dilaporkan: ' }, { text: name(0), strong: true }, { text: ` (${formatCount(topCount)} dari ${reports(total)}).` }]
      : top.length === 2
        ? [{ text: 'Ancaman yang paling sering dilaporkan: ' }, { text: name(0), strong: true }, { text: ' dan ' }, { text: name(1), strong: true }, { text: ` (masing-masing ${reports(topCount)}).` }]
        : [{ text: `${top.length} jenis ancaman sama-sama paling sering dilaporkan (masing-masing ${reports(topCount)}).` }]

  const { stages, rejected } = handlingStages(current.statusCounts)
  const undecided = stages[0]!.count
  const resolved = stages[3]!.count
  const waiting: Insight = undecided > 0
    ? { key: 'waiting', icon: 'clock', tone: 'amber', segments: [{ text: reports(undecided), strong: true }, { text: ' belum diverifikasi petugas.' }] }
    : { key: 'waiting', icon: 'shield', tone: 'forest', segments: [{ text: 'Semua laporan pada periode ini sudah diperiksa petugas.' }] }
  const done: Segment[] = resolved > 0
    ? [{ text: `${formatCount(resolved)} dari ${reports(total)}`, strong: true }, { text: ' sudah selesai ditangani.' }]
    : [{ text: 'Belum ada laporan dari periode ini yang selesai ditangani.' }]
  if (rejected > 0) done.push({ text: ` ${reports(rejected)} ditolak.` })

  return [
    { key: 'volume', icon: 'reports', tone: 'forest', segments: volume },
    { key: 'category', icon: 'leaf', tone: 'forest', segments: category },
    waiting,
    // A grey check reads as "not reached yet" rather than "done".
    { key: 'done', icon: 'check', tone: resolved > 0 ? 'forest' : 'muted', segments: done },
  ]
})

/** All-time figures with one idea per hint, in everyday words. */
const stateItems = computed(() => {
  const summary = data.value?.summary
  if (!summary) return []
  const items: { key: string; label: string; value: number; icon: AdminIconName; tone: 'forest' | 'amber' | 'red'; hint: string }[] = [
    { key: 'total', label: 'Total laporan', value: summary.total, icon: 'reports', tone: 'forest',
      hint: summary.rejected ? `Semua laporan sejak awal, termasuk ${formatCount(summary.rejected)} yang ditolak.` : 'Semua laporan sejak awal.' },
    { key: 'pending', label: 'Menunggu verifikasi', value: summary.pendingVerification, icon: 'clock', tone: 'amber',
      hint: ['Siap diperiksa petugas.',
        summary.analysisFailed ? `Ada juga ${formatCount(summary.analysisFailed)} laporan yang gagal dianalisis AI.` : '',
        summary.needsMoreInformation ? `${formatCount(summary.needsMoreInformation)} laporan menunggu informasi dari pelapor.` : ''].filter(Boolean).join(' ') },
    { key: 'verified', label: 'Telah diverifikasi', value: summary.verified, icon: 'shield', tone: 'forest',
      hint: summary.inProgress || summary.resolved
        ? `Dinyatakan benar oleh petugas, termasuk ${formatCount(summary.inProgress)} sedang ditindaklanjuti dan ${formatCount(summary.resolved)} selesai.`
        : 'Dinyatakan benar oleh petugas.' },
    { key: 'high', label: 'Prioritas tinggi aktif', value: summary.highPriority, icon: 'alert', tone: 'red', hint: 'Laporan belum selesai yang perlu didahulukan.' },
  ]
  return items
})
</script>

<template>
  <div class="admin-page">
    <AdminPageHeader title="Analitik laporan" description="Lihat berapa laporan yang masuk, jenis ancaman yang paling sering dilaporkan, dan sejauh mana laporan sudah ditangani." />

    <form role="search" method="get" aria-label="Filter analitik" class="admin-filter-bar flex flex-wrap items-end" @submit.prevent="apply">
      <div class="mr-auto flex w-full items-center gap-3 pb-1 xl:w-auto xl:pb-3"><span class="flex size-10 items-center justify-center rounded-xl bg-sage-100 text-forest-700"><AdminIcon name="filter" class="size-5" /></span><div><p class="font-semibold text-forest-900">Tampilkan analitik</p><p class="admin-muted">Pilih periode dan sumber laporan.</p></div></div>
      <div class="min-w-0 flex-[1_1_12rem] xl:w-52 xl:flex-none"><label :for="`${id}-days`" class="form-label">Rentang waktu</label><select :id="`${id}-days`" v-model="form.days" name="days" class="form-input"><option v-for="range in ANALYTICS_RANGES" :key="range" :value="String(range)">{{ ANALYTICS_RANGE_LABELS[range] }}</option></select></div>
      <div class="min-w-0 flex-[1_1_12rem] xl:w-48 xl:flex-none"><label :for="`${id}-dataset`" class="form-label">Sumber data</label><select :id="`${id}-dataset`" v-model="form.dataset" name="dataset" class="form-input"><option v-for="option in ANALYTICS_DATASETS" :key="option" :value="option">{{ ANALYTICS_DATASET_LABELS[option] }}</option></select></div>
      <button type="submit" class="button-primary w-full sm:w-auto">Terapkan <AdminIcon name="arrow-right" class="size-4" /></button>
    </form>
    <p v-if="dataset === 'simulation'" class="notice mt-5 font-medium">Menampilkan data simulasi untuk pengujian dan demo, bukan laporan nyata.</p>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat analitik…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><p>Analitik belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data">
      <section aria-labelledby="range-title" class="space-y-5">
        <div><p class="admin-eyebrow">Periode terpilih</p><h2 id="range-title" class="admin-section-title mt-1">{{ rangeName }}</h2><p class="admin-muted mt-1">{{ formatDateRange(data.range.from, data.range.to) }} · WIB</p></div>
        <div v-if="!data.rangeTotal" class="admin-panel admin-empty"><AdminIcon name="analytics" class="mx-auto mb-3 size-8 text-forest-500" /><p class="font-medium text-forest-900">Belum ada laporan pada periode ini.</p><p class="mt-1">Pilih rentang waktu lain untuk melihat perkembangannya.</p></div>
        <template v-else>
          <div class="insight-panel">
            <h3 class="admin-section-title">Poin penting</h3>
            <ul class="mt-4 grid gap-x-8 gap-y-4 lg:grid-cols-2" role="list">
              <li v-for="insight in insights" :key="insight.key" class="flex gap-3"><span class="insight-icon" :data-tone="insight.tone" aria-hidden="true"><AdminIcon :name="insight.icon" class="size-5" /></span><p class="insight-text"><template v-for="(segment, index) in insight.segments" :key="index"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template></p></li>
            </ul>
          </div>

          <div class="admin-panel"><div class="admin-panel-header"><div><h3 class="admin-section-title">{{ wording.title }}</h3><p class="admin-muted mt-1">Setiap batang adalah jumlah laporan dalam satu {{ wording.unit }}. Makin tinggi batang, makin banyak laporan.</p></div></div><div class="p-5 sm:p-6"><ClientOnly><AdminBarChart :title="`${wording.title}, ${rangeName}`" :labels="buckets.map(item => item.label)" :values="buckets.map(item => item.count)" readable tip-labels :category-title="wording.axis" height-class="h-72 sm:h-80" /><template #fallback><p class="h-72 text-sm text-charcoal/75 sm:h-80">Memuat grafik…</p></template></ClientOnly></div></div>
          <!-- Full-width panels: each grows with its own content (or an opened table), so no panel is stretched into empty space. -->
          <div class="admin-panel"><div class="admin-panel-header"><div><h3 class="admin-section-title">Kategori ancaman</h3><p class="admin-muted mt-1">Jenis ancaman yang dilaporkan, diurutkan dari yang terbanyak.</p></div></div><div class="p-5 sm:p-6"><AdminDistributionChart :title="`Kategori ancaman, ${rangeName}`" :items="categoryItems" :total="data.rangeTotal" item-heading="Kategori" note="Memakai kategori koreksi petugas bila ada; jika belum, hasil analisis AI, lalu pilihan pelapor." /></div></div>
          <div class="admin-panel"><div class="admin-panel-header"><div><h3 class="admin-section-title">Tahap penanganan</h3><p class="admin-muted mt-1">Sejauh mana laporan dari periode ini sudah ditangani petugas.</p></div></div><div class="p-5 sm:p-6"><AdminStageFlow :title="`Tahap penanganan, ${rangeName}`" :counts="data.statusCounts" /></div></div>
        </template>
      </section>

      <section aria-labelledby="state-title">
        <div class="mb-4"><div class="flex flex-wrap items-center gap-x-3 gap-y-2"><h2 id="state-title" class="admin-section-title">Kondisi seluruh laporan</h2><span class="scope-badge">Semua waktu</span></div><p class="admin-muted mt-1">Menghitung semua laporan sejak awal, jadi angkanya tidak berubah saat rentang waktu diganti.</p></div>
        <dl class="state-strip">
          <div v-for="item in stateItems" :key="item.key" class="state-item">
            <dt class="state-label"><span class="state-icon" :data-tone="item.tone" aria-hidden="true"><AdminIcon :name="item.icon" class="size-4" /></span>{{ item.label }}</dt>
            <dd class="state-value">{{ formatCount(item.value) }}</dd>
            <dd class="state-hint">{{ item.hint }}</dd>
          </div>
        </dl>
      </section>

      <details class="admin-panel group">
        <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-semibold text-forest-900 sm:px-6 [&::-webkit-details-marker]:hidden"><span class="flex items-center gap-3"><AdminIcon name="eye" class="size-5 text-forest-500" />Cara membaca angka</span><AdminIcon name="chevron-down" class="size-5 group-open:rotate-180" /></summary>
        <ul class="list-disc space-y-3 border-t border-line py-5 pr-5 pl-10 text-base leading-7 text-charcoal/85 sm:pr-6 sm:pl-11">
          <li><strong>Poin penting dan grafik periode</strong> menghitung laporan yang dikirim dalam rentang waktu terpilih, memakai tanggal WIB.</li>
          <li><strong>Tahap penanganan</strong> menunjukkan posisi laporan tersebut saat ini. <em>Belum diverifikasi</em> mencakup laporan yang menunggu analisis AI, gagal dianalisis AI (petugas tetap dapat memeriksanya), menunggu verifikasi, atau menunggu informasi tambahan dari pelapor.</li>
          <li><strong>Kondisi seluruh laporan</strong> menghitung semua laporan sejak awal. <em>Telah diverifikasi</em> mencakup laporan yang sedang ditindaklanjuti atau sudah selesai; laporan ditolak dihitung terpisah.</li>
          <li><strong>Prioritas tinggi aktif</strong> menghitung laporan yang belum selesai atau ditolak dengan skor prioritas terbaru tinggi.</li>
          <li>Angka <strong>0</strong> berarti memang tidak ada laporan yang sesuai, bukan data yang hilang. Bila database tidak dapat dihubungi, halaman menampilkan pesan gagal, bukan angka nol.</li>
        </ul>
      </details>
    </template>
  </div>
</template>

<style scoped>
.insight-panel { border: 1px solid #CFDDCB; border-radius: 1rem; background: #EEF3EB; padding: 1.25rem; }
.insight-icon { display: flex; width: 2.5rem; height: 2.5rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.75rem; background: #FFFFFF; color: #285C48; }
.insight-icon[data-tone="amber"] { background: #F3E6CA; color: #75501C; }
.insight-icon[data-tone="muted"] { background: #E4E8E2; color: #5C665F; }
.insight-text { padding-top: 0.375rem; font-size: 1rem; line-height: 1.625rem; color: #242B28; }
.insight-text strong { font-weight: 650; color: #173D32; }
.scope-badge { border: 1px solid #CFDDCB; border-radius: 999px; background: #E6EEE3; padding: 0.125rem 0.75rem; font-size: 0.875rem; font-weight: 600; line-height: 1.5rem; color: #285C48; }

/* All-time figures as a plain row of numbers (no cards): hairlines separate them. */
.state-strip { display: grid; grid-template-columns: minmax(0, 1fr); margin: 0; border-top: 1px solid #D3DDD0; border-bottom: 1px solid #D3DDD0; }
.state-item { min-width: 0; padding: 1rem 0; }
.state-item + .state-item { border-top: 1px solid #DDE5DA; }
.state-label { display: flex; align-items: center; gap: 0.625rem; font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; }
.state-icon { display: flex; width: 1.75rem; height: 1.75rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.5rem; background: #DCE7DA; color: #285C48; }
.state-icon[data-tone="amber"] { background: #F3E6CA; color: #75501C; }
.state-icon[data-tone="red"] { background: #F1DDD7; color: #8E3E34; }
.state-value { margin-top: 0.5rem; font-size: 2rem; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; color: #173D32; }
.state-hint { margin-top: 0.375rem; font-size: 0.9375rem; line-height: 1.5rem; color: #4F5B53; }

@media (min-width: 40rem) {
  .insight-panel { padding: 1.5rem; }
  .state-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .state-item { padding: 1.25rem 1.5rem 1.25rem 0; }
  .state-item + .state-item { border-top: 0; }
  .state-item:nth-child(n + 3) { border-top: 1px solid #DDE5DA; }
  .state-item:nth-child(even) { border-left: 1px solid #DDE5DA; padding-left: 1.5rem; }
}
@media (min-width: 80rem) {
  .state-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .state-item:nth-child(n + 3) { border-top: 0; }
  .state-item + .state-item { border-left: 1px solid #DDE5DA; padding-left: 1.5rem; }
  .state-item:last-child { padding-right: 0; }
}
</style>
