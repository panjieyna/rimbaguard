import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { createReportSchema } from '../../../shared/schemas/reports'
import { requireSession } from '../../utils/auth'
import { validatedBody, validateInput } from '../../utils/validation'
import { enforceRateLimit } from '../../utils/rate-limit'
import { updateReport } from '../../services/report-service'

export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  await enforceRateLimit(event, 'report-update', user.id, 15, 600)
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  const schema = z.strictObject({ expectedRevision: z.number().int().positive(), ...createReportSchema().shape })
  const body = await validatedBody(event, schema)
  const { expectedRevision, ...fields } = body
  const input = validateInput(createReportSchema(), fields)
  return updateReport(user, id, expectedRevision, input)
})
