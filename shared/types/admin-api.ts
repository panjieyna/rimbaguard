import type { ReportStatus, SessionUser, ThreatCategory } from './domain'
import type { AdminMapReport, PriorityRefreshStatus } from './map-api'
import type { AnalyticsDataset, AnalyticsRange } from '../constants/workflow'

export interface AdminQueueResponse {
  reports: AdminMapReport[]
  total: number
  page: number
  pageSize: number
  refresh: { status: PriorityRefreshStatus; remaining: number | null }
}

/**
 * Statistic meanings (also in docs/API.md):
 * - summary counts the current state of every report in the dataset, all time;
 * - verified includes reports that moved on to in progress or resolved;
 * - highPriority counts active (not rejected/resolved) reports whose latest score is high;
 * - statusCounts, categoryCounts and daily cover reports submitted in the WIB range;
 * - categoryCounts use the effective category (officer, then AI, then reporter).
 */
export interface AdminAnalytics {
  summary: {
    total: number
    pendingVerification: number
    analysisFailed: number
    needsMoreInformation: number
    highPriority: number
    verified: number
    inProgress: number
    resolved: number
    rejected: number
  }
  rangeTotal: number
  statusCounts: { status: ReportStatus; count: number }[]
  categoryCounts: { category: ThreatCategory; count: number }[]
  daily: { date: string; count: number }[]
  range: { from: string; to: string; days: AnalyticsRange; timezone: 'Asia/Jakarta'; dataset: AnalyticsDataset }
}

export interface AdminDashboardResponse {
  analytics: AdminAnalytics
  queue: AdminMapReport[]
  queueTotal: number
  refresh: { status: PriorityRefreshStatus; remaining: number | null }
}

export interface AdminSettingsResponse {
  account: SessionUser
  services: {
    database: 'available' | 'unavailable'
    ai: { configured: boolean; model: string | null }
  }
  scoring: { version: string }
}
