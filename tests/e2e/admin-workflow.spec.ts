import { expect, test, type Page } from '@playwright/test'
import { logoutFromAccount } from './helpers/account'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import type { Database } from '../../shared/types/database'

const configured = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD && process.env.E2E_ADMIN_USER_ID
  && process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
test.use({ trace: 'off', screenshot: 'off' })

function serviceDatabase() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const url = process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Private QA configuration is incomplete.')
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled()
  await page.evaluate(({ email, password }) => {
    for (const [id, value] of [['email', email], ['password', password]] as const) {
      const input = document.getElementById(id) as HTMLInputElement
      input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, { email, password })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

const INTERNAL_NOTE = 'Catatan internal QA: koordinasikan dengan patroli sektor simulasi.'
const REQUEST_NOTE = 'Mohon lampirkan keterangan tambahan untuk simulasi pengujian ini.'

test('officers review, respond and audit reports while reporters see only what is addressed to them', async ({ page }) => {
  test.skip(!configured, 'Requires the retained QA officer and simulation identities in ignored .env.e2e.')
  test.setTimeout(240_000)
  const database = serviceDatabase()
  const role = await database.from('profiles').select('role').eq('id', process.env.E2E_ADMIN_USER_ID!).single()
  test.skip(role.data?.role !== 'admin', 'The QA officer has not been granted the admin role by the operator yet.')
  const schema = await database.rpc('admin_analytics', { p_actor_id: process.env.E2E_ADMIN_USER_ID!, p_dataset: 'simulation', p_days: 30 })
  if (schema.error) throw new Error('The Phase 5 migration is not available; apply supabase/JALANKAN_FASE_5.sql first.')

  // Fixtures, in order: retained pending simulation reports get a labeled QA
  // outage through the real analysis RPCs (no AI output is fabricated), then
  // older failed reports, then reports awaiting verification. The newest failed
  // report stays reserved for analysis-failure.spec.ts. Report B returns to
  // analysis after the reporter's correction, so each run consumes one report.
  const fixtures: string[] = []
  try {
    const all = await database.from('reports').select('id,revision,status').eq('user_id', process.env.RIMBAGUARD_TEST_USER_ID!)
      .eq('is_simulation', true).order('created_at', { ascending: false })
    if (all.error || !all.data) throw new Error('Unavailable')
    const failed = all.data.filter(report => report.status === 'analysis_failed')
    for (const report of all.data.filter(item => item.status === 'pending_analysis').reverse()) {
      if (fixtures.length >= 2) break
      const claim = await database.rpc('claim_report_analysis', {
        p_report_id: report.id, p_actor_id: process.env.RIMBAGUARD_TEST_USER_ID!, p_expected_revision: report.revision,
        p_model_name: 'qa-provider-unavailable', p_prompt_version: 'qa-deliberate-outage-v1', p_force: false,
      })
      if (claim.error || !claim.data?.claimed) continue
      const outage = await database.rpc('fail_report_analysis', { p_analysis_id: claim.data.analysis.id, p_actor_id: process.env.RIMBAGUARD_TEST_USER_ID!, p_error_code: 'AI_PROVIDER_UNAVAILABLE' })
      if (!outage.error && outage.data?.analysis.analysis_status === 'failed') fixtures.push(report.id)
    }
    for (const report of [...failed.slice(1).reverse(), ...all.data.filter(item => item.status === 'pending_verification')]) {
      if (fixtures.length >= 2) break
      fixtures.push(report.id)
    }
    if (fixtures.length < 2) throw new Error('Unavailable')
  }
  catch { throw new Error('Two reviewable simulation reports are required (run reporting.spec.ts to create more); no private detail is logged.') }
  const [first, second] = fixtures.map(id => ({ id })) as [{ id: string }, { id: string }]

  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)
  await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Ringkasan', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigasi petugas' })).toBeVisible()

  // Dashboard numbers equal a direct count of the database rows.
  const dashboard = await page.evaluate(async () => (await fetch('/api/admin/dashboard?dataset=simulation')).json())
  const rows = await database.from('reports').select('status').eq('is_simulation', true)
  const real = await database.from('reports').select('id', { count: 'exact', head: true }).eq('is_simulation', false)
  const countOf = (status: string) => rows.data!.filter(row => row.status === status).length
  expect(dashboard.analytics.summary.total).toBe(rows.data!.length)
  expect(dashboard.analytics.summary.pendingVerification).toBe(countOf('pending_verification'))
  expect(dashboard.analytics.summary.analysisFailed).toBe(countOf('analysis_failed'))
  expect(dashboard.analytics.summary.resolved).toBe(countOf('resolved'))
  expect(dashboard.analytics.summary.verified).toBe(countOf('verified') + countOf('in_progress') + countOf('resolved'))
  expect(dashboard.analytics.statusCounts.reduce((sum: number, item: { count: number }) => sum + item.count, 0)).toBe(dashboard.analytics.rangeTotal)
  expect((await page.evaluate(async () => (await fetch('/api/admin/dashboard')).json())).analytics.summary.total).toBe(real.count)

  await page.getByRole('link', { name: 'Data simulasi' }).click()
  await expect(page.getByText('Menampilkan data simulasi untuk pengujian dan demo.', { exact: false })).toBeVisible()
  await expect(page.getByRole('img', { name: /Laporan masuk per hari/ })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Status penanganan', exact: true })).toBeVisible()

  // Queue scoped to manual review after AI failure.
  await page.goto('/admin/reports?scope=analysis_failed&dataset=simulation')
  await expect(page.getByRole('heading', { name: 'Laporan masuk' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Tinjau laporan/ }).first()).toBeVisible({ timeout: 20_000 })

  // Report A: manual review, response, resolution, category, note and audit.
  await page.goto(`/admin/reports/${first.id}`)
  const actions = page.getByRole('complementary', { name: 'Tindakan petugas dan riwayat' })
  await expect(actions.getByText('Data simulasi tidak dapat dipublikasikan ke peta publik.')).toBeVisible()
  for (const [action, status] of [['Verifikasi laporan', 'Terverifikasi'], ['Tandai sedang ditindaklanjuti', 'Sedang ditindaklanjuti'], ['Tandai selesai ditangani', 'Selesai ditangani']] as const) {
    await actions.getByRole('button', { name: action, exact: true }).click()
    await actions.getByRole('button', { name: `Konfirmasi: ${action}` }).click()
    await expect(actions.getByText(`Status diperbarui: ${action.toLowerCase()} berhasil.`)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('header').getByText(status, { exact: true })).toBeVisible()
  }
  await expect(actions.getByText('Status ini sudah final. Tidak ada perubahan status lanjutan.')).toBeVisible()
  await actions.getByLabel('Kategori menurut petugas').selectOption('forest_fire')
  await actions.getByRole('button', { name: 'Simpan kategori' }).click()
  await expect(actions.getByText('Kategori petugas disimpan. Skor prioritas dihitung ulang.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Kebakaran hutan · Koreksi petugas')).toBeVisible()
  await actions.getByLabel('Catatan untuk sesama petugas').fill(INTERNAL_NOTE)
  await actions.getByRole('button', { name: 'Tambah catatan' }).click()
  await expect(actions.getByText('Catatan internal disimpan.')).toBeVisible({ timeout: 30_000 })
  await expect(actions.getByText(INTERNAL_NOTE)).toBeVisible()
  await expect(actions.getByText('Akun Petugas Pengujian RimbaGuard', { exact: false }).first()).toBeVisible()

  const api = await page.evaluate(async ({ id }) => {
    const detail = await (await fetch(`/api/admin/reports/${id}`)).json()
    const send = async (path: string, method: string, body: unknown) => {
      const response = await fetch(`/api/admin/reports/${id}/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, code: (await response.json()).data?.error?.code }
    }
    return {
      revision: detail.report.revision as number,
      stale: await send('status', 'PATCH', { expectedRevision: detail.report.revision - 1, status: 'verified' }),
      invalid: await send('status', 'PATCH', { expectedRevision: detail.report.revision, status: 'verified' }),
      publish: await send('publication', 'PUT', { expectedRevision: detail.report.revision, publicSummary: 'Ringkasan simulasi tidak boleh terbit.' }),
      forged: await send('status', 'PATCH', { expectedRevision: detail.report.revision, status: 'resolved', role: 'admin' }),
      audit: detail.updates.map((event: { action: string }) => event.action) as string[],
      statuses: detail.updates.filter((event: { action: string }) => event.action === 'status_changed')
        .map((event: { newStatus: string }) => event.newStatus) as string[],
    }
  }, { id: first.id })
  expect(api.stale).toEqual({ status: 409, code: 'REPORT_CONFLICT' })
  expect(api.invalid).toEqual({ status: 422, code: 'INVALID_TRANSITION' })
  expect(api.publish).toEqual({ status: 422, code: 'SIMULATION_NOT_PUBLISHABLE' })
  expect(api.forged.status).toBe(422)
  // A recycled fixture may carry earlier decisions; this run's three come last, in order.
  expect(api.statuses.slice(-3)).toEqual(['verified', 'in_progress', 'resolved'])
  expect(api.audit).toEqual(expect.arrayContaining(['report_created', 'officer_category_changed', 'admin_note']))
  expect(api.audit.some(action => action === 'ai_analysis_failed' || action === 'ai_analysis_succeeded')).toBe(true)

  // Report B: an information request the reporter must answer.
  await page.goto(`/admin/reports/${second.id}`)
  await actions.getByRole('button', { name: 'Minta informasi tambahan', exact: true }).click()
  await expect(actions.getByText('Catatan ini terlihat oleh pelapor.', { exact: false })).toBeVisible()
  await actions.getByLabel('Alasan atau permintaan untuk pelapor').fill(REQUEST_NOTE)
  await actions.getByRole('button', { name: 'Konfirmasi: Minta informasi tambahan' }).click()
  await expect(page.locator('header').getByText('Memerlukan informasi tambahan', { exact: true })).toBeVisible({ timeout: 30_000 })

  await page.goto('/admin/analytics?dataset=simulation&days=90')
  await expect(page.getByRole('heading', { name: 'Analitik laporan' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Laporan masuk per minggu/ })).toBeVisible({ timeout: 20_000 })
  await page.goto('/admin/settings')
  await expect(page.locator('.service-row').filter({ hasText: 'Analisis AI' })).toContainText('Terkonfigurasi')
  await expect(page.getByText('Tersedia', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 800 })
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('navigation', { name: 'Navigasi petugas' }).getByRole('link', { name: 'Laporan' }).click()
  await expect(page).toHaveURL(/\/admin\/reports$/)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await page.setViewportSize({ width: 1280, height: 900 })

  // The reporter sees the request, never the internal notes, and resubmits.
  await page.route('**/api/reports/*/analyze', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ data: { error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Analisis sementara tidak tersedia. Laporan tetap tersimpan.' } } }),
  }))
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!)
  await expect(page).toHaveURL(/\/reports$/, { timeout: 30_000 })
  const denied = await page.evaluate(async ({ id }) => ({
    dashboard: (await fetch('/api/admin/dashboard')).status,
    detail: (await fetch(`/api/admin/reports/${id}`)).status,
    status: (await fetch(`/api/admin/reports/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1, status: 'verified' }) })).status,
    note: (await fetch(`/api/admin/reports/${id}/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'Catatan warga' }) })).status,
  }), { id: first.id })
  expect(denied).toEqual({ dashboard: 403, detail: 403, status: 403, note: 403 })
  const ownView = await page.evaluate(async ({ id }) => (await fetch(`/api/reports/${id}`)).json(), { id: first.id })
  expect(ownView.review).toBeNull()
  expect(JSON.stringify(ownView)).not.toContain(INTERNAL_NOTE)
  expect(ownView.updates.some((event: { action: string }) => event.action === 'admin_note')).toBe(false)
  expect(ownView.updates.find((event: { action: string }) => event.action === 'officer_category_changed')?.note).toBeNull()

  await page.goto(`/reports/${second.id}`)
  await expect(page.getByRole('heading', { name: 'Petugas meminta informasi tambahan' })).toBeVisible()
  await expect(page.getByText(REQUEST_NOTE).first()).toBeVisible()
  await expect(page.getByText(INTERNAL_NOTE)).toHaveCount(0)
  await page.getByRole('button', { name: 'Perbaiki informasi' }).click()
  const title = page.getByLabel('Judul laporan', { exact: true })
  await title.fill(`${(await title.inputValue()).slice(0, 120)} · dilengkapi`)
  await page.getByRole('button', { name: 'Simpan perbaikan' }).click()
  await expect(page.locator('header').getByText('Menunggu analisis', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Petugas meminta informasi tambahan' })).toHaveCount(0)
  const resubmitted = await database.from('reports').select('status').eq('id', second.id).single()
  expect(resubmitted.data?.status).toBe('pending_analysis')
  await logoutFromAccount(page)
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
})
