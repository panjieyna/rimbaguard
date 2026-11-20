<script setup lang="ts">
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip, type ChartConfiguration, type Plugin } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

// One validated hue for single-series charts (passes lightness, chroma and
// contrast checks on white). Text never wears the data color.
const MARK = '#287A52'
const MARK_HOVER = '#1E5E3F'
const GRID = '#E5E8E3'
const TEXT = '#4F5652'

const props = withDefaults(defineProps<{
  labels: string[]
  values: number[]
  /** Accessible chart name, e.g. "Laporan masuk per hari". */
  title: string
  unit?: string
  horizontal?: boolean
  /** Label each bar tip; used for short ranked lists, not dense time series. */
  tipLabels?: boolean
  /** Larger chart text for the analytics trend, without changing dashboard charts. */
  readable?: boolean
  /** Readable mode: the name of the category axis and table column, e.g. "Tanggal". */
  categoryTitle?: string
  heightClass?: string
}>(), { unit: 'laporan', horizontal: false, tipLabels: false, readable: false, categoryTitle: 'Tanggal / periode', heightClass: 'h-64' })

const canvas = ref<HTMLCanvasElement>()
let chart: Chart<'bar'> | undefined
const formatter = new Intl.NumberFormat('id-ID')

// Chart.js caps a vertical axis at about half the chart width; wrap long
// category names onto lines so they are never clipped on narrow cards.
function wrap(label: string, width = 18): string | string[] {
  if (label.length <= width) return label
  const lines: string[] = []
  let line = ''
  for (const word of label.split(' ')) {
    if (line && `${line} ${word}`.length > width) { lines.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}
const axisLabels = computed(() => props.horizontal ? props.labels.map(label => wrap(label)) : props.labels)
const summary = computed(() => `${props.title}. ${props.labels.map((label, index) => `${label}: ${formatter.format(props.values[index] ?? 0)}${props.readable ? ` ${props.unit}` : ''}`).join('; ')}.`)

function tipText(value: number) {
  return `${formatter.format(value)}${props.readable ? ` ${props.unit}` : ''}`
}

function readableTipWidth() {
  const context = canvas.value?.getContext('2d')
  if (!context) return 96
  context.save()
  context.font = '600 16px "Inter Variable", Inter, system-ui, sans-serif'
  const width = Math.max(0, ...props.values.map(value => context.measureText(tipText(value)).width))
  context.restore()
  return Math.ceil(width)
}

interface Box { left: number; right: number; top: number; bottom: number }
interface TipLabel { value: number; text: string; x: number; y: number; box: Box }
const overlaps = (a: Box, b: Box) => a.left < b.right + 6 && a.right + 6 > b.left && a.top < b.bottom + 4 && a.bottom + 4 > b.top

// Value at the bar tip, in text ink (never the series color).
const tipLabelPlugin: Plugin<'bar'> = {
  id: 'rimbaTipLabels',
  afterDatasetsDraw(instance) {
    if (!props.tipLabels) return
    const { ctx } = instance
    ctx.save()
    ctx.fillStyle = TEXT
    ctx.font = `600 ${props.readable ? 16 : 13}px "Inter Variable", Inter, system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    if (props.readable) {
      const labels = instance.getDatasetMeta(0).data.flatMap((element, index): TipLabel[] => {
        const value = props.values[index] ?? 0
        if (value === 0) return []
        const { x, y } = element.getProps(['x', 'y'], true) as { x: number; y: number }
        const text = tipText(value)
        const width = ctx.measureText(text).width
        const labelX = props.horizontal ? x + 8 : Math.max(width / 2 + 4, Math.min(instance.width - width / 2 - 4, x))
        const labelY = props.horizontal ? y : y - 8
        const box = props.horizontal
          ? { left: labelX, right: labelX + width, top: labelY - 10, bottom: labelY + 10 }
          : { left: labelX - width / 2, right: labelX + width / 2, top: labelY - 20, bottom: labelY }
        return [{ value, text, x: labelX, y: labelY, box }]
      })
      // A label must clear every bar (a short bar's label can sit on a taller
      // neighbour) and every other label.
      const bars: Box[] = instance.getDatasetMeta(0).data.map((element) => {
        const { x, y, base, width, height } = element.getProps(['x', 'y', 'base', 'width', 'height'], true) as { x: number; y: number; base: number; width: number; height: number }
        return props.horizontal
          ? { left: Math.min(base, x), right: Math.max(base, x), top: y - height / 2, bottom: y + height / 2 }
          : { left: x - width / 2, right: x + width / 2, top: Math.min(y, base), bottom: Math.max(y, base) }
      })
      const fits = (set: TipLabel[]) => set.every((label, index) => bars.every(bar => !overlaps(label.box, bar)) && set.slice(0, index).every(previous => !overlaps(label.box, previous.box)))
      // Label every bar when all values fit; otherwise only the peak, so labels
      // never appear on an arbitrary subset. Tooltip and table keep every value.
      const peak = Math.max(0, ...labels.map(label => label.value))
      const peaks = labels.filter(label => label.value === peak)
      const chosen = fits(labels) ? labels : fits(peaks) ? peaks : []
      ctx.textAlign = props.horizontal ? 'left' : 'center'
      ctx.textBaseline = props.horizontal ? 'middle' : 'bottom'
      for (const label of chosen) ctx.fillText(label.text, label.x, label.y)
    } else {
      instance.getDatasetMeta(0).data.forEach((element, index) => {
        const { x, y } = element.getProps(['x', 'y'], true) as { x: number; y: number }
        const label = tipText(props.values[index] ?? 0)
        if (props.horizontal) { ctx.textAlign = 'left'; ctx.fillText(label, x + 6, y) }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(label, x, y - 4) }
      })
    }
    ctx.restore()
  },
}

function config(): ChartConfiguration<'bar'> {
  const tickFont = { size: props.readable ? 15 : 13, family: 'Inter Variable, Inter, system-ui, sans-serif' }
  const tipWidth = props.readable && props.tipLabels ? readableTipWidth() : 0
  const valueAxis = {
    beginAtZero: true,
    grace: props.tipLabels && props.horizontal ? '12%' : '5%',
    border: { display: false },
    grid: { color: GRID, lineWidth: 1, drawTicks: false },
    ticks: { precision: 0, color: TEXT, font: tickFont, padding: 8 },
    ...(props.readable && !props.horizontal ? { title: { display: true, text: `Jumlah ${props.unit}`, color: TEXT, font: tickFont, padding: 12 } } : {}),
  }
  const categoryAxis = {
    border: { display: false },
    grid: { display: false },
    ticks: {
      color: TEXT, font: tickFont,
      autoSkip: !props.horizontal, maxRotation: 0, maxTicksLimit: props.horizontal ? undefined : 8,
    },
    ...(props.readable && !props.horizontal ? { title: { display: true, text: props.categoryTitle, color: TEXT, font: tickFont, padding: 12 } } : {}),
  }
  return {
    type: 'bar',
    data: {
      labels: axisLabels.value,
      datasets: [{
        data: props.values,
        backgroundColor: MARK,
        hoverBackgroundColor: MARK_HOVER,
        maxBarThickness: 24,
        borderRadius: 4,
        borderSkipped: 'start',
        categoryPercentage: 0.8,
        barPercentage: 0.9,
      }],
    },
    options: {
      indexAxis: props.horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: props.readable
        ? { top: props.tipLabels && !props.horizontal ? 36 : 8, right: props.tipLabels ? (props.horizontal ? tipWidth + 12 : Math.ceil(tipWidth / 2) + 8) : 12 }
        : { top: props.tipLabels && !props.horizontal ? 18 : 4, right: 12 } },
      scales: props.horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: '#242B28',
          padding: 10,
          ...(props.readable ? { titleFont: { size: 16 }, bodyFont: { size: 16 }, titleSpacing: 6, bodySpacing: 6, padding: 12 } : {}),
          callbacks: {
            title: items => props.labels[items[0]?.dataIndex ?? 0] ?? '',
            label: item => `${formatter.format(Number(item.raw ?? 0))} ${props.unit}`,
          },
        },
      },
    },
    plugins: [tipLabelPlugin],
  }
}

watch(canvas, (element) => {
  if (!element || chart) return
  chart = new Chart(element, config())
}, { flush: 'post' })
watch(() => [props.labels, props.values], () => {
  if (!chart) return
  chart.data.labels = axisLabels.value
  chart.data.datasets[0]!.data = props.values
  if (props.readable && props.tipLabels) chart.options.layout = config().options!.layout
  chart.update()
}, { deep: true })
watch(() => [props.horizontal, props.readable, props.tipLabels, props.unit, props.categoryTitle], () => {
  if (!canvas.value) return
  chart?.destroy()
  chart = new Chart(canvas.value, config())
})
onBeforeUnmount(() => { chart?.destroy(); chart = undefined })
</script>

<template>
  <figure class="min-w-0" :class="{ 'admin-readable-chart': readable }">
    <div class="relative w-full" :class="heightClass">
      <canvas ref="canvas" role="img" :aria-label="summary" />
    </div>
    <details class="mt-4 border-t border-line pt-2 text-sm">
      <summary class="min-h-12 cursor-pointer content-center font-medium text-forest-700">Lihat data sebagai tabel</summary>
      <table class="mt-2 w-full text-left leading-6">
        <caption class="sr-only">{{ title }}</caption>
        <thead class="border-b border-line bg-[#F4F6F2] text-sm text-charcoal/75"><tr><th scope="col" class="px-3 py-3 font-medium">{{ readable && !horizontal ? categoryTitle : 'Kelompok' }}</th><th scope="col" class="px-3 py-3 text-right font-medium">{{ readable ? `Jumlah ${unit}` : 'Jumlah' }}</th></tr></thead>
        <tbody class="divide-y divide-line tabular-nums">
          <tr v-for="(label, index) in labels" :key="label"><th scope="row" class="px-3 py-3 font-normal">{{ label }}</th><td class="px-3 py-3 text-right">{{ formatter.format(values[index] ?? 0) }}</td></tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>

<style scoped>
.admin-readable-chart details,
.admin-readable-chart table,
.admin-readable-chart thead { font-size: 1rem; line-height: 1.625rem; }
</style>
