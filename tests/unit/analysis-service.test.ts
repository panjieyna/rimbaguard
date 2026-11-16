import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { AiAnalysisRow, ReportRow } from '../../shared/types/database'
import type { SessionUser, ThreatAnalysis } from '../../shared/types/domain'
import { analysisRequestSchema } from '../../shared/schemas/analysis-request'

const mocks = vi.hoisted(() => ({
  permitted: vi.fn(), limit: vi.fn(), environment: vi.fn(), rpc: vi.fn(), download: vi.fn(), provider: vi.fn(),
}))
vi.mock('../../server/utils/config', () => ({ getServerEnvironment: mocks.environment }))
vi.mock('../../server/utils/supabase', () => ({ getServiceDatabase: () => ({ rpc: mocks.rpc, storage: { from: () => ({ download: mocks.download }) } }) }))
vi.mock('../../server/utils/rate-limit', () => ({ enforceRateLimit: mocks.limit }))
vi.mock('../../server/services/report-service', () => ({ getPermittedReport: mocks.permitted }))
vi.mock('../../server/services/ai/threat-analysis', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/services/ai/threat-analysis')>(), analyzeThreat: mocks.provider,
}))
import { analyzeReport } from '../../server/services/analysis-service'
import { ThreatAnalysisError } from '../../server/services/ai/threat-analysis'
import { toReportAnalysis } from '../../server/utils/analysis-result'

const actor: SessionUser = { id: '71000000-0000-4000-8000-000000000001', email: 'unit@example.invalid', fullName: 'Unit test', role: 'public' }
const report: ReportRow = {
  id: '72000000-0000-4000-8000-000000000001', user_id: actor.id, report_code: 'UNIT-ONLY',
  title: '[UNIT TEST] Analisis', category: 'other_environmental_threat', officer_category: null,
  description: 'Fixture pengujian terisolasi, bukan laporan lingkungan nyata.',
  image_path: `${actor.id}/sealed/73000000-0000-4000-8000-000000000001.jpg`,
  latitude: -3, longitude: 102, location_name: 'Unit fixture', incident_time: '2020-01-01T00:00:00Z',
  status: 'pending_analysis', idempotency_key: '74000000-0000-4000-8000-000000000001', revision: 1,
  priority_dirty: true, priority_recalculate_at: null, is_simulation: true, is_public: false,
  public_summary: null, published_by: null, published_at: null, created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z',
}
const attempt: AiAnalysisRow = {
  id: '75000000-0000-4000-8000-000000000001', report_id: report.id, report_revision: 1,
  analysis_status: 'processing', detected_category: null, detected_indicators: null,
  visual_observation: null, reasoning_summary: null, confidence: null, risk_level: null,
  recommendation: null, needs_human_verification: true, raw_response: null,
  model_name: 'gemini-3.5-flash', prompt_version: 'rimbaguard-threat-v1', error_code: null,
  processing_expires_at: '2030-01-01T00:00:00Z', completed_at: null, created_at: '2020-01-01T00:00:00Z',
}
const output: ThreatAnalysis = {
  category: 'uncertain', risk_level: 'uncertain', detected_indicators: [], confidence: 0.2,
  visual_observation: 'Fixture unit terisolasi.', reasoning_summary: 'Tidak ada bukti kejadian nyata.',
  recommendation: 'Memerlukan verifikasi manusia.', needs_human_verification: true,
}
const event = {} as H3Event
const request = { expectedRevision: 1, force: false }
function invoke() { return analyzeReport(event, actor, report.id, request) }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.permitted.mockResolvedValue(report)
  mocks.environment.mockReturnValue({ geminiApiKey: 'unit-fixture-not-a-real-key', geminiModel: '' })
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([255, 216, 255, 1])], { type: 'image/jpeg' }), error: null })
  mocks.provider.mockResolvedValue({ output, modelName: attempt.model_name, promptVersion: attempt.prompt_version })
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'claim_report_analysis') return { data: { analysis: attempt, claimed: true }, error: null }
    if (name === 'complete_report_analysis') return { data: { analysis: { ...attempt, analysis_status: 'succeeded', raw_response: output }, accepted: true, reason: null }, error: null }
    return { data: { analysis: { ...attempt, analysis_status: 'failed', error_code: args.p_error_code }, accepted: true, reason: null }, error: null }
  })
})

