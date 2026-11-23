import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import sharp from 'sharp'
import type { SessionUser } from '../../shared/types/domain'
import { MAX_EVIDENCE_BYTES } from '../../shared/constants/domain'

const mocks = vi.hoisted(() => ({ permitted: vi.fn(), download: vi.fn() }))
vi.mock('../../server/services/report-service', () => ({ getPermittedReport: mocks.permitted }))
vi.mock('../../server/utils/supabase', () => ({ getServiceDatabase: () => ({ storage: { from: () => ({ download: mocks.download }) } }) }))
import { readReportEvidence } from '../../server/services/report-evidence'

const event = {} as H3Event
const user: SessionUser = { id: '71000000-0000-4000-8000-000000000001', email: 'unit@example.invalid', fullName: 'Unit test', role: 'public' }
const reportId = '72000000-0000-4000-8000-000000000001'
const path = `${user.id}/sealed/73000000-0000-4000-8000-000000000001.jpg`

beforeEach(() => {
  vi.resetAllMocks()
  mocks.permitted.mockResolvedValue({ user_id: user.id, image_path: path })
})

describe('private report evidence', () => {
  it('authorizes the report before reading storage and produces a bounded metadata-free thumbnail', async () => {
    const source = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#285C48' } }).jpeg().withMetadata().toBuffer()
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(source)]), error: null })
    const result = await readReportEvidence(event, user, reportId, 'thumbnail')
    expect(mocks.permitted).toHaveBeenCalledWith(event, user, reportId)
    expect(mocks.download).toHaveBeenCalledWith(path)
    const metadata = await sharp(result.bytes).metadata()
    expect(result.mime).toBe('image/webp')
    expect(metadata.width).toBe(384)
    expect(metadata.height).toBe(288)
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
  })

  it.each([{ width: 900, height: 300 }, { width: 300, height: 900 }])
  ('keeps both outer evidence edges visible instead of cropping: %j', async ({ width, height }) => {
    const landscape = width > height
    const pixels = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const position = landscape ? x / width : y / height
      const offset = (y * width + x) * 3
      pixels[offset] = position < 0.2 ? 240 : 0
      pixels[offset + 1] = position >= 0.2 && position <= 0.8 ? 120 : 0
      pixels[offset + 2] = position > 0.8 ? 240 : 0
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(source)]), error: null })
    const thumbnail = await readReportEvidence(event, user, reportId, 'thumbnail')
    const { data, info } = await sharp(thumbnail.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const sample = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels
      return data.subarray(offset, offset + 3)
    }
    const first = landscape ? sample(2, Math.floor(info.height / 2)) : sample(Math.floor(info.width / 2), 2)
    const last = landscape ? sample(info.width - 3, Math.floor(info.height / 2)) : sample(Math.floor(info.width / 2), info.height - 3)
    expect(first[0]).toBeGreaterThan(180)
    expect(first[2]).toBeLessThan(60)
    expect(last[2]).toBeGreaterThan(180)
    expect(last[0]).toBeLessThan(60)
  })

  it('never reads privileged storage when ownership/RLS denies the report', async () => {
    const denied = Object.assign(new Error('Report unavailable'), { statusCode: 404 })
    mocks.permitted.mockRejectedValue(denied)
    await expect(readReportEvidence(event, user, reportId, 'thumbnail')).rejects.toBe(denied)
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it.each(['../private.jpg', 'https://example.invalid/private.jpg', path.replace('/sealed/', '/incoming/'), path.replace(user.id, reportId)])
  ('refuses unsafe or mismatched stored evidence paths: %s', async imagePath => {
    mocks.permitted.mockResolvedValue({ user_id: user.id, image_path: imagePath })
    await expect(readReportEvidence(event, user, reportId, 'thumbnail')).rejects.toMatchObject({ statusCode: 503, statusMessage: 'EVIDENCE_UNAVAILABLE' })
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it.each([
    { data: null, error: { message: 'private storage path' } },
    { data: new Blob([]), error: null },
    { data: new Blob([new Uint8Array(MAX_EVIDENCE_BYTES + 1)]), error: null },
    { data: new Blob(['not an image']), error: null },
    { data: new Blob([new Uint8Array([255, 216, 255, 224])]), error: null },
  ])('returns a safe unavailable error for missing or malformed evidence', async download => {
    mocks.download.mockResolvedValue(download)
    await expect(readReportEvidence(event, user, reportId, 'thumbnail')).rejects.toMatchObject({ statusCode: 503, statusMessage: 'EVIDENCE_UNAVAILABLE' })
  })

  it('does not expose storage exception details', async () => {
    mocks.download.mockRejectedValue(new Error(`private provider details: ${path}`))
    await expect(readReportEvidence(event, user, reportId, 'thumbnail')).rejects.toMatchObject({ message: 'Foto bukti belum dapat dimuat. Silakan coba kembali.' })
  })
})
