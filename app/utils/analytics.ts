import type { ReportStatus } from '#shared/types/domain'

/** Dates arrive as WIB calendar days (YYYY-MM-DD); format them without shifting. */
const dayFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function utc(date: string) { return new Date(`${date}T00:00:00Z`) }

export interface TimeBucket { label: string; count: number }

/**
 * Daily bars for short ranges; 7-day buckets for 90 days and calendar months
 * for a year, so the chart never needs hundreds of hairline bars.
 */
export function timeBuckets(daily: { date: string; count: number }[], days: number): TimeBucket[] {
  if (days <= 30) return daily.map(day => ({ label: dayFormat.format(utc(day.date)), count: day.count }))
  if (days <= 90) {
    const buckets: TimeBucket[] = []
    for (let index = 0; index < daily.length; index += 7) {
      const slice = daily.slice(index, index + 7)
      const first = slice[0]!.date
      const last = slice[slice.length - 1]!.date
      buckets.push({ label: first === last ? dayFormat.format(utc(first)) : `${dayFormat.format(utc(first))}–${dayFormat.format(utc(last))}`, count: slice.reduce((sum, day) => sum + day.count, 0) })
    }
    return buckets
  }
  const months = new Map<string, TimeBucket>()
  for (const day of daily) {
    const key = day.date.slice(0, 7)
    const bucket = months.get(key) ?? { label: monthFormat.format(utc(`${key}-01`)), count: 0 }
    bucket.count += day.count
    months.set(key, bucket)
  }
  return [...months.values()]
}

export function formatCount(value: number) {
  return new Intl.NumberFormat('id-ID').format(value)
}

const longDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const longDayMonth = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** "19 Oktober – 17 November 2026"; the year is repeated only when it changes. */
export function formatDateRange(from: string, to: string) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${(sameYear ? longDayMonth : longDate).format(utc(from))} – ${longDate.format(utc(to))}`
}

const percentFormat = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 0 })

/** Whole-number share; a non-zero part never reads as "0%". */
export function formatPercent(part: number, total: number) {
  if (total <= 0) return percentFormat.format(0)
  if (part > 0 && part / total < 0.005) return '<1%'
  return percentFormat.format(part / total)
}

/** Plain-language names for the bucket size that timeBuckets() picks for a range. */
export function bucketWording(days: number) {
  if (days <= 30) return { title: 'Laporan masuk per hari', axis: 'Tanggal', unit: 'hari', at: 'pada' }
  if (days <= 90) return { title: 'Laporan masuk per minggu', axis: 'Minggu', unit: 'minggu', at: 'pada minggu' }
  return { title: 'Laporan masuk per bulan', axis: 'Bulan', unit: 'bulan', at: 'pada bulan' }
}

/** The busiest bucket(s); no labels when nothing was reported. */
export function peakBuckets(buckets: TimeBucket[]) {
  const max = Math.max(0, ...buckets.map(bucket => bucket.count))
  return { max, labels: max > 0 ? buckets.filter(bucket => bucket.count === max).map(bucket => bucket.label) : [] }
}

/**
 * The eight workflow statuses read as four stages for a general audience.
 * Rejected reports leave the flow and are returned separately.
 */
const HANDLING_STAGES = [
  { key: 'undecided', label: 'Belum diverifikasi', description: 'Petugas belum memutuskan apakah laporan ini benar.', statuses: ['pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information'] },
  { key: 'verified', label: 'Terverifikasi', description: 'Dinyatakan benar oleh petugas, menunggu tindak lanjut.', statuses: ['verified'] },
  { key: 'in_progress', label: 'Sedang ditindaklanjuti', description: 'Petugas sedang menangani laporan ini.', statuses: ['in_progress'] },
  { key: 'resolved', label: 'Selesai ditangani', description: 'Penanganan laporan sudah selesai.', statuses: ['resolved'] },
] as const satisfies readonly { key: string; label: string; description: string; statuses: readonly ReportStatus[] }[]

export type HandlingStageKey = (typeof HANDLING_STAGES)[number]['key']
export interface HandlingStage {
  key: HandlingStageKey
  label: string
  description: string
  count: number
  /** Non-zero statuses inside a grouped stage, in workflow order. */
  details: { status: ReportStatus; count: number }[]
}

/** The stage a status belongs to, for tables that list the raw statuses. */
export function stageLabelOf(status: ReportStatus) {
  return HANDLING_STAGES.find(stage => (stage.statuses as readonly ReportStatus[]).includes(status))?.label ?? 'Ditolak'
}

export function handlingStages(statusCounts: { status: ReportStatus; count: number }[]) {
  const countOf = (status: ReportStatus) => statusCounts.find(row => row.status === status)?.count ?? 0
  const stages: HandlingStage[] = HANDLING_STAGES.map((stage) => {
    const statuses: readonly ReportStatus[] = stage.statuses
    return {
      key: stage.key,
      label: stage.label,
      description: stage.description,
      count: statuses.reduce((sum, status) => sum + countOf(status), 0),
      details: statuses.length > 1 ? statuses.map(status => ({ status, count: countOf(status) })).filter(detail => detail.count > 0) : [],
    }
  })
  return { stages, rejected: countOf('rejected') }
}
