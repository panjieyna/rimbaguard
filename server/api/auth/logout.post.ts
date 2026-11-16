import { defineEventHandler, deleteCookie, parseCookies } from 'h3'
import { getServerEnvironment } from '../../utils/config'
import { safeAuthFailure } from '../../utils/auth-errors'
import { apiError } from '../../utils/response'
import { classifySessionError } from '../../utils/session-error'
import { getUserDatabase } from '../../utils/supabase'
import { validatedBody } from '../../utils/validation'
import { logoutSchema } from '../../../shared/schemas/auth'

export default defineEventHandler(async (event) => {
  // 'global' revokes every refresh token of this account (all devices).
  const { scope } = await validatedBody(event, logoutSchema)
  const environment = getServerEnvironment()
  const client = getUserDatabase(event)
  const { error } = await client.auth.signOut({ scope })
  // End this browser's session even when a stale cookie cannot be refreshed.
  const project = new URL(environment.supabaseUrl!).hostname.split('.')[0]
  const base = `sb-${project}-auth-token`
  for (const name of Object.keys(parseCookies(event))) {
    if (name === base || name.startsWith(`${base}.`) || name === `${base}-code-verifier` || name.startsWith(`${base}-code-verifier.`)) {
      deleteCookie(event, name, { path: '/', httpOnly: true, secure: !environment.development, sameSite: 'lax' })
    }
  }
  if (error && classifySessionError(error) !== 'anonymous') {
    const failure = safeAuthFailure(error, 'logout')
    throw apiError(failure.statusCode, failure.code, failure.message)
  }
  return { success: true }
})
