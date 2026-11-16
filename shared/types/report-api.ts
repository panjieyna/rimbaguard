import type { CategorySource } from '../constants/scoring'
import type { PriorityRefreshStatus } from './map-api'
import type { AiCategory, AiRiskLevel, PriorityLevel, ReportStatus, ThreatCategory } from './domain'

export interface ReportSummary {
  id: string
  reportCode: string
  title: string
  category: ThreatCategory
  locationName: string | null
  latitude: number
  longitude: number
  incidentTime: string
  status: ReportStatus
  revision: number
  isSimulation: boolean
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface ReportDetail extends ReportSummary {
  description: string
  evidencePath: string
  /** Revision of the latest content change (creation or reporter correction).
   * Officer decisions also increment `revision`; AI results stay current
   * while `analysis.reportRevision >= contentRevision`. */
  contentRevision: number
}

export interface ReportAnalysis {
  id: string
  reportRevision: number
  analysisStatus: 'pending' | 'processing' | 'succeeded' | 'failed'
  category: AiCategory | null
  detectedIndicators: string[]
  visualObservation: string | null
  reasoningSummary: string | null
  confidence: number | null
  riskLevel: AiRiskLevel | null
  recommendation: string | null
  needsHumanVerification: boolean
  modelName: string
  promptVersion: string
  errorCode: string | null
  processingExpiresAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface ReportPriority {
  id: string
  reportRevision: number
  totalScore: number
  priorityLevel: PriorityLevel
  effectiveCategory: ThreatCategory
  categorySource: CategorySource
  threatSeverity: number
  evidenceCompleteness: number
  recencyScore: number
  nearbyReportsScore: number
  nearbyReportsCount: number
  explanation: string
  scoringVersion: string
  calculatedAt: string
}

export interface ReportTimelineEvent {
  id: string
  action: string
  actorType: 'user' | 'admin' | 'system'
  previousStatus: ReportStatus | null
  newStatus: ReportStatus
  note: string | null
  /** Officer display name, for officers only. */
  actorName: string | null
  createdAt: string
}

/** The officer's latest message addressed to the reporter (rejection or information request). */
export interface ReviewerMessage {
  status: ReportStatus
  note: string
  createdAt: string
}

/** Officer-only review state for /admin/reports/[id]. */
export interface ReportReview {
  officerCategory: ThreatCategory | null
  publicSummary: string | null
  publishedAt: string | null
  allowedTransitions: ReportStatus[]
  publication: 'available' | 'simulation' | 'status'
}

export interface ReportListResponse { reports: ReportSummary[]; total: number; page: number; pageSize: number }
export interface ReportCreatedResponse { report: ReportSummary; idempotentReplay: boolean }
export interface ReportDetailResponse {
  report: ReportDetail
  canEdit: boolean
  canAnalyze: boolean
  canForceAnalysis: boolean
  evidenceUrl: string
  analyses: ReportAnalysis[]
  /** Officer-only: nearby counts reveal other people's submissions. Empty for citizens. */
  priorities: ReportPriority[]
  priorityStatus: { stale: boolean; refresh: PriorityRefreshStatus } | null
  updates: ReportTimelineEvent[]
  reviewerMessage: ReviewerMessage | null
  review: ReportReview | null
}
export interface AnalyzeReportResponse { analysis: ReportAnalysis; reused: boolean }
export interface UploadAuthorizedResponse { uploadId: string; path: string; signedUrl: string; token: string }
export interface UploadFinalizedResponse { evidencePath: string }
