import { defineEventHandler, getHeader, setResponseStatus } from 'h3'
import { createReportSchema, idempotencyKeySchema } from '../../../shared/schemas/reports'
import { requireSession } from '../../utils/auth'
import { validatedBody, validateInput } from '../../utils/validation'
import { enforceRateLimit } from '../../utils/rate-limit'
import { createReport } from '../../services/report-service'

export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  await enforceRateLimit(event, 'report-submit', user.id, 10, 600)
  const key = validateInput(idempotencyKeySchema, getHeader(event, 'idempotency-key'))
  const input = await validatedBody(event, createReportSchema())
  const result = await createReport(user, input, key)
  setResponseStatus(event, result.idempotentReplay ? 200 : 201)
  return result
})
