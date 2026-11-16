import type { AiAnalysisRow } from '../../shared/types/database'
import type { ReportAnalysis } from '../../shared/types/report-api'

export const ANALYSIS_COLUMNS = 'id,report_revision,analysis_status,detected_category,detected_indicators,visual_observation,reasoning_summary,confidence,risk_level,recommendation,needs_human_verification,model_name,prompt_version,error_code,processing_expires_at,completed_at,created_at' as const

/** Both RPC records and owner-scoped SELECTs cross the same safe boundary. */
export function toReportAnalysis(row: Omit<AiAnalysisRow, 'raw_response' | 'report_id'>): ReportAnalysis {
  return {
    id: row.id, reportRevision: row.report_revision, analysisStatus: row.analysis_status,
    category: row.detected_category,
    detectedIndicators: Array.isArray(row.detected_indicators) ? row.detected_indicators.filter((value): value is string => typeof value === 'string') : [],
    visualObservation: row.visual_observation, reasoningSummary: row.reasoning_summary,
    confidence: row.confidence, riskLevel: row.risk_level, recommendation: row.recommendation,
    needsHumanVerification: row.needs_human_verification, modelName: row.model_name,
    promptVersion: row.prompt_version, errorCode: row.error_code,
    processingExpiresAt: row.processing_expires_at, completedAt: row.completed_at, createdAt: row.created_at,
  }
}
