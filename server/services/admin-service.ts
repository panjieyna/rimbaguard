import { z } from 'zod'
import type { SessionUser } from '../../shared/types/domain'
import type { ReportRow } from '../../shared/types/database'
import type { AdminAnalytics, AdminDashboardResponse, AdminQueueResponse, AdminSettingsResponse } from '../../shared/types/admin-api'
import { REPORT_STATUSES, THREAT_CATEGORIES } from '../../shared/constants/domain'
import { SCORING_VERSION } from '../../shared/constants/scoring'
import { ANALYTICS_DATASETS, ANALYTICS_RANGES } from '../../shared/constants/workflow'
import {
  ADMIN_QUEUE_PAGE_SIZE, type AnalyticsFilters, type CategoryCorrectionInput, type PublicationInput,
  type QueueFilters, type StatusChangeInput, type WithdrawalInput,
} from '../../shared/schemas/admin'
import { getServiceDatabase } from '../utils/supabase'
import { getServerEnvironment } from '../utils/config'
import { apiError, databaseUnavailable } from '../utils/response'
import { adminPageSchema, refreshPriorities, refreshReportPriority } from './threat-priority'
import { resolveGeminiModel } from './ai/threat-analysis'
import { toReportSummary } from './report-service'

const count = z.number().int().min(0)
const analyticsSchema = z.object({
  summary: z.object({
    total: count, pendingVerification: count, analysisFailed: count, needsMoreInformation: count,
    highPriority: count, verified: count, inProgress: count, resolved: count, rejected: count,
  }),
  rangeTotal: count,
  statusCounts: z.array(z.object({ status: z.enum(REPORT_STATUSES), count })).length(REPORT_STATUSES.length),
  categoryCounts: z.array(z.object({ category: z.enum(THREAT_CATEGORIES), count })).length(THREAT_CATEGORIES.length),
  daily: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), count })).min(1).max(366),
  range: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.literal([...ANALYTICS_RANGES]),
    timezone: z.literal('Asia/Jakarta'), dataset: z.enum(ANALYTICS_DATASETS),
  }),
})

// Database outcomes become fixed, actionable messages; raw database text never escapes.
const CONFLICT_MESSAGES: Readonly<Record<string, [number, string, string]>> = {
  invalid_status_transition: [422, 'INVALID_TRANSITION', 'Perubahan status ini tidak diizinkan dari status laporan saat ini.'],
  verification_note_required: [422, 'NOTE_REQUIRED', 'Tulis alasan atau permintaan untuk pelapor, minimal 5 karakter.'],
  simulation_not_publishable: [422, 'SIMULATION_NOT_PUBLISHABLE', 'Data simulasi tidak dapat dipublikasikan ke peta publik.'],
  publication_not_eligible: [422, 'PUBLICATION_NOT_ELIGIBLE', 'Hanya laporan terverifikasi, sedang ditindaklanjuti, atau selesai yang dapat dipublikasikan.'],
  withdrawal_note_required: [422, 'NOTE_REQUIRED', 'Tulis alasan penarikan publikasi, minimal 5 karakter.'],
  report_not_public: [409, 'REPORT_NOT_PUBLIC', 'Laporan ini sudah tidak dipublikasikan. Muat ulang untuk melihat keadaan terbaru.'],
  category_unchanged: [409, 'CATEGORY_UNCHANGED', 'Kategori petugas tidak berubah.'],
}

export function throwAdminDatabaseError(error: { code?: string; message?: string }): never {
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')) {
    throw apiError(503, 'ADMIN_SCHEMA_UNAVAILABLE', 'Skema alur kerja petugas belum tersedia. Terapkan migrasi Fase 5 sebelum mencoba lagi.')
  }
  const known = error.message ? CONFLICT_MESSAGES[error.message] : undefined
  if (known) throw apiError(known[0], known[1], known[2])
  if (error.code === '42501') throw apiError(403, 'ADMIN_REQUIRED', 'Akses ini hanya tersedia bagi petugas.')
  if (error.code === 'P0002') throw apiError(404, 'REPORT_NOT_FOUND', 'Laporan tidak ditemukan.')
  if (['PT409', '40001'].includes(error.code ?? '')) {
    throw apiError(409, 'REPORT_CONFLICT', 'Laporan baru saja diubah oleh proses lain. Muat ulang untuk melihat keadaan terbaru, lalu ulangi tindakan.')
  }
  if (['22023', '23514'].includes(error.code ?? '')) throw apiError(422, 'VALIDATION_FAILED', 'Periksa kembali isian tindakan petugas.')
  throw databaseUnavailable()
}

export async function getAnalytics(actor: SessionUser, filters: AnalyticsFilters): Promise<AdminAnalytics> {
  const { data, error } = await getServiceDatabase().rpc('admin_analytics', { p_actor_id: actor.id, p_dataset: filters.dataset, p_days: filters.days })
  if (error) throwAdminDatabaseError(error)
  const result = analyticsSchema.safeParse(data)
  if (!result.success) throw databaseUnavailable()
  return result.data
}

