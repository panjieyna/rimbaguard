import type { H3Event } from 'h3'
import sharp from 'sharp'
import type { SessionUser } from '../../shared/types/domain'
import { MAX_EVIDENCE_BYTES } from '../../shared/constants/domain'
import { evidencePathSchema } from '../../shared/schemas/reports'
import { getPermittedReport } from './report-service'
import { getServiceDatabase } from '../utils/supabase'
import { apiError } from '../utils/response'
import { detectImageMime, MAX_IMAGE_PIXELS } from '../utils/image-validation'

export async function readAdminEvidence(event: H3Event, user: SessionUser, reportId: string, size: 'thumbnail' | 'full') {
  if (user.role !== 'admin') throw apiError(403, 'ADMIN_REQUIRED', 'Akses ini hanya tersedia bagi petugas.')
  // Authorize through the current user's RLS before the privileged Storage read.
  // The request accepts a report ID, never a client-supplied object path or URL.
  const report = await getPermittedReport(event, user, reportId)
  const path = evidencePathSchema.safeParse(report.image_path)
  const unavailable = () => apiError(503, 'EVIDENCE_UNAVAILABLE', 'Foto bukti belum dapat dimuat. Silakan coba kembali.')
  if (!path.success || !path.data.startsWith(`${report.user_id}/sealed/`)) throw unavailable()

  try {
    const image = await getServiceDatabase().storage.from('report-evidence').download(path.data)
    if (image.error || !image.data || image.data.size === 0 || image.data.size > MAX_EVIDENCE_BYTES) throw unavailable()
    const bytes = Buffer.from(await image.data.arrayBuffer())
    const mime = detectImageMime(bytes)
    if (!mime) throw unavailable()
    if (size === 'full') return { bytes, mime }

    const thumbnail = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false, failOn: 'error' })
      .rotate()
      .resize({ width: 384, height: 288, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer()
    return { bytes: thumbnail, mime: 'image/webp' as const }
  }
  catch {
    // Storage and decoder exceptions may contain private object details.
    throw unavailable()
  }
}
