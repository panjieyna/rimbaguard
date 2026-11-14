import { describe, expect, it } from 'vitest'
import { isSameOriginRequest } from '../../server/utils/origin'

describe('cookie mutation origin checks', () => {
  it('accepts the configured application origin', () => {
    expect(isSameOriginRequest('https://rimbaguard.example', 'https://rimbaguard.example', 'same-origin')).toBe(true)
  })
  it.each([undefined, 'null', 'https://rimbaguard.example.attacker.test', 'https://other.example', 'http://rimbaguard.example'])('rejects missing or mismatched origin %s', (origin) => {
    expect(isSameOriginRequest(origin, 'https://rimbaguard.example')).toBe(false)
  })
  it('rejects cross-site metadata even with a matching origin', () => {
    expect(isSameOriginRequest('https://rimbaguard.example', 'https://rimbaguard.example', 'cross-site')).toBe(false)
  })
})
