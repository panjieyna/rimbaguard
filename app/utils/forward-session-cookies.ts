import { appendResponseHeader, splitCookiesString, type H3Event } from 'h3'

interface CookieHeaders {
  get(name: string): string | null
  getSetCookie?: () => string[]
}

/** Only import from the server branch of the session composable. */
export function forwardSessionCookies(event: H3Event, headers: CookieHeaders) {
  const cookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : splitCookiesString(headers.get('set-cookie') || '')
  for (const cookie of cookies) {
    if (cookie) appendResponseHeader(event, 'set-cookie', cookie)
  }
}
