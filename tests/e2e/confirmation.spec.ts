import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'

const configured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
const authCookiePattern = /^sb-.+-auth-token(?:\.\d+)?=/

test.use({ trace: 'off', screenshot: 'off' })

// Plain Node fetch keeps token URLs and Cookie headers out of Playwright's
// request call logs. Neither provider exceptions nor response bodies are logged.
async function privateFetch(url: URL, options: RequestInit = {}) {
  try {
    return await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  }
  catch {
    throw new Error('Private authentication request could not be completed.')
  }
}

test('generated email token establishes an HttpOnly session through the real callback', async ({ baseURL }) => {
  test.skip(!configured, 'Requires the existing dedicated simulation account in ignored .env.e2e.')
  test.setTimeout(60_000)
  // Server credentials remain in this Node test process; no browser is opened.
  if (existsSync('.env')) process.loadEnvFile('.env')
  const serviceUrl = process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) throw new Error('Private Supabase test configuration is incomplete.')
  const app = new URL(baseURL || 'http://localhost:3000')
  expect(['localhost', '127.0.0.1'].includes(app.hostname) && app.protocol === 'http:').toBe(true)

  let admin: ReturnType<typeof createClient>
  try {
    admin = createClient(serviceUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  catch {
    throw new Error('Private Supabase test configuration is invalid.')
  }

  let existingIdentity = false
  try {
    const result = await admin.auth.admin.getUserById(process.env.RIMBAGUARD_TEST_USER_ID!)
    existingIdentity = !result.error
      && result.data.user?.id === process.env.RIMBAGUARD_TEST_USER_ID
      && result.data.user.email?.toLowerCase() === process.env.E2E_EMAIL!.toLowerCase()
  }
  catch {
    throw new Error('The existing simulation identity could not be checked.')
  }
  // Refuse link generation for an unknown identity: this test creates no users.
  expect(existingIdentity).toBe(true)

  let tokenHash: string | undefined
  let linkOwnsExistingIdentity = false
  try {
    // generateLink creates the link only. It does not invoke send/invite/SMTP.
    const result = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: process.env.E2E_EMAIL!,
      options: { redirectTo: new URL('/auth/callback', app).href },
    })
    linkOwnsExistingIdentity = !result.error && result.data.user?.id === process.env.RIMBAGUARD_TEST_USER_ID
    tokenHash = result.data.properties?.hashed_token
  }
  catch {
    throw new Error('A token for the existing simulation identity could not be generated.')
  }
  expect(linkOwnsExistingIdentity && typeof tokenHash === 'string' && tokenHash.length > 0).toBe(true)

  const callback = new URL('/auth/callback', app)
  callback.searchParams.set('token_hash', tokenHash!)
  callback.searchParams.set('type', 'email')
  let cookieHeader = ''
  let loggedOut = false
  try {
    const response = await privateFetch(callback)
    const cookies = response.headers.getSetCookie().filter(cookie => authCookiePattern.test(cookie))
    cookieHeader = cookies.map(cookie => cookie.split(';', 1)[0]!).join('; ')
    expect(response.status).toBe(303)
    expect(response.headers.get('location') === '/reports').toBe(true)
    expect(cookies.length).toBeGreaterThan(0)
    expect(cookies.every(cookie => /;\s*httponly(?:;|$)/i.test(cookie))).toBe(true)
    expect(response.headers.get('cache-control')?.includes('no-store') === true).toBe(true)
    expect(response.headers.get('referrer-policy') === 'no-referrer').toBe(true)

    const session = await privateFetch(new URL('/api/auth/session', app), { headers: { cookie: cookieHeader } })
    expect(session.status).toBe(200)
    let sameIdentity = false
    try {
      const body = await session.json()
      sameIdentity = body.user?.id === process.env.RIMBAGUARD_TEST_USER_ID && body.simulationMode === true
    }
    catch {
      throw new Error('The callback session response could not be checked.')
    }
    expect(sameIdentity).toBe(true)
  }
  finally {
    if (cookieHeader) {
      const response = await privateFetch(new URL('/api/auth/logout', app), {
        method: 'POST',
        headers: { origin: app.origin, 'content-type': 'application/json', cookie: cookieHeader },
        body: '{}',
      })
      loggedOut = response.ok
    }
  }
  expect(loggedOut).toBe(true)

  const invalid = new URL('/auth/callback?token_hash=invalid-test-token&type=email', app)
  const rejected = await privateFetch(invalid)
  expect(rejected.status).toBe(303)
  expect(rejected.headers.get('location') === '/login?error=confirmation_failed').toBe(true)
})
