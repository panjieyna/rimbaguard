import { defineEventHandler } from 'h3'
import type { PublicStatistics } from '../../../shared/types/domain'
import { getServiceDatabase } from '../../utils/supabase'
import { databaseUnavailable } from '../../utils/response'
import { throwReportDatabaseError } from '../../utils/report-errors'

function count(value: unknown): number {
  if (value === null || value === undefined || value === '') throw databaseUnavailable()
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) throw databaseUnavailable()
  return number
}

export default defineEventHandler(async (): Promise<PublicStatistics> => {
  const { data, error } = await getServiceDatabase().rpc('platform_statistics')
  if (error) throwReportDatabaseError(error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw databaseUnavailable()
  return {
    totalReports: count(row.total_reports), verifiedReports: count(row.verified_reports),
    inProgressReports: count(row.in_progress_reports), namedLocations: count(row.named_locations),
  }
})
