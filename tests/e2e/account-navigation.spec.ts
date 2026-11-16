import { expect, test, type Page, type Route } from '@playwright/test'

const configured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)

// Real retained QA sessions; credentials never enter locator logs or artifacts.
test.use({ trace: 'off', screenshot: 'off' })

async function signIn(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled()
  await page.evaluate(({ email, password }) => {
    for (const [id, value] of [['email', email], ['password', password]] as const) {
      const field = document.getElementById(id) as HTMLInputElement | null
      if (!field) throw new Error('Login field unavailable')
      field.value = value
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, { email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page).toHaveURL(/\/reports$/, { timeout: 30_000 })
  const isRetainedAccount = await page.evaluate(async expectedId => {
    const response = await fetch('/api/auth/session')
    const session = await response.json()
    return response.ok && session.user?.id === expectedId
  }, process.env.RIMBAGUARD_TEST_USER_ID!)
  expect(isRetainedAccount).toBe(true)
}

for (const width of [1440, 375]) {
  test(`account controls are separate, keyboard accessible, and log out at ${width}px`, async ({ page }) => {
    test.skip(!configured, 'Requires the retained QA citizen credentials in ignored .env.e2e.')
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 1000 })
    await page.route('https://tile.openstreetmap.org/**', route => route.abort())
    await signIn(page)
    // Also exercise the separate account control inside the homepage capsule;
    // the desktop case keeps the reports-to-home logout redirect coverage.
    if (width === 375) await page.goto('/')
    if (width < 1280) await page.getByRole('button', { name: 'Menu', exact: true }).click()

    const account = page.getByRole('button', { name: 'Akun saya', exact: true })
    const logout = page.getByRole('button', { name: 'Keluar', exact: true })
    await expect(account).toBeVisible()
    expect(await account.evaluate(element => element.closest('nav') === null)).toBe(true)
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: 'Keluar', exact: true })).toHaveCount(0)
    await expect(logout).not.toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect((await account.boundingBox())!.height).toBeGreaterThanOrEqual(48)

    await account.focus()
    await page.keyboard.press('Enter')
    await expect(logout).toBeVisible()
    expect((await logout.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    await page.keyboard.press('Escape')
    await expect(logout).not.toBeVisible()
    await expect(account).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(logout).toBeVisible()

    if (width === 1440) {
      // An explicit temporary outage must leave this real session usable and
      // expose a retryable error rather than pretending logout succeeded.
      const failureMessage = 'Belum dapat keluar. Silakan coba lagi.'
      const unavailable = (route: Route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ data: { error: { code: 'AUTH_UNAVAILABLE', message: failureMessage } } }),
      })
      await page.route('**/api/auth/logout', unavailable)
      await logout.click()
      await expect(page.getByRole('alert')).toHaveText(failureMessage)
      await expect(page).toHaveURL(/\/reports$/)
      await expect(logout).toBeEnabled()
      expect(await page.evaluate(async expectedId => {
        const response = await fetch('/api/auth/session')
        const session = await response.json()
        return response.ok && session.user?.id === expectedId
      }, process.env.RIMBAGUARD_TEST_USER_ID!)).toBe(true)
      await page.unroute('**/api/auth/logout', unavailable)
    }

    const response = page.waitForResponse(result => new URL(result.url()).pathname === '/api/auth/logout' && result.request().method() === 'POST')
    await logout.click()
    expect((await response).status()).toBe(200)
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
    expect(await page.evaluate(async () => {
      const response = await fetch('/api/auth/session')
      const session = await response.json()
      return response.ok && session.user === null
    })).toBe(true)
    await expect(page.getByRole('button', { name: 'Akun saya', exact: true })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
}
