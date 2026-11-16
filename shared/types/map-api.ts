import type { CategorySource } from '../constants/scoring'
import type { PriorityLevel, PublicMapReport, ReportStatus, ThreatCategory } from './domain'

export interface MapPriority {
  level: PriorityLevel
  totalScore: number
  calculatedAt: string
  /** The report changed or a recency boundary passed after this calculation. */
  stale: boolean
}

/** Officer-only projection: exact coordinates and private/simulation records. */
export interface AdminMapReport {
  id: string
  reportCode: string
  title: string
  category: ThreatCategory
  effectiveCategory: ThreatCategory
  categorySource: CategorySource
  status: ReportStatus
  latitude: number
  longitude: number
  locationName: string | null
  incidentTime: string
  createdAt: string
  isSimulation: boolean
  isPublic: boolean
  excerpt: string
  priority: MapPriority | null
}

export type PriorityRefreshStatus = 'fresh' | 'busy' | 'failed'

export interface PriorityRefreshResult {
  status: PriorityRefreshStatus
  refreshed: number
  remaining: number | null
}

export interface AdminMapResponse {
  reports: AdminMapReport[]
  total: number
  page: number
  pageSize: number
  refresh: { status: PriorityRefreshStatus; remaining: number | null }
}

export interface PublicMapResponse {
  reports: PublicMapReport[]
  total: number
  page: number
  pageSize: number
}
