import { defineEventHandler, getRequestIP } from 'h3'
import { registerSchema } from '../../../shared/schemas/auth'
import { getSessionUserFromClient } from '../../utils/auth'
import { isExistingRegistration, safeAuthFailure } from '../../utils/auth-errors'
import { getServerEnvironment } from '../../utils/config'
import { enforceRateLimit } from '../../utils/rate-limit'
import { apiError } from '../../utils/response'
import { getUserDatabase } from '../../utils/supabase'
import { validatedBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const input = await validatedBody(event, registerSchema)
  const client = getUserDatabase(event)
  const address = getRequestIP(event, { xForwardedFor: false }) || 'unknown'
  await enforceRateLimit(event, 'auth:register:ip', address, 6, 3_600)
  await enforceRateLimit(event, 'auth:register:email', input.email, 3, 3_600)
  const environment = getServerEnvironment()
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
      emailRedirectTo: new URL('/auth/callback', environment.appUrl).href,
    },
  })
  if (error) {
    // Preserve the same public result for existing and confirmation-pending accounts.
    if (isExistingRegistration(error)) return { requiresEmailConfirmation: true, user: null }
    const failure = safeAuthFailure(error, 'register')
    throw apiError(failure.statusCode, failure.code, failure.message)
  }
  if (!data.session) return { requiresEmailConfirmation: true, user: null }
  if (!data.user) throw apiError(503, 'AUTH_UNAVAILABLE', 'Pendaftaran belum dapat diselesaikan. Silakan coba kembali.')
  const user = await getSessionUserFromClient(client, data.user)
  return { requiresEmailConfirmation: false, user }
})
