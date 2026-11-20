import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import type { Database } from '../../shared/types/database'

// Automated WCAG 2.2 A/AA checks catch a subset of issues (labels, contrast,
// roles, names); keyboard and screen-reader behavior is also tested elsewhere.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const WIDTHS = [375, 768, 1280, 1440]
const citizenConfigured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
const officerConfigured = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)
test.use({ trace: 'off', screenshot: 'off' })

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

async function simulationReportId(): Promise<string> {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const database = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data } = await database.from('reports').select('id').eq('user_id', process.env.RIMBAGUARD_TEST_USER_ID!)
    .eq('is_simulation', true).order('created_at', { ascending: false }).limit(1).single()
  if (!data) throw new Error('A retained simulation report is required.')
  return data.id
}

/** Scan a settled page, then confirm no width forces sideways scrolling. */
async function audit(page: Page, path: string, ready: (page: Page) => Promise<void>) {
  const problems: string[] = []
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(path)
  await ready(page)
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS)
    // Map tiles are third-party imagery; the map region itself is still scanned.
    .exclude('.leaflet-tile-pane')
    .analyze()
  for (const violation of scan.violations) {
    const line = `${path} [${violation.impact}] ${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`
    // Serious and critical issues fail the test; lesser ones are reported for review.
    if (violation.impact === 'serious' || violation.impact === 'critical') problems.push(line)
    else console.log(`a11y review: ${line}`)
  }
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(150)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 1) problems.push(`${path} overflows by ${overflow}px at ${width}px`)
  }
  return problems
}

const settled = (text: string | RegExp) => async (page: Page) => {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(400)
}

test('public pages meet automated WCAG 2.2 AA checks and fit every width', async ({ page }) => {
  test.setTimeout(180_000)
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  const problems = [
    ...await audit(page, '/', settled('Bersama menjaga hutan kita.')),
    ...await audit(page, '/map', settled('Peta laporan masyarakat')),
    ...await audit(page, '/about', async p => { await expect(p.locator('h1')).toBeVisible({ timeout: 30_000 }) }),
    ...await audit(page, '/login', settled('Masuk ke RimbaGuard.')),
    ...await audit(page, '/register', async p => { await expect(p.locator('h1')).toBeVisible({ timeout: 30_000 }) }),
  ]
  expect(problems).toEqual([])
})

test('citizen pages meet automated WCAG 2.2 AA checks and fit every width', async ({ page }) => {
  test.skip(!citizenConfigured, 'Requires the retained simulation identity in ignored .env.e2e.')
  test.setTimeout(240_000)
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  const reportId = await simulationReportId()
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!)
  const problems = [
    ...await audit(page, '/reports', settled(/laporan dapat diakses/)),
    // Read-only accessibility checks also run against the ordinary dev server;
    // the form, rather than the optional simulation banner, marks readiness.
    ...await audit(page, '/report', async p => { await expect(p.getByRole('textbox', { name: 'Ceritakan apa yang Anda lihat', exact: true })).toBeVisible({ timeout: 30_000 }) }),
    ...await audit(page, '/report', async p => {
      await p.getByRole('button', { name: 'Isi formulir sendiri', exact: false }).click()
      await expect(p.getByRole('textbox', { name: 'Judul laporan', exact: true })).toBeVisible()
    }),
    ...await audit(page, `/reports/${reportId}`, settled('Riwayat perkembangan')),
  ]
  expect(problems).toEqual([])
})

test('officer pages meet automated WCAG 2.2 AA checks and fit every width', async ({ page }) => {
  test.skip(!officerConfigured || !citizenConfigured, 'Requires the retained QA officer identity in ignored .env.e2e.')
  test.setTimeout(300_000)
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  const reportId = await simulationReportId()
  await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)
  const problems = [
    ...await audit(page, '/admin/dashboard?dataset=simulation', async p => { await expect(p.getByRole('img', { name: /Laporan masuk per hari/ })).toBeVisible({ timeout: 30_000 }) }),
    ...await audit(page, '/admin/reports?scope=all&dataset=simulation', settled(/laporan sesuai filter/)),
    ...await audit(page, `/admin/reports/${reportId}`, settled('Verifikasi dan penanganan')),
    ...await audit(page, '/admin/map?dataset=simulation', async p => {
      await expect(p.locator('.rg-cluster').first()).toBeVisible({ timeout: 30_000 })
      await p.getByRole('region', { name: 'Peta prioritas laporan petugas' }).scrollIntoViewIfNeeded()
      // Leaflet animates its initial fitBounds; scan settled target geometry.
      await p.waitForTimeout(500)
    }),
    ...await audit(page, '/admin/analytics?dataset=simulation', async p => { await expect(p.getByRole('img', { name: /Laporan masuk per hari/ })).toBeVisible({ timeout: 30_000 }) }),
    ...await audit(page, '/admin/settings', settled('Keadaan layanan')),
  ]
  expect(problems).toEqual([])
})
