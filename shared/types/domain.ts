import type { z } from 'zod'
import type {
  AI_CATEGORIES,
  AI_RISK_LEVELS,
  EVIDENCE_MIME_TYPES,
  PRIORITY_LEVELS,
  PUBLIC_REPORT_STATUSES,
  REPORT_STATUSES,
  THREAT_CATEGORIES,
  USER_ROLES,
} from '../constants/domain'
import type { passwordChangeSchema, profileUpdateSchema } from '../schemas/account'
import type { threatAnalysisSchema } from '../schemas/ai'
import type { loginSchema, registerSchema } from '../schemas/auth'
import type { coordinatesSchema } from '../schemas/common'
import type { createReportSchema, uploadDeclarationSchema } from '../schemas/reports'

export type UserRole = (typeof USER_ROLES)[number]
export type ThreatCategory = (typeof THREAT_CATEGORIES)[number]
export type ReportStatus = (typeof REPORT_STATUSES)[number]
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number]
export type AiCategory = (typeof AI_CATEGORIES)[number]
export type AiRiskLevel = (typeof AI_RISK_LEVELS)[number]
export type EvidenceMimeType = (typeof EVIDENCE_MIME_TYPES)[number]

export type Coordinates = z.infer<typeof coordinatesSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type CreateReportInput = z.infer<ReturnType<typeof createReportSchema>>
export type UploadDeclaration = z.infer<typeof uploadDeclarationSchema>
export type ThreatAnalysis = z.infer<typeof threatAnalysisSchema>

/** Only safe session identity is serialized; never include access/refresh tokens. */
export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  /** Same-origin URL of the private profile photo, new for every upload; null without a photo. */
  avatarUrl?: string | null
}

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>

export interface AccountUserResponse {
  user: SessionUser
}

export interface PasswordChangeResponse {
  success: true
  /** Other devices were signed out after the change; this browser stays signed in. */
  otherSessionsSignedOut: boolean
}

export interface SessionResponse {
  user: SessionUser | null
  simulationMode?: true
}

export type FieldErrors = Record<string, string[]>

export interface ApiSuccess<T> {
  data: T
}

/** H3 serializes controlled API errors in its standard envelope. */
export interface ApiErrorResponse {
  statusCode: number
  statusMessage: string
  message: string
  data: {
    error: {
      code: string
      message: string
      fields?: FieldErrors
    }
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse

/** Admin-approved publication fields only. Exact/private report data is absent. */
export interface PublicMapReport {
  id: string
  reportCode: string
  category: ThreatCategory
  summary: string
  approximateLatitude: number
  approximateLongitude: number
  coordinatesAreApproximate: true
  incidentTime: string
  publishedAt: string
  status: (typeof PUBLIC_REPORT_STATUSES)[number]
  priority: PriorityLevel | null
}

export interface PublicStatistics {
  totalReports: number
  verifiedReports: number
  inProgressReports: number
  namedLocations: number
}
