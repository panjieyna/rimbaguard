<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PublicMapReport } from '../../../shared/types/domain'

const props = withDefaults(defineProps<{
  modelValue?: { latitude: number; longitude: number } | null
  selectable?: boolean
  reports?: PublicMapReport[]
  selectedId?: string
}>(), { modelValue: null, selectable: false, reports: () => [] })
const emit = defineEmits<{
  'update:modelValue': [value: { latitude: number; longitude: number }]
  select: [id: string]
}>()
const canvas = ref<HTMLElement>()
const tileError = ref(false)
let map: L.Map | undefined
let selection: L.CircleMarker | undefined
let reportsLayer: L.LayerGroup | undefined

function updateSelection() {
  if (!map) return
  if (!props.modelValue) { selection?.remove(); selection = undefined; return }
  const { latitude, longitude } = props.modelValue
  const position: L.LatLngTuple = [latitude, longitude]
  if (!selection) selection = L.circleMarker(position, { radius: 9, color: '#173D32', fillColor: '#4B8065', fillOpacity: 1, weight: 3 }).addTo(map)
  else selection.setLatLng(position)
  map.setView(position, Math.max(map.getZoom(), 13))
}
function updateReports() {
  if (!map || !reportsLayer) return
  reportsLayer.clearLayers()
  for (const report of props.reports) {
    const position: L.LatLngTuple = [report.approximateLatitude, report.approximateLongitude]
    const selected = props.selectedId === report.id
    const marker = L.circleMarker(position, { radius: selected ? 9 : 6, color: '#173D32', fillColor: selected ? '#285C48' : '#737B76', fillOpacity: 1, weight: selected ? 3 : 1 })
    const label = document.createElement('span')
    label.textContent = report.reportCode
    marker.bindTooltip(label).on('click', () => emit('select', report.id)).addTo(reportsLayer)
  }
}
onMounted(() => {
  if (!canvas.value) return
  map = L.map(canvas.value, { scrollWheelZoom: false }).setView([-2.5, 118], 4)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
    .on('tileerror', () => { tileError.value = true }).addTo(map)
  reportsLayer = L.layerGroup().addTo(map)
  if (props.selectable) map.on('click', (event: L.LeafletMouseEvent) => emit('update:modelValue', { latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) }))
  updateSelection()
  updateReports()
  if (props.reports.length) map.fitBounds(L.latLngBounds(props.reports.map(report => [report.approximateLatitude, report.approximateLongitude])), { padding: [36, 36], maxZoom: 11 })
})
watch(() => props.modelValue, updateSelection, { deep: true })
watch(() => [props.reports, props.selectedId], updateReports, { deep: true })
onBeforeUnmount(() => { map?.remove(); map = undefined })
</script>

<template>
  <div>
    <div ref="canvas" role="region" aria-label="Peta lokasi laporan" class="relative z-0 h-[380px] w-full rounded-lg border border-line bg-sage-100 sm:h-[450px]" />
    <p v-if="tileError" role="status" class="form-hint">Peta dasar belum dapat dimuat. {{ selectable ? 'Anda tetap dapat memasukkan koordinat secara manual.' : 'Informasi laporan tetap tersedia pada daftar.' }}</p>
    <p v-if="selectable" class="form-hint">Klik atau ketuk peta untuk memilih titik. Koordinat juga dapat diisi pada kolom di bawah.</p>
  </div>
</template>
