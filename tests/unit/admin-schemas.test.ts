import { describe, expect, it } from 'vitest'
import {
  adminNoteSchema, analyticsFiltersSchema, categoryCorrectionSchema, publicationSchema, queueFiltersSchema,
  statusChangeSchema, withdrawalSchema,
} from '../../shared/schemas/admin'
import { logoutSchema } from '../../shared/schemas/auth'
import { allowedTransitions, auditEventLabel } from '../../shared/constants/workflow'

describe('officer action contracts', () => {
  it('requires a reporter-facing note only for rejection and information requests', () => {
    expect(statusChangeSchema.safeParse({ expectedRevision: 1, status: 'verified' }).success).toBe(true)
    expect(statusChangeSchema.parse({ expectedRevision: 1, status: 'verified', note: '   ' }).note).toBeUndefined()
    for (const status of ['rejected', 'needs_more_information']) {
      expect(statusChangeSchema.safeParse({ expectedRevision: 1, status }).success).toBe(false)
      expect(statusChangeSchema.safeParse({ expectedRevision: 1, status, note: ' abcd ' }).success).toBe(false)
      expect(statusChangeSchema.parse({ expectedRevision: 1, status, note: '  Mohon foto lebih jelas  ' }).note).toBe('Mohon foto lebih jelas')
    }
  })

  it.each([
    [{ expectedRevision: 0, status: 'verified' }],
    [{ expectedRevision: 1.5, status: 'verified' }],
    [{ expectedRevision: 1, status: 'pending_analysis' }],
    [{ expectedRevision: 1, status: 'verified', note: 'x'.repeat(2001) }],
    [{ expectedRevision: 1, status: 'verified', role: 'admin' }],
  ])('rejects invalid status changes %o', (input) => {
    expect(statusChangeSchema.safeParse(input).success).toBe(false)
  })

  it('bounds publication, withdrawal, category and note input', () => {
    expect(publicationSchema.parse({ expectedRevision: 2, publicSummary: '  Ringkasan publik.  ' }).publicSummary).toBe('Ringkasan publik.')
    expect(publicationSchema.safeParse({ expectedRevision: 2, publicSummary: 'Pendek' }).success).toBe(false)
    expect(publicationSchema.safeParse({ expectedRevision: 2, publicSummary: 'x'.repeat(501) }).success).toBe(false)
    expect(withdrawalSchema.safeParse({ expectedRevision: 2, note: 'abc' }).success).toBe(false)
    expect(categoryCorrectionSchema.parse({ expectedRevision: 2, category: null }).category).toBeNull()
    expect(categoryCorrectionSchema.safeParse({ expectedRevision: 2, category: 'deforestation' }).success).toBe(false)
    expect(adminNoteSchema.safeParse({ note: 'abcd' }).success).toBe(false)
    expect(adminNoteSchema.parse({ note: '  Koordinasi patroli  ' }).note).toBe('Koordinasi patroli')
  })

  it('defaults and validates queue and analytics filters', () => {
    expect(queueFiltersSchema.parse({ category: '', priority: '' })).toEqual({ scope: 'active', dataset: 'all', page: 1 })
    expect(queueFiltersSchema.parse({ scope: 'pending_verification', page: '3' })).toMatchObject({ scope: 'pending_verification', page: 3 })
    expect(queueFiltersSchema.safeParse({ scope: 'bogus' }).success).toBe(false)
    expect(queueFiltersSchema.safeParse({ unexpected: '1' }).success).toBe(false)
    expect(analyticsFiltersSchema.parse({})).toEqual({ days: 30, dataset: 'real' })
    expect(analyticsFiltersSchema.parse({ days: '90', dataset: 'simulation' })).toEqual({ days: 90, dataset: 'simulation' })
    expect(analyticsFiltersSchema.safeParse({ days: '12' }).success).toBe(false)
    expect(analyticsFiltersSchema.safeParse({ dataset: 'all' }).success).toBe(false)
  })

  it('signs out locally unless every device is requested', () => {
    expect(logoutSchema.parse({})).toEqual({ scope: 'local' })
    expect(logoutSchema.parse({ scope: 'global' })).toEqual({ scope: 'global' })
    expect(logoutSchema.safeParse({ scope: 'others' }).success).toBe(false)
  })

  it('labels workflow events and exposes only allowed transitions', () => {
    expect(allowedTransitions('pending_verification')).toEqual(['verified', 'rejected', 'needs_more_information'])
    expect(allowedTransitions('resolved')).toEqual([])
    expect(allowedTransitions('rejected')).toEqual([])
    expect(auditEventLabel('status_changed', 'verified')).toBe('Status: Terverifikasi')
    expect(auditEventLabel('admin_note', 'verified')).toBe('Catatan internal petugas')
    expect(auditEventLabel('ai_analysis_failed', 'analysis_failed')).toBe('Percobaan analisis AI gagal')
  })
})
