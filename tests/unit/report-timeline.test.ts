import { describe, expect, it } from 'vitest'
import { reporterMayReadNote, reviewerMessageFor, toTimeline, type AuditRow } from '../../server/utils/report-timeline'

const officer = '91000000-0000-4000-8000-000000000001'
const owner = '91000000-0000-4000-8000-000000000002'
let sequence = 0
function event(action: string, newStatus: AuditRow['new_status'], note: string | null, actorType: AuditRow['actor_type'] = 'admin'): AuditRow {
  sequence++
  return {
    id: `92000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, action, actor_type: actorType,
    actor_id: actorType === 'system' ? null : actorType === 'admin' ? officer : owner,
    previous_status: null, new_status: newStatus, note, created_at: `2026-11-15T0${sequence % 10}:00:00Z`,
  }
}

const history: AuditRow[] = [
  event('report_created', 'pending_analysis', null, 'user'),
  event('ai_analysis_failed', 'analysis_failed', 'AI_TIMEOUT', 'system'),
  event('admin_note', 'analysis_failed', 'Internal: cek dengan patroli sektor 3.'),
  event('status_changed', 'needs_more_information', 'Mohon lampirkan foto yang lebih dekat.'),
  event('report_corrected', 'pending_analysis', null, 'user'),
  event('status_changed', 'verified', 'Internal: cocok dengan laporan patroli.'),
  event('officer_category_changed', 'verified', 'Kategori petugas: kebakaran hutan · alasan internal'),
  event('report_published', 'verified', 'Ringkasan publik yang disetujui.'),
  event('publication_withdrawn', 'verified', 'Internal: koordinat perlu dicek.'),
]

describe('reporter-facing audit projection', () => {
  it('removes internal events and keeps only notes addressed to the reporter', () => {
    const timeline = toTimeline(history, false)
    expect(timeline.some(item => item.action === 'admin_note')).toBe(false)
    const notes = timeline.filter(item => item.note).map(item => item.note)
    expect(notes).toEqual(['Mohon lampirkan foto yang lebih dekat.', 'Ringkasan publik yang disetujui.'])
    expect(JSON.stringify(timeline)).not.toContain('Internal')
    expect(JSON.stringify(timeline)).not.toContain('AI_TIMEOUT')
    expect(timeline.every(item => item.actorName === null)).toBe(true)
  })

  it('shows officers every event, note and officer name', () => {
    const timeline = toTimeline(history, true, new Map([[officer, 'Petugas Uji']]))
    expect(timeline).toHaveLength(history.length)
    expect(timeline.filter(item => item.note)).toHaveLength(7)
    expect(timeline.find(item => item.action === 'admin_note')?.actorName).toBe('Petugas Uji')
    expect(timeline.find(item => item.action === 'report_created')?.actorName).toBeNull()
  })

  it.each([
    ['status_changed', 'rejected', 'admin', true],
    ['status_changed', 'needs_more_information', 'admin', true],
    ['status_changed', 'verified', 'admin', false],
    ['status_changed', 'resolved', 'admin', false],
    ['admin_note', 'needs_more_information', 'admin', false],
    ['publication_withdrawn', 'verified', 'admin', false],
    ['officer_category_changed', 'verified', 'admin', false],
    ['ai_analysis_failed', 'analysis_failed', 'system', false],
    ['report_published', 'verified', 'admin', true],
  ] as const)('%s to %s by %s: reporter may read note = %s', (action, status, actorType, expected) => {
    expect(reporterMayReadNote({ action, new_status: status, actor_type: actorType })).toBe(expected)
  })

  it('surfaces the latest officer message only while it still applies', () => {
    const rejected = [...history.slice(0, 1), event('status_changed', 'rejected', 'Foto bukan kawasan hutan.')]
    expect(reviewerMessageFor(rejected, 'rejected')).toMatchObject({ status: 'rejected', note: 'Foto bukan kawasan hutan.' })
    expect(reviewerMessageFor(history.slice(0, 4), 'needs_more_information')?.note).toBe('Mohon lampirkan foto yang lebih dekat.')
    // After the correction the request no longer applies.
    expect(reviewerMessageFor(history, 'verified')).toBeNull()
  })
})
