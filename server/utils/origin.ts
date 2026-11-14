export function isSameOriginRequest(origin: string | undefined, appUrl: string, fetchSite?: string): boolean {
  if (fetchSite === 'cross-site' || !origin) return false
  try { return new URL(origin).origin === new URL(appUrl).origin }
  catch { return false }
}
