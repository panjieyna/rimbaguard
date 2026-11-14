import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { requireSession } from '../../utils/auth'
import { validateInput } from '../../utils/validation'
import { getReportDetail } from '../../services/report-service'

export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  return getReportDetail(event, user, id)
})
