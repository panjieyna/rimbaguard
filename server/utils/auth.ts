import { z } from 'zod'
import { type H3Event } from 'h3'
import type { SessionUser } from '../../shared/types/domain'
import { getServerEnvironment } from './config'
import { getUserDatabase } from './supabase'
import { apiError, databaseUnavailable } from './response'
import { classifySessionError } from './session-error'
import { avatarPathOf, avatarUrlOf, type AuthIdentity } from './avatar'

const profileSchema = z.object({ id: z.uuid(), email: z.email(), full_name: z.string(), role: z.enum(['public', 'admin']) })

/** Call only after Supabase has authenticated this user on the same client. */
export async function getSessionUserFromClient(client: ReturnType<typeof getUserDatabase>, authUser: AuthIdentity): Promise<SessionUser> {
  const userId = authUser.id
  const { data: profile, error: profileError } = await client.from('profiles').select('id,email,full_name,role').eq('id', userId).single()
  if (profileError) throw databaseUnavailable()
  const result = profileSchema.safeParse(profile)
  if (!result.success || result.data.id !== userId) throw databaseUnavailable()
  return {
    id: result.data.id,
    email: result.data.email,
    fullName: result.data.full_name,
    role: result.data.role,
    avatarUrl: avatarUrlOf(avatarPathOf(authUser)),
  }
}

/** The verified Supabase user behind requireSession(), for server-only data such as the photo path. */
export function sessionAuthUser(event: H3Event): AuthIdentity {
  const user = event.context.rimbaguardAuthUser as AuthIdentity | undefined
  if (!user) throw apiError(401, 'AUTHENTICATION_REQUIRED', 'Silakan masuk untuk melanjutkan.')
  return user
}

export async function getOptionalSession(event: H3Event): Promise<SessionUser | null> {
  if (getServerEnvironment().mode === 'setup') return null
  const client = getUserDatabase(event)
  const { data, error } = await client.auth.getUser()
  if (error) {
    const outcome = classifySessionError(error)
    if (outcome === 'anonymous') return null
    if (outcome === 'rate_limited') throw apiError(429, 'AUTH_RATE_LIMITED', 'Pemeriksaan sesi sedang dibatasi. Tunggu sebentar lalu coba lagi.')
    throw databaseUnavailable()
  }
  if (!data.user) return null
  event.context.rimbaguardAuthUser = data.user
  return getSessionUserFromClient(client, data.user)
}

export async function requireSession(event: H3Event): Promise<SessionUser> {
  const user = await getOptionalSession(event)
  if (!user) throw apiError(401, 'AUTHENTICATION_REQUIRED', 'Silakan masuk untuk melanjutkan.')
  return user
}

export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireSession(event)
  if (user.role !== 'admin') throw apiError(403, 'ADMIN_REQUIRED', 'Akses ini hanya tersedia bagi petugas.')
  return user
}
