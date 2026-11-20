import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '../../shared/types/domain'
import type { ReportRow } from '../../shared/types/database'
import { DEFAULT_GEMINI_MODEL } from '../../server/services/ai/threat-analysis'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), refreshOne: vi.fn(), environment: vi.fn() }))
vi.mock('../../server/utils/supabase', () => ({ getServiceDatabase: () => ({ rpc: mocks.rpc, from: mocks.from }), getUserDatabase: vi.fn() }))
vi.mock('../../server/utils/config', () => ({ getServerEnvironment: mocks.environment }))
vi.mock('../../server/services/threat-priority', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/services/threat-priority')>(),
  refreshPriorities: mocks.refresh, refreshReportPriority: mocks.refreshOne,
}))
import {
  addNote, changeStatus, correctCategory, getAnalytics, getDashboard, getSettings, listQueue, publishReport, throwAdminDatabaseError,
} from '../../server/services/admin-service'

const officer: SessionUser = { id: '93000000-0000-4000-8000-000000000001', email: 'officer@example.invalid', fullName: 'Unit officer', role: 'admin' }
const reportId = '93000000-0000-4000-8000-000000000002'
const row: ReportRow = {
  id: reportId, report_code: 'RG-UNIT', user_id: '93000000-0000-4000-8000-000000000003', title: '[UNIT] Laporan', category: 'forest_fire',
  officer_category: null, description: 'Fixture unit terisolasi.', image_path: 'x/sealed/y.jpg', latitude: -3, longitude: 102,
  location_name: null, incident_time: '2026-11-15T00:00:00Z', status: 'verified', idempotency_key: 'k', revision: 3,
  priority_dirty: true, priority_recalculate_at: null, is_simulation: false, is_public: false, public_summary: null,
  published_by: null, published_at: null, created_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T00:00:00Z',
}
const analytics = {
  summary: { total: 3, pendingVerification: 1, analysisFailed: 0, needsMoreInformation: 0, highPriority: 1, verified: 1, inProgress: 0, resolved: 1, rejected: 0 },
  rangeTotal: 2,
  statusCounts: ['pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information', 'verified', 'rejected', 'in_progress', 'resolved'].map(status => ({ status, count: 0 })),
  categoryCounts: ['illegal_logging_suspected', 'forest_fire', 'land_clearing', 'suspicious_human_activity', 'other_environmental_threat'].map(category => ({ category, count: 0 })),
  daily: [{ date: '2026-11-15', count: 2 }],
  range: { from: '2026-10-17', to: '2026-11-15', days: 30, timezone: 'Asia/Jakarta', dataset: 'real' },
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.refresh.mockResolvedValue({ status: 'fresh', refreshed: 0, remaining: 0 })
  mocks.refreshOne.mockResolvedValue({ status: 'fresh', refreshed: 1, remaining: 0 })
  mocks.environment.mockReturnValue({ geminiApiKey: 'unit-secret-key-not-real', geminiModel: '' })
})

describe('officer actions', () => {
  it('sends the verified actor and expected revision, then refreshes the score', async () => {
    mocks.rpc.mockResolvedValue({ data: row, error: null })
    const result = await changeStatus(officer, reportId, { expectedRevision: 2, status: 'verified', note: undefined })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_change_report_status', { p_report_id: reportId, p_actor_id: officer.id, p_expected_revision: 2, p_new_status: 'verified', p_note: null })
    expect(mocks.refreshOne).toHaveBeenCalledWith(reportId)
    expect(result.report).toMatchObject({ id: reportId, revision: 3, status: 'verified' })
  })

  it('passes publication and category input unchanged to the database', async () => {
    mocks.rpc.mockResolvedValue({ data: row, error: null })
    await publishReport(officer, reportId, { expectedRevision: 3, publicSummary: 'Ringkasan publik.' })
    expect(mocks.rpc).toHaveBeenLastCalledWith('admin_publish_report', { p_report_id: reportId, p_actor_id: officer.id, p_expected_revision: 3, p_public_summary: 'Ringkasan publik.' })
    await correctCategory(officer, reportId, { expectedRevision: 3, category: null, note: undefined })
    expect(mocks.rpc).toHaveBeenLastCalledWith('admin_set_officer_category', { p_report_id: reportId, p_actor_id: officer.id, p_expected_revision: 3, p_category: null, p_note: null })
  })

  it('rejects a response for a different report', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...row, id: '93000000-0000-4000-8000-000000000009' }, error: null })
    await expect(changeStatus(officer, reportId, { expectedRevision: 2, status: 'verified', note: undefined })).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.refreshOne).not.toHaveBeenCalled()
  })

  it('stores an internal note without refreshing scores', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: '93000000-0000-4000-8000-000000000004', created_at: '2026-11-15T01:00:00Z', note: 'x' }, error: null })
    await expect(addNote(officer, reportId, 'Koordinasi patroli')).resolves.toEqual({ note: { id: '93000000-0000-4000-8000-000000000004', createdAt: '2026-11-15T01:00:00Z' } })
    expect(mocks.refreshOne).not.toHaveBeenCalled()
  })
})

