import { expect, test } from '@playwright/test'

for (const width of [375, 768, 1280, 1440]) {
  test(`landing and navigation work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Protecting Our Forests Starts With Awareness.')
    await expect(page.getByAltText('Vegetasi hutan tropis yang rapat di lereng Gunung Lempuyang, Bali')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: true })
    if (width < 1024) await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Tentang', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dari kepedulian')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('keyboard can skip navigation', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Lewati ke konten utama' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
})

test('protected reporting redirects anonymous visitors to login', async ({ page }) => {
  await page.goto('/report')
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(page.getByRole('heading', { name: 'Masuk ke RimbaGuard.' })).toBeVisible()
})

test('invalid login is rejected before any login request', async ({ page }) => {
  let submitted = false
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/auth/login')) submitted = true })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('invalid')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.locator('#email-error')).toBeVisible()
  await expect(page.locator('#password-error')).toBeVisible()
  expect(submitted).toBe(false)
})

test('invalid registration remains local and does not send email', async ({ page }) => {
  let submitted = false
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/auth/register')) submitted = true })
  await page.goto('/register')
  await page.getByLabel('Nama lengkap', { exact: true }).fill('A')
  await page.getByLabel('Email', { exact: true }).fill('invalid')
  await page.getByLabel('Kata sandi', { exact: true }).fill('short')
  await page.getByRole('button', { name: 'Buat akun', exact: true }).click()
  await expect(page.locator('#name-error')).toBeVisible()
  await expect(page.locator('#email-error')).toBeVisible()
  await expect(page.locator('#password-error')).toBeVisible()
  expect(submitted).toBe(false)
})

test('public map provides a map and a privacy-safe list or empty state', async ({ page }) => {
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: 'Peta laporan masyarakat' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Peta lokasi laporan' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Laporan publik', exact: true })).toBeVisible()
  await expect(page.getByText('Peta berbasis laporan insiden; tidak menampilkan deteksi deforestasi, batas kawasan, atau pemantauan satelit langsung.')).toBeVisible()
})
