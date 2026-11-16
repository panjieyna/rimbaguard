import type { H3Event } from 'h3'
import type { CreateReportInput, SessionUser } from '../../shared/types/domain'
import { PUBLISHABLE_STATUSES, allowedTransitions } from '../../shared/constants/workflow'
import { reviewerMessageFor, toTimeline } from '../utils/report-timeline'
import type { ReportRow } from '../../shared/types/database'
import type { ReportDetailResponse, ReportSummary } from '../../shared/types/report-api'
import { getServiceDatabase, getUserDatabase } from '../utils/supabase'
import { apiError, databaseUnavailable } from '../utils/response'
import { throwReportDatabaseError } from '../utils/report-errors'
import { ANALYSIS_COLUMNS, toReportAnalysis } from '../utils/analysis-result'
import { refreshPriorities } from './threat-priority'

const SUMMARY_COLUMNS = 'id,report_code,title,category,location_name,latitude,longitude,incident_time,status,revision,is_simulation,is_public,created_at,updated_at' as const
type SummaryRow = Pick<ReportRow, 'id' | 'report_code' | 'title' | 'category' | 'location_name' | 'latitude' | 'longitude' | 'incident_time' | 'status' | 'revision' | 'is_simulation' | 'is_public' | 'created_at' | 'updated_at'>