describe('authorized persisted analysis orchestration', () => {
  it('sends only authorized evidence/text and persists only validated output', async () => {
    const result = await invoke()
    expect(mocks.download).toHaveBeenCalledWith(report.image_path)
    const input = mocks.provider.mock.calls[0]![0]
    expect(Object.keys(input).sort()).toEqual(['description', 'image', 'mimeType', 'title', 'userCategory'])
    expect(input.image).toBeInstanceOf(Uint8Array)
    expect(mocks.rpc).toHaveBeenCalledWith('complete_report_analysis', { p_analysis_id: attempt.id, p_actor_id: actor.id, p_output: output })
    expect(result.analysis.analysisStatus).toBe('succeeded')
    expect(JSON.stringify(result)).not.toContain('raw_response')
    expect(JSON.stringify(result)).not.toContain('unit-fixture-not-a-real-key')
  })

  it.each(['succeeded', 'processing'] as const)('reuses %s without reading evidence or invoking a provider', async status => {
    mocks.rpc.mockResolvedValue({ data: { analysis: { ...attempt, analysis_status: status }, claimed: false }, error: null })
    const result = await invoke()
    expect(result.reused).toBe(true)
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.provider).not.toHaveBeenCalled()
  })

  it('denies public forced reanalysis before privileged mutation', async () => {
    await expect(analyzeReport(event, actor, report.id, { ...request, force: true })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not call privileged operations when ownership lookup fails', async () => {
    mocks.permitted.mockRejectedValue(new Error('safe denied fixture'))
    await expect(invoke()).rejects.toThrow('safe denied fixture')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.provider).not.toHaveBeenCalled()
  })

  it('persists missing-configuration failure without downloading private evidence', async () => {
    mocks.environment.mockReturnValue({ geminiApiKey: undefined, geminiModel: '' })
    const result = await invoke()
    expect(result.analysis.errorCode).toBe('AI_NOT_CONFIGURED')
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.provider).not.toHaveBeenCalled()
  })

  it.each(['AI_TIMEOUT', 'AI_QUOTA_EXCEEDED', 'AI_INVALID_OUTPUT'] as const)('persists %s as failure without inventing output', async code => {
    mocks.provider.mockRejectedValue(new ThreatAnalysisError(code))
    const result = await invoke()
    expect(result.analysis.analysisStatus).toBe('failed')
    expect(result.analysis.errorCode).toBe(code)
    expect(result.analysis.visualObservation).toBeNull()
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'complete_report_analysis')).toBe(false)
  })

  it('sanitizes unexpected provider failures before persistence', async () => {
    mocks.provider.mockRejectedValue(new Error('private-provider-payload'))
    const result = await invoke()
    expect(result.analysis.errorCode).toBe('AI_PROVIDER_UNAVAILABLE')
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('private-provider-payload')
  })

  it('records unreadable evidence as failure without contacting Gemini', async () => {
    mocks.download.mockResolvedValue({ data: null, error: { message: 'private-storage-detail' } })
    const result = await invoke()
    expect(result.analysis.errorCode).toBe('AI_EVIDENCE_UNAVAILABLE')
    expect(mocks.provider).not.toHaveBeenCalled()
  })

  it('returns conflict only after a stale result has been terminalized by the database', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_report_analysis'
      ? { data: { analysis: attempt, claimed: true }, error: null }
      : { data: { analysis: { ...attempt, analysis_status: 'failed', error_code: 'AI_STALE_REPORT' }, accepted: false, reason: 'AI_STALE_REPORT' }, error: null })
    await expect(invoke()).rejects.toMatchObject({ statusCode: 409, data: { error: { code: 'AI_STALE_REPORT' } } })
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'fail_report_analysis')).toBe(false)
  })

  it('does not overwrite an ambiguous completion with a failure', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_report_analysis'
      ? { data: { analysis: attempt, claimed: true }, error: null }
      : { data: null, error: { code: '' } })
    await expect(invoke()).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'fail_report_analysis')).toBe(false)
  })

  it('reports missing schema honestly before provider use', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await expect(invoke()).rejects.toMatchObject({ statusCode: 503, data: { error: { code: 'AI_SCHEMA_UNAVAILABLE' } } })
    expect(mocks.provider).not.toHaveBeenCalled()
  })

  it('uses safe metadata when an invalid model setting might contain a secret', async () => {
    mocks.environment.mockReturnValue({ geminiApiKey: 'unit-fixture-not-a-real-key', geminiModel: 'private-setting?token=fixture' })
    mocks.provider.mockRejectedValue(new ThreatAnalysisError('AI_MODEL_UNAVAILABLE'))
    await invoke()
    expect(mocks.rpc.mock.calls[0]![1].p_model_name).toBe('unconfigured')
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('private-setting')
  })
})

describe('analysis boundaries', () => {
  it('rejects client supplied identity, model and results', () => {
    expect(analysisRequestSchema.safeParse({ ...request, userId: actor.id, model: 'arbitrary', output }).success).toBe(false)
  })
  it('omits raw output, identity and report linkage from the serialized result', () => {
    const safe = toReportAnalysis({ ...attempt, raw_response: { private_fixture: true } } as AiAnalysisRow)
    expect(Object.keys(safe)).not.toContain('raw_response')
    expect(Object.keys(safe)).not.toContain('report_id')
    expect(safe.promptVersion).toBe(attempt.prompt_version)
  })
})
