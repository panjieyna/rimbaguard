import { expect, test, type Page } from '@playwright/test'
import { logoutFromAccount } from './helpers/account'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import type { Database } from '../../shared/types/database'

const PUBLIC_KEYS = ['approximateLatitude', 'approximateLongitude', 'category', 'coordinatesAreApproximate', 'id',
  'incidentTime', 'priority', 'publishedAt', 'reportCode', 'status', 'summary']
const citizenConfigured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
const officerConfigured = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD && process.env.E2E_ADMIN_USER_ID)
test.use({ trace: 'off', screenshot: 'off' })

function serviceDatabase() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const url = process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Private QA configuration is incomplete.')
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function simulationReportIds(): Promise<string[]> {
  const { data, error } = await serviceDatabase().from('reports').select('id').eq('user_id', process.env.RIMBAGUARD_TEST_USER_ID!)
    .eq('is_simulation', true).order('created_at', { ascending: true })
  if (error || !data?.length) throw new Error('The retained simulation fixtures are unavailable; no private detail is logged.')
  return data.map(row => row.id)
}

// Credentials are typed through evaluate so they never appear in locator logs.
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
  await expect(page).toHaveURL(/\/(reports|admin\/dashboard)$/, { timeout: 30_000 })
}

test('public map exposes only published allowlisted data with database filters and honest empty states', async ({ page, request }) => {
  test.setTimeout(90_000)
  const hydrationWarnings: string[] = []
  page.on('console', message => { if (/hydration/i.test(message.text())) hydrationWarnings.push(message.text().slice(0, 120)) })
  const all = await request.get('/api/public/map')
  expect(all.status()).toBe(200)
  const body = await all.json()
  expect(Object.keys(body).sort()).toEqual(['page', 'pageSize', 'reports', 'total'])
  for (const report of body.reports) {
    expect(Object.keys(report).sort()).toEqual(PUBLIC_KEYS)
    expect(report.coordinatesAreApproximate).toBe(true)
    expect(Math.round(report.approximateLatitude * 100) / 100).toBe(report.approximateLatitude)
    expect(['verified', 'in_progress', 'resolved']).toContain(report.status)
  }
  expect((await request.get('/api/public/map?status=pending_verification')).status()).toBe(422)
  expect((await request.get('/api/public/map?from=2026-11-16&to=2026-11-15')).status()).toBe(422)
  expect((await request.get('/api/public/map?category=forest_fire&priority=high&from=2026-01-01&to=2026-12-31')).status()).toBe(200)
  expect((await request.get('/api/admin/map')).status()).toBe(401)

  if (citizenConfigured) {
    // Private simulation reports must be indistinguishable from missing ones.
    const [simulation] = await simulationReportIds()
    expect((await request.get(`/api/public/map/${simulation}`)).status()).toBe(404)
    expect(JSON.stringify(body)).not.toContain(simulation!)
    await page.goto(`/map?report=${simulation}`)
    await expect(page.getByText('Laporan publik tersebut tidak ditemukan atau belum dipublikasikan.')).toBeVisible()
  }

  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: 'Peta laporan masyarakat' })).toBeVisible()
  await expect(page.getByRole('search', { name: 'Filter laporan pada peta' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Peta lokasi laporan' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Prioritas tinggi' }).first()).toBeVisible()
  if (!body.total) await expect(page.getByText('Belum ada laporan yang dipublikasikan.')).toBeVisible()
  await expect(page.getByText('Peta dasar belum dapat dimuat.', { exact: false })).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Kategori', { exact: true }).selectOption('forest_fire')
  await page.getByLabel('Status verifikasi', { exact: true }).selectOption('resolved')
  await page.getByRole('button', { name: 'Terapkan', exact: true }).click()
  await expect(page).toHaveURL(/category=forest_fire/)
  await expect(page).toHaveURL(/status=resolved/)
  await expect(page.getByText(/^\d+ laporan sesuai filter$/)).toBeVisible({ timeout: 20_000 })
  if (!body.total) await expect(page.getByText('Tidak ada laporan publik yang sesuai filter.')).toBeVisible()
  await page.getByRole('button', { name: 'Atur ulang', exact: true }).click()
  await expect(page).not.toHaveURL(/category=/)

  await page.goto('/')
  // The preview loads its map library only when the section nears the viewport.
  await page.getByRole('heading', { name: 'Lihat pengamatan yang telah ditinjau.' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('region', { name: 'Pratinjau peta laporan publik' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(body.total ? /laporan publik · pilih titik/ : /Belum ada laporan yang dipublikasikan/)).toBeVisible({ timeout: 20_000 })
  expect(hydrationWarnings).toEqual([])
})

test('a citizen cannot open the officer map or read priority details', async ({ page }) => {
  test.skip(!citizenConfigured, 'Requires the retained public simulation identity in ignored .env.e2e.')
  test.setTimeout(90_000)
  const [ownReport] = await simulationReportIds()
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!)
  expect(await page.evaluate(async () => (await fetch('/api/admin/map')).status)).toBe(403)
  const detail = await page.evaluate(async id => (await fetch(`/api/reports/${id}`)).json(), ownReport)
  expect(detail.priorities).toEqual([])
  expect(detail.priorityStatus).toBeNull()
  const response = await page.goto('/admin/map')
  expect(response?.status()).toBe(403)
  await page.goto('/reports')
  await logoutFromAccount(page)
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
})

