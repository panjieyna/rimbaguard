import type { SessionResponse } from '../../shared/types/domain'

export function useAuth() {
  // Nitro's event.$fetch wrapper forwards headers but does not implement .raw.
  // Capture only the cookie header explicitly for the raw internal request.
  const requestHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  // Capture the outer page event before awaiting the internal session request.
  const pageEvent = import.meta.server ? useRequestEvent() : undefined
  return useAsyncData<SessionResponse>('auth-session', async () => {
    const response = await $fetch.raw<SessionResponse>('/api/auth/session', { headers: requestHeaders, ignoreResponseError: true })
    if (import.meta.server && pageEvent) {
      const { forwardSessionCookies } = await import('../utils/forward-session-cookies')
      forwardSessionCookies(pageEvent, response.headers)
    }
    // Forward rotated cookies even if the later profile lookup failed. Only the
    // safe identity payload belongs in SSR data; response headers never do.
    if (!response.ok || response._data === undefined) {
      throw createError({ statusCode: response.ok ? 503 : response.status, message: 'Sesi belum dapat diperiksa. Silakan coba kembali.' })
    }
    return response._data
  })
}
