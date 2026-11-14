import { getRequestWebStream, type H3Event } from 'h3'
import { z } from 'zod'
import { apiError } from './response'
import { readBoundedJson } from './body'

export function validateInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const fields: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || '_form'
    ;(fields[field] ??= []).push(issue.message)
  }
  throw apiError(422, 'VALIDATION_FAILED', 'Periksa kembali data yang Anda masukkan.', fields)
}

export async function validatedBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const stream = getRequestWebStream(event)
  if (!stream) throw apiError(400, 'INVALID_BODY', 'Isi permintaan harus berupa JSON yang valid.')
  const body = await readBoundedJson(stream)
  return validateInput(schema, body)
}