test('the officer map shows persisted scores, clusters nearby reports and filters in the database', async ({ page }) => {
  test.skip(!officerConfigured || !citizenConfigured, 'Requires the retained QA officer and simulation identities in ignored .env.e2e.')
  test.setTimeout(150_000)
  const profile = await serviceDatabase().from('profiles').select('role').eq('id', process.env.E2E_ADMIN_USER_ID!).single()
  test.skip(profile.data?.role !== 'admin', 'The QA officer has not been granted the admin role by the operator yet.')
  const simulations = await simulationReportIds()
  const clientErrors: string[] = []
  page.on('pageerror', error => clientErrors.push(error.message.replace(/https?:\/\/\S+/g, '[url]')))
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)

  const api = await page.evaluate(async () => {
    const response = await fetch('/api/admin/map?dataset=simulation')
    return { status: response.status, body: await response.json() }
  })
  expect(api.status).toBe(200)
  expect(['fresh', 'busy']).toContain(api.body.refresh.status)
  const listed = api.body.reports.filter((report: { id: string }) => simulations.includes(report.id))
  expect(listed).toHaveLength(simulations.length)
  for (const report of listed) {
    expect(report.isSimulation).toBe(true)
    expect(report.priority).not.toBeNull()
    expect(['high', 'medium', 'low']).toContain(report.priority.level)
    expect(report.priority.totalScore).toBeGreaterThanOrEqual(0)
    expect(report.priority.totalScore).toBeLessThanOrEqual(100)
  }
  expect((await page.evaluate(async () => (await fetch('/api/admin/map?dataset=real')).json())).reports
    .some((report: { id: string }) => simulations.includes(report.id))).toBe(false)
  expect(await page.evaluate(async () => (await fetch('/api/admin/map?status=bogus')).status)).toBe(422)

  // Persisted components agree with the published v1 formula.
  const detail = await page.evaluate(async id => (await fetch(`/api/reports/${id}`)).json(), simulations[0])
  const current = detail.priorities[0]
  expect(detail.priorityStatus.stale).toBe(false)
  expect(current.scoringVersion).toBe('rimbaguard-priority-v1')
  const total = Math.round((current.threatSeverity * 0.35 + current.evidenceCompleteness * 0.25 + current.recencyScore * 0.2 + current.nearbyReportsScore * 0.2) * 10_000) / 10_000
  expect(current.totalScore).toBe(total)
  expect(current.nearbyReportsCount).toBeGreaterThanOrEqual(simulations.length > 3 ? 3 : simulations.length - 1)

  await page.goto('/admin/map?dataset=simulation')
  await expect(page.getByRole('heading', { name: 'Peta prioritas laporan' })).toBeVisible()
  const map = page.getByRole('region', { name: 'Peta prioritas laporan petugas' })
  await expect(map).toBeVisible()
  // Identical simulation points form one cluster labelled with their count.
  const clusterIcon = map.locator('.rg-cluster').first()
  await expect(clusterIcon).toBeVisible({ timeout: 20_000 })
  expect(Number(await clusterIcon.textContent())).toBeGreaterThanOrEqual(2)
  // Clusters are keyboard buttons with a descriptive name, like markers.
  const clusterButton = map.getByRole('button', { name: /Kelompok \d+ laporan berdekatan/ }).first()
  await clusterButton.focus()
  await page.keyboard.press('Enter')
  const marker = map.locator('.leaflet-marker-icon[role="button"][aria-label*="(simulasi)"]').first()
  await expect(marker).toBeVisible({ timeout: 20_000 })
  await marker.focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('complementary', { name: 'Detail dan daftar laporan' })
  await expect(panel.getByRole('link', { name: 'Lihat detail' })).toBeVisible()
  await expect(panel.getByText('SIMULASI', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/report=/)
  // The unverified label follows the selected report's actual workflow status.
  const selected = listed.find((report: { id: string }) => report.id === new URL(page.url()).searchParams.get('report'))
  const unverified = ['pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information'].includes(selected?.status)
  await expect(panel.getByText('Belum diverifikasi petugas.')).toHaveCount(unverified ? 1 : 0)

  await panel.getByRole('button', { name: 'Kembali ke daftar' }).click()
  await page.getByLabel('Prioritas', { exact: true }).selectOption('none')
  await page.getByRole('button', { name: 'Terapkan', exact: true }).click()
  await expect(page).toHaveURL(/priority=none/)
  // The previous result stays visible while the hosted database is queried.
  await expect(page.getByText('Tidak ada laporan yang sesuai filter.')).toBeVisible({ timeout: 20_000 })

  await page.goto(`/reports/${simulations[0]}`)
  await expect(page.getByRole('heading', { name: 'Prioritas pemeriksaan' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Komponen skor prioritas' })).toBeVisible()
  await expect(page.getByText('Kategori pelapor (sementara)', { exact: false }).first()).toBeVisible()
  expect(clientErrors).toEqual([])
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
})
