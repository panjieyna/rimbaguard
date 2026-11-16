import { describe, expect, it } from 'vitest'
import { developmentCanonicalRedirect, isSameOriginRequest } from '../../server/utils/origin'

describe('cookie mutation origin checks', () => {
  it('accepts the configured application origin', () => {
    expect(isSameOriginRequest('https://rimbaguard.example', 'https://rimbaguard.example', 'same-origin')).toBe(true)
  })
  it.each([undefined, 'null', 'https://rimbaguard.example.attacker.test', 'https://other.example', 'http://rimbaguard.example', 'https://rimbaguard.example/path', 'https://user@rimbaguard.example', 'https://rimbaguard.example?query=1'])('rejects missing or mismatched origin %s', (origin) => {
    expect(isSameOriginRequest(origin, 'https://rimbaguard.example')).toBe(false)
  })
  it('rejects cross-site metadata even with a matching origin', () => {
    expect(isSameOriginRequest('https://rimbaguard.example', 'https://rimbaguard.example', 'cross-site')).toBe(false)
  })
})

describe('development canonical navigation', () => {
  const input = { requestUrl: 'http://127.0.0.1:3000/register?next=%2Freports', appUrl: 'http://localhost:3000', method: 'GET', development: true }

  it('redirects local navigation while retaining the path and query', () => {
    expect(developmentCanonicalRedirect(input)).toBe('http://localhost:3000/register?next=%2Freports')
    expect(developmentCanonicalRedirect({ ...input, method: 'HEAD' })).toBe('http://localhost:3000/register?next=%2Freports')
  })

  it('supports IPv6 loopback and the configured reverse alias', () => {
    expect(developmentCanonicalRedirect({ ...input, requestUrl: 'http://[::1]:3000/register' })).toBe('http://localhost:3000/register')
    expect(developmentCanonicalRedirect({ ...input, requestUrl: 'http://localhost:3000/register', appUrl: 'http://127.0.0.1:3000' })).toBe('http://127.0.0.1:3000/register')
  })

  it('keeps a network-path-shaped path on the trusted configured host', () => {
    expect(developmentCanonicalRedirect({ ...input, requestUrl: 'http://127.0.0.1:3000//attacker.example/path' })).toBe('http://localhost:3000//attacker.example/path')
  })

  it.each([
    { development: false }, { method: 'POST' }, { method: 'PATCH' }, { upgrade: 'websocket' },
    { requestUrl: 'http://localhost:3000/register' }, { requestUrl: 'http://127.0.0.1:3001/register' },
    { requestUrl: 'https://127.0.0.1:3000/register' }, { requestUrl: 'http://127.0.0.2:3000/register' },
    { requestUrl: 'http://localhost.attacker.example:3000/register' }, { requestUrl: 'http://192.168.1.10:3000/register' },
    { requestUrl: 'http://user@127.0.0.1:3000/register' }, { requestUrl: 'invalid' },
    { appUrl: 'https://production.example' }, { appUrl: 'http://localhost:3001' },
    { requestUrl: 'http://127.0.0.1:3000/api/auth/session' },
  ])('does not redirect unsafe or ineligible navigation %#', patch => {
    expect(developmentCanonicalRedirect({ ...input, ...patch })).toBeNull()
  })
})
