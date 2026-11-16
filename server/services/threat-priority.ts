import { z } from 'zod'
import type { SessionUser } from '../../shared/types/domain'
import type { AdminMapResponse, PriorityRefreshResult, PublicMapResponse } from '../../shared/types/map-api'
import { PRIORITY_LEVELS, PUBLIC_REPORT_STATUSES, REPORT_STATUSES, THREAT_CATEGORIES } from '../../shared/constants/domain'
import { CATEGORY_SOURCES } from '../../shared/constants/scoring'
import { MAP_PAGE_SIZE, wibDateRange, type AdminMapFilters, type PublicMapFilters } from '../../shared/schemas/map'
import { getServiceDatabase } from '../utils/supabase'
import { apiError, databaseUnavailable } from '../utils/response'

// Scores are calculated only by the database (migration 005). This service
// requests bounded refreshes and validates every projection it returns.

const refreshResultSchema = z.object({
  refreshed: z.number().int().min(0),
  failed: z.number().int().min(0),
  remaining: z.number().int().min(0).nullable(),
  busy: z.boolean(),
})

const timestamp = z.string().min(1).refine(value => !Number.isNaN(Date.parse(value)), 'Invalid timestamp')
// SQL bounds count characters; JavaScript counts UTF-16 units (an emoji is two).
const text = (characters: number) => z.string().max(characters * 2)
const latitude = z.number().min(-90).max(90)
const longitude = z.number().min(-180).max(180)

// z.object strips unknown keys: only these fields can ever reach a browser.
const adminItemSchema = z.object({
  id: z.uuid(),
  reportCode: z.string().min(1).max(40),
  title: text(160).min(1),
  category: z.enum(THREAT_CATEGORIES),
  effectiveCategory: z.enum(THREAT_CATEGORIES),
  categorySource: z.enum(CATEGORY_SOURCES),
  status: z.enum(REPORT_STATUSES),
  latitude,
  longitude,
  locationName: text(160).nullable(),
  incidentTime: timestamp,
  createdAt: timestamp,
  isSimulation: z.boolean(),
  isPublic: z.boolean(),
  excerpt: text(180),
  priority: z.object({
    level: z.enum(PRIORITY_LEVELS),
    totalScore: z.number().min(0).max(100),
    calculatedAt: timestamp,
    stale: z.boolean(),
  }).nullable(),
})

const publicItemSchema = z.object({
  id: z.uuid(),
  reportCode: z.string().min(1).max(40),
  category: z.enum(THREAT_CATEGORIES),
  summary: text(500).min(1),
  approximateLatitude: latitude,
  approximateLongitude: longitude,
  coordinatesAreApproximate: z.literal(true),
  incidentTime: timestamp,
  publishedAt: timestamp,
  status: z.enum(PUBLIC_REPORT_STATUSES),
  priority: z.enum(PRIORITY_LEVELS).nullable(),
})

function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ total: z.number().int().min(0), reports: z.array(item).max(MAP_PAGE_SIZE) })
}
/** Shared with the officer queue, which uses the same database projection. */
export const adminPageSchema = pageSchema(adminItemSchema)
const publicPageSchema = pageSchema(publicItemSchema)

function throwMapDatabaseError(error: { code?: string }): never {
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')) {
    throw apiError(503, 'MAP_SCHEMA_UNAVAILABLE', 'Skema peta prioritas belum tersedia. Terapkan migrasi Fase 4 sebelum mencoba lagi.')
  }
  if (error.code === '42501') throw apiError(403, 'ADMIN_REQUIRED', 'Akses ini hanya tersedia bagi petugas.')
  if (error.code === '22023') throw apiError(422, 'VALIDATION_FAILED', 'Periksa kembali filter peta.')
  throw databaseUnavailable()
}

/**
 * Bounded, serialized score refresh. Never throws: a report is already saved
 * when this runs, and readers show the last calculation with its freshness.
 */
export async function refreshPriorities(options: { reportIds?: string[]; limit?: number; wait?: boolean } = {}): Promise<PriorityRefreshResult> {
  try {
    const { data, error } = await getServiceDatabase().rpc('refresh_threat_priorities', {
      p_report_ids: options.reportIds?.length ? options.reportIds : null,
      p_limit: options.limit ?? 50,
      p_wait: options.wait ?? false,
    })
    const result = refreshResultSchema.safeParse(data)
    if (error || !result.success) return { status: 'failed', refreshed: 0, remaining: null }
    if (result.data.busy) return { status: 'busy', refreshed: 0, remaining: null }
    return { status: result.data.failed > 0 ? 'failed' : 'fresh', refreshed: result.data.refreshed, remaining: result.data.remaining }
  }
  catch {
    return { status: 'failed', refreshed: 0, remaining: null }
  }
}

/** After a report write: recalculate it and the neighborhoods it affects. */
export function refreshReportPriority(reportId: string) {
  return refreshPriorities({ reportIds: [reportId], limit: 25, wait: true })
}

export async function listAdminMapReports(actor: SessionUser, filters: AdminMapFilters): Promise<AdminMapResponse> {
  // Freshen stale scores before sorting; a concurrent refresh is not awaited.
  const refresh = await refreshPriorities({ limit: 200 })
  const range = wibDateRange(filters.from, filters.to)
  const { data, error } = await getServiceDatabase().rpc('admin_map_reports', {
    p_actor_id: actor.id,
    p_category: filters.category ?? null,
    p_priority: filters.priority ?? null,
    p_status: filters.status ?? null,
    p_from: range.from,
    p_to: range.to,
    p_dataset: filters.dataset,
    p_limit: MAP_PAGE_SIZE,
    p_offset: (filters.page - 1) * MAP_PAGE_SIZE,
  })
  if (error) throwMapDatabaseError(error)
  const page = adminPageSchema.safeParse(data)
  if (!page.success) throw databaseUnavailable()
  return {
    reports: page.data.reports, total: page.data.total, page: filters.page, pageSize: MAP_PAGE_SIZE,
    refresh: { status: refresh.status, remaining: refresh.remaining },
  }
}

export async function listPublicMapReports(filters: PublicMapFilters, reportId?: string): Promise<PublicMapResponse> {
  // Read-only: anonymous requests never trigger score calculations.
  const range = wibDateRange(filters.from, filters.to)
  const { data, error } = await getServiceDatabase().rpc('public_map_reports', {
    p_category: filters.category ?? null,
    p_priority: filters.priority ?? null,
    p_status: filters.status ?? null,
    p_from: range.from,
    p_to: range.to,
    p_report_id: reportId ?? null,
    p_limit: MAP_PAGE_SIZE,
    p_offset: (filters.page - 1) * MAP_PAGE_SIZE,
  })
  if (error) throwMapDatabaseError(error)
  const page = publicPageSchema.safeParse(data)
  if (!page.success) throw databaseUnavailable()
  return {
    // Re-round as defense in depth: an exact point must never leave the server.
    reports: page.data.reports.map(report => ({
      ...report,
      approximateLatitude: Math.round(report.approximateLatitude * 100) / 100,
      approximateLongitude: Math.round(report.approximateLongitude * 100) / 100,
    })),
    total: page.data.total, page: filters.page, pageSize: MAP_PAGE_SIZE,
  }
}
