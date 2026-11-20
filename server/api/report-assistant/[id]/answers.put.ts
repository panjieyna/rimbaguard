import { defineEventHandler,getRouterParam } from 'h3'
import { z } from 'zod'
import { assistantAnswersSchema } from '../../../../shared/schemas/report-assistant'
import { requireSession } from '../../../utils/auth'
import { validateInput,validatedBody } from '../../../utils/validation'
import { enforceRateLimit } from '../../../utils/rate-limit'
import { answerAssistant } from '../../../services/report-assistant-service'
export default defineEventHandler(async event => {
  const user = await requireSession(event)
  const id = validateInput(z.uuid(),getRouterParam(event,'id'))
  const input = await validatedBody(event,assistantAnswersSchema)
  await enforceRateLimit(event,'assistant-answers',user.id,30,600)
  return answerAssistant(user,id,input)
})
