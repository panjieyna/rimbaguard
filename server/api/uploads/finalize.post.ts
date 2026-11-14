import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { requireSession } from '../../utils/auth'
import { validatedBody } from '../../utils/validation'
import { enforceRateLimit } from '../../utils/rate-limit'
import { finalizeEvidence } from '../../services/evidence-service'

const schema = z.strictObject({ uploadId: z.uuid() })
export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  await enforceRateLimit(event, 'evidence-finalize', user.id, 20, 600)
  const input = await validatedBody(event, schema)
  return finalizeEvidence(user, input.uploadId)
})
