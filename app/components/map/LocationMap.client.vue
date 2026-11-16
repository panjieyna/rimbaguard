<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Single-point picker/display. Report collections use ThreatMap.client.vue.
const props = withDefaults(defineProps<{
  modelValue?: { latitude: number; longitude: number } | null
  selectable?: boolean
}>(), { modelValue: null, selectable: false })
const emit = defineEmits<{
  'update:modelValue': [value: { latitude: number; longitude: number }]
}>()
const canvas = ref<HTMLElement>()
const tileError = ref(false)
let map: L.Map | undefined
let selection: L.CircleMarker | undefined

function updateSelection() {
  if (!map) return
  if (!props.modelValue) { selection?.remove(); selection = undefined; return }
  const { latitude, longitude } = props.modelValue
  const position: L.LatLngTuple = [latitude, longitude]
  if (!selection) selection = L.circleMarker(position, { radius: 9, color: '#173D32', fillColor: '#4B8065', fillOpacity: 1, weight: 3 }).addTo(map)
  else selection.setLatLng(position)
  map.setView(position, Math.max(map.getZoom(), 13))
}
// Nuxt's .client wrapper may expose this element only after its mounted hook.
// Initialize when the actual canvas exists, including a hard SSR navigation.
watch(canvas, element => {
  if (!element || map) return
  map = L.map(element, { scrollWheelZoom: false }).setView([-2.5, 118], 4)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
    .on('tileerror', () => { tileError.value = true }).addTo(map)
  if (props.selectable) map.on('click', (event: L.LeafletMouseEvent) => emit('update:modelValue', { latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) }))
  updateSelection()
}, { flush: 'post' })
watch(() => props.modelValue, updateSelection, { deep: true })
onBeforeUnmount(() => { map?.remove(); map = undefined })
</script>

<template>
  <div>
    <div ref="canvas" role="region" aria-label="Peta lokasi laporan" class="relative z-0 h-[380px] w-full rounded-lg border border-line bg-sage-100 sm:h-[450px]" />
    <p v-if="tileError" role="status" class="form-hint">Peta dasar belum dapat dimuat. {{ selectable ? 'Anda tetap dapat memasukkan koordinat secara manual.' : 'Informasi laporan tetap tersedia pada halaman ini.' }}</p>
    <p v-if="selectable" class="form-hint">Klik atau ketuk peta untuk memilih titik. Koordinat juga dapat diisi pada kolom di bawah.</p>
  </div>
</template>
