import { defineEventHandler, getQuery } from 'h3'
import { adminMapFiltersSchema } from '../../../shared/schemas/map'
import { requireAdmin } from '../../utils/auth'
import { validateInput } from '../../utils/validation'
import { listAdminMapReports } from '../../services/threat-priority'

export default defineEventHandler(async (event) => {
  // The admin middleware also guards this path; the handler does not rely on it.
  const user = await requireAdmin(event)
  const filters = validateInput(adminMapFiltersSchema, getQuery(event))
  return listAdminMapReports(user, filters)
})
