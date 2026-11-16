import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { publicMapFiltersSchema } from '../../../../shared/schemas/map'
import type { PublicMapReport } from '../../../../shared/types/domain'
import { validateInput } from '../../../utils/validation'
import { apiError } from '../../../utils/response'
import { listPublicMapReports } from '../../../services/threat-priority'

// Shareable /map?report=<id> details. An unpublished, withdrawn or private
// report is indistinguishable from a missing one.
export default defineEventHandler(async (event): Promise<{ report: PublicMapReport }> => {
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  const result = await listPublicMapReports(validateInput(publicMapFiltersSchema, {}), id)
  const report = result.reports[0]
  if (!report || report.id !== id) throw apiError(404, 'PUBLIC_REPORT_NOT_FOUND', 'Laporan publik tidak ditemukan atau belum dipublikasikan.')
  return { report }
})
