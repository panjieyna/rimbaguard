import { describe, expect, it } from 'vitest'
import {
  classifyServiceFailure,
  isExpectedPermissionDenial,
  isSafeServiceUrl,
  safeProviderCode,
} from '../../scripts/lib/service-checks.mjs'

describe('service probe URL safety', () => {
  it.each([
    'https://project.supabase.co',
    'https://project.supabase.co/',
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    'http://[::1]:54321',
  ])('permits a secure service origin: %s', (url) => {
    expect(isSafeServiceUrl(url)).toBe(true)
  })

  it.each([
    'http://project.supabase.co',
    'http://127.0.0.1.attacker.invalid',
    'https://user:password@project.supabase.co',
    'https://project.supabase.co/rest/v1',
    'https://project.supabase.co?apikey=private',
    'https://project.supabase.co/#private',
    'file:///etc/passwd',
    'not-a-url',
    undefined,
  ])('rejects unsafe or ambiguous service targets: %s', (url) => {
    expect(isSafeServiceUrl(url)).toBe(false)
  })
})

describe('service probe permission meaning', () => {
  it.each([401, 403])('recognizes an actual database permission denial with HTTP %s', (status) => {
    expect(isExpectedPermissionDenial(status, { code: '42501' })).toBe(true)
  })

  it.each([
    [401, { message: 'Invalid API key' }],
    [401, { code: 'bad_jwt' }],
    [403, { code: 'not_admin' }],
    [404, { code: 'PGRST205' }],
    [200, []],
    [404, { code: '42501' }],
  ])('does not misreport wrong keys or missing schema as secure denial', (status, payload) => {
    expect(isExpectedPermissionDenial(status, payload)).toBe(false)
  })
})

describe('service probe diagnostics disclose only allowlisted metadata', () => {
  it.each(['PGRST205', '42P01'])('identifies an unapplied table schema: %s', (code) => {
    expect(classifyServiceFailure(404, { code, message: 'Private project URL and diagnostic content' }))
      .toEqual({ httpStatus: 404, providerCode: code, kind: 'missing_schema' })
  })

  it('distinguishes missing columns from a complete migration', () => {
    expect(classifyServiceFailure(400, { code: '42703' }).kind).toBe('missing_columns')
  })

  it('does not echo unknown provider codes, messages, URLs, or keys', () => {
    const privateValue = 'private-value-that-must-not-appear'
    const result = classifyServiceFailure(401, { code: privateValue, message: privateValue, details: privateValue })
    expect(result).toEqual({ httpStatus: 401, kind: 'request_failed' })
    expect(JSON.stringify(result)).not.toContain(privateValue)
  })

  it('handles invalid or absent error bodies without trusting arbitrary strings', () => {
    expect(safeProviderCode(null)).toBeUndefined()
    expect(safeProviderCode('42501')).toBeUndefined()
    expect(safeProviderCode(['42501'])).toBeUndefined()
    expect(safeProviderCode({ error_code: 'bad_jwt' })).toBe('bad_jwt')
  })
})
