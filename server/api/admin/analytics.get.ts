import { defineEventHandler, getQuery } from 'h3'
import { analyticsFiltersSchema } from '../../../shared/schemas/admin'
import { requireAdmin } from '../../utils/auth'
import { validateInput } from '../../utils/validation'
import { getAnalytics } from '../../services/admin-service'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  return getAnalytics(user, validateInput(analyticsFiltersSchema, getQuery(event)))
})
