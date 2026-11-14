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
  errorCode: string | null
  createdAt: string
}

export interface ReportPriority {
  id: string
  reportRevision: number
  totalScore: number
  priorityLevel: PriorityLevel
  threatSeverity: number
  evidenceCompleteness: number
  recencyScore: number
  nearbyReportsScore: number
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
  createdAt: string
}

export interface ReportListResponse { reports: ReportSummary[]; total: number; page: number; pageSize: number }
export interface ReportCreatedResponse { report: ReportSummary; idempotentReplay: boolean }
export interface ReportDetailResponse {
  report: ReportDetail
  canEdit: boolean
  evidenceUrl: string
  analyses: ReportAnalysis[]
  priorities: ReportPriority[]
  updates: ReportTimelineEvent[]
}
export interface UploadAuthorizedResponse { uploadId: string; path: string; signedUrl: string; token: string }
export interface UploadFinalizedResponse { evidencePath: string }
