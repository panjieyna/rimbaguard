import { describe, expect, it } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { appendResponseHeader, createEvent, getResponseHeader } from 'h3'
import { forwardSessionCookies } from '../../app/utils/forward-session-cookies'

function pageEvent() {
  const request = new IncomingMessage(new Socket())
  return createEvent(request, new ServerResponse(request))
}

describe('SSR session cookie propagation', () => {
  it('preserves every rotated chunk and its security attributes', () => {
    const event = pageEvent()
    const cookies = [
      'sb-project-auth-token.0=fixture-a; Path=/; HttpOnly; SameSite=Lax; Secure',
      'sb-project-auth-token.1=fixture-b; Path=/; HttpOnly; SameSite=Lax; Secure',
    ]
    const headers = new Headers()
    for (const cookie of cookies) headers.append('set-cookie', cookie)
    forwardSessionCookies(event, headers)
    expect(getResponseHeader(event, 'set-cookie')).toEqual(cookies)
  })

  it('appends refreshed auth cookies without dropping other page cookies', () => {
    const event = pageEvent()
    appendResponseHeader(event, 'set-cookie', 'page-preference=fixture; Path=/')
    forwardSessionCookies(event, new Headers({ 'set-cookie': 'sb-project-auth-token=updated-fixture; Path=/; HttpOnly' }))
    expect(getResponseHeader(event, 'set-cookie')).toEqual([
      'page-preference=fixture; Path=/',
      'sb-project-auth-token=updated-fixture; Path=/; HttpOnly',
    ])
  })

  it('splits legacy combined headers without splitting the Expires date', () => {
    const event = pageEvent()
    forwardSessionCookies(event, {
      get: name => name === 'set-cookie'
        ? 'sb-project-auth-token.0=fixture-a; Expires=Wed, 21 Oct 2037 07:28:00 GMT; HttpOnly, sb-project-auth-token.1=fixture-b; HttpOnly'
        : null,
    })
    expect(getResponseHeader(event, 'set-cookie')).toEqual([
      'sb-project-auth-token.0=fixture-a; Expires=Wed, 21 Oct 2037 07:28:00 GMT; HttpOnly',
      'sb-project-auth-token.1=fixture-b; HttpOnly',
    ])
  })

  it('does not forward unrelated internal API headers or invent cookies', () => {
    const event = pageEvent()
    forwardSessionCookies(event, new Headers({ authorization: 'Bearer fixture-never-forward', 'x-internal-service': 'fixture' }))
    expect(getResponseHeader(event, 'set-cookie')).toBeUndefined()
    expect(getResponseHeader(event, 'authorization')).toBeUndefined()
    expect(getResponseHeader(event, 'x-internal-service')).toBeUndefined()
  })
})
