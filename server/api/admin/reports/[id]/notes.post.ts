import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { adminNoteSchema } from '../../../../../shared/schemas/admin'
import { requireAdmin } from '../../../../utils/auth'
import { enforceRateLimit } from '../../../../utils/rate-limit'
import { validatedBody, validateInput } from '../../../../utils/validation'
import { addNote } from '../../../../services/admin-service'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  await enforceRateLimit(event, 'admin-action', user.id, 120, 600)
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  const body = await validatedBody(event, adminNoteSchema)
  return addNote(user, id, body.note)
})
