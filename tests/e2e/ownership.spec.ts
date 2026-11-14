import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import type { Database } from '../../shared/types/database.js'

const configured = Boolean(process.env.E2E_EMAIL && process.env.RIMBAGUARD_TEST_USER_ID
  && process.env.E2E_READER_EMAIL && process.env.E2E_READER_PASSWORD && process.env.E2E_READER_USER_ID)
const authCookiePattern = /^sb-.+-auth-token(?:\.\d+)?=/

test.use({ trace: 'off', screenshot: 'off' })

// These calls intentionally use Node fetch, without Playwright request logging.
async function privateFetch(url: URL, options: RequestInit = {}) {
  try {
    return await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  }
  catch {
    throw new Error('Private ownership request could not be completed.')
  }
}

async function privateJson(response: Response) {
  try { return await response.json() }
  catch { throw new Error('Private ownership response could not be checked.') }
}

async function privateRead<T>(operation: () => PromiseLike<T>): Promise<T> {
  try { return await operation() }
  catch { throw new Error('Private ownership fixture could not be checked.') }
}

test('another public user cannot access or alter private simulation evidence and reports', async ({ baseURL }) => {
  test.skip(!configured, 'Requires the retained primary and reader QA identities in ignored .env.e2e.')
  test.setTimeout(90_000)
  if (existsSync('.env')) process.loadEnvFile('.env')
  const serviceUrl = process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) throw new Error('Private ownership test configuration is incomplete.')
  const app = new URL(baseURL || 'http://localhost:3000')
  expect(['localhost', '127.0.0.1'].includes(app.hostname) && app.protocol === 'http:').toBe(true)
  const primaryId = process.env.RIMBAGUARD_TEST_USER_ID!
  const readerId = process.env.E2E_READER_USER_ID!
  expect(primaryId !== readerId && process.env.E2E_EMAIL!.toLowerCase() !== process.env.E2E_READER_EMAIL!.toLowerCase()).toBe(true)
  let database: ReturnType<typeof createClient<Database>>
  try {
    database = createClient<Database>(serviceUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  catch { throw new Error('Private ownership test configuration is invalid.') }

  const [primary, reader, profiles] = await privateRead(() => Promise.all([
    database.auth.admin.getUserById(primaryId),
    database.auth.admin.getUserById(readerId),
    database.from('profiles').select('id,role').in('id', [primaryId, readerId]),
  ]))
  expect(!primary.error && primary.data.user?.id === primaryId
    && primary.data.user.email?.toLowerCase() === process.env.E2E_EMAIL!.toLowerCase()
    && Boolean(primary.data.user.email_confirmed_at) && primary.data.user.user_metadata.rimbaguard_qa === true).toBe(true)
  expect(!reader.error && reader.data.user?.id === readerId
    && reader.data.user.email?.toLowerCase() === process.env.E2E_READER_EMAIL!.toLowerCase()
    && Boolean(reader.data.user.email_confirmed_at) && reader.data.user.user_metadata.rimbaguard_qa === true).toBe(true)
  expect(!profiles.error && profiles.data?.length === 2
    && profiles.data.every(profile => profile.role === 'public' && [primaryId, readerId].includes(profile.id))).toBe(true)

  const reportResult = await privateRead(() => database.from('reports').select('*')
    .eq('user_id', primaryId).eq('is_simulation', true).order('created_at', { ascending: false }).limit(1).maybeSingle())
  const report = reportResult.data
  expect(!reportResult.error && Boolean(report && report.user_id === primaryId && report.is_simulation && !report.is_public)).toBe(true)
  if (!report) throw new Error('A retained private simulation report is required before ownership QA.')
  const receiptResult = await privateRead(() => database.from('evidence_uploads')
    .select('id,user_id,report_id,sealed_path,status').eq('report_id', report.id).eq('sealed_path', report.image_path).maybeSingle())
  const receipt = receiptResult.data
  expect(!receiptResult.error && Boolean(receipt && receipt.user_id === primaryId
    && receipt.report_id === report.id && receipt.status === 'attached')).toBe(true)
  if (!receipt) throw new Error('An attached simulation evidence receipt is required before ownership QA.')
  const ownedResult = await privateRead(() => database.from('reports').select('id', { count: 'exact' }).eq('user_id', readerId).limit(50))
  expect(!ownedResult.error && Array.isArray(ownedResult.data) && typeof ownedResult.count === 'number').toBe(true)
  const readerOwnedIds = new Set((ownedResult.data ?? []).map(row => row.id))
  const body = {
    title: report.title, category: report.category, description: report.description, evidencePath: report.image_path,
    latitude: Number(report.latitude), longitude: Number(report.longitude), incidentTime: report.incident_time,
    ...(report.location_name ? { locationName: report.location_name } : {}), expectedRevision: report.revision,
  }
  const declaration = { fileName: 'simulasi.jpg', mimeType: 'image/jpeg', size: 64 }
  let cookieHeader = ''
  let loggedOut = false
  const headers = () => ({ origin: app.origin, 'content-type': 'application/json', cookie: cookieHeader })
  try {
    const login = await privateFetch(new URL('/api/auth/login', app), {
      method: 'POST', headers: { origin: app.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.E2E_READER_EMAIL, password: process.env.E2E_READER_PASSWORD }),
    })
    const cookies = login.headers.getSetCookie().filter(cookie => authCookiePattern.test(cookie))
    cookieHeader = cookies.map(cookie => cookie.split(';', 1)[0]!).join('; ')
    expect(login.status).toBe(200)
    expect(cookies.length > 0 && cookies.every(cookie => /;\s*httponly(?:;|$)/i.test(cookie))).toBe(true)
    const identity = await privateJson(await privateFetch(new URL('/api/auth/session', app), { headers: headers() }))
    expect(identity.user?.id === readerId && identity.user?.role === 'public' && identity.simulationMode !== true).toBe(true)

    expect((await privateFetch(new URL(`/api/reports/${report.id}`, app), { headers: headers() })).status).toBe(404)
    expect((await privateFetch(new URL(`/api/reports/${report.id}`, app), {
      method: 'PATCH', headers: headers(), body: JSON.stringify(body),
    })).status).toBe(403)
    expect((await privateFetch(new URL('/api/uploads/finalize', app), {
      method: 'POST', headers: headers(), body: JSON.stringify({ uploadId: receipt.id }),
    })).status).toBe(403)
    const list = await privateFetch(new URL('/api/reports?pageSize=50', app), { headers: headers() })
    expect(list.status).toBe(200)
    const listed = await privateJson(list)
    expect(Array.isArray(listed.reports) && listed.total === ownedResult.count
      && listed.reports.every((item: { id: string }) => item.id !== report.id && readerOwnedIds.has(item.id))).toBe(true)
    expect((await privateFetch(new URL('/api/admin/dashboard', app), { headers: headers() })).status).toBe(403)
    expect((await privateFetch(new URL('/api/uploads/authorize', app), {
      method: 'POST', headers: { ...headers(), origin: 'https://untrusted.example.invalid' }, body: JSON.stringify(declaration),
    })).status).toBe(403)

    // Denials must leave the owner's evidence reference and revision untouched.
    const unchanged = await privateRead(() => database.from('reports').select('revision,image_path,status,title').eq('id', report.id).single())
    expect(!unchanged.error && unchanged.data?.revision === report.revision && unchanged.data.image_path === report.image_path
      && unchanged.data.status === report.status && unchanged.data.title === report.title).toBe(true)
  }
  finally {
    if (cookieHeader) {
      const logout = await privateFetch(new URL('/api/auth/logout', app), { method: 'POST', headers: headers(), body: '{}' })
      loggedOut = logout.ok
      cookieHeader = '' // Apply the server's logout to this in-memory browser jar.
    }
  }
  expect(loggedOut).toBe(true)
  expect((await privateFetch(new URL(`/api/reports/${report.id}`, app))).status).toBe(401)
  expect((await privateFetch(new URL('/api/uploads/authorize', app), {
    method: 'POST', headers: { origin: app.origin, 'content-type': 'application/json' }, body: JSON.stringify(declaration),
  })).status).toBe(401)
})
