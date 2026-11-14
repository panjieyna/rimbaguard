import { createHash } from 'node:crypto'
import { setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { getServiceDatabase } from './supabase'
import { apiError, databaseUnavailable } from './response'

const resultSchema = z.object({ allowed: z.boolean(), remaining: z.number().int().nonnegative(), retry_after_seconds: z.number().int().nonnegative() })

export async function enforceRateLimit(event: H3Event, scope: string, subject: string, limit: number, windowSeconds: number) {
  const key = createHash('sha256').update(`${scope}:${subject}`).digest('hex')
  const { data, error } = await getServiceDatabase().rpc('consume_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
  if (error) throw databaseUnavailable()
  const result = resultSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!result.success) throw databaseUnavailable()
  setHeader(event, 'x-ratelimit-remaining', String(result.data.remaining))
  if (!result.data.allowed) {
    setHeader(event, 'retry-after', result.data.retry_after_seconds)
    throw apiError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba lagi.')
  }
}
