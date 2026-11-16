import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { z } from 'zod'
import { analysisRequestSchema } from '../../../../shared/schemas/analysis-request'
import { requireSession } from '../../../utils/auth'
import { validatedBody, validateInput } from '../../../utils/validation'
import { analyzeReport } from '../../../services/analysis-service'
import { refreshReportPriority } from '../../../services/threat-priority'

export default defineEventHandler(async event => {
  const user = await requireSession(event)
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  const request = await validatedBody(event, analysisRequestSchema)
  const result = await analyzeReport(event, user, id, request)
  // A validated AI category can change the effective category and neighborhood.
  if (result.analysis.analysisStatus === 'succeeded' && !result.reused) await refreshReportPriority(id)
  if (['pending', 'processing'].includes(result.analysis.analysisStatus)) setResponseStatus(event, 202)
  return result
})
