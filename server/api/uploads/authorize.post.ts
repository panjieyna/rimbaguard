import { defineEventHandler } from 'h3'
import { uploadDeclarationSchema } from '../../../shared/schemas/reports'
import { requireSession } from '../../utils/auth'
import { validatedBody } from '../../utils/validation'
import { enforceRateLimit } from '../../utils/rate-limit'
import { authorizeEvidence } from '../../services/evidence-service'

export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  await enforceRateLimit(event, 'evidence-authorize', user.id, 15, 600)
  return authorizeEvidence(user, await validatedBody(event, uploadDeclarationSchema))
})
