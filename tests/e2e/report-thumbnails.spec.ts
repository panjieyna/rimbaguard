import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginQaCitizen } from './helpers/qa-session'

const citizenConfigured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
test.use({ trace: 'off', screenshot: 'off' })

async function ownSimulation(page: Page) {
  expect(await page.evaluate(async expected => (await (await fetch('/api/auth/session')).json()).user?.id === expected, process.env.RIMBAGUARD_TEST_USER_ID!)).toBe(true)
  const id = await page.evaluate(async () => {
    const list = await (await fetch('/api/reports?pageSize=10')).json()
    return list.reports?.find((report: { id: string; isSimulation: boolean }) => report.isSimulation)?.id
  })
  if (!id) throw new Error('A retained QA simulation report is required.')
  return id as string
}

async function loginApi(page: Page, email: string, password: string) {
  await page.goto('/login')
  // Keep credentials out of locator/request logs and traces.
  const status = await page.evaluate(async credentials => (await fetch('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials),
  })).status, { email, password })
  expect(status).toBe(200)
}

test('owned report photos load in responsive cards and remain usable when a thumbnail fails', async ({ page }) => {
  test.skip(!citizenConfigured, 'Requires the retained QA citizen and simulation report.')
  test.setTimeout(90_000)
  await loginQaCitizen(page)
  const id = await ownSimulation(page)
  const path = `/api/reports/${id}/thumbnail`
  const response = await page.request.get(path)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/webp')
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(response.headers()['cross-origin-resource-policy']).toBe('same-origin')
  expect((await response.body()).byteLength).toBeGreaterThan(0)
  const card = page.locator(`.report-card[href="/reports/${id}"]`)
  const photo = card.locator('.report-photo img')
  await card.scrollIntoViewIfNeeded()
  await expect(photo).toHaveClass('photo-ready')
  expect(await photo.evaluate(image => (image as HTMLImageElement).naturalWidth > 0)).toBe(true)
  for (const width of [1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const picture = await card.locator('.report-photo').boundingBox()
    const content = await card.locator('.report-card-content').boundingBox()
    expect(picture && content && (width >= 768 ? picture.x < content.x : picture.y < content.y)).toBe(true)
  }
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(scan.violations.map(violation => violation.id)).toEqual([])
  await page.route(`**${path}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.reload()
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByText('Foto belum dapat dimuat.', { exact: true })).toBeVisible()
  await expect(card.getByText('Lihat detail laporan', { exact: true })).toBeVisible()
  await card.click()
  await expect(page).toHaveURL(new RegExp(`/reports/${id}$`))
  await expect(page.getByRole('heading', { name: 'Bukti dan pengamatan', exact: true })).toBeVisible()
})

test('report thumbnails reject anonymous and unrelated users while officer photos keep working', async ({ page, browser, baseURL }) => {
  test.skip(!citizenConfigured || !process.env.E2E_READER_EMAIL || !process.env.E2E_READER_PASSWORD || !process.env.E2E_READER_USER_ID || !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'Requires retained primary, reader and officer QA identities.')
  test.setTimeout(90_000)
  await loginQaCitizen(page)
  const id = await ownSimulation(page)
  const path = `/api/reports/${id}/thumbnail`
  expect((await page.request.get('/api/reports/not-a-uuid/thumbnail')).status()).toBe(422)
  expect((await page.request.get('/api/reports/ffffffff-ffff-4fff-8fff-ffffffffffff/thumbnail')).status()).toBe(404)
  const isolated = await browser.newContext({ baseURL })
  try {
    const other = await isolated.newPage()
    expect((await isolated.request.get(path)).status()).toBe(401)
    await loginApi(other, process.env.E2E_READER_EMAIL!, process.env.E2E_READER_PASSWORD!)
    expect(await other.evaluate(async expected => (await (await fetch('/api/auth/session')).json()).user?.id === expected, process.env.E2E_READER_USER_ID!)).toBe(true)
    expect((await isolated.request.get(path)).status()).toBe(404)
    expect((await isolated.request.get(`/api/admin/reports/${id}/evidence`)).status()).toBe(403)
    await other.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    await loginApi(other, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)
    for (const endpoint of [path, `/api/admin/reports/${id}/evidence?size=thumbnail`, `/api/admin/reports/${id}/evidence?size=full`]) {
      const image = await isolated.request.get(endpoint)
      expect(image.status()).toBe(200)
      expect(image.headers()['content-type']).toMatch(/^image\/(webp|jpeg|png)$/)
      expect(image.headers()['cache-control']).toBe('private, no-store')
    }
    await other.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
  }
  finally { await isolated.close() }
})
