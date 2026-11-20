import { defineEventHandler, getHeader, setResponseStatus } from 'h3'
import { createReportSchema, idempotencyKeySchema } from '../../../shared/schemas/reports'
import { requireSession } from '../../utils/auth'
import { validatedBody, validateInput } from '../../utils/validation'
import { enforceRateLimit } from '../../utils/rate-limit'
import { createReport } from '../../services/report-service'
import { assistantConfirmationSchema } from '../../../shared/schemas/report-assistant'
import { createAssistedReport } from '../../services/report-assistant-service'
import { refreshReportPriority } from '../../services/threat-priority'

export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  await enforceRateLimit(event, 'report-submit', user.id, 10, 600)
  const key = validateInput(idempotencyKeySchema, getHeader(event, 'idempotency-key'))
  const { assistant, ...input } = await validatedBody(event, createReportSchema().extend({ assistant: assistantConfirmationSchema.optional() }))
  const result = assistant ? await createAssistedReport(user,input,key,assistant) : await createReport(user, input, key)
  // Awaited (no detached work on serverless). Failure keeps the saved report stale.
  await refreshReportPriority(result.report.id)
  setResponseStatus(event, result.idempotentReplay ? 200 : 201)
  return result
})
