interface SessionError { name?: string; status?: number; code?: string }

export function classifySessionError(error: SessionError): 'anonymous' | 'rate_limited' | 'unavailable' {
  if (error.status === 429) return 'rate_limited'
  if (error.status && error.status >= 500) return 'unavailable'
  if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) return 'anonymous'
  if (error.code && ['bad_jwt', 'session_expired', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error.code)) return 'anonymous'
  return 'unavailable'
}
