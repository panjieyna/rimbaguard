import { expect, test, type BrowserContext, type Cookie } from '@playwright/test'
import { combineChunks, createChunks, stringFromBase64URL, stringToBase64URL } from '@supabase/ssr'

const configured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
const authCookiePattern = /^sb-.+-auth-token(?:\.\d+)?$/

interface StoredSession {
  expires_at?: number
  access_token?: string
  refresh_token?: string
  [key: string]: unknown
}

async function storedSession(context: BrowserContext) {
  const cookies = (await context.cookies('http://localhost:3000')).filter(cookie => authCookiePattern.test(cookie.name))
  expect(cookies.length > 0).toBe(true)
  const names = [...new Set(cookies.map(cookie => cookie.name.replace(/\.\d+$/, '')))]
  expect(names.length === 1).toBe(true)
  const base = names[0]!
  const encoded = await combineChunks(base, name => cookies.find(cookie => cookie.name === name)?.value)
  expect(typeof encoded === 'string' && encoded.length > 0).toBe(true)
  let session: StoredSession
  try {
    const text = encoded!.startsWith('base64-')
      ? stringFromBase64URL(encoded!.slice('base64-'.length))
      : decodeURIComponent(encoded!)
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid session shape')
    session = parsed as StoredSession
  }
  catch {
    // Never include the encoded cookie or parser input in test errors.
    throw new Error('Stored authentication cookie could not be decoded for the refresh test.')
  }
  expect(typeof session.refresh_token === 'string' && session.refresh_token.length > 0).toBe(true)
  expect(typeof session.access_token === 'string' && session.access_token.length > 0).toBe(true)
  return { base, cookies, session }
}

function cookieAttributes(template: Cookie) {
  return {
    domain: template.domain,
    path: template.path,
    httpOnly: template.httpOnly,
    secure: template.secure,
    sameSite: template.sameSite,
    ...(template.expires > 0 ? { expires: template.expires } : {}),
  }
}

test('SSR refresh returns rotated HttpOnly auth cookies to the browser', async ({ page, context }) => {
  test.skip(!configured, 'Requires the dedicated simulation account in ignored .env.e2e.')
  test.setTimeout(60_000)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled()
  // Keep credentials out of locator call logs and recorded traces.
  await page.evaluate(({ email, password }) => {
    for (const [id, value] of [['email', email], ['password', password]]) {
      const input = document.getElementById(id!) as HTMLInputElement | null
      if (!input) throw new Error('Login input unavailable')
      input.value = value!
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, { email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  // Login makes several hosted round trips; match the other specs' allowance.
  await expect(page).toHaveURL(/\/reports$/, { timeout: 30_000 })
  const identity = await page.evaluate(async () => (await fetch('/api/auth/session')).json())
  expect(identity.simulationMode === true && identity.user?.id === process.env.RIMBAGUARD_TEST_USER_ID).toBe(true)

  const original = await storedSession(context)
  expect(original.cookies.every(cookie => cookie.httpOnly)).toBe(true)
  const past = Math.floor(Date.now() / 1_000) - 60
  // The signed JWT and real refresh token are untouched. Only the local expiry
  // metadata changes, forcing the installed SDK's real refresh path on SSR.
  const encoded = 'base64-' + stringToBase64URL(JSON.stringify({ ...original.session, expires_at: past }))
  const escapedBase = original.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await context.clearCookies({ name: new RegExp(`^${escapedBase}(?:\\.\\d+)?$`) })
  await context.addCookies(createChunks(original.base, encoded).map(chunk => ({ ...cookieAttributes(original.cookies[0]!), ...chunk })))
  expect((await storedSession(context)).session.expires_at === past).toBe(true)

  // A hard navigation ensures this proof concerns the outer SSR HTTP response,
  // rather than a later browser-side session request masking missing forwarding.
  const response = await page.reload({ waitUntil: 'domcontentloaded' })
  expect(response !== null && response.ok()).toBe(true)
  const headers = response ? await response.headersArray() : []
  const rotated = headers.filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => header.value)
    .filter(value => value.startsWith(`${original.base}=`) || value.startsWith(`${original.base}.`))
  expect(rotated.length > 0 && rotated.some(value => /;\s*httponly(?:;|$)/i.test(value))).toBe(true)
  await expect(page).toHaveURL(/\/reports$/)
  await expect(page.getByRole('heading', { name: 'Laporan saya', exact: true })).toBeVisible()
  const refreshed = await storedSession(context)
  expect(typeof refreshed.session.expires_at === 'number' && refreshed.session.expires_at > Math.floor(Date.now() / 1_000)).toBe(true)
  expect(refreshed.cookies.every(cookie => cookie.httpOnly)).toBe(true)
  const session = await page.evaluate(async () => (await fetch('/api/auth/session')).json())
  expect(session.user?.id === process.env.RIMBAGUARD_TEST_USER_ID && session.simulationMode === true).toBe(true)
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})
