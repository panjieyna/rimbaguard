export const USER_ROLES = ['public', 'admin'] as const

export const THREAT_CATEGORIES = [
  'illegal_logging_suspected',
  'forest_fire',
  'land_clearing',
  'suspicious_human_activity',
  'other_environmental_threat',
] as const

export const REPORT_STATUSES = [
  'pending_analysis',
  'analysis_failed',
  'pending_verification',
  'needs_more_information',
  'verified',
  'rejected',
  'in_progress',
  'resolved',
] as const

export const PRIORITY_LEVELS = ['high', 'medium', 'low'] as const
export const AI_CATEGORIES = [...THREAT_CATEGORIES, 'uncertain'] as const
export const AI_RISK_LEVELS = ['high', 'medium', 'low', 'uncertain'] as const
export const PUBLIC_REPORT_STATUSES = ['verified', 'in_progress', 'resolved'] as const

export const EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_EVIDENCE_BYTES = 5_000_000

export const THREAT_CATEGORY_LABELS: Record<(typeof THREAT_CATEGORIES)[number], string> = {
  illegal_logging_suspected: 'Dugaan penebangan liar',
  forest_fire: 'Kebakaran hutan',
  land_clearing: 'Pembukaan lahan',
  suspicious_human_activity: 'Aktivitas manusia mencurigakan',
  other_environmental_threat: 'Ancaman lingkungan lainnya',
}

export const REPORT_STATUS_LABELS: Record<(typeof REPORT_STATUSES)[number], string> = {
  pending_analysis: 'Menunggu analisis',
  analysis_failed: 'Analisis gagal',
  pending_verification: 'Menunggu verifikasi',
  needs_more_information: 'Memerlukan informasi tambahan',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
  in_progress: 'Sedang ditindaklanjuti',
  resolved: 'Selesai ditangani',
}

export const PRIORITY_LABELS: Record<(typeof PRIORITY_LEVELS)[number], string> = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',
}
