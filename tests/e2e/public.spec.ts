import { expect, test } from '@playwright/test'

for (const width of [320, 375, 768, 1280, 1440]) {
  test(`landing and navigation work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bersama menjaga hutan kita.')
    const hero = page.getByRole('region', { name: 'Bersama menjaga hutan kita.' })
    const panorama = hero.locator('img')
    await expect(panorama).toBeVisible()
    await expect.poll(() => panorama.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await expect(panorama).toHaveAttribute('alt', '')
    // The image is a full-width backdrop. The copy and real CTA must sit
    // within it on phones as well as desktops; a portrait ratio is valid here.
    const photoBounds = await panorama.boundingBox()
    expect(photoBounds!.width).toBeGreaterThan(width * 0.9)
    for (const content of [hero.getByRole('heading', { level: 1 }), hero.getByRole('link', { name: 'Laporkan ancaman', exact: true })]) {
      const bounds = await content.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(photoBounds!.x)
      expect(bounds!.y).toBeGreaterThanOrEqual(photoBounds!.y)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(photoBounds!.x + photoBounds!.width + 1)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(photoBounds!.y + photoBounds!.height + 1)
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const menu = page.getByRole('button', { name: 'Menu', exact: true })
    if (await menu.isVisible()) await expect(menu).toBeEnabled()
    await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: true })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Tentang', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kepedulian Anda')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

for (const width of [375, 1440]) {
  test(`reporting workflow explains three consistent steps and opens reporting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const workflow = page.getByRole('region', { name: /Dari ponsel Anda/ })
    await workflow.scrollIntoViewIfNeeded()
    const steps = workflow.getByRole('list', { name: 'Tahapan pelaporan RimbaGuard' }).getByRole('listitem')
    await expect(steps).toHaveCount(3)
    await expect(steps.getByRole('heading', { level: 3 })).toHaveText([
      /Tambahkan foto dan cerita/, /Periksa draf laporan/, /Kirim dan pantau laporan/,
    ])
    await expect(workflow.locator('img')).toHaveCount(0)
    const backgrounds = await steps.evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor))
    expect(new Set(backgrounds).size).toBe(1)
    await expect(page.getByText(/Ilustrasi AI|Ilustrasi hutan tropis|Data simulasi tidak dihitung/i)).toHaveCount(0)
    await expect(workflow.getByText('Foto dan lokasi rinci Anda disimpan privat.')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await workflow.getByRole('link', { name: 'Mulai buat laporan', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?next=/)
  })
}

test('workflow respects reduced motion without hiding its content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const workflow = page.getByRole('region', { name: /Dari ponsel Anda/ })
  await workflow.scrollIntoViewIfNeeded()
  await expect(workflow.getByRole('link', { name: 'Mulai buat laporan', exact: true })).toBeVisible()
  await expect(workflow.getByRole('heading', { level: 2 })).toBeVisible()
  await expect(workflow.getByRole('list', { name: 'Tahapan pelaporan RimbaGuard' })).toBeVisible()
})

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
  await expect(page.getByRole('heading', { name: 'Daftar laporan', exact: true })).toBeVisible()
  await expect(page.getByText('Titik menunjukkan perkiraan lokasi. Foto dan koordinat rinci tetap privat.')).toBeVisible()
})
