export const AI_FAILURE_MESSAGES = {
  AI_NOT_CONFIGURED: 'Layanan AI belum dikonfigurasi. Laporan tetap tersimpan.',
  AI_TIMEOUT: 'Analisis AI melewati batas waktu. Laporan tetap tersimpan; silakan coba lagi.',
  AI_QUOTA_EXCEEDED: 'Kuota layanan AI sedang dibatasi. Tunggu sebelum mencoba lagi.',
  AI_AUTH_FAILED: 'Konfigurasi akses layanan AI belum dapat digunakan.',
  AI_MODEL_UNAVAILABLE: 'Model AI yang dikonfigurasi belum tersedia untuk analisis ini.',
  AI_PROVIDER_UNAVAILABLE: 'Layanan AI sementara belum dapat dihubungi. Laporan tetap tersimpan.',
  AI_INVALID_OUTPUT: 'Hasil AI tidak memenuhi format yang diwajibkan. Silakan coba analisis lagi.',
  AI_BLOCKED: 'Layanan AI tidak dapat memproses bukti ini. Laporan tetap dapat diperiksa petugas.',
  AI_EVIDENCE_UNAVAILABLE: 'Bukti laporan belum dapat dibaca untuk analisis AI.',
  AI_INTERRUPTED: 'Analisis terhenti sebelum selesai. Silakan coba lagi.',
  AI_STALE_REPORT: 'Informasi laporan telah berubah. Analisis lama tidak digunakan sebagai hasil terbaru.',
} as const

export type AiFailureCode = keyof typeof AI_FAILURE_MESSAGES

export const AI_AUDIT_LABELS: Readonly<Record<string, string>> = {
  ai_analysis_requested: 'Analisis AI dimulai',
  ai_analysis_succeeded: 'Analisis AI selesai',
  ai_analysis_failed: 'Percobaan analisis AI gagal',
}

export function analysisFailureMessage(code: string | null): string {
  return code && Object.hasOwn(AI_FAILURE_MESSAGES, code)
    ? AI_FAILURE_MESSAGES[code as AiFailureCode]
    : 'Analisis belum dapat diselesaikan. Laporan tetap tersimpan dan dapat diperiksa petugas.'
}
