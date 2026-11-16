import type { PriorityLevel, ThreatCategory } from '../types/domain'

/**
 * Display copy of scoring v1. The database (migration 005) is the only
 * calculator; tests/unit/scoring-contract.test.ts keeps these values aligned.
 */
export const SCORING_VERSION = 'rimbaguard-priority-v1'

export const SCORING_WEIGHTS = { severity: 0.35, completeness: 0.25, recency: 0.2, nearby: 0.2 } as const

export const THREAT_SEVERITY: Record<ThreatCategory, number> = {
  forest_fire: 95,
  illegal_logging_suspected: 90,
  land_clearing: 80,
  suspicious_human_activity: 55,
  other_environmental_threat: 40,
}

export const COMPLETENESS_RULES = [
  { points: 25, label: 'Foto bukti tersimpan dan tervalidasi' },
  { points: 25, label: 'Deskripsi minimal 80 karakter' },
  { points: 20, label: 'Koordinat valid' },
  { points: 20, label: 'Waktu kejadian valid dan tidak di masa depan' },
  { points: 10, label: 'Nama lokasi minimal 3 karakter' },
] as const

export const RECENCY_RULES = [
  { score: 100, label: 'Usia kejadian paling lama 6 jam' },
  { score: 85, label: 'Lebih dari 6 jam sampai 24 jam' },
  { score: 65, label: 'Lebih dari 1 hari sampai 3 hari' },
  { score: 40, label: 'Lebih dari 3 hari sampai 7 hari' },
  { score: 20, label: 'Lebih dari 7 hari' },
] as const

export const NEARBY_RADIUS_KM = 2
export const NEARBY_WINDOW_DAYS = 7
export const NEARBY_RULES = [
  { count: '0', score: 0 },
  { count: '1', score: 40 },
  { count: '2', score: 70 },
  { count: '3 atau lebih', score: 100 },
] as const

export const PRIORITY_THRESHOLDS: Record<PriorityLevel, string> = {
  high: '75–100',
  medium: '45 sampai di bawah 75',
  low: 'di bawah 45',
}

export const CATEGORY_SOURCES = ['user', 'ai', 'officer'] as const
export type CategorySource = (typeof CATEGORY_SOURCES)[number]
export const CATEGORY_SOURCE_LABELS: Record<CategorySource, string> = {
  user: 'Kategori pelapor (sementara)',
  ai: 'Kategori analisis AI',
  officer: 'Koreksi petugas',
}

export const MAP_PRIORITY_FILTERS = ['high', 'medium', 'low', 'none'] as const
export type MapPriorityFilter = (typeof MAP_PRIORITY_FILTERS)[number]
export const MAP_PRIORITY_FILTER_LABELS: Record<MapPriorityFilter, string> = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',
  none: 'Belum dihitung',
}

export const MAP_DATASETS = ['all', 'real', 'simulation'] as const
export type MapDataset = (typeof MAP_DATASETS)[number]
export const MAP_DATASET_LABELS: Record<MapDataset, string> = {
  all: 'Semua data',
  real: 'Laporan nyata',
  simulation: 'Data simulasi',
}

/** Marker letters keep priority readable without relying on color alone. */
export const PRIORITY_MARKERS: Record<PriorityLevel | 'none', { letter: string; color: string; text: string; label: string }> = {
  high: { letter: 'T', color: '#C64C45', text: '#FFFFFF', label: 'Prioritas tinggi' },
  medium: { letter: 'S', color: '#C38B35', text: '#242B28', label: 'Prioritas sedang' },
  low: { letter: 'R', color: '#3D805B', text: '#FFFFFF', label: 'Prioritas rendah' },
  none: { letter: '–', color: '#737B76', text: '#FFFFFF', label: 'Prioritas belum dihitung' },
}
