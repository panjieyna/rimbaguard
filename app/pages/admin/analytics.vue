<script setup lang="ts">
import type { AdminAnalytics } from '../../../shared/types/admin-api'
import { THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { ANALYTICS_DATASETS, ANALYTICS_DATASET_LABELS, ANALYTICS_RANGES, ANALYTICS_RANGE_LABELS } from '#shared/constants/workflow'
import type { AdminIconName } from '~/types/admin-ui'
import { bucketWording, formatCount, formatDateRange, handlingStages, peakBuckets, timeBuckets } from '~/utils/analytics'

definePageMeta({ middleware: 'auth', layout: 'admin' })
useSeoMeta({ title: 'Analitik — RimbaGuard', robots: 'noindex' })
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
interface Insight { key: string; title: string; icon: AdminIconName; tone: 'forest' | 'amber' | 'muted'; segments: Segment[] }

/** The period in plain sentences, so nobody has to decode a chart to get the gist. */
const insights = computed<Insight[]>(() => {
  const current = data.value
  if (!current?.rangeTotal) return []
  const total = current.rangeTotal
  const reports = (count: number) => `${formatCount(count)} laporan`

  const peak = peakBuckets(buckets.value)
  const at = wording.value.at
  const volume: Segment[] = [{ text: `Selama ${rangeName.value.toLowerCase()}.` }]
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
    ? { key: 'waiting', title: 'Verifikasi petugas', icon: 'clock', tone: 'amber', segments: [{ text: reports(undecided), strong: true }, { text: ' belum diverifikasi petugas.' }] }
    : { key: 'waiting', title: 'Verifikasi petugas', icon: 'shield', tone: 'forest', segments: [{ text: 'Semua laporan pada periode ini sudah diperiksa petugas.' }] }
  const done: Segment[] = resolved > 0
    ? [{ text: `${formatCount(resolved)} dari ${reports(total)}`, strong: true }, { text: ' sudah selesai ditangani.' }]
    : [{ text: 'Belum ada laporan dari periode ini yang selesai ditangani.' }]
  if (rejected > 0) done.push({ text: ` ${reports(rejected)} ditolak.` })

  return [
    { key: 'volume', title: 'Laporan masuk', icon: 'reports', tone: 'forest', segments: volume },
    { key: 'category', title: 'Kategori yang dilaporkan', icon: 'leaf', tone: 'forest', segments: category },
    waiting,
    // A grey check reads as "not reached yet" rather than "done".
    { key: 'done', title: 'Penyelesaian laporan', icon: 'check', tone: resolved > 0 ? 'forest' : 'muted', segments: done },
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
  <div class="admin-page analytics-page">
    <AdminPageHeader title="Analitik laporan" description="Lihat berapa laporan yang masuk, jenis ancaman yang paling sering dilaporkan, dan sejauh mana laporan sudah ditangani." />

    <form role="search" method="get" aria-label="Filter analitik" class="analytics-filters" @submit.prevent="apply">
      <div class="analytics-filter-intro"><h2>Tampilkan laporan</h2><p>Pilih periode yang ingin Anda tinjau.</p></div>
      <div><label :for="`${id}-days`" class="form-label">Rentang waktu</label><select :id="`${id}-days`" v-model="form.days" name="days" class="form-input"><option v-for="range in ANALYTICS_RANGES" :key="range" :value="String(range)">{{ ANALYTICS_RANGE_LABELS[range] }}</option></select></div>
      <div><label :for="`${id}-dataset`" class="form-label">Sumber data</label><select :id="`${id}-dataset`" v-model="form.dataset" name="dataset" class="form-input"><option v-for="option in ANALYTICS_DATASETS" :key="option" :value="option">{{ ANALYTICS_DATASET_LABELS[option] }}</option></select></div>
      <button type="submit" class="button-primary" :disabled="status === 'pending'">Terapkan <AdminIcon name="arrow-right" class="size-4" /></button>
    </form>
    <p v-if="dataset === 'simulation'" class="notice mt-5 font-medium">Menampilkan data simulasi untuk pengujian dan demo, bukan laporan nyata.</p>

    <p v-if="status === 'pending' && !data" role="status" class="notice mt-6">Memuat analitik…</p>
    <div v-else-if="error" role="alert" class="notice mt-6"><p>Analitik belum dapat dimuat. Periksa koneksi atau sesi Anda.</p><button type="button" class="text-link mt-3 min-h-11" @click="refresh()">Coba kembali</button></div>
    <template v-else-if="data">
      <p v-if="status === 'pending'" role="status" class="notice">Memperbarui analitik…</p>
      <section aria-labelledby="range-title" class="analytics-period">
        <div class="analytics-section-heading"><div><p class="analytics-scope">Periode terpilih</p><h2 id="range-title" class="admin-section-title mt-1">{{ rangeName }}</h2></div><p class="admin-muted">{{ formatDateRange(data.range.from, data.range.to) }} · WIB</p></div>
        <div v-if="!data.rangeTotal" class="admin-panel analytics-empty"><span class="analytics-empty-icon" aria-hidden="true"><AdminIcon name="analytics" class="size-6" /></span><h3>Belum ada laporan pada periode ini.</h3><p>Pilih rentang waktu lain melalui pilihan di atas. Kondisi seluruh laporan tetap tersedia di bawah.</p></div>
        <template v-else>
          <div class="insight-panel" role="region" aria-labelledby="insights-title">
            <h3 id="insights-title" class="sr-only">Poin penting</h3>
            <ul class="insight-list" role="list">
              <li v-for="insight in insights" :key="insight.key" class="insight-item" :class="{ 'insight-volume': insight.key === 'volume' }">
                <span class="insight-icon" :data-tone="insight.tone" aria-hidden="true"><AdminIcon :name="insight.icon" class="size-5" /></span>
                <div class="insight-content"><h4>{{ insight.title }}</h4><p v-if="insight.key === 'volume'" class="insight-total">{{ formatCount(data.rangeTotal) }}<span class="sr-only"> laporan</span></p><p class="insight-text"><template v-for="(segment, index) in insight.segments" :key="index"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template></p></div>
              </li>
            </ul>
          </div>

          <section class="admin-panel" aria-labelledby="trend-title"><div class="admin-panel-header"><div><h3 id="trend-title" class="admin-section-title">{{ wording.title }}</h3><p class="admin-muted mt-1">Setiap batang menunjukkan jumlah laporan dalam satu {{ wording.unit }}.</p></div></div><div class="analytics-chart-body"><ClientOnly><AdminBarChart :title="`${wording.title}, ${rangeName}`" :labels="buckets.map(item => item.label)" :values="buckets.map(item => item.count)" readable tip-labels :category-title="wording.axis" height-class="h-64 sm:h-72" /><template #fallback><p class="h-64 text-sm text-charcoal/75 sm:h-72">Memuat grafik…</p></template></ClientOnly></div></section>
          <div class="analytics-breakdown">
            <section class="admin-panel" aria-labelledby="categories-title"><div class="admin-panel-header"><div><h3 id="categories-title" class="admin-section-title">Kategori ancaman</h3><p class="admin-muted mt-1">Dari jenis yang paling banyak dilaporkan.</p></div></div><div class="analytics-chart-body"><AdminDistributionChart :title="`Kategori ancaman, ${rangeName}`" :items="categoryItems" :total="data.rangeTotal" item-heading="Kategori" note="Kategori mengikuti koreksi petugas, lalu analisis AI, lalu pilihan pelapor." /></div></section>
            <section class="admin-panel" aria-labelledby="handling-title"><div class="admin-panel-header"><div><h3 id="handling-title" class="admin-section-title">Tahap penanganan</h3><p class="admin-muted mt-1">Posisi terkini laporan dari periode terpilih.</p></div></div><div class="analytics-chart-body"><AdminStageFlow :title="`Tahap penanganan, ${rangeName}`" :counts="data.statusCounts" /></div></section>
          </div>
        </template>
      </section>

      <section aria-labelledby="state-title">
        <div class="analytics-section-heading"><div><p class="analytics-scope">Semua waktu</p><h2 id="state-title" class="admin-section-title mt-1">Kondisi seluruh laporan</h2></div><p class="admin-muted analytics-scope-note">Dihitung sejak awal. Angka ini tetap saat periode di atas diganti.</p></div>
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
.analytics-page { overflow-wrap: anywhere; }
.analytics-filters { display: grid; align-items: end; gap: 1rem; border-top: 1px solid #DCE3D8; border-bottom: 1px solid #DCE3D8; padding: 1.25rem 0; }
.analytics-filters > div { min-width: 0; }
.analytics-filter-intro h2 { font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; }
.analytics-filter-intro p { margin-top: 0.25rem; font-size: 0.875rem; line-height: 1.5rem; color: #526057; }
.analytics-section-heading { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 0.75rem 1.5rem; margin-bottom: 1.25rem; }
.analytics-scope { font-size: 0.8125rem; font-weight: 600; line-height: 1.5rem; letter-spacing: 0.07em; text-transform: uppercase; color: #526057; }
.analytics-scope-note { max-width: 27rem; }
.analytics-period > * + * { margin-top: 1.5rem; }
.analytics-period > .analytics-section-heading { margin-top: 0; margin-bottom: 0; }
.analytics-chart-body { min-width: 0; padding: 1.25rem; }
.analytics-breakdown { display: grid; align-items: start; gap: 1.5rem; }
.analytics-empty { padding: 2rem 1.25rem; text-align: center; }
.analytics-empty-icon { display: flex; align-items: center; justify-content: center; width: 3rem; height: 3rem; margin: 0 auto 1rem; border-radius: 50%; background: #EAF0E9; color: #285C48; }
.analytics-empty h3 { font-size: 1.125rem; font-weight: 600; line-height: 1.75rem; color: #173D32; }
.analytics-empty p { max-width: 36rem; margin: 0.5rem auto 0; font-size: 1rem; line-height: 1.75rem; color: #526057; }
.insight-panel { overflow: hidden; border: 1px solid #DCE3D8; border-radius: 0.75rem; background: white; }
.insight-list { display: grid; margin: 0; padding: 0; list-style: none; }
.insight-item { display: grid; grid-template-columns: 2.25rem minmax(0, 1fr); align-items: start; gap: 0.875rem; min-width: 0; padding: 1.25rem; }
.insight-item + .insight-item { border-top: 1px solid #E5E8E3; }
.insight-content { min-width: 0; }
.insight-content h4 { font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; }
.insight-icon { display: flex; width: 2.25rem; height: 2.25rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: #EAF0E9; color: #285C48; }
.insight-icon[data-tone="amber"] { background: #F3E6CA; color: #75501C; }
.insight-icon[data-tone="muted"] { background: #E4E8E2; color: #5C665F; }
.insight-text { margin-top: 0.375rem; font-size: 1rem; line-height: 1.625rem; color: #526057; }
.insight-text strong { font-weight: 650; color: #173D32; }
.insight-volume { position: relative; display: block; border: 0; background: #173D32; padding: 1.5rem; color: white; }
.insight-volume .insight-icon { position: absolute; top: 1.25rem; right: 1.25rem; background: rgb(255 255 255 / 12%); color: #EAF0E9; }
.insight-volume h4 { padding-right: 3rem; color: #FFFFFF; }
.insight-total { margin: 1rem 0 0.75rem; font-size: 3rem; font-weight: 650; line-height: 1.1; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
.insight-volume .insight-text { color: #DCE7DB; }
.insight-volume .insight-text strong { color: white; }

/* Keep all-time totals in one subdued strip, separate from the selected period. */
.state-strip { display: grid; grid-template-columns: minmax(0, 1fr); margin: 0; overflow: hidden; border: 1px solid #D3DDD0; border-radius: 0.75rem; background: #EDF2E9; }
.state-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.75rem 1rem; min-width: 0; padding: 1.25rem; }
.state-item + .state-item { border-top: 1px solid #DDE5DA; }
.state-label { display: flex; align-items: center; gap: 0.625rem; font-size: 1rem; font-weight: 600; line-height: 1.5rem; color: #173D32; }
.state-icon { display: flex; width: 1.75rem; height: 1.75rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: #DCE7DA; color: #285C48; }
.state-icon[data-tone="amber"] { background: #F3E6CA; color: #75501C; }
.state-icon[data-tone="red"] { background: #F1DDD7; color: #8E3E34; }
.state-value { font-size: 2.25rem; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; color: #173D32; font-variant-numeric: tabular-nums; }
.state-hint { grid-column: 1 / -1; font-size: 0.9375rem; line-height: 1.5rem; color: #4F5B53; }

@media (min-width: 40rem) {
  .analytics-filters { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
  .analytics-filter-intro { grid-column: 1 / -1; }
  .analytics-chart-body { padding: 1.5rem; }
  .state-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .state-item + .state-item { border-top: 0; }
  .state-item:nth-child(n + 3) { border-top: 1px solid #DDE5DA; }
  .state-item:nth-child(even) { border-left: 1px solid #DDE5DA; }
}
@media (min-width: 48rem) {
  .insight-list { grid-template-columns: minmax(13rem, 0.85fr) minmax(0, 1.8fr); }
  .insight-volume { grid-row: 1 / span 3; }
  .insight-item + .insight-item { grid-column: 2; }
  .insight-item:nth-child(2) { border-top: 0; }
  .insight-total { font-size: 3.5rem; }
}
@media (min-width: 80rem) {
  .analytics-filters { grid-template-columns: minmax(0, 1fr) 13rem 12rem auto; }
  .analytics-filter-intro { grid-column: auto; padding-bottom: 0.125rem; }
  .analytics-breakdown { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .state-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .state-item { display: flex; flex-direction: column; align-items: flex-start; gap: 0; }
  .state-label { min-height: 3rem; }
  .state-value { margin-top: 0.75rem; }
  .state-hint { margin-top: 0.75rem; }
  .state-item:nth-child(n + 3) { border-top: 0; }
  .state-item + .state-item { border-left: 1px solid #DDE5DA; }
}
</style>
