import { defineEventHandler } from 'h3'
import { PUBLIC_REPORT_STATUSES } from '../../../shared/constants/domain'
import type { PublicMapReport } from '../../../shared/types/domain'
import { getServiceDatabase } from '../../utils/supabase'
import { databaseUnavailable } from '../../utils/response'
import { throwReportDatabaseError } from '../../utils/report-errors'

const LIMIT = 500

export default defineEventHandler(async () => {
  const { data, error } = await getServiceDatabase().from('reports')
    .select('id,report_code,category,public_summary,latitude,longitude,incident_time,published_at,status')
    .eq('is_public', true).eq('is_simulation', false).in('status', [...PUBLIC_REPORT_STATUSES])
    .order('incident_time', { ascending: false }).limit(LIMIT + 1)
  if (error) throwReportDatabaseError(error)
  if (!Array.isArray(data)) throw databaseUnavailable()
  const reports: PublicMapReport[] = data.slice(0, LIMIT).map((row) => {
    const latitude = Number(row.latitude)
    const longitude = Number(row.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !row.public_summary || !row.published_at || !PUBLIC_REPORT_STATUSES.includes(row.status as typeof PUBLIC_REPORT_STATUSES[number])) throw databaseUnavailable()
    return {
      id: row.id, reportCode: row.report_code, category: row.category, summary: row.public_summary,
      approximateLatitude: Math.round(latitude * 100) / 100, approximateLongitude: Math.round(longitude * 100) / 100,
      coordinatesAreApproximate: true, incidentTime: row.incident_time, publishedAt: row.published_at,
      status: row.status as typeof PUBLIC_REPORT_STATUSES[number], priority: null,
    }
  })
  return { reports, limited: data.length > LIMIT, limit: LIMIT }
})
