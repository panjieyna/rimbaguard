import { z } from 'zod'
import { EVIDENCE_MIME_TYPES, MAX_EVIDENCE_BYTES } from '../constants/domain'
import {
  instantSchema,
  latitudeSchema,
  longitudeSchema,
  threatCategorySchema,
  uuidSchema,
} from './common'

const uuidPathPart = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const evidencePathPattern = new RegExp(`^${uuidPathPart}/sealed/${uuidPathPart}\\.(?:jpg|png|webp)$`)

// Shape validation does not authorize access. The server must also verify that this
// immutable, finalized object belongs to the authenticated user before attaching it.
export const evidencePathSchema = z.string()
  .regex(evidencePathPattern, 'Referensi bukti tidak valid.')

export const idempotencyKeySchema = uuidSchema

const reportFieldsSchema = z.strictObject({
  title: z.string().trim()
    .min(5, 'Judul minimal 5 karakter.')
    .max(160, 'Judul maksimal 160 karakter.'),
  category: threatCategorySchema,
  description: z.string().trim()
    .min(20, 'Deskripsi minimal 20 karakter.')
    .max(4_000, 'Deskripsi maksimal 4.000 karakter.'),
  evidencePath: evidencePathSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  incidentTime: instantSchema,
  locationName: z.string().trim()
    .min(3, 'Nama lokasi minimal 3 karakter.')
    .max(160, 'Nama lokasi maksimal 160 karakter.')
    .optional(),
})

/** Capture a fresh clock per request; inject a fixed instant for deterministic tests. */
export function createReportSchema(now: number | Date = Date.now()) {
  const currentTime = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(currentTime)) {
    throw new TypeError('Report validation requires a valid current instant.')
  }

  return reportFieldsSchema.superRefine((report, context) => {
    if (Date.parse(report.incidentTime) > currentTime) {
      context.addIssue({
        code: 'custom',
        path: ['incidentTime'],
        message: 'Waktu kejadian tidak boleh berada di masa depan.',
      })
    }
  })
}

export const uploadDeclarationSchema = z.strictObject({
  fileName: z.string().trim()
    .min(1, 'Nama berkas wajib diisi.')
    .max(160, 'Nama berkas maksimal 160 karakter.')
    .regex(/^[^/\\\u0000-\u001f\u007f]+\.(?:jpe?g|png|webp)$/iu,
      'Nama berkas harus berupa JPEG, PNG, atau WebP tanpa direktori.'),
  mimeType: z.enum(EVIDENCE_MIME_TYPES, { error: 'Gunakan gambar JPEG, PNG, atau WebP.' }),
  size: z.number({ error: 'Ukuran berkas harus berupa angka.' })
    .int('Ukuran berkas harus berupa bilangan bulat.')
    .positive('Berkas tidak boleh kosong.')
    .max(MAX_EVIDENCE_BYTES, 'Ukuran berkas maksimal 5 MB.'),
}).superRefine((upload, context) => {
  const extension = upload.fileName.split('.').at(-1)?.toLowerCase()
  const expectedMime = extension === 'jpg' || extension === 'jpeg'
    ? 'image/jpeg'
    : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : undefined

  if (expectedMime && expectedMime !== upload.mimeType) {
    context.addIssue({
      code: 'custom',
      path: ['mimeType'],
      message: 'Format nama berkas tidak sesuai dengan tipe gambar.',
    })
  }
})
