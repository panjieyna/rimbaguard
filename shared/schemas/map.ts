import { z } from 'zod'
import { PUBLIC_REPORT_STATUSES, REPORT_STATUSES, THREAT_CATEGORIES } from '../constants/domain'
import { MAP_DATASETS, MAP_PRIORITY_FILTERS } from '../constants/scoring'

export const MAP_PAGE_SIZE = 500

/** Indonesia's western zone has no daylight saving; dates are WIB calendar days. */
const WIB_OFFSET = '+07:00'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format tanggal YYYY-MM-DD.')
  .refine(value => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, 'Tanggal tidak valid.')

const filterFields = {
  category: z.enum(THREAT_CATEGORIES, 'Kategori tidak dikenal.').optional(),
  priority: z.enum(MAP_PRIORITY_FILTERS, 'Prioritas tidak dikenal.').optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
}

/** Empty form controls mean "no filter"; repeated parameters stay invalid. */
function withoutBlanks(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '' && item !== null && item !== undefined))
}

function orderedDates(value: { from?: string; to?: string }, context: z.RefinementCtx) {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'Tanggal akhir tidak boleh sebelum tanggal awal.' })
  }
}

export const publicMapFiltersSchema = z.preprocess(withoutBlanks, z.strictObject({
  ...filterFields,
  status: z.enum(PUBLIC_REPORT_STATUSES, 'Status tidak tersedia pada peta publik.').optional(),
}).superRefine(orderedDates))

export const adminMapFiltersSchema = z.preprocess(withoutBlanks, z.strictObject({
  ...filterFields,
  status: z.enum(REPORT_STATUSES, 'Status tidak dikenal.').optional(),
  dataset: z.enum(MAP_DATASETS, 'Pilihan data tidak dikenal.').default('all'),
}).superRefine(orderedDates))

export type PublicMapFilters = z.output<typeof publicMapFiltersSchema>
export type AdminMapFilters = z.output<typeof adminMapFiltersSchema>

/** Inclusive WIB calendar range as a half-open instant range for the database. */
export function wibDateRange(from?: string, to?: string): { from: string | null; to: string | null } {
  let end: string | null = null
  if (to) {
    const next = new Date(`${to}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    end = `${next.toISOString().slice(0, 10)}T00:00:00${WIB_OFFSET}`
  }
  return { from: from ? `${from}T00:00:00${WIB_OFFSET}` : null, to: end }
}
