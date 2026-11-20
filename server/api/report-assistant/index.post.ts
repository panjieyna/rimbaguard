import { defineEventHandler,setResponseStatus } from 'h3'
import { assistantStartSchema } from '../../../shared/schemas/report-assistant'
import { requireSession } from '../../utils/auth'
import { validatedBody } from '../../utils/validation'
import { enforceRateLimit } from '../../utils/rate-limit'
import { startAssistant } from '../../services/report-assistant-service'

export default defineEventHandler(async event => {
  const user = await requireSession(event)
  const input = await validatedBody(event,assistantStartSchema)
  await enforceRateLimit(event,'assistant-user',user.id,6,600)
  await enforceRateLimit(event,'assistant-upload',`${user.id}:${input.uploadId}`,3,600)
  const result = await startAssistant(user,input)
  if (result.draft.status==='processing') setResponseStatus(event,202)
  return result
})
