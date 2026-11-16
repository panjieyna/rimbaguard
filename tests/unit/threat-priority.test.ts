import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '../../shared/types/domain'
import { adminMapFiltersSchema, publicMapFiltersSchema } from '../../shared/schemas/map'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), database: vi.fn() }))
vi.mock('../../server/utils/supabase', () => ({ getServiceDatabase: mocks.database }))
import { listAdminMapReports, listPublicMapReports, refreshPriorities, refreshReportPriority } from '../../server/services/threat-priority'

const officer: SessionUser = { id: '81000000-0000-4000-8000-000000000001', email: 'officer@example.invalid', fullName: 'Unit officer', role: 'admin' }
const publicItem = {
  id: '82000000-0000-4000-8000-000000000001', reportCode: 'RG-UNIT0000001', category: 'forest_fire',
  summary: 'Ringkasan publik yang telah ditinjau petugas.', approximateLatitude: -3.8, approximateLongitude: 102.27,
  coordinatesAreApproximate: true, incidentTime: '2026-11-15T01:00:00+00:00', publishedAt: '2026-11-15T02:00:00+00:00',
  status: 'verified', priority: 'high',
}
const adminItem = {
  id: '82000000-0000-4000-8000-000000000002', reportCode: 'RG-UNIT0000002', title: '[UNIT] Fixture peta petugas',
  category: 'other_environmental_threat', effectiveCategory: 'forest_fire', categorySource: 'ai', status: 'pending_verification',
  latitude: -3.812345, longitude: 102.212345, locationName: null, incidentTime: '2026-11-15T01:00:00+00:00',
  createdAt: '2026-11-15T01:05:00+00:00', isSimulation: true, isPublic: false, excerpt: 'Fixture unit terisolasi.',
  priority: { level: 'medium', totalScore: 70.5, calculatedAt: '2026-11-15T01:06:00+00:00', stale: false },
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.database.mockReturnValue({ rpc: mocks.rpc })
})

describe('bounded score refresh', () => {
  it('reports a fresh refresh and sends bounded, explicit arguments', async () => {
    mocks.rpc.mockResolvedValue({ data: { refreshed: 3, failed: 0, remaining: 0, busy: false }, error: null })
    await expect(refreshReportPriority(adminItem.id)).resolves.toEqual({ status: 'fresh', refreshed: 3, remaining: 0 })
    expect(mocks.rpc).toHaveBeenCalledWith('refresh_threat_priorities', { p_report_ids: [adminItem.id], p_limit: 25, p_wait: true })
    await refreshPriorities()
    expect(mocks.rpc).toHaveBeenLastCalledWith('refresh_threat_priorities', { p_report_ids: null, p_limit: 50, p_wait: false })
  })

  it.each([
    ['busy', { data: { refreshed: 0, failed: 0, remaining: null, busy: true }, error: null }, 'busy'],
    ['partial failure', { data: { refreshed: 2, failed: 1, remaining: 1, busy: false }, error: null }, 'failed'],
    ['database error', { data: null, error: { code: 'PGRST202' } }, 'failed'],
    ['unexpected payload', { data: { refreshed: 'many' }, error: null }, 'failed'],
  ])('never throws on %s', async (_name, response, status) => {
    mocks.rpc.mockResolvedValue(response)
    await expect(refreshPriorities({ reportIds: [adminItem.id] })).resolves.toMatchObject({ status })
  })

  it('survives a missing service configuration', async () => {
    mocks.database.mockImplementation(() => { throw new Error('not configured') })
    await expect(refreshPriorities()).resolves.toEqual({ status: 'failed', refreshed: 0, remaining: null })
  })
})

