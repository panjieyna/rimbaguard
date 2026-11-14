import { defineEventHandler, getQuery } from 'h3'
import { z } from 'zod'
import { requireSession } from '../../utils/auth'
import { validateInput } from '../../utils/validation'
import { listReports } from '../../services/report-service'

const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  const query = validateInput(querySchema, getQuery(event))
  return listReports(event, user, query.page, query.pageSize)
})
