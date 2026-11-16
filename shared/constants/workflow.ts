import type { ReportStatus } from '../types/domain'
import { REPORT_STATUSES, REPORT_STATUS_LABELS } from './domain'
import { AI_AUDIT_LABELS } from './analysis'

/**
 * Officer status matrix. public.admin_change_report_status (migration 001) is
 * authoritative; tests/unit/workflow-contract.test.ts keeps this copy aligned.
 */
export const ADMIN_STATUS_TRANSITIONS: Partial<Record<ReportStatus, readonly ReportStatus[]>> = {
  pending_verification: ['verified', 'rejected', 'needs_more_information'],
  analysis_failed: ['verified', 'rejected', 'needs_more_information'],
  verified: ['in_progress'],
  in_progress: ['resolved'],
}

export const ADMIN_TARGET_STATUSES = ['verified', 'rejected', 'needs_more_information', 'in_progress', 'resolved'] as const
export type AdminTargetStatus = (typeof ADMIN_TARGET_STATUSES)[number]

/** Notes for these decisions are addressed to the reporter and shown to them. */
export const REPORTER_NOTE_STATUSES: readonly ReportStatus[] = ['rejected', 'needs_more_information']

export const STATUS_ACTION_LABELS: Record<AdminTargetStatus, string> = {
  verified: 'Verifikasi laporan',
  rejected: 'Tolak laporan',
  needs_more_information: 'Minta informasi tambahan',
  in_progress: 'Tandai sedang ditindaklanjuti',
  resolved: 'Tandai selesai ditangani',
}

export const PUBLISHABLE_STATUSES: readonly ReportStatus[] = ['verified', 'in_progress', 'resolved']

export function allowedTransitions(status: ReportStatus): readonly ReportStatus[] {
  return ADMIN_STATUS_TRANSITIONS[status] ?? []
}

const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  report_created: 'Laporan dikirim',
  report_corrected: 'Informasi laporan diperbaiki pelapor',
  report_published: 'Ringkasan dipublikasikan ke peta publik',
  public_summary_updated: 'Ringkasan publik diperbarui',
  publication_withdrawn: 'Publikasi ditarik dari peta publik',
  officer_category_changed: 'Kategori dikoreksi petugas',
  admin_note: 'Catatan internal petugas',
  ...AI_AUDIT_LABELS,
}

export function auditEventLabel(action: string, newStatus: ReportStatus): string {
  if (action === 'status_changed') return `Status: ${REPORT_STATUS_LABELS[newStatus]}`
  return AUDIT_ACTION_LABELS[action] ?? REPORT_STATUS_LABELS[newStatus]
}

/** Owners never see internal officer notes or internal-only events. */
export const INTERNAL_AUDIT_ACTIONS: readonly string[] = ['admin_note']

export const QUEUE_SCOPES = ['active', 'all', ...REPORT_STATUSES] as const
export type QueueScope = (typeof QUEUE_SCOPES)[number]
export const QUEUE_SCOPE_LABELS: Record<QueueScope, string> = {
  active: 'Antrean aktif (belum selesai/ditolak)',
  all: 'Semua status',
  ...REPORT_STATUS_LABELS,
}

export const ANALYTICS_RANGES = [7, 30, 90, 365] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]
export const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  7: '7 hari terakhir',
  30: '30 hari terakhir',
  90: '90 hari terakhir',
  365: '12 bulan terakhir',
}
export const ANALYTICS_DATASETS = ['real', 'simulation'] as const
export type AnalyticsDataset = (typeof ANALYTICS_DATASETS)[number]
export const ANALYTICS_DATASET_LABELS: Record<AnalyticsDataset, string> = {
  real: 'Laporan nyata',
  simulation: 'Data simulasi',
}

/** Workflow order for the status distribution (the enum order is not the reading order). */
export const STATUS_DISPLAY_ORDER: readonly ReportStatus[] = [
  'pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information',
  'verified', 'in_progress', 'resolved', 'rejected',
]
