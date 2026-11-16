import { defineEventHandler, getQuery } from 'h3'
import { queueFiltersSchema } from '../../../../shared/schemas/admin'
import { requireAdmin } from '../../../utils/auth'
import { validateInput } from '../../../utils/validation'
import { listQueue } from '../../../services/admin-service'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  return listQueue(user, validateInput(queueFiltersSchema, getQuery(event)))
})
