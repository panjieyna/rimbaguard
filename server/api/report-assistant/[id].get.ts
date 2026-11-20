import { defineEventHandler,getRouterParam } from 'h3'
import { z } from 'zod'
import { requireSession } from '../../utils/auth'
import { validateInput } from '../../utils/validation'
import { getAssistantDraft } from '../../services/report-assistant-service'
export default defineEventHandler(async event => {
  const user = await requireSession(event)
  return getAssistantDraft(event,user,validateInput(z.uuid(),getRouterParam(event,'id')))
})
