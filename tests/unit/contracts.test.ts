import { describe, expect, it } from 'vitest'
import { MAX_EVIDENCE_BYTES } from '../../shared/constants/domain'
import { threatAnalysisSchema } from '../../shared/schemas/ai'
import { loginSchema, registerSchema } from '../../shared/schemas/auth'
import { coordinatesSchema } from '../../shared/schemas/common'
import {
  createReportSchema,
  evidencePathSchema,
  uploadDeclarationSchema,
} from '../../shared/schemas/reports'

// Fixtures are isolated validation inputs, never runtime reports or AI results.
const evidencePath = 'a7d556fc-1930-40cf-a2c3-1847444c5fb4/sealed/c1797c6f-f49e-4aa2-9b6b-e91193453a80.jpg'
const now = new Date('2026-11-14T03:00:00.000Z')
const reportSchema = createReportSchema(now)
const validReport = {
  title: 'Laporan uji validasi',
  category: 'forest_fire',
  description: 'Deskripsi khusus pengujian kontrak laporan.',
  evidencePath,
  latitude: -3.8,
  longitude: 102.3,
  incidentTime: '2026-11-14T09:00:00+07:00',
}

describe('coordinates', () => {
  it('preserves zero coordinates when actually supplied as numbers', () => {
    expect(coordinatesSchema.parse({ latitude: 0, longitude: 0 }))
      .toEqual({ latitude: 0, longitude: 0 })
  })

  it.each([
    { latitude: '', longitude: 100 },
    { latitude: '-3.8', longitude: 100 },
    { latitude: null, longitude: 100 },
    { latitude: Number.NaN, longitude: 100 },
    { latitude: Infinity, longitude: 100 },
    { latitude: 91, longitude: 100 },
    { latitude: -91, longitude: 100 },
    { latitude: -3, longitude: 181 },
    { latitude: -3, longitude: -181 },
  ])('rejects missing, nonnumeric, nonfinite, or out-of-range values: %j', (input) => {
    expect(coordinatesSchema.safeParse(input).success).toBe(false)
  })
})

describe('report input', () => {
  it('accepts an incident with an explicit time-zone offset', () => {
    expect(reportSchema.parse(validReport).incidentTime).toBe(validReport.incidentTime)
  })

  it('accepts a valid incident at exactly the supplied current instant', () => {
    expect(reportSchema.safeParse({ ...validReport, incidentTime: now.toISOString() }).success).toBe(true)
  })

  it.each([
    '2026-11-14T03:00:00.001Z',
    '2026-11-14T10:00:01+07:00',
    '2026-11-14T09:00:00',
    '2026-02-30T01:00:00Z',
    'not-a-date',
  ])('rejects future, ambiguous, or invalid incident time: %s', (incidentTime) => {
    expect(reportSchema.safeParse({ ...validReport, incidentTime }).success).toBe(false)
  })

  it.each(['status', 'user_id', 'priority', 'score', 'ai_result', 'is_public'])
  ('rejects a forged privileged input field: %s', (field) => {
    expect(reportSchema.safeParse({ ...validReport, [field]: 'forged' }).success).toBe(false)
  })

  it('validates normalized text length and bounded categories', () => {
    expect(reportSchema.safeParse({ ...validReport, title: '    ' }).success).toBe(false)
    expect(reportSchema.safeParse({ ...validReport, description: 'x'.repeat(4_001) }).success).toBe(false)
    expect(reportSchema.safeParse({ ...validReport, category: 'confirmed_illegal_logging' }).success).toBe(false)
  })

  it('rejects invalid validation-clock configuration', () => {
    expect(() => createReportSchema(new Date('invalid'))).toThrow(TypeError)
  })

  it.each([
    'https://example.test/image.jpg',
    '../private/image.jpg',
    `${evidencePath}?token=secret`,
    evidencePath.replace('/', '%2F'),
    evidencePath.replace('.jpg', '.svg'),
    evidencePath.replace('/sealed/', '/incoming/'),
  ])('rejects arbitrary URLs or unsafe evidence references: %s', (path) => {
    expect(evidencePathSchema.safeParse(path).success).toBe(false)
  })
})

