import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../../utils/auth'
import { validateInput } from '../../../utils/validation'
import { getReportDetail } from '../../../services/report-service'

// Officer review detail: evidence, AI attempts, score components, the internal
// audit trail with officer names, and the allowed workflow actions.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  return getReportDetail(event, user, id)
})
