import { defineEventHandler, getHeader, getMethod, getRequestURL, sendRedirect, setHeader } from 'h3'
import { getServerEnvironment } from '../utils/config'
import { developmentCanonicalRedirect, isSameOriginRequest } from '../utils/origin'
import { apiError } from '../utils/response'

export default defineEventHandler((event) => {
  setHeader(event, 'x-content-type-options', 'nosniff')
  setHeader(event, 'referrer-policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'x-frame-options', 'DENY')
  setHeader(event, 'permissions-policy', 'geolocation=(self), camera=(), microphone=()')
  if (import.meta.dev && ['GET', 'HEAD'].includes(getMethod(event))) {
    const environment = getServerEnvironment()
    const redirect = developmentCanonicalRedirect({
      requestUrl: getRequestURL(event, { xForwardedHost: false, xForwardedProto: false }).href,
      appUrl: environment.appUrl,
      method: getMethod(event),
      development: environment.development,
      upgrade: getHeader(event, 'upgrade'),
    })
    if (redirect) {
      setHeader(event, 'cache-control', 'private, no-store')
      setHeader(event, 'referrer-policy', 'no-referrer')
      return sendRedirect(event, redirect, 307)
    }
  }
  const pathname = getRequestURL(event).pathname
  // A page rendered for a signed-in visitor embeds their identity in its
  // payload; no shared cache may keep it, whatever the route.
  if (!pathname.startsWith('/_nuxt/') && /(?:^|;\s*)sb-[^=;]+-auth-token/.test(getHeader(event, 'cookie') ?? '')) {
    setHeader(event, 'cache-control', 'private, no-store')
  }
  if (!pathname.startsWith('/api/')) return
  setHeader(event, 'cache-control', 'private, no-store')
  if (['GET', 'HEAD', 'OPTIONS'].includes(getMethod(event))) return
  const environment = getServerEnvironment()
  if (!isSameOriginRequest(getHeader(event, 'origin'), environment.appUrl, getHeader(event, 'sec-fetch-site'))) {
    throw apiError(403, 'INVALID_ORIGIN', 'Permintaan harus berasal dari aplikasi RimbaGuard.')
  }
  const contentLength = Number(getHeader(event, 'content-length') ?? 0)
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 65_536) {
    throw apiError(413, 'REQUEST_TOO_LARGE', 'Ukuran permintaan melebihi batas. Unggah bukti melalui layanan penyimpanan.')
  }
  if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json')) {
    throw apiError(415, 'UNSUPPORTED_CONTENT_TYPE', 'Permintaan API harus menggunakan JSON.')
  }
})