describe('auth input', () => {
  const registration = {
    fullName: '  Pengguna Uji  ',
    email: '  PENGGUNA@example.test  ',
    password: 'sandi panjang uji ',
  }

  it('normalizes identity text without changing the password', () => {
    const result = registerSchema.parse(registration)
    expect(result.fullName).toBe('Pengguna Uji')
    expect(result.email).toBe('pengguna@example.test')
    expect(result.password).toBe(registration.password)
  })

  it('rejects attempted public admin registration', () => {
    expect(registerSchema.safeParse({ ...registration, role: 'admin' }).success).toBe(false)
  })

  it('rejects weak registration passwords and malformed email', () => {
    expect(registerSchema.safeParse({ ...registration, password: 'short' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...registration, password: ' '.repeat(12) }).success).toBe(false)
    expect(registerSchema.safeParse({ ...registration, email: 'invalid' }).success).toBe(false)
  })

  it('requires a password for login without applying new-account password policy', () => {
    expect(loginSchema.safeParse({ email: 'u@example.test', password: '' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'u@example.test', password: 'existing' }).success).toBe(true)
  })
})

describe('upload declaration', () => {
  const upload = { fileName: 'bukti.jpg', mimeType: 'image/jpeg', size: MAX_EVIDENCE_BYTES }

  it('accepts the exact 5 MB upper boundary', () => {
    expect(uploadDeclarationSchema.safeParse(upload).success).toBe(true)
  })

  it.each([0, -1, 0.5, MAX_EVIDENCE_BYTES + 1, Infinity, '100'])
  ('rejects invalid file size: %s', (size) => {
    expect(uploadDeclarationSchema.safeParse({ ...upload, size }).success).toBe(false)
  })

  it('rejects unsupported MIME, mismatch, paths, and URL injection', () => {
    expect(uploadDeclarationSchema.safeParse({ ...upload, mimeType: 'image/svg+xml' }).success).toBe(false)
    expect(uploadDeclarationSchema.safeParse({ ...upload, mimeType: 'image/png' }).success).toBe(false)
    expect(uploadDeclarationSchema.safeParse({ ...upload, fileName: '../bukti.jpg' }).success).toBe(false)
    expect(uploadDeclarationSchema.safeParse({ ...upload, imageUrl: 'https://example.test/a.jpg' }).success).toBe(false)
  })
})

describe('AI output', () => {
  const analysis = {
    category: 'uncertain',
    detected_indicators: [],
    visual_observation: 'Bukti uji tidak cukup jelas untuk penilaian.',
    risk_level: 'uncertain',
    confidence: 0.1,
    reasoning_summary: 'Informasi pada bukti uji terbatas.',
    recommendation: 'Perlu pemeriksaan aman oleh petugas.',
    needs_human_verification: true,
  }

  it('allows uncertainty instead of forcing a threat classification', () => {
    expect(threatAnalysisSchema.safeParse(analysis).success).toBe(true)
  })

  it.each([-0.1, 1.01, Number.NaN, Infinity, '0.8'])
  ('rejects out-of-range or nonnumeric confidence: %s', (confidence) => {
    expect(threatAnalysisSchema.safeParse({ ...analysis, confidence }).success).toBe(false)
  })

  it('requires human verification and every bounded output field', () => {
    expect(threatAnalysisSchema.safeParse({ ...analysis, needs_human_verification: false }).success).toBe(false)
    expect(threatAnalysisSchema.safeParse({ ...analysis, reasoning_summary: undefined }).success).toBe(false)
    expect(threatAnalysisSchema.safeParse({ ...analysis, recommendation: 'x'.repeat(2_001) }).success).toBe(false)
    expect(threatAnalysisSchema.safeParse({ ...analysis, detected_indicators: Array(21).fill('indicator') }).success).toBe(false)
  })

  it('rejects invented provider fields and unsupported category values', () => {
    expect(threatAnalysisSchema.safeParse({ ...analysis, officers_contacted: true }).success).toBe(false)
    expect(threatAnalysisSchema.safeParse({ ...analysis, category: 'confirmed_crime' }).success).toBe(false)
  })
})
