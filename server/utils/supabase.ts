import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { parseCookies, setCookie, type H3Event } from 'h3'
import type { Database } from '../../shared/types/database'
import { getServerEnvironment } from './config'
import { databaseUnavailable } from './response'

export function getUserDatabase(event: H3Event) {
  const cached = event.context.rimbaguardUserDatabase as ReturnType<typeof createServerClient<Database>> | undefined
  if (cached) return cached
  const environment = getServerEnvironment()
  if (!environment.supabaseUrl || !environment.supabaseAnonKey) throw databaseUnavailable()
  const client = createServerClient<Database>(environment.supabaseUrl, environment.supabaseAnonKey, {
    cookieOptions: { httpOnly: true, secure: !environment.development, sameSite: 'lax', path: '/' },
    cookies: {
      getAll() { return Object.entries(parseCookies(event)).map(([name, value]) => ({ name, value })) },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          setCookie(event, name, value, { ...options, httpOnly: true, secure: !environment.development, sameSite: 'lax', path: '/' })
        }
      },
    },
  })
  event.context.rimbaguardUserDatabase = client
  return client
}

// This bypasses RLS. Only use after server-side identity/role checks, for scoped writes.
export function getServiceDatabase() {
  const environment = getServerEnvironment()
  if (!environment.supabaseUrl || !environment.supabaseServiceRoleKey) throw databaseUnavailable()
  return createClient<Database>(environment.supabaseUrl, environment.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