async function readQueue(actor: SessionUser, filters: QueueFilters, pageSize: number) {
  const { data, error } = await getServiceDatabase().rpc('admin_report_queue', {
    p_actor_id: actor.id, p_scope: filters.scope, p_category: filters.category ?? null, p_priority: filters.priority ?? null,
    p_dataset: filters.dataset, p_limit: pageSize, p_offset: (filters.page - 1) * pageSize,
  })
  if (error) throwAdminDatabaseError(error)
  const page = adminPageSchema.safeParse(data)
  if (!page.success) throw databaseUnavailable()
  return page.data
}

export async function listQueue(actor: SessionUser, filters: QueueFilters): Promise<AdminQueueResponse> {
  // Sort on fresh scores; a concurrent refresh is not awaited.
  const refresh = await refreshPriorities({ limit: 200 })
  const page = await readQueue(actor, filters, ADMIN_QUEUE_PAGE_SIZE)
  return { reports: page.reports, total: page.total, page: filters.page, pageSize: ADMIN_QUEUE_PAGE_SIZE, refresh: { status: refresh.status, remaining: refresh.remaining } }
}

export async function getDashboard(actor: SessionUser, dataset: AnalyticsFilters['dataset']): Promise<AdminDashboardResponse> {
  const refresh = await refreshPriorities({ limit: 200 })
  const [analytics, queue] = await Promise.all([
    getAnalytics(actor, { days: 30, dataset }),
    readQueue(actor, { scope: 'active', dataset, page: 1 }, 5),
  ])
  return { analytics, queue: queue.reports, queueTotal: queue.total, refresh: { status: refresh.status, remaining: refresh.remaining } }
}

/** Every officer mutation refreshes the affected scores before answering. */
async function afterMutation(reportId: string, data: ReportRow | null) {
  if (!data || typeof data !== 'object' || data.id !== reportId) throw databaseUnavailable()
  await refreshReportPriority(reportId)
  return { report: toReportSummary(data) }
}

export async function changeStatus(actor: SessionUser, reportId: string, input: StatusChangeInput) {
  const { data, error } = await getServiceDatabase().rpc('admin_change_report_status', {
    p_report_id: reportId, p_actor_id: actor.id, p_expected_revision: input.expectedRevision,
    p_new_status: input.status, p_note: input.note ?? null,
  })
  if (error) throwAdminDatabaseError(error)
  return afterMutation(reportId, data)
}

export async function publishReport(actor: SessionUser, reportId: string, input: PublicationInput) {
  const { data, error } = await getServiceDatabase().rpc('admin_publish_report', {
    p_report_id: reportId, p_actor_id: actor.id, p_expected_revision: input.expectedRevision, p_public_summary: input.publicSummary,
  })
  if (error) throwAdminDatabaseError(error)
  return afterMutation(reportId, data)
}

export async function withdrawPublication(actor: SessionUser, reportId: string, input: WithdrawalInput) {
  const { data, error } = await getServiceDatabase().rpc('admin_withdraw_publication', {
    p_report_id: reportId, p_actor_id: actor.id, p_expected_revision: input.expectedRevision, p_note: input.note,
  })
  if (error) throwAdminDatabaseError(error)
  return afterMutation(reportId, data)
}

export async function correctCategory(actor: SessionUser, reportId: string, input: CategoryCorrectionInput) {
  const { data, error } = await getServiceDatabase().rpc('admin_set_officer_category', {
    p_report_id: reportId, p_actor_id: actor.id, p_expected_revision: input.expectedRevision,
    p_category: input.category, p_note: input.note ?? null,
  })
  if (error) throwAdminDatabaseError(error)
  return afterMutation(reportId, data)
}

export async function addNote(actor: SessionUser, reportId: string, note: string) {
  const { data, error } = await getServiceDatabase().rpc('admin_add_report_note', { p_report_id: reportId, p_actor_id: actor.id, p_note: note })
  if (error) throwAdminDatabaseError(error)
  const event = z.object({ id: z.uuid(), created_at: z.string() }).passthrough().safeParse(data)
  if (!event.success) throw databaseUnavailable()
  return { note: { id: event.data.id, createdAt: event.data.created_at } }
}

/** Non-secret service state for officers. Never returns keys or URLs. */
export async function getSettings(actor: SessionUser): Promise<AdminSettingsResponse> {
  const environment = getServerEnvironment()
  let database: 'available' | 'unavailable' = 'unavailable'
  try {
    const { error } = await getServiceDatabase().from('profiles').select('id', { head: true, count: 'exact' }).eq('id', actor.id)
    if (!error) database = 'available'
  }
  catch { database = 'unavailable' }
  let model: string | null = null
  try { model = resolveGeminiModel(environment.geminiModel) }
  catch { model = null }
  return {
    account: actor,
    services: { database, ai: { configured: Boolean(environment.geminiApiKey), model: environment.geminiApiKey ? model : null } },
    scoring: { version: SCORING_VERSION },
  }
}
