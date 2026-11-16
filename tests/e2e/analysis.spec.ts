import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { threatAnalysisSchema } from '../../shared/schemas/ai'
import type { Database } from '../../shared/types/database'

const configured = Boolean(process.env.E2E_GEMINI_LIVE === 'true' && process.env.E2E_EMAIL
  && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
test.use({ trace: 'off', screenshot: 'off' })

test('real Gemini retry persists validated output and concurrent requests reuse one attempt', async ({ page }) => {
  test.skip(!configured, 'Explicit E2E_GEMINI_LIVE=true, migration004, quota and dedicated simulation identity required.')
  test.setTimeout(150_000)
  if (existsSync('.env')) process.loadEnvFile('.env')
  const serviceUrl = process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) throw new Error('Private simulation configuration is incomplete.')
  const database = createClient<Database>(serviceUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let fixtureId = ''
  let revision = 0
  try {
    const identity = await database.auth.admin.getUserById(process.env.RIMBAGUARD_TEST_USER_ID!)
    const profile = await database.from('profiles').select('role').eq('id', process.env.RIMBAGUARD_TEST_USER_ID!).single()
    const report = await database.from('reports').select('id,revision,is_simulation,title')
      .eq('user_id', process.env.RIMBAGUARD_TEST_USER_ID!).eq('is_simulation', true)
      .eq('status', 'pending_analysis').order('created_at', { ascending: false }).limit(1).single()
    if (identity.error || profile.error || report.error || !report.data?.is_simulation
      || profile.data.role !== 'public' || identity.data.user?.user_metadata.rimbaguard_qa !== true
      || identity.data.user.email?.toLowerCase() !== process.env.E2E_EMAIL!.toLowerCase()
      || !report.data.title.includes('SIMULASI')) throw new Error('Invalid fixture')
    fixtureId = report.data.id; revision = report.data.revision
    // Persist a deliberate, labeled QA outage using the real atomic RPCs.
    // No synthetic AI output is stored. The retry below invokes Gemini itself.
    const claim = await database.rpc('claim_report_analysis', {
      p_report_id: fixtureId, p_actor_id: process.env.RIMBAGUARD_TEST_USER_ID!, p_expected_revision: revision,
      p_model_name: 'qa-provider-unavailable', p_prompt_version: 'qa-deliberate-outage-v1', p_force: false,
    })
    if (claim.error || !claim.data?.claimed) throw new Error('Unavailable lease')
    const failed = await database.rpc('fail_report_analysis', {
      p_analysis_id: claim.data.analysis.id, p_actor_id: process.env.RIMBAGUARD_TEST_USER_ID!, p_error_code: 'AI_PROVIDER_UNAVAILABLE',
    })
    if (failed.error || !failed.data?.accepted || failed.data.analysis.analysis_status !== 'failed') throw new Error('Failure not persisted')
  }
  catch { throw new Error('The isolated simulation failure fixture could not be prepared; no private detail is logged.') }

  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled()
  await page.evaluate(({ email, password }) => {
    for (const [id, value] of [['email', email], ['password', password]]) {
      const input = document.getElementById(id!) as HTMLInputElement
      input.value = value!; input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, { email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page).toHaveURL(/\/reports$/, { timeout: 30_000 })
  const identity = await page.evaluate(async () => (await fetch('/api/auth/session')).json())
  // This test never creates reports. Its existing fixture was independently
  // checked as simulation-only, so no server-wide test-user setting is needed.
  expect(identity.user?.id === process.env.RIMBAGUARD_TEST_USER_ID && identity.user?.role === 'public').toBe(true)
  let analysisPosts = 0
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyze')) analysisPosts++ })
  await page.goto(`/reports/${fixtureId}?submitted=1`)
  const retry = page.getByRole('button', { name: 'Coba analisis lagi', exact: true })
  await expect(retry).toBeEnabled()
  // A crafted GET URL cannot initiate paid analysis without the in-memory
  // intent created by an actual successful save or an explicit button press.
  expect(analysisPosts).toBe(0)
  await expect(page.getByText('Layanan AI sementara belum dapat dihubungi.', { exact: false }).first()).toBeVisible()
  const firstRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyze'))
  await retry.click()
  const initiated = await firstRequest
  const firstResponse = initiated.response()
  const simultaneous = await page.evaluate(async ({ id, revision }) => {
    const response = await fetch(`/api/reports/${id}/analyze`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision }),
    })
    const value = await response.json()
    return { status: response.status, id: value.analysis?.id }
  }, { id: fixtureId, revision })
  expect([200, 202].includes(simultaneous.status)).toBe(true)
  const completed = await firstResponse
  expect(completed !== null && [200, 202].includes(completed.status())).toBe(true)
  if (!completed) throw new Error('The initial analysis response was not received.')
  const response = await completed.json()
  expect([completed.status(), simultaneous.status].includes(200)).toBe(true)
  expect(simultaneous.id === response.analysis.id).toBe(true)
  let detail = await page.evaluate(async id => (await fetch(`/api/reports/${id}`)).json(), fixtureId)
  let current = detail.analyses.find((analysis: { id: string }) => analysis.id === response.analysis.id)
  const failureCode = typeof current?.errorCode === 'string' && /^AI_[A-Z_]+$/.test(current.errorCode) ? current.errorCode : 'none'
  expect(current?.analysisStatus, `Live AI outcome failure code: ${failureCode}`).toBe('succeeded')
  await expect(page.getByRole('heading', { name: 'Pengamatan visual', exact: true })).toBeVisible({ timeout: 20_000 })
  await page.reload()
  detail = await page.evaluate(async id => (await fetch(`/api/reports/${id}`)).json(), fixtureId)
  current = detail.analyses.find((analysis: { id: string }) => analysis.id === response.analysis.id)
  expect(detail.report.isSimulation === true && detail.report.revision === revision && detail.report.status === 'pending_verification').toBe(true)
  expect(current?.analysisStatus === 'succeeded' && current.reportRevision === revision).toBe(true)
  expect(threatAnalysisSchema.safeParse({
    category: current.category, detected_indicators: current.detectedIndicators, visual_observation: current.visualObservation,
    risk_level: current.riskLevel, confidence: current.confidence, reasoning_summary: current.reasoningSummary,
    recommendation: current.recommendation, needs_human_verification: current.needsHumanVerification,
  }).success).toBe(true)
  expect(current.category === 'uncertain' && current.riskLevel === 'uncertain').toBe(true)
  expect(!('raw_response' in current) && !('rawResponse' in current)).toBe(true)
  expect(detail.analyses.some((analysis: { promptVersion: string; analysisStatus: string }) => analysis.promptVersion === 'qa-deliberate-outage-v1' && analysis.analysisStatus === 'failed')).toBe(true)
  let successes = -1
  try {
    const stored = await database.from('ai_analyses').select('id', { count: 'exact' })
      .eq('report_id', fixtureId).eq('report_revision', revision).eq('analysis_status', 'succeeded')
    if (!stored.error && typeof stored.count === 'number') successes = stored.count
  } catch { /* No raw provider/database detail in logs. */ }
  expect(successes).toBe(1)
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
})