describe('public map projection', () => {
  it('passes database filters and returns only allowlisted, rounded fields', async () => {
    const leaked = { ...publicItem, approximateLatitude: -3.812345, latitude: -3.812345, title: 'private', user_id: officer.id, description: 'private' }
    mocks.rpc.mockResolvedValue({ data: { total: 1, reports: [leaked] }, error: null })
    const result = await listPublicMapReports(publicMapFiltersSchema.parse({ category: 'forest_fire', priority: 'high', status: 'verified', from: '2026-11-01', to: '2026-11-15', page: '2' }))
    expect(mocks.rpc).toHaveBeenCalledWith('public_map_reports', {
      p_category: 'forest_fire', p_priority: 'high', p_status: 'verified',
      p_from: '2026-11-01T00:00:00+07:00', p_to: '2026-11-16T00:00:00+07:00', p_report_id: null, p_limit: 500, p_offset: 500,
    })
    expect(Object.keys(result.reports[0]!).sort()).toEqual(['approximateLatitude', 'approximateLongitude', 'category', 'coordinatesAreApproximate',
      'id', 'incidentTime', 'priority', 'publishedAt', 'reportCode', 'status', 'summary'])
    expect(result.reports[0]!.approximateLatitude).toBe(-3.81)
    expect(JSON.stringify(result)).not.toContain('private')
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 500 })
  })

  it('never triggers a score calculation for anonymous readers', async () => {
    mocks.rpc.mockResolvedValue({ data: { total: 0, reports: [] }, error: null })
    await listPublicMapReports(publicMapFiltersSchema.parse({}))
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['public_map_reports'])
  })

  it.each([
    [{ total: 1, reports: [{ ...publicItem, status: 'pending_verification' }] }],
    [{ total: 1, reports: [{ ...publicItem, coordinatesAreApproximate: false }] }],
    [{ reports: [] }],
  ])('rejects a malformed or unsafe projection', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(listPublicMapReports(publicMapFiltersSchema.parse({}))).rejects.toMatchObject({ statusCode: 503 })
  })

  it('maps a missing Phase 4 schema and invalid filters to safe errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'private detail' } })
    await expect(listPublicMapReports(publicMapFiltersSchema.parse({}))).rejects.toMatchObject({ statusCode: 503, statusMessage: 'MAP_SCHEMA_UNAVAILABLE' })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '22023' } })
    await expect(listPublicMapReports(publicMapFiltersSchema.parse({}))).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('officer map projection', () => {
  it('refreshes stale scores without waiting, then reads with the verified actor', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'refresh_threat_priorities'
      ? { data: { refreshed: 1, failed: 0, remaining: 4, busy: false }, error: null }
      : { data: { total: 1, reports: [adminItem] }, error: null })
    const result = await listAdminMapReports(officer, adminMapFiltersSchema.parse({ dataset: 'simulation', priority: 'medium' }))
    expect(mocks.rpc.mock.calls[0]).toEqual(['refresh_threat_priorities', { p_report_ids: null, p_limit: 200, p_wait: false }])
    expect(mocks.rpc.mock.calls[1]).toEqual(['admin_map_reports', {
      p_actor_id: officer.id, p_category: null, p_priority: 'medium', p_status: null, p_from: null, p_to: null,
      p_dataset: 'simulation', p_limit: 500, p_offset: 0,
    }])
    expect(result.reports[0]).toEqual(adminItem)
    expect(result.refresh).toEqual({ status: 'fresh', remaining: 4 })
  })

  it('still shows the last calculations when the refresh fails', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'refresh_threat_priorities'
      ? { data: null, error: { code: '57014' } }
      : { data: { total: 1, reports: [adminItem] }, error: null })
    const result = await listAdminMapReports(officer, adminMapFiltersSchema.parse({}))
    expect(result.refresh.status).toBe('failed')
    expect(result.reports).toHaveLength(1)
  })

  it('maps a database role denial to 403', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'refresh_threat_priorities'
      ? { data: { refreshed: 0, failed: 0, remaining: 0, busy: false }, error: null }
      : { data: null, error: { code: '42501', message: 'admin_required' } })
    await expect(listAdminMapReports(officer, adminMapFiltersSchema.parse({}))).rejects.toMatchObject({ statusCode: 403 })
  })
})
