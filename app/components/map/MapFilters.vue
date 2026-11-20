<script setup lang="ts">
import type { ReportStatus } from '../../../shared/types/domain'
import type { MapFilterValues } from '~/types/map'
import { REPORT_STATUS_LABELS, THREAT_CATEGORIES, THREAT_CATEGORY_LABELS } from '#shared/constants/domain'
import { MAP_DATASETS, MAP_DATASET_LABELS, MAP_PRIORITY_FILTERS, MAP_PRIORITY_FILTER_LABELS } from '#shared/constants/scoring'

const props = defineProps<{ statuses: readonly ReportStatus[]; values: MapFilterValues; showDataset?: boolean; expanded?: boolean }>()
const emit = defineEmits<{ apply: [values: MapFilterValues] }>()
const id = useId()
const open = ref(false)
const blank = () => ({ category: '', priority: '', status: '', from: '', to: '', dataset: 'all' })
const form = reactive(blank())
watch(() => props.values, (values) => { Object.assign(form, blank(), values) }, { immediate: true, deep: true })
const activeCount = computed(() => Object.entries(props.values).filter(([key, value]) => value && !(key === 'dataset' && value === 'all')).length)

function apply() {
  const values: MapFilterValues = {}
  for (const [key, value] of Object.entries(form) as [keyof MapFilterValues, string][]) {
    if (!value || (key === 'dataset' && (value === 'all' || !props.showDataset))) continue
    values[key] = value
  }
  emit('apply', values)
  open.value = false
}
function reset() { Object.assign(form, blank()); apply() }
</script>

<template>
  <form role="search" method="get" aria-label="Filter laporan pada peta" class="rounded-lg border border-line bg-white p-4" @submit.prevent="apply">
    <div v-if="!expanded" class="flex items-center justify-between gap-3 lg:hidden">
      <p class="text-sm font-medium">Filter<span v-if="activeCount" class="font-normal text-charcoal/75"> · {{ activeCount }} aktif</span></p>
      <button type="button" class="button-secondary min-h-11 px-4 py-2" :aria-expanded="open" :aria-controls="`${id}-fields`" @click="open = !open">{{ open ? 'Tutup filter' : 'Ubah filter' }}</button>
    </div>
    <div :id="`${id}-fields`" class="mt-4 gap-4 sm:grid-cols-2 lg:mt-0 lg:grid lg:items-end" :class="[open || expanded ? 'grid' : 'hidden', showDataset ? 'lg:grid-cols-[repeat(6,minmax(0,1fr))_auto]' : 'lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]']">
      <div><label :for="`${id}-category`" class="form-label">Kategori</label><select :id="`${id}-category`" v-model="form.category" name="category" class="form-input"><option value="">Semua kategori</option><option v-for="category in THREAT_CATEGORIES" :key="category" :value="category">{{ THREAT_CATEGORY_LABELS[category] }}</option></select></div>
      <div><label :for="`${id}-priority`" class="form-label">Prioritas</label><select :id="`${id}-priority`" v-model="form.priority" name="priority" class="form-input"><option value="">Semua prioritas</option><option v-for="priority in MAP_PRIORITY_FILTERS" :key="priority" :value="priority">{{ MAP_PRIORITY_FILTER_LABELS[priority] }}</option></select></div>
      <div><label :for="`${id}-status`" class="form-label">Status verifikasi</label><select :id="`${id}-status`" v-model="form.status" name="status" class="form-input"><option value="">Semua status</option><option v-for="status in statuses" :key="status" :value="status">{{ REPORT_STATUS_LABELS[status] }}</option></select></div>
      <div><label :for="`${id}-from`" class="form-label">Dari tanggal</label><input :id="`${id}-from`" v-model="form.from" name="from" type="date" class="form-input" :max="form.to || undefined"></div>
      <div><label :for="`${id}-to`" class="form-label">Sampai tanggal</label><input :id="`${id}-to`" v-model="form.to" name="to" type="date" class="form-input" :min="form.from || undefined"></div>
      <div v-if="showDataset"><label :for="`${id}-dataset`" class="form-label">Data</label><select :id="`${id}-dataset`" v-model="form.dataset" name="dataset" class="form-input"><option v-for="dataset in MAP_DATASETS" :key="dataset" :value="dataset">{{ MAP_DATASET_LABELS[dataset] }}</option></select></div>
      <div class="flex gap-2 sm:col-span-2 lg:col-span-1"><button type="submit" class="button-primary flex-1 lg:flex-none">Terapkan</button><button type="button" class="button-secondary flex-1 lg:flex-none" @click="reset">Atur ulang</button></div>
    </div>
    <p class="form-hint lg:mt-3">Tanggal mengikuti waktu kejadian dalam WIB.</p>
  </form>
</template>
