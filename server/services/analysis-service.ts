import type { H3Event } from 'h3'
import type { SessionUser } from '../../shared/types/domain'
import type { AnalysisRequest } from '../../shared/schemas/analysis-request'
import type { AnalyzeReportResponse } from '../../shared/types/report-api'
import type { AiAnalysisRow } from '../../shared/types/database'
import { MAX_EVIDENCE_BYTES } from '../../shared/constants/domain'
import { analysisFailureMessage, type AiFailureCode } from '../../shared/constants/analysis'
import { getPermittedReport } from './report-service'
import { analyzeThreat, DEFAULT_GEMINI_MODEL, PROMPT_VERSION, ThreatAnalysisError, resolveGeminiModel } from './ai/threat-analysis'
import { getServiceDatabase } from '../utils/supabase'
import { getServerEnvironment } from '../utils/config'
import { enforceRateLimit } from '../utils/rate-limit'
import { toReportAnalysis } from '../utils/analysis-result'
import { apiError, databaseUnavailable } from '../utils/response'

function analysisDatabaseError(error: { code?: string }): never {
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'].includes(error.code || '')) {
    throw apiError(503, 'AI_SCHEMA_UNAVAILABLE', 'Penyimpanan analisis belum tersedia. Laporan tetap tersimpan.')
  }
  if (error.code === '42501') throw apiError(403, 'AI_FORBIDDEN', 'Anda tidak memiliki izin untuk menganalisis laporan ini.')
  if (error.code === 'P0002') throw apiError(404, 'REPORT_NOT_FOUND', 'Laporan atau analisis tidak ditemukan.')
  if (['PT409', '40001'].includes(error.code || '')) throw apiError(409, 'AI_CONFLICT', 'Informasi atau proses analisis telah berubah. Muat ulang lalu coba lagi.')
  if (['22023', '23514'].includes(error.code || '')) throw apiError(422, 'AI_REQUEST_INVALID', 'Analisis belum dapat dimulai pada keadaan laporan ini.')
  throw databaseUnavailable()
}

function terminalResponse(result: { analysis: AiAnalysisRow; accepted: boolean; reason: string | null }, reused: boolean): AnalyzeReportResponse {
  if (!result.accepted) {
    if (result.reason === 'AI_INTERRUPTED' || result.reason === 'AI_STALE_REPORT') {
      throw apiError(409, result.reason, analysisFailureMessage(result.reason))
    }
    throw apiError(409, 'AI_CONFLICT', 'Percobaan analisis sudah selesai atau berubah. Muat ulang untuk memeriksa hasil tersimpannya.')
  }
  return { analysis: toReportAnalysis(result.analysis), reused }
}

export async function analyzeReport(event: H3Event, user: SessionUser, reportId: string, request: AnalysisRequest): Promise<AnalyzeReportResponse> {
  const report = await getPermittedReport(event, user, reportId)
  if (request.force && user.role !== 'admin') throw apiError(403, 'AI_FORBIDDEN', 'Analisis ulang hanya tersedia bagi petugas.')
  await enforceRateLimit(event, 'analysis-user', user.id, 10, 600)
  await enforceRateLimit(event, 'analysis-report', report.id, 3, 600)
  const environment = getServerEnvironment()
  let modelName = DEFAULT_GEMINI_MODEL
  try { modelName = resolveGeminiModel(environment.geminiModel) }
  catch { modelName = 'unconfigured' } // Never persist an invalid config string as public metadata.
  const database = getServiceDatabase()
  const claim = await database.rpc('claim_report_analysis', {
    p_report_id: report.id, p_actor_id: user.id, p_expected_revision: request.expectedRevision,
    p_model_name: modelName, p_prompt_version: PROMPT_VERSION, p_force: request.force,
  })
  if (claim.error) analysisDatabaseError(claim.error)
  if (!claim.data?.analysis) throw databaseUnavailable()
  if (!claim.data.claimed) return { analysis: toReportAnalysis(claim.data.analysis), reused: true }
  const attempt = claim.data.analysis

  let output
  try {
    if (!environment.geminiApiKey) throw new ThreatAnalysisError('AI_NOT_CONFIGURED')
    const evidence = await database.storage.from('report-evidence').download(report.image_path)
    if (evidence.error || !evidence.data || evidence.data.size === 0 || evidence.data.size > MAX_EVIDENCE_BYTES) {
      throw new ThreatAnalysisError('AI_EVIDENCE_UNAVAILABLE')
    }
    output = await analyzeThreat({
      image: new Uint8Array(await evidence.data.arrayBuffer()), mimeType: 'image/jpeg',
      title: report.title, description: report.description, userCategory: report.category,
    }, { apiKey: environment.geminiApiKey, model: environment.geminiModel })
  }
  catch (error) {
    const code: AiFailureCode = error instanceof ThreatAnalysisError ? error.code : 'AI_PROVIDER_UNAVAILABLE'
    const failed = await database.rpc('fail_report_analysis', { p_analysis_id: attempt.id, p_actor_id: user.id, p_error_code: code })
    if (failed.error) analysisDatabaseError(failed.error)
    if (!failed.data?.analysis) throw apiError(503, 'AI_SAVE_FAILED', 'Laporan tetap tersimpan; hasil percobaan analisis belum dapat dikonfirmasi. Muat ulang untuk memeriksanya.')
    return terminalResponse(failed.data, false)
  }

  // Do not convert an uncertain completion into a fabricated provider failure.
  // A committed result can still be recovered by reloading after a network loss.
  const completed = await database.rpc('complete_report_analysis', { p_analysis_id: attempt.id, p_actor_id: user.id, p_output: output.output })
  if (completed.error) analysisDatabaseError(completed.error)
  if (!completed.data?.analysis) throw apiError(503, 'AI_SAVE_FAILED', 'Laporan tetap tersimpan; hasil analisis belum dapat dikonfirmasi. Muat ulang untuk memeriksanya.')
  return terminalResponse(completed.data, false)
}
