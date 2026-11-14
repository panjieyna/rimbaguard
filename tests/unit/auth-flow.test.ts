import { describe, expect, it } from 'vitest'
import { isExistingRegistration, safeAuthFailure, safeAuthRedirect } from '../../server/utils/auth-errors'

describe('safe authentication results', () => {
  it('maps incorrect credentials to an actionable generic response', () => {
    expect(safeAuthFailure({ code: 'invalid_credentials', status: 400 }, 'login')).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' })
  })
  it('distinguishes email confirmation from a wrong password', () => {
    expect(safeAuthFailure({ code: 'email_not_confirmed', status: 400 }, 'login')).toMatchObject({ statusCode: 403, code: 'EMAIL_CONFIRMATION_REQUIRED' })
  })
  it('does not map throttling or provider outages to an absent account', () => {
    expect(safeAuthFailure({ status: 429 }, 'login').statusCode).toBe(429)
    expect(safeAuthFailure({ name: 'AuthRetryableFetchError' }, 'login').statusCode).toBe(503)
    expect(safeAuthFailure({ status: 500 }, 'register').statusCode).toBe(503)
  })
  it('recognizes existing registration without exposing it in a message', () => {
    expect(isExistingRegistration({ code: 'user_already_exists' })).toBe(true)
    expect(isExistingRegistration({ code: 'email_exists' })).toBe(true)
    expect(isExistingRegistration({ code: 'weak_password' })).toBe(false)
  })
  it('keeps provider detail out of frontend errors', () => {
    const failure = safeAuthFailure({ code: 'unexpected_sensitive_provider_code', status: 400 }, 'register')
    expect(JSON.stringify(failure)).not.toContain('unexpected_sensitive_provider_code')
  })
  it('makes registration password and disabled-provider failures explicit', () => {
    expect(safeAuthFailure({ code: 'weak_password' }, 'register').code).toBe('PASSWORD_REQUIREMENTS')
    expect(safeAuthFailure({ code: 'signup_disabled' }, 'register').code).toBe('REGISTRATION_UNAVAILABLE')
  })
})

describe('role-based auth redirects', () => {
  it('sends officers to their protected dashboard', () => {
    expect(safeAuthRedirect('admin', '/report')).toBe('/admin/dashboard')
  })
  it('supports an explicit local citizen reporting destination', () => {
    expect(safeAuthRedirect('public', '/report')).toBe('/report')
    expect(safeAuthRedirect('public', '/reports?status=pending_analysis')).toBe('/reports?status=pending_analysis')
  })
  it.each([
    undefined, null, ['report'], 'https://attacker.invalid', '//attacker.invalid', '/\\attacker.invalid',
    '/%2f%2fattacker.invalid', '/api/auth/session', '/admin/dashboard', '/login', '/register',
    '/report\r\nLocation:https://attacker.invalid', '/report#javascript:alert(1)',
  ])('rejects unsafe or looping return destination %s', (destination) => {
    expect(safeAuthRedirect('public', destination)).toBe('/reports')
  })
})
