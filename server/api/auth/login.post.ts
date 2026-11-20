import { defineEventHandler, getQuery, getRequestIP } from 'h3'
import { loginSchema } from '../../../shared/schemas/auth'
import { getSessionUserFromClient } from '../../utils/auth'
import { safeAuthFailure, safeAuthRedirect } from '../../utils/auth-errors'
import { enforceRateLimit } from '../../utils/rate-limit'
import { apiError } from '../../utils/response'
import { getUserDatabase } from '../../utils/supabase'
import { validatedBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const input = await validatedBody(event, loginSchema)
  const client = getUserDatabase(event)
  // Forwarded IP headers are not trusted without an explicit hosting contract.
  const address = getRequestIP(event, { xForwardedFor: false }) || 'unknown'
  await enforceRateLimit(event, 'auth:login:ip', address, 30, 900)
  await enforceRateLimit(event, 'auth:login:email', input.email, 10, 900)
  const { data, error } = await client.auth.signInWithPassword(input)
  if (error) {
    const failure = safeAuthFailure(error, 'login')
    throw apiError(failure.statusCode, failure.code, failure.message)
  }
  if (!data.user || !data.session) throw apiError(503, 'AUTH_UNAVAILABLE', 'Sesi masuk belum dapat dibuat. Silakan coba kembali.')
  const user = await getSessionUserFromClient(client, data.user)
  return { user, redirectTo: safeAuthRedirect(user.role, getQuery(event).next) }
})
