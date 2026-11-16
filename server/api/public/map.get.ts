import { defineEventHandler, getQuery } from 'h3'
import { publicMapFiltersSchema } from '../../../shared/schemas/map'
import { validateInput } from '../../utils/validation'
import { listPublicMapReports } from '../../services/threat-priority'

export default defineEventHandler(async (event) => {
  const filters = validateInput(publicMapFiltersSchema, getQuery(event))
  return listPublicMapReports(filters)
})
