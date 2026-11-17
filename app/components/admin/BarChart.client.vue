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
  heightClass?: string
}>(), { unit: 'laporan', horizontal: false, tipLabels: false, heightClass: 'h-64' })

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
const summary = computed(() => `${props.title}. ${props.labels.map((label, index) => `${label}: ${formatter.format(props.values[index] ?? 0)}`).join('; ')}.`)

// Value at the bar tip, in text ink (never the series color).
const tipLabelPlugin: Plugin<'bar'> = {
  id: 'rimbaTipLabels',
  afterDatasetsDraw(instance) {
    if (!props.tipLabels) return
    const { ctx } = instance
    ctx.save()
    ctx.fillStyle = TEXT
    ctx.font = '600 14px "Inter Variable", Inter, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    instance.getDatasetMeta(0).data.forEach((element, index) => {
      const value = props.values[index] ?? 0
      const { x, y } = element.getProps(['x', 'y'], true) as { x: number; y: number }
      if (props.horizontal) { ctx.textAlign = 'left'; ctx.fillText(formatter.format(value), x + 6, y) }
      else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(formatter.format(value), x, y - 4) }
    })
    ctx.restore()
  },
}

function config(): ChartConfiguration<'bar'> {
  const valueAxis = {
    beginAtZero: true,
    grace: props.tipLabels && props.horizontal ? '12%' : '5%',
    border: { display: false },
    grid: { color: GRID, lineWidth: 1, drawTicks: false },
    ticks: { precision: 0, color: TEXT, font: { size: 14, family: 'Inter Variable, Inter, system-ui, sans-serif' }, padding: 8 },
  }
  const categoryAxis = {
    border: { display: false },
    grid: { display: false },
    ticks: {
      color: TEXT, font: { size: 14, family: 'Inter Variable, Inter, system-ui, sans-serif' },
      autoSkip: !props.horizontal, maxRotation: 0, maxTicksLimit: props.horizontal ? undefined : 8,
    },
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
      layout: { padding: { top: props.tipLabels && !props.horizontal ? 18 : 4, right: 12 } },
      scales: props.horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: '#242B28',
          padding: 10,
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
watch(() => [props.labels, props.values, props.horizontal], () => {
  if (!chart) return
  chart.data.labels = axisLabels.value
  chart.data.datasets[0]!.data = props.values
  chart.update()
}, { deep: true })
onBeforeUnmount(() => { chart?.destroy(); chart = undefined })
</script>

<template>
  <figure class="min-w-0">
    <div class="relative w-full" :class="heightClass">
      <canvas ref="canvas" role="img" :aria-label="summary" />
    </div>
    <details class="mt-4 border-t border-line pt-2 text-sm">
      <summary class="min-h-12 cursor-pointer content-center font-medium text-forest-700">Lihat data sebagai tabel</summary>
      <table class="mt-2 w-full text-left leading-6">
        <caption class="sr-only">{{ title }}</caption>
        <thead class="border-b border-line bg-[#F4F6F2] text-sm text-charcoal/75"><tr><th scope="col" class="px-3 py-3 font-medium">Kelompok</th><th scope="col" class="px-3 py-3 text-right font-medium">Jumlah</th></tr></thead>
        <tbody class="divide-y divide-line tabular-nums">
          <tr v-for="(label, index) in labels" :key="label"><th scope="row" class="px-3 py-3 font-normal">{{ label }}</th><td class="px-3 py-3 text-right">{{ formatter.format(values[index] ?? 0) }}</td></tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>
