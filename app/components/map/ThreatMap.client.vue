<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import type { PriorityLevel } from '../../../shared/types/domain'
import type { ThreatMapPoint } from '~/types/map'
import { PRIORITY_MARKERS } from '#shared/constants/scoring'

const props = withDefaults(defineProps<{
  points: ThreatMapPoint[]
  selectedId?: string | null
  label?: string
  heightClass?: string
}>(), { selectedId: null, label: 'Peta laporan ancaman', heightClass: 'h-[420px] sm:h-[520px] lg:h-[620px]' })
const emit = defineEmits<{ select: [id: string] }>()

const canvas = ref<HTMLElement>()
const tileError = ref(false)
const ready = ref(false)
let map: L.Map | undefined
let cluster: L.MarkerClusterGroup | undefined
const markers = new Map<string, L.Marker>()
const markerPriority = new WeakMap<L.Marker, PriorityLevel | 'none'>()
let fittedKey = ''

const PRIORITY_RANK: Record<PriorityLevel | 'none', number> = { none: 0, low: 1, medium: 2, high: 3 }

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)

function markerIcon(level: PriorityLevel | 'none', selected: boolean, name: string) {
  const style = PRIORITY_MARKERS[level]
  return L.divIcon({
    className: 'rg-marker-wrapper',
    // The letter is decorative; the visually hidden text names the button.
    html: `<span class="rg-marker${selected ? ' rg-marker--selected' : ''}" style="--rg-marker:${style.color};--rg-marker-text:${style.text}" aria-hidden="true">${style.letter}</span><span class="sr-only">${escapeHtml(name)}</span>`,
    // Keep a 44px touch target even when the visible priority dot is smaller.
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })
}

