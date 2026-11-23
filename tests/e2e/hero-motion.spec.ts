import { expect, test } from '@playwright/test'

test('hero video plays silently without controls and suspends offscreen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Bersama menjaga hutan kita.' })
  const video = hero.locator('video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.2)
  expect(await video.evaluate(element => {
    const media = element as HTMLVideoElement
    return media.muted && media.loop && media.playsInline && !media.controls && media.videoWidth === 1920
  })).toBe(true)
  await expect(hero.getByRole('button', { name: /(?:Jeda|Putar) video/ })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, window.innerHeight + 300))
  await expect(video).toHaveJSProperty('paused', true)
  await expect(page.locator('header.public-header')).toHaveCSS('background-color', 'rgb(18, 55, 43)')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(video).toHaveJSProperty('paused', false)
  await expect(page.locator('header.public-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

test('reduced motion keeps the poster without downloading video', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const downloads: string[] = []
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.mp4')) downloads.push(request.url()) })
  await page.goto('/')
  const poster = page.locator('.hero-media-poster')
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeEnabled()
  await expect.poll(() => poster.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(downloads).toHaveLength(0)
  await expect(page.locator('.hero-media-video')).not.toHaveAttribute('src', /mp4/)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.locator('video').evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.2)
  expect(downloads.length).toBeGreaterThan(0)
})

test('mobile uses the smaller video and a readable keyboard-accessible navigation menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/')
  const video = page.locator('.hero-media-video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.2)
  await expect(video).toHaveAttribute('src', '/videos/rainforest-canopy-720.mp4')
  await expect(video).toHaveJSProperty('videoWidth', 1280)
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await menu.click()
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible()
  await expect(page.locator('header.public-header')).toHaveCSS('background-color', 'rgb(18, 55, 43)')
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('an unavailable video leaves the poster and reporting link usable', async ({ page }) => {
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Bersama menjaga hutan kita.' })
  await expect(hero.locator('video')).toHaveAttribute('src', /mp4/)
  await expect(hero.getByRole('link', { name: 'Laporkan ancaman', exact: true })).toBeVisible()
  await expect(hero.getByRole('button', { name: /(?:Jeda|Putar) video/ })).toHaveCount(0)
  await expect(hero.locator('video')).not.toHaveClass(/has-played/)
  await expect(hero.locator('.hero-media-poster')).toBeVisible()
  await expect.poll(() => hero.locator('.hero-media-poster').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})
