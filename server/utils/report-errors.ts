import { apiError, databaseUnavailable } from './response'

interface DatabaseFailure { code?: string; message?: string }

export function throwReportDatabaseError(error: DatabaseFailure): never {
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')) {
    throw apiError(503, 'SCHEMA_UNAVAILABLE', 'Skema pelaporan belum tersedia. Hubungkan migrasi Fase 2 sebelum mencoba lagi.')
  }
  if (['PT409', '40001'].includes(error.code ?? '')) throw apiError(409, 'REPORT_CONFLICT', 'Laporan atau unggahan sedang diperbarui. Muat ulang lalu coba lagi.')
  if (error.code === 'P0002') throw apiError(404, 'REPORT_NOT_FOUND', 'Laporan atau bukti tidak ditemukan.')
  if (error.code === '42501') throw apiError(403, 'REPORT_FORBIDDEN', 'Anda tidak memiliki izin untuk tindakan ini.')
  if (['idempotency_payload_conflict', 'idempotency_key_reused'].includes(error.message ?? '')) {
    throw apiError(409, 'IDEMPOTENCY_CONFLICT', 'Kunci pengiriman sudah digunakan untuk data berbeda. Mulai pengiriman baru.')
  }
  if (error.code === '23505') throw apiError(409, 'DUPLICATE_SUBMISSION', 'Permintaan ini bertentangan dengan kiriman yang sudah tersimpan.')
  if (error.message?.includes('expired')) throw apiError(409, 'EVIDENCE_EXPIRED', 'Batas waktu unggahan berakhir. Unggah kembali foto bukti.')
  if (['22023', '23514'].includes(error.code ?? '')) {
    throw apiError(422, 'REPORT_STATE_INVALID', 'Data laporan atau status bukti tidak sesuai. Periksa data atau unggah kembali bukti.')
  }
  throw databaseUnavailable()
}
