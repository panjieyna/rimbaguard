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
