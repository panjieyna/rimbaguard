import { z } from 'zod'
import { THREAT_CATEGORIES } from '../constants/domain'
import { MAP_DATASETS, MAP_PRIORITY_FILTERS } from '../constants/scoring'
import { ADMIN_TARGET_STATUSES, ANALYTICS_DATASETS, ANALYTICS_RANGES, QUEUE_SCOPES, REPORTER_NOTE_STATUSES } from '../constants/workflow'

export const ADMIN_QUEUE_PAGE_SIZE = 20

const expectedRevision = z.number().int().positive()
const optionalNote = (max: number) => z.string().trim().max(max, `Catatan maksimal ${max} karakter.`).optional()
  .transform(value => value || undefined)

export const statusChangeSchema = z.strictObject({
  expectedRevision,
  status: z.enum(ADMIN_TARGET_STATUSES, 'Status tujuan tidak dikenal.'),
  note: optionalNote(2000),
}).superRefine((value, context) => {
  if (REPORTER_NOTE_STATUSES.includes(value.status) && (value.note?.length ?? 0) < 5) {
    context.addIssue({ code: 'custom', path: ['note'], message: 'Tulis alasan atau permintaan untuk pelapor, minimal 5 karakter.' })
  }
})

export const publicationSchema = z.strictObject({
  expectedRevision,
  publicSummary: z.string().trim().min(10, 'Ringkasan publik minimal 10 karakter.').max(500, 'Ringkasan publik maksimal 500 karakter.'),
})

export const withdrawalSchema = z.strictObject({
  expectedRevision,
  note: z.string().trim().min(5, 'Tulis alasan penarikan, minimal 5 karakter.').max(2000, 'Alasan maksimal 2.000 karakter.'),
})

export const categoryCorrectionSchema = z.strictObject({
  expectedRevision,
  category: z.enum(THREAT_CATEGORIES, 'Kategori tidak dikenal.').nullable(),
  note: optionalNote(1800),
})

export const adminNoteSchema = z.strictObject({
  note: z.string().trim().min(5, 'Catatan minimal 5 karakter.').max(2000, 'Catatan maksimal 2.000 karakter.'),
})

/** Empty form controls mean "no filter"; repeated parameters stay invalid. */
function withoutBlanks(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '' && item !== null && item !== undefined))
}

export const queueFiltersSchema = z.preprocess(withoutBlanks, z.strictObject({
  scope: z.enum(QUEUE_SCOPES, 'Cakupan antrean tidak dikenal.').default('active'),
  category: z.enum(THREAT_CATEGORIES, 'Kategori tidak dikenal.').optional(),
  priority: z.enum(MAP_PRIORITY_FILTERS, 'Prioritas tidak dikenal.').optional(),
  dataset: z.enum(MAP_DATASETS, 'Pilihan data tidak dikenal.').default('all'),
  page: z.coerce.number().int().min(1).max(5000).default(1),
}))

export const analyticsFiltersSchema = z.preprocess(withoutBlanks, z.strictObject({
  days: z.coerce.number().int().refine(value => (ANALYTICS_RANGES as readonly number[]).includes(value), 'Rentang waktu tidak tersedia.').default(30),
  dataset: z.enum(ANALYTICS_DATASETS, 'Pilihan data tidak dikenal.').default('real'),
}))

export type StatusChangeInput = z.output<typeof statusChangeSchema>
export type PublicationInput = z.output<typeof publicationSchema>
export type WithdrawalInput = z.output<typeof withdrawalSchema>
export type CategoryCorrectionInput = z.output<typeof categoryCorrectionSchema>
export type QueueFilters = z.output<typeof queueFiltersSchema>
export type AnalyticsFilters = z.output<typeof analyticsFiltersSchema>
