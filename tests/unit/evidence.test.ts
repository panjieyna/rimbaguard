import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { MAX_EVIDENCE_BYTES } from '../../shared/constants/domain'
import { assertEvidenceEnvelope, detectImageMime, normalizeEvidence } from '../../server/utils/image-validation'
import { throwReportDatabaseError } from '../../server/utils/report-errors'

describe('evidence format and byte validation', () => {
  it('recognizes JPEG, PNG, and WebP signatures without trusting filenames', () => {
    expect(detectImageMime(new Uint8Array([255, 216, 255, 224]))).toBe('image/jpeg')
    expect(detectImageMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png')
    expect(detectImageMime(new TextEncoder().encode('RIFF0000WEBP'))).toBe('image/webp')
    expect(detectImageMime(new TextEncoder().encode('<svg>'))).toBeNull()
  })
  it('rejects MIME spoofing and declarations that differ from stored bytes', () => {
    const bytes = new Uint8Array([255, 216, 255, 224])
    expect(() => assertEvidenceEnvelope(bytes, 'image/png', bytes.length)).toThrow()
    expect(() => assertEvidenceEnvelope(bytes, 'image/jpeg', bytes.length + 1)).toThrow()
  })
  it('accepts exactly five million bytes at the envelope boundary and rejects one extra byte', () => {
    const bytes = new Uint8Array(MAX_EVIDENCE_BYTES)
    bytes.set([255, 216, 255])
    expect(() => assertEvidenceEnvelope(bytes, 'image/jpeg', MAX_EVIDENCE_BYTES)).not.toThrow()
    expect(() => assertEvidenceEnvelope(new Uint8Array(MAX_EVIDENCE_BYTES + 1), 'image/jpeg', MAX_EVIDENCE_BYTES + 1)).toThrow()
  })
  it('rejects a truncated image even if its magic bytes match', async () => {
    const bytes = new Uint8Array([255, 216, 255, 224])
    await expect(normalizeEvidence(bytes, 'image/jpeg', bytes.length)).rejects.toMatchObject({ statusCode: 422 })
  })
  it.each(['png', 'webp', 'jpeg'] as const)('decodes %s and seals JPEG without metadata', async (format) => {
    const original = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#285C48' } }).toFormat(format).withMetadata().toBuffer()
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp'
    const normalized = await normalizeEvidence(original, mime, original.length)
    const metadata = await sharp(normalized.bytes).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(normalized.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(normalized.size).toBe(normalized.bytes.byteLength)
  })
  it('reduces an image to bounded display dimensions', async () => {
    const original = await sharp({ create: { width: 3000, height: 1200, channels: 3, background: '#285C48' } }).png().toBuffer()
    const normalized = await normalizeEvidence(original, 'image/png', original.length)
    const metadata = await sharp(normalized.bytes).metadata()
    expect(metadata.width).toBe(2048)
    expect(metadata.height).toBeLessThanOrEqual(2048)
  })
})

describe('safe reporting errors', () => {
  it.each(['PGRST202', 'PGRST205', '42P01'])('makes a missing migration explicit: %s', (code) => {
    expect(() => throwReportDatabaseError({ code, message: 'private provider details' })).toThrow(expect.objectContaining({ statusCode: 503, statusMessage: 'SCHEMA_UNAVAILABLE' }))
  })
  it('returns a conflict for a reused key with different data', () => {
    expect(() => throwReportDatabaseError({ code: '23505', message: 'idempotency_key_reused' })).toThrow(expect.objectContaining({ statusCode: 409, statusMessage: 'IDEMPOTENCY_CONFLICT' }))
  })
  it('never exposes arbitrary database messages', () => {
    try { throwReportDatabaseError({ code: 'unknown', message: 'sensitive-payload-never-return' }) }
    catch (error) { expect(String(error)).not.toContain('sensitive-payload-never-return') }
  })
})
