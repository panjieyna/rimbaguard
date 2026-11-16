import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import type { Database } from '../../shared/types/database'

const ORIGIN = 'http://localhost:3000'
const RANDOM_ID = '00000000-0000-4000-8000-0000000000aa'
const readerConfigured = Boolean(process.env.E2E_READER_EMAIL && process.env.E2E_READER_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
test.use({ trace: 'off', screenshot: 'off' })

function serviceDatabase() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

async function status(request: APIRequestContext, method: string, path: string, options: { origin?: string | null; type?: string; body?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': options.type ?? 'application/json' }
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN
  const response = await request.fetch(path, { method, headers, data: options.body ?? (method === 'GET' ? undefined : '{}'), maxRedirects: 0 })
  return response.status()
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
  await expect(page).toHaveURL(/\/reports$/, { timeout: 30_000 })
}

test('anonymous clients reach only public data and every mutation is origin- and type-checked', async ({ request }) => {
  test.setTimeout(120_000)
  for (const path of ['/api/reports', `/api/reports/${RANDOM_ID}`, '/api/admin/dashboard', '/api/admin/reports', `/api/admin/reports/${RANDOM_ID}`,
    '/api/admin/analytics', '/api/admin/settings', '/api/admin/map']) {
    expect(await status(request, 'GET', path), path).toBe(401)
  }
  for (const [method, path] of [['POST', '/api/reports'], ['PATCH', `/api/reports/${RANDOM_ID}`], ['POST', `/api/reports/${RANDOM_ID}/analyze`],
    ['POST', '/api/uploads/authorize'], ['POST', '/api/uploads/finalize'], ['PATCH', `/api/admin/reports/${RANDOM_ID}/status`],
    ['PUT', `/api/admin/reports/${RANDOM_ID}/publication`], ['DELETE', `/api/admin/reports/${RANDOM_ID}/publication`],
    ['PATCH', `/api/admin/reports/${RANDOM_ID}/category`], ['POST', `/api/admin/reports/${RANDOM_ID}/notes`]] as const) {
    expect(await status(request, method, path), `${method} ${path}`).toBe(401)
  }
  // Cross-site request forgery defenses run before authentication.
  expect(await status(request, 'POST', '/api/reports', { origin: null })).toBe(403)
  expect(await status(request, 'POST', '/api/reports', { origin: 'https://attacker.invalid' })).toBe(403)
  expect(await status(request, 'POST', '/api/reports', { origin: 'http://localhost:3000.attacker.invalid' })).toBe(403)
  expect(await status(request, 'POST', '/api/reports', { type: 'text/plain' })).toBe(415)
  expect(await status(request, 'POST', '/api/reports', { body: JSON.stringify({ padding: 'x'.repeat(70_000) }) })).toBe(413)

  const health = await request.get('/api/health')
  expect(health.headers()['x-content-type-options']).toBe('nosniff')
  expect(health.headers()['x-frame-options']).toBe('DENY')
  expect(health.headers()['cache-control']).toContain('no-store')
  expect(Object.keys(await health.json()).sort()).toEqual(['mode', 'services'])
  const statistics = await (await request.get('/api/public/statistics')).json()
  expect(Object.keys(statistics).sort()).toEqual(['inProgressReports', 'namedLocations', 'totalReports', 'verifiedReports'])

  // Private evidence is never served through a public Storage URL.
  const evidence = await serviceDatabase().from('reports').select('image_path').eq('is_simulation', true).limit(1).single()
  if (evidence.data) {
    const direct = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/report-evidence/${evidence.data.image_path}`, { signal: AbortSignal.timeout(20_000) })
    expect([400, 401, 403, 404]).toContain(direct.status)
  }
})

test('a signed-in citizen cannot abuse uploads, reach other reports, exceed limits or reuse a revoked session', async ({ page, browser }) => {
  test.skip(!readerConfigured, 'Requires the retained reader identity in ignored .env.e2e.')
  test.setTimeout(150_000)
  const othersReport = await serviceDatabase().from('reports').select('id').eq('user_id', process.env.RIMBAGUARD_TEST_USER_ID!).limit(1).single()
  await login(page, process.env.E2E_READER_EMAIL!, process.env.E2E_READER_PASSWORD!)

  const probe = await page.evaluate(async ({ others, random }) => {
    const send = async (method: string, path: string, body: unknown) => (await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).status
    return {
      traversal: await send('POST', '/api/uploads/authorize', { fileName: '../../evil.jpg', mimeType: 'image/jpeg', size: 1000 }),
      svg: await send('POST', '/api/uploads/authorize', { fileName: 'evil.svg', mimeType: 'image/svg+xml', size: 1000 }),
      oversized: await send('POST', '/api/uploads/authorize', { fileName: 'big.jpg', mimeType: 'image/jpeg', size: 5_000_001 }),
      unknownUpload: await send('POST', '/api/uploads/finalize', { uploadId: random }),
      forgedUpload: await send('POST', '/api/uploads/finalize', { uploadId: random, path: 'other-user/sealed/x.jpg' }),
      othersRead: (await fetch(`/api/reports/${others}`)).status,
      othersAnalyze: await send('POST', `/api/reports/${others}/analyze`, { expectedRevision: 1, force: false }),
      officerOnly: (await fetch('/api/admin/dashboard')).status,
    }
  }, { others: othersReport.data!.id, random: RANDOM_ID })
  expect(probe).toEqual({ traversal: 422, svg: 422, oversized: 422, unknownUpload: 404, forgedUpload: 422, othersRead: 404, othersAnalyze: 404, officerOnly: 403 })

  // The database-backed limiter is shared by every server instance.
  const limited = await page.evaluate(async (random) => {
    const results: { status: number; retryAfter: string | null }[] = []
    for (let index = 0; index < 16; index++) {
      const response = await fetch(`/api/reports/${random}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })
      results.push({ status: response.status, retryAfter: response.headers.get('retry-after') })
    }
    return results
  }, RANDOM_ID)
  const blocked = limited.filter(result => result.status === 429)
  expect(blocked.length).toBeGreaterThan(0)
  expect(Number(blocked[0]!.retryAfter)).toBeGreaterThan(0)
  expect(limited.every(result => [422, 429].includes(result.status))).toBe(true)

  // Pages rendered for a signed-in visitor carry their identity: never cacheable.
  for (const path of ['/', '/map', '/report']) {
    expect((await page.request.get(path)).headers()['cache-control'], path).toContain('no-store')
  }

  // A copied session cookie stops working once the owner signs out everywhere.
  const stolen = await browser.newContext({ baseURL: ORIGIN })
  await stolen.addCookies(await page.context().cookies())
  expect((await stolen.request.get('/api/reports')).status()).toBe(200)
  const logout = await page.evaluate(async () => (await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'global' }) })).status)
  expect(logout).toBe(200)
  expect((await stolen.request.get('/api/reports')).status()).toBe(401)
  expect((await page.request.get('/api/reports')).status()).toBe(401)
  await stolen.close()
})
