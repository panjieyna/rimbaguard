export function formatReportDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Waktu tidak tersedia'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(date) + ' WIB'
}

export function localDateTime(value = new Date()): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
