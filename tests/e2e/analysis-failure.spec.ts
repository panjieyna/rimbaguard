import { expect, test } from '@playwright/test'
import { logoutFromAccount } from './helpers/account'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { analysisFailureMessage } from '../../shared/constants/analysis'

test.use({ trace: 'off', screenshot: 'off' })

test('an actual persisted AI failure remains visible after reload without fabricated output', async ({ page }) => {
  test.skip(process.env.E2E_GEMINI_LIVE !== 'true' || !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'Requires the retained live simulation failure fixture.')
  test.setTimeout(60_000)
  if (existsSync('.env')) process.loadEnvFile('.env')
  let reportId = ''
  let code = ''
  try {
    const database = createClient(process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const report = await database.from('reports').select('id,revision').eq('user_id', process.env.RIMBAGUARD_TEST_USER_ID!)
      .eq('is_simulation', true).eq('status', 'analysis_failed').order('created_at', { ascending: false }).limit(1).single()
    if (report.error || !report.data) throw new Error('Unavailable')
    const result = await database.from('ai_analyses').select('error_code').eq('report_id', report.data.id)
      .eq('report_revision', report.data.revision).eq('analysis_status', 'failed').order('created_at', { ascending: false }).limit(1).single()
    if (result.error || !/^AI_[A-Z_]+$/.test(result.data?.error_code || '')) throw new Error('Unavailable')
    reportId = report.data.id; code = result.data.error_code
  }
  catch { throw new Error('The existing simulation failure could not be checked; no private detail is logged.') }
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
  let invoked = false
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyze')) invoked = true })
  await page.goto(`/reports/${reportId}?submitted=1`)
  await expect(page.getByRole('button', { name: 'Coba analisis lagi', exact: true })).toBeEnabled()
  await expect(page.getByText(analysisFailureMessage(code), { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pengamatan visual', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(analysisFailureMessage(code), { exact: true }).first()).toBeVisible()
  const detail = await page.evaluate(async id => (await fetch(`/api/reports/${id}`)).json(), reportId)
  expect(detail.report.isSimulation === true && detail.report.status === 'analysis_failed').toBe(true)
  expect(detail.analyses.some((analysis: { analysisStatus: string; errorCode: string }) => analysis.analysisStatus === 'failed' && analysis.errorCode === code)).toBe(true)
  expect(invoked).toBe(false)
  await logoutFromAccount(page)
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
})