describe('database outcome mapping', () => {
  it.each([
    [{ code: '23514', message: 'invalid_status_transition' }, 422, 'INVALID_TRANSITION'],
    [{ code: '23514', message: 'verification_note_required' }, 422, 'NOTE_REQUIRED'],
    [{ code: '23514', message: 'simulation_not_publishable' }, 422, 'SIMULATION_NOT_PUBLISHABLE'],
    [{ code: '23514', message: 'publication_not_eligible' }, 422, 'PUBLICATION_NOT_ELIGIBLE'],
    [{ code: '23514', message: 'report_not_public' }, 409, 'REPORT_NOT_PUBLIC'],
    [{ code: '23514', message: 'category_unchanged' }, 409, 'CATEGORY_UNCHANGED'],
    [{ code: 'PT409', message: 'report_revision_conflict' }, 409, 'REPORT_CONFLICT'],
    [{ code: '42501', message: 'admin_required' }, 403, 'ADMIN_REQUIRED'],
    [{ code: 'P0002', message: 'report_not_found' }, 404, 'REPORT_NOT_FOUND'],
    [{ code: 'PGRST202', message: 'Could not find the function' }, 503, 'ADMIN_SCHEMA_UNAVAILABLE'],
    [{ code: '22023', message: 'invalid_publication' }, 422, 'VALIDATION_FAILED'],
    [{ code: 'XX000', message: 'private internal detail' }, 503, 'DATABASE_UNAVAILABLE'],
  ])('maps %o to %i %s without exposing database text', (error, statusCode, code) => {
    let thrown: { statusCode?: number; statusMessage?: string; message?: string } | undefined
    try { throwAdminDatabaseError(error) }
    catch (caught) { thrown = caught as typeof thrown }
    expect(thrown).toMatchObject({ statusCode, statusMessage: code })
    expect(thrown?.message).not.toContain(error.message)
  })
})

describe('officer reads', () => {
  it('validates analytics and rejects an unexpected shape', async () => {
    mocks.rpc.mockResolvedValue({ data: analytics, error: null })
    await expect(getAnalytics(officer, { days: 30, dataset: 'real' })).resolves.toMatchObject({ summary: { total: 3 }, rangeTotal: 2 })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_analytics', { p_actor_id: officer.id, p_dataset: 'real', p_days: 30 })
    mocks.rpc.mockResolvedValue({ data: { ...analytics, statusCounts: [] }, error: null })
    await expect(getAnalytics(officer, { days: 30, dataset: 'real' })).rejects.toMatchObject({ statusCode: 503 })
  })

  it('refreshes stale scores before reading the queue and pages it', async () => {
    mocks.rpc.mockResolvedValue({ data: { total: 41, reports: [] }, error: null })
    const result = await listQueue(officer, { scope: 'active', dataset: 'all', page: 3 })
    expect(mocks.refresh).toHaveBeenCalledWith({ limit: 200 })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_report_queue', { p_actor_id: officer.id, p_scope: 'active', p_category: null, p_priority: null, p_dataset: 'all', p_limit: 20, p_offset: 40 })
    expect(result).toMatchObject({ total: 41, page: 3, pageSize: 20 })
  })

  it('builds the dashboard from 30-day analytics and the top five active reports', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'admin_analytics'
      ? { data: analytics, error: null } : { data: { total: 7, reports: [] }, error: null })
    const result = await getDashboard(officer, 'simulation')
    expect(mocks.rpc).toHaveBeenCalledWith('admin_analytics', { p_actor_id: officer.id, p_dataset: 'simulation', p_days: 30 })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_report_queue', expect.objectContaining({ p_scope: 'active', p_dataset: 'simulation', p_limit: 5, p_offset: 0 }))
    expect(result.queueTotal).toBe(7)
  })

  it('reports service state without ever returning credentials', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    mocks.from.mockReturnValue({ select: () => ({ eq }) })
    const settings = await getSettings(officer)
    expect(settings).toEqual({ account: officer, services: { database: 'available', ai: { configured: true, model: DEFAULT_GEMINI_MODEL } }, scoring: { version: 'rimbaguard-priority-v1' } })
    expect(JSON.stringify(settings)).not.toContain('unit-secret-key-not-real')
  })
})
