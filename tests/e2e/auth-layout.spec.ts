import { expect, test } from '@playwright/test'

const views = [
  { path: '/login', heading: 'Masuk ke RimbaGuard.', submit: 'Masuk', autocomplete: 'current-password' },
  { path: '/register', heading: 'Jaga hutan, bersama.', submit: 'Buat akun', autocomplete: 'new-password' },
] as const

for (const view of views) {
  for (const width of [375, 1440]) {
    test(`${view.path} presents readable split-screen authentication at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(view.path)
      const main = page.getByRole('main')
      const identity = page.getByRole('complementary', { name: 'RimbaGuard', exact: true })
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(view.heading)
      await expect(main.getByRole('button', { name: view.submit, exact: true })).toBeEnabled()
      await expect(identity.getByRole('link', { name: 'RimbaGuard, beranda' })).toBeVisible()
      const artwork = identity.locator('img')
      await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)

      const imageBounds = (await identity.boundingBox())!
      const formBounds = (await main.boundingBox())!
      if (width >= 1024) {
        expect(formBounds.x).toBeGreaterThanOrEqual(imageBounds.x + imageBounds.width)
      }
      else {
        expect(formBounds.y).toBeGreaterThanOrEqual(imageBounds.y + imageBounds.height)
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      const email = main.getByLabel('Email', { exact: true })
      const password = main.getByLabel('Kata sandi', { exact: true })
      await expect(email).toHaveAttribute('autocomplete', 'email')
      await expect(password).toHaveAttribute('autocomplete', view.autocomplete)
      await expect(password).toHaveAttribute('type', 'password')
      if (view.path === '/register') {
        await expect(main.getByLabel('Nama lengkap', { exact: true })).toHaveAttribute('autocomplete', 'name')
        await expect(password).toHaveAttribute('minlength', '12')
        await expect(password).toHaveAttribute('maxlength', '128')
      }
      for (const input of [email, password]) {
        await expect(input).toBeVisible()
        expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(48)
        expect(await input.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16)
      }
    })
  }

  test(`${view.path} supports password visibility by keyboard without submitting`, async ({ page }) => {
    let authSubmissions = 0
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/auth\/(login|register)(?:\?|$)/.test(new URL(request.url()).pathname)) authSubmissions++
    })
    await page.goto(view.path)
    const password = page.getByLabel('Kata sandi', { exact: true })
    const show = page.getByRole('button', { name: 'Tampilkan kata sandi', exact: true })
    await expect(show).toBeEnabled()
    // This string is local UI input, never an account credential or API payload.
    const example = 'ui-toggle-only'
    await password.fill(example)
    await password.focus()
    await page.keyboard.press('Tab')
    await expect(show).toBeFocused()
    await page.keyboard.press('Enter')
    const hide = page.getByRole('button', { name: 'Sembunyikan kata sandi', exact: true })
    await expect(hide).toHaveAttribute('aria-pressed', 'true')
    await expect(password).toHaveAttribute('type', 'text')
    await expect(password).toHaveValue(example)

    await page.keyboard.press('Space')
    await expect(password).toHaveAttribute('type', 'password')
    await expect(password).toHaveValue(example)
    await expect(show).toHaveAttribute('aria-pressed', 'false')

    await show.click()
    await expect(password).toHaveAttribute('type', 'text')
    await password.clear()
    await expect(password).toHaveAttribute('type', 'password')
    await expect(show).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.form-error')).toHaveCount(0)
    expect(authSubmissions).toBe(0)
  })
}

test('authentication links navigate between account views and public pages', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('main').getByRole('link', { name: 'Daftar', exact: true }).click()
  await expect(page).toHaveURL(/\/register$/)
  await page.getByRole('main').getByRole('link', { name: 'Masuk', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('link', { name: 'Tentang RimbaGuard', exact: true }).click()
  await expect(page).toHaveURL(/\/about$/)
  await page.goto('/login')
  await page.getByRole('link', { name: 'Kembali ke beranda', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('expired confirmation feedback remains readable in the authentication frame', async ({ page }) => {
  await page.goto('/login?error=confirmation_failed')
  await expect(page.getByRole('alert')).toHaveText('Tautan konfirmasi tidak valid atau sudah kedaluwarsa. Silakan periksa email Anda.')
  await expect(page.getByRole('complementary', { name: 'RimbaGuard', exact: true })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled()
})