function clusterIcon(group: L.MarkerCluster) {
  const children = group.getAllChildMarkers()
  let top: PriorityLevel | 'none' = 'none'
  for (const child of children) {
    const level = markerPriority.get(child) ?? 'none'
    if (PRIORITY_RANK[level] > PRIORITY_RANK[top]) top = level
  }
  const style = PRIORITY_MARKERS[top]
  const count = group.getChildCount()
  return L.divIcon({
    className: 'rg-marker-wrapper',
    html: `<span class="rg-cluster" style="--rg-marker:${style.color};--rg-marker-text:${style.text}" aria-hidden="true">${count}</span><span class="sr-only">Kelompok ${count} laporan berdekatan, ${style.label.toLowerCase()} tertinggi. Pilih untuk memperbesar.</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })
}

function describe(point: ThreatMapPoint) {
  return `${point.label} · ${PRIORITY_MARKERS[point.priority ?? 'none'].label}`
}

// Leaflet recreates the icon element on add and on setIcon; label it each time.
function decorate(marker: L.Marker, point: ThreatMapPoint) {
  const element = marker.getElement()
  element?.setAttribute('role', 'button')
  element?.setAttribute('aria-label', describe(point))
}

function renderPoints() {
  if (!map || !cluster) return
  cluster.clearLayers()
  markers.clear()
  const layers: L.Marker[] = []
  for (const point of props.points) {
    const level = point.priority ?? 'none'
    const marker = L.marker([point.latitude, point.longitude], {
      icon: markerIcon(level, point.id === props.selectedId, describe(point)),
      title: describe(point),
      keyboard: true,
      riseOnHover: true,
    })
    markerPriority.set(marker, level)
    marker.on('click', () => emit('select', point.id))
    // Leaflet 1.9 only maps Enter to click for popups; markers emit keypress.
    marker.on('keypress', (event: L.LeafletEvent) => {
      const original = (event as L.LeafletKeyboardEvent).originalEvent
      if (original.key !== 'Enter' && original.key !== ' ') return
      original.preventDefault()
      emit('select', point.id)
    })
    marker.on('add', () => decorate(marker, point))
    markers.set(point.id, marker)
    layers.push(marker)
  }
  cluster.addLayers(layers)
  // Refit only when the set of reports changes, never on selection.
  const key = props.points.map(point => point.id).join(',')
  if (key !== fittedKey) {
    fittedKey = key
    if (props.points.length) {
      map.fitBounds(L.latLngBounds(props.points.map(point => [point.latitude, point.longitude] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 12 })
    }
    else map.setView([-2.5, 118], 4)
  }
}

function updateSelection(current: string | null | undefined, previous: string | null | undefined) {
  for (const id of [previous, current]) {
    if (!id) continue
    const marker = markers.get(id)
    const point = props.points.find(item => item.id === id)
    if (marker && point) { marker.setIcon(markerIcon(point.priority ?? 'none', id === current, describe(point))); decorate(marker, point) }
  }
  const marker = current ? markers.get(current) : undefined
  // A selection from the list may be hidden inside a cluster.
  if (marker && cluster) cluster.zoomToShowLayer(marker)
}

// Nuxt's .client wrapper may expose the element only after mounting.
watch(canvas, async (element) => {
  if (!element || map) return
  // The cluster plugin is a classic script that extends the global Leaflet object.
  ;(window as typeof window & { L?: typeof L }).L = L
  await import('leaflet.markercluster')
  if (!canvas.value || map) return
  map = L.map(canvas.value, { scrollWheelZoom: false }).setView([-2.5, 118], 4)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).on('tileerror', () => { tileError.value = true }).addTo(map)
  cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 64,
    spiderfyDistanceMultiplier: 1.5,
    iconCreateFunction: clusterIcon,
  }).addTo(map)
  // Keyboard parity with the cluster click: zoom in, or spread identical points.
  cluster.on('clusterkeypress', (event: L.LeafletEvent) => {
    const original = (event as L.LeafletKeyboardEvent).originalEvent
    if (original.key !== 'Enter' && original.key !== ' ') return
    original.preventDefault()
    const group = (event as L.LeafletEvent & { layer: L.MarkerCluster }).layer
    const bounds = group.getBounds()
    if (!map || bounds.getNorthEast().equals(bounds.getSouthWest()) || map.getZoom() >= map.getMaxZoom()) group.spiderfy()
    else group.zoomToBounds({ padding: [40, 40] })
  })
  renderPoints()
  updateSelection(props.selectedId, null)
  ready.value = true
}, { flush: 'post' })

watch(() => props.points, renderPoints, { deep: true })
watch(() => props.selectedId, (current, previous) => updateSelection(current, previous))
onBeforeUnmount(() => { map?.remove(); map = undefined; cluster = undefined; markers.clear() })
</script>

<template>
  <div>
    <div ref="canvas" role="region" :aria-label="label" :aria-busy="!ready" class="relative z-0 w-full rounded-lg border border-line bg-sage-100" :class="heightClass" />
    <p v-if="tileError" role="status" class="form-hint">Peta dasar belum dapat dimuat. Daftar laporan tetap dapat digunakan.</p>
  </div>
</template>

<style>
.rg-marker-wrapper { display: grid; place-items: center; background: transparent; border: 0; }
.rg-marker, .rg-cluster {
  display: grid; place-items: center; width: 100%; height: 100%; border-radius: 9999px;
  background: var(--rg-marker); color: var(--rg-marker-text); font: 700 13px/1 var(--font-sans, Inter, sans-serif);
  border: 2px solid #FFFFFF; box-shadow: 0 1px 3px rgb(36 43 40 / 0.35);
}
.rg-marker--selected { border: 3px solid #173D32; box-shadow: 0 0 0 3px #FFFFFF, 0 2px 6px rgb(36 43 40 / 0.4); font-size: 15px; }
.rg-marker { width: 30px; height: 30px; }
.rg-marker--selected { width: 38px; height: 38px; }
.rg-cluster { font-size: 14px; border-width: 3px; box-shadow: 0 0 0 4px rgb(255 255 255 / 0.55), 0 1px 4px rgb(36 43 40 / 0.35); }
.leaflet-marker-icon:focus-visible { outline: 3px solid #285C48; outline-offset: 3px; border-radius: 9999px; }
</style>
