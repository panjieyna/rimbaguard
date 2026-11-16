export function isSameOriginRequest(origin: string | undefined, appUrl: string, fetchSite?: string): boolean {
  if (fetchSite === 'cross-site' || !origin) return false
  try {
    const parsed = new URL(origin)
    return parsed.origin === origin && parsed.origin === new URL(appUrl).origin
  }
  catch { return false }
}

/** Keep local browser cookies and callbacks on the configured origin. */
export function developmentCanonicalRedirect(input: {
  requestUrl: string
  appUrl: string
  method: string
  development: boolean
  upgrade?: string
}): string | null {
  if (!input.development || !['GET', 'HEAD'].includes(input.method) || input.upgrade !== undefined) return null
  try {
    const request = new URL(input.requestUrl)
    const configured = new URL(input.appUrl)
    const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
    if (!loopback.has(request.hostname) || !loopback.has(configured.hostname)
      || !['http:', 'https:'].includes(request.protocol)
      || request.protocol !== configured.protocol || request.port !== configured.port
      || request.username || request.password || configured.username || configured.password
      || request.origin === configured.origin
      || request.pathname === '/api' || request.pathname.startsWith('/api/')) return null
    // Assign the path separately so //attacker.example cannot change the target host.
    const target = new URL(configured.origin)
    target.pathname = request.pathname
    target.search = request.search
    return target.href
  }
  catch { return null }
}
