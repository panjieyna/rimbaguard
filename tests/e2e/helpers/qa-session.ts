import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createServerClient } from '@supabase/ssr'
import { existsSync } from 'node:fs'

let sessionCookies: Parameters<BrowserContext['addCookies']>[0] | null = null

/** Genuine Auth session for feature tests. Login UI/API and revocation have
 * separate coverage; repeated feature audits must not exhaust login limits.
 * Credentials and cookies stay in the Node worker's memory, never on disk. */
export async function loginQaCitizen(page: Page) {
  if (!sessionCookies) {
    if (existsSync('.env')) process.loadEnvFile('.env')
    const jar: Parameters<BrowserContext['addCookies']>[0] = []
    const origin = new URL(test.info().project.use.baseURL!)
    const client = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => [], setAll: cookies => {
        for (const cookie of cookies) jar.push({ name: cookie.name, value: cookie.value, url: origin.origin, httpOnly: true, sameSite: 'Lax', secure: origin.protocol === 'https:' })
      } },
    })
    const result = await client.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! })
    if (result.error || !result.data.session || !jar.length) throw new Error('QA Auth session unavailable; private details omitted.')
    sessionCookies = jar
  }
  await page.context().addCookies(sessionCookies)
  await page.goto('/reports')
  await expect(page).toHaveURL(/\/reports$/)
}
