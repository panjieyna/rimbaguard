import type { UserRole } from '../../shared/types/domain'

interface AuthProviderFailure { name?: string; status?: number; code?: string }

export interface SafeAuthFailure {
  statusCode: number
  code: string
  message: string
}

const accountExistsCodes = new Set(['user_already_exists', 'email_exists'])

export function isExistingRegistration(error: AuthProviderFailure): boolean {
  return typeof error.code === 'string' && accountExistsCodes.has(error.code)
}

/** Never reflect the provider message, URL, submitted email, or credential. */
export function safeAuthFailure(error: AuthProviderFailure, operation: 'login' | 'register' | 'logout'): SafeAuthFailure {
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    return { statusCode: 429, code: 'AUTH_RATE_LIMITED', message: 'Terlalu banyak percobaan autentikasi. Tunggu beberapa saat lalu coba lagi.' }
  }
  if (operation === 'login' && error.code === 'email_not_confirmed') {
    return { statusCode: 403, code: 'EMAIL_CONFIRMATION_REQUIRED', message: 'Konfirmasikan alamat email melalui tautan yang diterima sebelum masuk.' }
  }
  if (operation === 'login' && (error.code === 'invalid_credentials' || error.status === 401 || error.code === 'user_banned')) {
    return { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi tidak sesuai.' }
  }
  if (operation === 'register' && error.code === 'weak_password') {
    return { statusCode: 422, code: 'PASSWORD_REQUIREMENTS', message: 'Kata sandi belum memenuhi persyaratan keamanan layanan. Gunakan kata sandi yang lebih kuat.' }
  }
  if (error.code === 'captcha_failed') {
    return { statusCode: 422, code: 'AUTH_VERIFICATION_REQUIRED', message: 'Layanan memerlukan verifikasi tambahan. Hubungi pengelola untuk menyelesaikan konfigurasi autentikasi.' }
  }
  if (operation === 'register' && (error.code === 'signup_disabled' || error.code === 'email_provider_disabled')) {
    return { statusCode: 503, code: 'REGISTRATION_UNAVAILABLE', message: 'Pendaftaran belum tersedia. Silakan coba kembali setelah layanan diaktifkan.' }
  }
  // Supabase's built-in mailer only delivers to the project's team; other addresses are refused.
  if (operation === 'register' && error.code === 'email_address_not_authorized') {
    return { statusCode: 422, code: 'REGISTRATION_EMAIL_RESTRICTED', message: 'Email konfirmasi belum dapat dikirim ke alamat ini karena pendaftaran akun baru sedang dibatasi. Silakan masuk menggunakan akun demo yang disediakan.' }
  }
  return { statusCode: 503, code: 'AUTH_UNAVAILABLE', message: 'Layanan autentikasi belum dapat dihubungi. Silakan coba kembali.' }
}

const UUID_PATH = '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const CITIZEN_DESTINATIONS = new RegExp(`^(?:/|/report|/reports(?:${UUID_PATH})?|/map|/about|/account)$`, 'u')
const OFFICER_DESTINATIONS = new RegExp(`^/admin/(?:dashboard|reports(?:${UUID_PATH})?|map|analytics|settings)$`, 'u')

/**
 * A return path is an allowlisted application route for the role, never a URL,
 * API endpoint, or login loop. Officers return to officer pages only.
 */
export function safeAuthRedirect(role: UserRole, requested?: unknown): string {
  const fallback = role === 'admin' ? '/admin/dashboard' : '/reports'
  if (typeof requested !== 'string' || requested.length > 1_024 || !requested.startsWith('/') || requested.startsWith('//') || /[\u0000-\u0020\u007f\\]/u.test(requested)) return fallback
  try {
    const url = new URL(requested, 'https://rimbaguard.invalid')
    if (url.origin !== 'https://rimbaguard.invalid' || url.hash) return fallback
    const allowed = role === 'admin' ? OFFICER_DESTINATIONS : CITIZEN_DESTINATIONS
    return allowed.test(url.pathname) ? `${url.pathname}${url.search}` : fallback
  }
  catch { return fallback }
}
