import { defineEventHandler, getQuery } from 'h3'
import { analyticsFiltersSchema } from '../../../shared/schemas/admin'
import { requireAdmin } from '../../utils/auth'
import { validateInput } from '../../utils/validation'
import { getDashboard } from '../../services/admin-service'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { dataset } = validateInput(analyticsFiltersSchema, { dataset: getQuery(event).dataset })
  return getDashboard(user, dataset)
})
