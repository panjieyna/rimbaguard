import { createError } from 'h3'

export function apiError(statusCode: number, code: string, message: string, fields?: Record<string, string[]>) {
  return createError({
    statusCode,
    statusMessage: code,
    message,
    data: { error: { code, message, ...(fields ? { fields } : {}) } },
  })
}

export function databaseUnavailable() {
  return apiError(503, 'DATABASE_UNAVAILABLE', 'Layanan database belum tersedia. Silakan coba lagi setelah koneksi dipulihkan.')
}
