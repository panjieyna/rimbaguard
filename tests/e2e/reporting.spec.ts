import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { createHash, randomUUID } from 'node:crypto'
import type { UploadAuthorizedResponse } from '../../shared/types/report-api'

const configured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)

test('real private report upload persists, can be corrected, and requires a session', async ({ page, context }) => {
  test.skip(!configured, 'Requires a dedicated, server-designated simulation account in ignored .env.e2e.')
  test.setTimeout(180_000)
  const clientErrors: string[] = []
  page.on('pageerror', error => clientErrors.push(error.message.replace(/https?:\/\/\S+/g, '[url]')))
  const uploadActivity: string[] = []
  page.on('response', response => {
    const path = new URL(response.url()).pathname
    if (path.includes('/storage/v1/object/upload/sign/')) uploadActivity.push(`storage:${response.status()}`)
    else if (path === '/api/uploads/finalize') uploadActivity.push(`finalize:${response.status()}`)
  })
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.includes('/storage/v1/object/upload/sign/')) {
      const failure = request.failure()?.errorText || ''
      uploadActivity.push(/^net::[A-Z_]+$/.test(failure) ? failure : 'storage-request-failed')
    }
  })
  // An unavailable basemap must not block point selection or report submission.
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  // Keep this reporting regression focused on a real persisted report during
  // an analysis outage. Live Gemini persistence is exercised separately.
  await page.route('**/api/reports/*/analyze', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ data: { error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Analisis sementara tidak tersedia. Laporan tetap tersimpan.' } } }),
  }))
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled()
  // Evaluate arguments are kept out of locator call logs; tracing is disabled.
  await page.evaluate(({ email, password }) => {
    const setValue = (id: string, value: string) => {
      const input = document.getElementById(id) as HTMLInputElement | null
      if (!input) throw new Error('Login field unavailable')
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    setValue('email', email); setValue('password', password)
  }, { email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! })
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST', { timeout: 40_000 })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  expect((await loginResponse).status()).toBe(200)
  await expect(page).toHaveURL(/\/reports$/, { timeout: 30_000 })
  const cookies = await context.cookies()
  const authCookies = cookies.filter(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
  expect(authCookies.length).toBeGreaterThan(0)
  expect(authCookies.every(cookie => cookie.httpOnly)).toBe(true)
  const session = await page.evaluate(async () => (await fetch('/api/auth/session')).json())
  // Refuse writes unless the server explicitly confirms simulation mode.
  expect(session.simulationMode === true && session.user?.id === process.env.RIMBAGUARD_TEST_USER_ID).toBe(true)
  expect(await page.evaluate(async () => (await fetch('/api/admin/dashboard')).status)).toBe(403)
  await page.goto('/report')
  await expect(page.getByText('Akun ini menggunakan mode simulasi.', { exact: false })).toBeVisible()
  await context.clearPermissions()
  await page.getByRole('button', { name: 'Gunakan lokasi perangkat' }).click()
  await expect(page.getByText('Izin lokasi ditolak.', { exact: false })).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Judul laporan', { exact: true }).fill('[SIMULASI] Pengujian pelaporan privat')
  await page.getByLabel('Kategori ancaman', { exact: true }).selectOption('other_environmental_threat')
  await page.getByLabel('Deskripsi kejadian', { exact: true }).fill('Data simulasi pengujian otomatis. Gambar dan koordinat bukan bukti kejadian lingkungan nyata; jangan ditindaklanjuti.')
  await page.getByLabel('Waktu kejadian', { exact: true }).fill('2020-01-01T07:00')
  expect(clientErrors).toEqual([])
  await page.getByRole('region', { name: 'Peta lokasi laporan' }).locator('.leaflet-control-zoom-in').waitFor()
  await expect(page.getByText('Peta dasar belum dapat dimuat.', { exact: false })).toBeVisible()
  await page.getByRole('region', { name: 'Peta lokasi laporan' }).click({ position: { x: 240, y: 180 } })
  const pickedPoint = await page.evaluate(() => {
    const latitude = (document.getElementById('latitude') as HTMLInputElement).value
    const longitude = (document.getElementById('longitude') as HTMLInputElement).value
    return latitude !== '' && longitude !== '' && Number.isFinite(Number(latitude)) && Math.abs(Number(latitude)) <= 90 && Number.isFinite(Number(longitude)) && Math.abs(Number(longitude)) <= 180
  })
  expect(pickedPoint).toBe(true)
  await page.getByLabel('Lintang', { exact: true }).fill('-3.8')
  await page.getByLabel('Bujur', { exact: true }).fill('102.2')
  await page.getByLabel('Nama lokasi (opsional)', { exact: true }).fill('Lokasi simulasi pengujian')
  const fileField = page.locator('#evidence-image')
  await fileField.setInputFiles({ name: 'too-large.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5_000_001) })
  await expect(page.locator('#image-error')).toContainText('5 MB')
  const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="#eaf0e9"/><text x="70" y="250" font-size="52" fill="#173d32">SIMULASI PENGUJIAN</text></svg>')).jpeg().toBuffer()
  const fullSizeImage = Buffer.concat([image, Buffer.alloc(5_000_000 - image.length)])
  await fileField.setInputFiles({ name: 'simulasi.jpg', mimeType: 'image/jpeg', buffer: fullSizeImage })
  let requestBody: Record<string, unknown>
  let submissionKey: string | undefined
  page.on('request', request => {
    if (!submissionKey && request.method() === 'POST' && new URL(request.url()).pathname === '/api/reports') {
      requestBody = request.postDataJSON()
      submissionKey = request.headers()['idempotency-key']
    }
  })
  // Fail the real direct upload once. No report should be written, and retry
  // must keep the user's input while obtaining a fresh scoped upload token.
  let failedUpload = false
  const uploadRoute = '**/storage/v1/object/upload/sign/**'
  await page.route(uploadRoute, async route => {
    if (!failedUpload && route.request().method() === 'PUT') {
      failedUpload = true
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    }
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Kirim laporan', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Penyimpanan laporan belum dapat dikonfirmasi', { timeout: 40_000 })
  expect(failedUpload).toBe(true)
  expect(submissionKey === undefined).toBe(true)
  await expect(page.getByLabel('Judul laporan', { exact: true })).toHaveValue('[SIMULASI] Pengujian pelaporan privat')
  const authorizationResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/uploads/authorize' && response.ok())
  // Allow the full-size direct upload and server image verification to finish
  // before measuring the following creation request.
  const finalizationResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/uploads/finalize' && response.request().method() === 'POST', { timeout: 100_000 }).catch(() => null)
  const creationResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/reports' && response.request().method() === 'POST', { timeout: 145_000 }).catch(() => null)
  let reusableKeySent = false
  page.on('request', request => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname.includes('/storage/v1/object/upload/sign/')) {
      const headers = request.headers()
      reusableKeySent ||= Boolean(headers.apikey || headers.authorization)
    }
  })
  await page.getByRole('button', { name: 'Kirim laporan', exact: true }).click()
  const authorization = await (await authorizationResponse).json() as UploadAuthorizedResponse
  const finalized = await Promise.race([
    finalizationResponse,
    page.getByRole('alert').waitFor({ state: 'visible', timeout: 100_000 }).then(() => null).catch(() => null),
  ])
  expect(finalized?.status(), uploadActivity.join(', ')).toBe(200)
  expect((await creationResponse)?.status()).toBe(201)
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+\?submitted=1/, { timeout: 45_000 })
  await page.unroute(uploadRoute)
  expect(reusableKeySent).toBe(false)
  const reportId = new URL(page.url()).pathname.split('/').at(-1)!
  await expect(page.getByRole('heading', { name: '[SIMULASI] Pengujian pelaporan privat' })).toBeVisible()
  await expect(page.getByText('Data simulasi untuk pengujian.', { exact: false })).toBeVisible()
  const detail = await page.evaluate(async id => (await fetch(`/api/reports/${id}`)).json(), reportId)
  expect(detail.report.isSimulation).toBe(true)
  expect(detail.report.status).toBe('pending_analysis')
  expect(detail.report.latitude).toBe(-3.8)
  let originalDigest = ''
  let replayBlocked = false
  let sealedWriteBlocked = false
  let digestAfterReplay = ''
  try {
    const original = await fetch(detail.evidenceUrl, { signal: AbortSignal.timeout(30_000) })
    if (original.ok) originalDigest = createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex')
    // Previously issued incoming tokens must never mutate sealed evidence,
    // even when a malicious client requests an upsert after attachment.
    const replay = await fetch(authorization.signedUrl, {
      method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' },
      body: image, signal: AbortSignal.timeout(30_000),
    })
    replayBlocked = !replay.ok
    const sealedTarget = new URL(authorization.signedUrl)
    sealedTarget.pathname = sealedTarget.pathname.replace(`/incoming/${authorization.uploadId}.jpg`, `/sealed/${authorization.uploadId}.jpg`)
    const sealedWrite = await fetch(sealedTarget, {
      method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' },
      body: image, signal: AbortSignal.timeout(30_000),
    })
    sealedWriteBlocked = !sealedWrite.ok
    const after = await fetch(detail.evidenceUrl, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (after.ok) digestAfterReplay = createHash('sha256').update(Buffer.from(await after.arrayBuffer())).digest('hex')
  }
  catch { /* Keep signed URLs out of test errors and request call logs. */ }
  expect(originalDigest.length === 64 && digestAfterReplay === originalDigest).toBe(true)
  expect(replayBlocked).toBe(true)
  expect(sealedWriteBlocked).toBe(true)
  const repeated = await page.evaluate(async ({ body, key }) => {
    const response = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) })
    const value = await response.json()
    return { status: response.status, id: value.report?.id }
  }, { body: requestBody, key: submissionKey! })
  expect(repeated.status).toBe(200)
  expect(repeated.id === reportId).toBe(true)
  const rejected = await page.evaluate(async ({ body, conflictKey, invalidKey, reportId }) => {
    const send = async (payload: unknown, key: string) => (await fetch('/api/reports', {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload),
    })).status
    return {
      conflict: await send({ ...body, title: '[SIMULASI] Payload berbeda dengan kunci yang sama' }, conflictKey),
      invalid: await send({ ...body, latitude: 91, incidentTime: '2099-01-01T00:00:00.000Z', status: 'verified', role: 'admin', totalScore: 100, analysis: {}, isSimulation: false }, invalidKey),
      mapExcludesReport: !(await (await fetch('/api/public/map')).json()).reports.some((report: { id: string }) => report.id === reportId),
      onlyOneCopy: (await (await fetch('/api/reports')).json()).reports.filter((report: { id: string }) => report.id === reportId).length === 1,
    }
  }, { body: requestBody!, conflictKey: submissionKey!, invalidKey: randomUUID(), reportId })
  expect(rejected).toEqual({ conflict: 409, invalid: 422, mapExcludesReport: true, onlyOneCopy: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: '[SIMULASI] Pengujian pelaporan privat' })).toBeVisible()
  await page.getByRole('button', { name: 'Perbaiki informasi' }).click()
  await page.getByLabel('Judul laporan', { exact: true }).fill('[SIMULASI] Informasi laporan diperbaiki')
  await page.getByRole('button', { name: 'Simpan perbaikan' }).click()
  await expect(page.getByRole('heading', { name: '[SIMULASI] Informasi laporan diperbaiki' })).toBeVisible({ timeout: 30_000 })
  const staleCorrection = await page.evaluate(async ({ reportId, body, revision }) => (await fetch(`/api/reports/${reportId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, expectedRevision: revision }),
  })).status, { reportId, body: requestBody!, revision: detail.report.revision })
  expect(staleCorrection).toBe(409)
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  expect(await page.evaluate(async id => (await fetch(`/api/reports/${id}`)).status, reportId)).toBe(401)
  await page.goto(`/reports/${reportId}`)
  await expect(page).toHaveURL(/\/login\?next=/)
})
