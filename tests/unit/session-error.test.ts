import { describe, expect, it } from 'vitest'
import { classifySessionError } from '../../server/utils/session-error'

describe('auth failures retain their meaning', () => {
  it.each([
    { name: 'AuthSessionMissingError' },
    { name: 'AuthApiError', status: 401 },
    { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' },
  ])('recognizes absent or revoked sessions', error => {
    expect(classifySessionError(error)).toBe('anonymous')
  })
  it('does not silently log out a user when auth is rate limited', () => {
    expect(classifySessionError({ name: 'AuthApiError', status: 429 })).toBe('rate_limited')
  })
  it.each([
    { name: 'AuthApiError', status: 500 },
    { name: 'AuthApiError', status: 400, code: 'unexpected_configuration' },
    { name: 'AuthRetryableFetchError' },
  ])('preserves provider/configuration failures as unavailable', error => {
    expect(classifySessionError(error)).toBe('unavailable')
  })
})