export function toReportSummary(row: SummaryRow): ReportSummary {
  return {
    id: row.id, reportCode: row.report_code, title: row.title, category: row.category,
    locationName: row.location_name, latitude: Number(row.latitude), longitude: Number(row.longitude),
    incidentTime: row.incident_time, status: row.status, revision: row.revision,
    isSimulation: row.is_simulation, isPublic: row.is_public, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export async function listReports(event: H3Event, user: SessionUser, page: number, pageSize: number) {
  let query = getUserDatabase(event).from('reports').select(SUMMARY_COLUMNS, { count: 'exact' })
  if (user.role !== 'admin') query = query.eq('user_id', user.id)
  const { data, error, count } = await query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throwReportDatabaseError(error)
  if (!Array.isArray(data) || typeof count !== 'number') throw databaseUnavailable()
  return { reports: data.map(toReportSummary), total: count, page, pageSize }
}

export async function getPermittedReport(event: H3Event, user: SessionUser, id: string) {
  let query = getUserDatabase(event).from('reports').select('*').eq('id', id)
  if (user.role !== 'admin') query = query.eq('user_id', user.id)
  const { data, error } = await query.maybeSingle()
  if (error) throwReportDatabaseError(error)
  if (!data) throw apiError(404, 'REPORT_NOT_FOUND', 'Laporan tidak ditemukan atau tidak dapat diakses.')
  return data
}

const PRIORITY_COLUMNS = 'id,report_revision,total_score,priority_level,effective_category,category_source,threat_severity,evidence_completeness,recency_score,nearby_reports_score,nearby_reports_count,explanation,scoring_version,calculated_at' as const

export async function getReportDetail(event: H3Event, user: SessionUser, id: string): Promise<ReportDetailResponse> {
  // Officers see priority, so freshen this report (and affected neighbors) first.
  const canViewPriority = user.role === 'admin'
  const refresh = canViewPriority ? await refreshPriorities({ reportIds: [id], limit: 10, wait: true }) : null
  const report = await getPermittedReport(event, user, id)
  const database = getUserDatabase(event)
  const service = getServiceDatabase()
  const [analyses, priorities, updates, content, image] = await Promise.all([
    database.from('ai_analyses').select(ANALYSIS_COLUMNS).eq('report_id', id).order('created_at', { ascending: false }).limit(20),
    canViewPriority
      ? database.from('threat_priorities').select(PRIORITY_COLUMNS).eq('report_id', id).order('calculated_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    service.from('report_updates').select('id,action,actor_type,actor_id,previous_status,new_status,note,created_at').eq('report_id', id).order('created_at', { ascending: false }).limit(100),
    // Officer decisions also increment revision; AI output describes content.
    service.from('report_updates').select('report_revision').eq('report_id', id).in('action', ['report_created', 'report_corrected'])
      .order('report_revision', { ascending: false }).limit(1).maybeSingle(),
    service.storage.from('report-evidence').createSignedUrl(report.image_path, 300),
  ])
  for (const result of [analyses, priorities, updates, content]) if (result.error) throwReportDatabaseError(result.error)
  if (image.error || !image.data?.signedUrl) throw apiError(503, 'EVIDENCE_UNAVAILABLE', 'Foto bukti belum dapat dimuat. Muat ulang untuk mencoba lagi.')
  const priorityRows = priorities.data ?? []
  const recalculateAt = report.priority_recalculate_at ? Date.parse(report.priority_recalculate_at) : null
  const isOfficer = user.role === 'admin'
  const events = (updates.data ?? []).reverse()
  const actorNames = isOfficer ? await officerNames(events.map(row => row.actor_id)) : new Map<string, string>()
  return {
    report: {
      ...toReportSummary(report), description: report.description, evidencePath: report.image_path,
      contentRevision: content.data?.report_revision ?? 1,
    },
    canEdit: report.user_id === user.id && ['pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information'].includes(report.status),
    canAnalyze: user.role === 'admin' || (report.user_id === user.id && ['pending_analysis', 'analysis_failed'].includes(report.status)),
    canForceAnalysis: user.role === 'admin',
    evidenceUrl: image.data.signedUrl,
    analyses: (analyses.data ?? []).map(toReportAnalysis),
    priorities: priorityRows.map(row => ({
      id: row.id, reportRevision: row.report_revision, totalScore: Number(row.total_score), priorityLevel: row.priority_level,
      effectiveCategory: row.effective_category, categorySource: row.category_source,
      threatSeverity: Number(row.threat_severity), evidenceCompleteness: Number(row.evidence_completeness), recencyScore: Number(row.recency_score),
      nearbyReportsScore: Number(row.nearby_reports_score), nearbyReportsCount: row.nearby_reports_count,
      explanation: row.explanation, scoringVersion: row.scoring_version, calculatedAt: row.calculated_at,
    })),
    priorityStatus: refresh ? {
      stale: report.priority_dirty || (recalculateAt !== null && recalculateAt < Date.now()) || priorityRows[0]?.report_revision !== report.revision,
      refresh: refresh.status,
    } : null,
    // Reporters never see internal events or internal notes (report-timeline.ts).
    updates: toTimeline(events, isOfficer, actorNames),
    reviewerMessage: reviewerMessageFor(events, report.status),
    review: isOfficer ? {
      officerCategory: report.officer_category,
      publicSummary: report.public_summary,
      publishedAt: report.is_public ? report.published_at : null,
      allowedTransitions: [...allowedTransitions(report.status)],
      publication: report.is_simulation ? 'simulation' : PUBLISHABLE_STATUSES.includes(report.status) ? 'available' : 'status',
    } : null,
  }
}

/** Officer display names for the internal audit trail. */
async function officerNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unique.length) return new Map()
  const { data, error } = await getServiceDatabase().from('profiles').select('id,full_name,role').in('id', unique)
  if (error || !data) return new Map()
  return new Map(data.map(row => [row.id, row.full_name || (row.role === 'admin' ? 'Petugas' : 'Pelapor')]))
}

export async function createReport(user: SessionUser, input: CreateReportInput, idempotencyKey: string) {
  const database = getServiceDatabase()
  const previous = await database.from('reports').select('id').eq('user_id', user.id).eq('idempotency_key', idempotencyKey).maybeSingle()
  if (previous.error) throwReportDatabaseError(previous.error)
  const { data, error } = await database.rpc('create_report', {
    p_actor_id: user.id, p_idempotency_key: idempotencyKey, p_payload: { ...input },
    // Only the server operator can designate a controlled test account. The
    // strict client payload never accepts simulation/status/role fields.
    p_is_simulation: process.env.RIMBAGUARD_TEST_USER_ID === user.id,
  })
  if (error) throwReportDatabaseError(error)
  if (!data) throw apiError(503, 'REPORT_SAVE_FAILED', 'Laporan belum dapat disimpan. Coba lagi menggunakan pengiriman yang sama.')
  return { report: toReportSummary(data), idempotentReplay: Boolean(previous.data) }
}

export async function updateReport(user: SessionUser, id: string, expectedRevision: number, input: CreateReportInput) {
  const { data, error } = await getServiceDatabase().rpc('update_owned_report', {
    p_actor_id: user.id, p_report_id: id, p_expected_revision: expectedRevision, p_payload: { ...input },
  })
  if (error) throwReportDatabaseError(error)
  if (!data) throw apiError(503, 'REPORT_SAVE_FAILED', 'Perubahan laporan belum dapat disimpan.')
  return { report: toReportSummary(data) }
}
