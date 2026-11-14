import type { ZodError } from 'zod'

export function getFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) (fields[issue.path.join('.') || '_form'] ??= []).push(issue.message)
  return fields
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function readApiError(error: unknown, fallback = 'Permintaan belum berhasil. Silakan coba lagi.') {
  const payload = record(record(error).data)
  const detail = record(record(payload.data).error)
  const fields: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(record(detail.fields))) {
    if (Array.isArray(value)) fields[key] = value.filter((item): item is string => typeof item === 'string').slice(0, 3)
  }
  return {
    message: typeof detail.message === 'string' ? detail.message : fallback,
    code: typeof detail.code === 'string' ? detail.code : 'REQUEST_FAILED',
    fields,
  }
}
