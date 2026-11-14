import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { MAX_EVIDENCE_BYTES } from '../../shared/constants/domain'
import type { EvidenceMimeType } from '../../shared/types/domain'
import { apiError } from './response'

export const MAX_IMAGE_PIXELS = 20_000_000
export const MAX_SEALED_DIMENSION = 2048

export function detectImageMime(bytes: Uint8Array): EvidenceMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

export function assertEvidenceEnvelope(bytes: Uint8Array, declaredMime: string, declaredSize: number) {
  if (!bytes.byteLength || bytes.byteLength > MAX_EVIDENCE_BYTES) {
    throw apiError(422, 'INVALID_EVIDENCE_SIZE', 'Ukuran gambar harus lebih dari nol dan maksimal 5 MB.')
  }
  if (bytes.byteLength !== declaredSize) throw apiError(422, 'EVIDENCE_SIZE_MISMATCH', 'Ukuran berkas yang tersimpan tidak sesuai dengan unggahan. Pilih kembali foto.')
  if (detectImageMime(bytes) !== declaredMime) throw apiError(422, 'EVIDENCE_MIME_MISMATCH', 'Isi berkas tidak sesuai dengan format gambar yang dipilih.')
}

export async function normalizeEvidence(bytes: Uint8Array, declaredMime: string, declaredSize: number) {
  assertEvidenceEnvelope(bytes, declaredMime, declaredSize)
  const input = Buffer.from(bytes)
  try {
    const image = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false, failOn: 'error' })
    const metadata = await image.metadata()
    const expectedFormat = declaredMime === 'image/jpeg' ? 'jpeg' : declaredMime === 'image/png' ? 'png' : 'webp'
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS || (metadata.pages ?? 1) > 1) {
      throw new Error('invalid_image_structure')
    }
    // Sharp strips metadata by default. A new immutable object is used for the
    // normalized image, so an old incoming upload token cannot alter evidence.
    const normalized = await image.rotate()
      .resize({ width: MAX_SEALED_DIMENSION, height: MAX_SEALED_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
    if (normalized.byteLength > MAX_EVIDENCE_BYTES) throw new Error('normalized_image_too_large')
    return { bytes: normalized, mimeType: 'image/jpeg' as const, size: normalized.byteLength, sha256: createHash('sha256').update(normalized).digest('hex') }
  }
  catch {
    throw apiError(422, 'INVALID_EVIDENCE_IMAGE', 'Gambar tidak dapat dibaca. Gunakan JPEG, PNG, atau WebP statis dengan maksimal 20 juta piksel.')
  }
}
