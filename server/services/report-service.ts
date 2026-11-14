import type { H3Event } from 'h3'
import type { CreateReportInput, SessionUser } from '../../shared/types/domain'
import type { ReportRow } from '../../shared/types/database'
import type { ReportDetailResponse, ReportSummary } from '../../shared/types/report-api'
import { getServiceDatabase, getUserDatabase } from '../utils/supabase'
import { apiError, databaseUnavailable } from '../utils/response'
import { throwReportDatabaseError } from '../utils/report-errors'

const SUMMARY_COLUMNS = 'id,report_code,title,category,location_name,latitude,longitude,incident_time,status,revision,is_simulation,is_public,created_at,updated_at' as const
const ANALYSIS_COLUMNS = 'id,report_revision,analysis_status,detected_category,detected_indicators,visual_observation,reasoning_summary,confidence,risk_level,recommendation,needs_human_verification,model_name,error_code,created_at' as const
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

export async function getReportDetail(event: H3Event, user: SessionUser, id: string): Promise<ReportDetailResponse> {
  const report = await getPermittedReport(event, user, id)
  const database = getUserDatabase(event)
  const service = getServiceDatabase()
  const results = await Promise.all([
    database.from('ai_analyses').select(ANALYSIS_COLUMNS).eq('report_id', id).order('created_at', { ascending: false }).limit(20),
    database.from('threat_priorities').select('*').eq('report_id', id).order('calculated_at', { ascending: false }).limit(20),
    service.from('report_updates').select('id,action,actor_type,previous_status,new_status,note,created_at').eq('report_id', id).order('created_at', { ascending: false }).limit(100),
    service.storage.from('report-evidence').createSignedUrl(report.image_path, 300),
  ])
  for (const result of results.slice(0, 3)) if (result.error) throwReportDatabaseError(result.error)
  const [analyses, priorities, updates, image] = results
  if (image.error || !image.data?.signedUrl) throw apiError(503, 'EVIDENCE_UNAVAILABLE', 'Foto bukti belum dapat dimuat. Muat ulang untuk mencoba lagi.')
  return {
    report: { ...toReportSummary(report), description: report.description, evidencePath: report.image_path },
    canEdit: report.user_id === user.id && ['pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information'].includes(report.status),
    evidenceUrl: image.data.signedUrl,
    analyses: (analyses.data ?? []).map(row => ({
      id: row.id, reportRevision: row.report_revision, analysisStatus: row.analysis_status, category: row.detected_category,
      detectedIndicators: Array.isArray(row.detected_indicators) ? row.detected_indicators.filter((value): value is string => typeof value === 'string') : [],
      visualObservation: row.visual_observation, reasoningSummary: row.reasoning_summary, confidence: row.confidence,
      riskLevel: row.risk_level, recommendation: row.recommendation, needsHumanVerification: row.needs_human_verification,
      modelName: row.model_name, errorCode: row.error_code, createdAt: row.created_at,
    })),
    priorities: (priorities.data ?? []).map(row => ({
      id: row.id, reportRevision: row.report_revision, totalScore: row.total_score, priorityLevel: row.priority_level,
      threatSeverity: row.threat_severity, evidenceCompleteness: row.evidence_completeness, recencyScore: row.recency_score,
      nearbyReportsScore: row.nearby_reports_score, explanation: row.explanation, scoringVersion: row.scoring_version, calculatedAt: row.calculated_at,
    })),
    updates: (updates.data ?? []).reverse().map(row => ({
      id: row.id, action: row.action, actorType: row.actor_type, previousStatus: row.previous_status, newStatus: row.new_status,
      note: user.role === 'admin' || row.actor_type === 'user' || row.new_status === 'needs_more_information' ? row.note : null, createdAt: row.created_at,
    })),
  }
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
