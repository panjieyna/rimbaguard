import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'no-preference' })

for (const width of [375, 1440]) {
  test(`public information reveals once on scroll without moving the map at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('.public-menu-button')).toBeEnabled()
    const step = page.locator('.workflow-step').last()
    await expect(page.locator('#hero-title')).toHaveCSS('opacity', '1')
    await expect(step).toHaveCSS('opacity', '0')
    await step.scrollIntoViewIfNeeded()
    await expect(step).toHaveCSS('opacity', '1')
    await expect(step).toHaveCSS('translate', 'none')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await expect(step).toHaveCSS('opacity', '1')
    await step.scrollIntoViewIfNeeded()
    await expect(step).toHaveCSS('opacity', '1')
    const mapIntro = page.getByRole('heading', { name: 'Lihat pengamatan yang telah ditinjau.', exact: true })
    await mapIntro.scrollIntoViewIfNeeded()
    await expect(mapIntro.locator('..')).toHaveCSS('opacity', '1')
    expect(await page.locator('nav, form, .leaflet-container').evaluateAll(elements => elements.every(element => !element.closest('[data-scroll-reveal]')))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('scroll reveals initialize after navigation restores the new page position', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto('/about')
  await expect(page.locator('.public-menu-button')).toBeEnabled()
  await page.locator('.about-home').click()
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  const step = page.locator('.workflow-step').last()
  await expect(step).toHaveCSS('opacity', '0')
  await step.scrollIntoViewIfNeeded()
  await expect(step).toHaveCSS('opacity', '1')
  await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Tentang', exact: true }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('.about-invitation')).toHaveCSS('opacity', '0')
  await page.locator('.about-invitation').scrollIntoViewIfNeeded()
  await expect(page.locator('.about-invitation')).toHaveCSS('opacity', '1')
})

test('keyboard focus reveals a reporting action immediately', async ({ page }) => {
  await page.goto('/about')
  await expect(page.locator('.public-menu-button')).toBeEnabled()
  const invitation = page.locator('.about-invitation')
  await expect(invitation).toHaveCSS('opacity', '0')
  const report = invitation.getByRole('link', { name: 'Laporkan pengamatan', exact: true })
  await report.focus()
  await expect(report).toBeFocused()
  await expect(invitation).toHaveCSS('opacity', '1')
  await expect(invitation).toHaveCSS('transition-duration', '0s')
  await report.press('Enter')
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('reduced motion keeps all information visible and also cancels pending reveals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/about')
  await expect(page.locator('.public-menu-button')).toBeEnabled()
  const allVisible = () => page.locator('[data-scroll-reveal]').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1' && getComputedStyle(element).translate === 'none'))
  expect(await allVisible()).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await expect(page.locator('.public-menu-button')).toBeEnabled()
  await expect(page.locator('.about-invitation')).toHaveCSS('opacity', '0')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(allVisible).toBe(true)
  await expect(page.locator('.scroll-reveal-pending')).toHaveCount(0)
})

test('missing IntersectionObserver leaves the public information visible', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, 'IntersectionObserver') })
  await page.goto('/about')
  await expect(page.locator('.public-menu-button')).toBeEnabled()
  await expect(page.locator('.about-invitation')).toHaveCSS('opacity', '1')
  await expect(page.locator('.about-invitation')).toHaveCSS('translate', 'none')
})

test('server-rendered information stays readable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto('/about')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.about-invitation')).toHaveCSS('opacity', '1')
    await expect(page.locator('.about-invitation')).toHaveCSS('translate', 'none')
  }
  finally { await context.close() }
})
