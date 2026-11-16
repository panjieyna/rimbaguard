import type { ReportStatus } from '../../shared/types/domain'
import type { DatabaseAuditActorType } from '../../shared/types/database'
import type { ReportTimelineEvent, ReviewerMessage } from '../../shared/types/report-api'
import { INTERNAL_AUDIT_ACTIONS, REPORTER_NOTE_STATUSES } from '../../shared/constants/workflow'

export interface AuditRow {
  id: string
  action: string
  actor_type: DatabaseAuditActorType
  actor_id: string | null
  previous_status: ReportStatus | null
  new_status: ReportStatus
  note: string | null
  created_at: string
}

/**
 * A reporter reads a note only when it is addressed to them (rejection or an
 * information request) or is the approved public summary. Internal notes,
 * withdrawal reasons, category reasons and AI failure codes stay with officers.
 */
export function reporterMayReadNote(row: Pick<AuditRow, 'action' | 'actor_type' | 'new_status'>): boolean {
  if (row.action === 'status_changed') return REPORTER_NOTE_STATUSES.includes(row.new_status)
  return row.actor_type === 'user' || row.action === 'report_published' || row.action === 'public_summary_updated'
}

/** Rows must be chronological. Internal-only events are removed for reporters. */
export function toTimeline(rows: AuditRow[], isOfficer: boolean, names: ReadonlyMap<string, string> = new Map()): ReportTimelineEvent[] {
  return rows.filter(row => isOfficer || !INTERNAL_AUDIT_ACTIONS.includes(row.action)).map(row => ({
    id: row.id, action: row.action, actorType: row.actor_type, previousStatus: row.previous_status, newStatus: row.new_status,
    note: isOfficer || reporterMayReadNote(row) ? row.note : null,
    actorName: isOfficer && row.actor_id ? names.get(row.actor_id) ?? null : null,
    createdAt: row.created_at,
  }))
}

/** The latest officer message to the reporter, only while it still applies. */
export function reviewerMessageFor(rows: AuditRow[], currentStatus: ReportStatus): ReviewerMessage | null {
  const latest = [...rows].reverse().find(row => row.action === 'status_changed' && REPORTER_NOTE_STATUSES.includes(row.new_status) && row.note)
  if (!latest?.note || latest.new_status !== currentStatus) return null
  return { status: latest.new_status, note: latest.note, createdAt: latest.created_at }
}
