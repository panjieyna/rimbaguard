import { createHash, randomUUID } from 'node:crypto'
import { isError } from 'h3'
import type { SessionUser, UploadDeclaration } from '../../shared/types/domain'
import type { UploadAuthorizedResponse, UploadFinalizedResponse } from '../../shared/types/report-api'
import { getServiceDatabase } from '../utils/supabase'
import { apiError } from '../utils/response'
import { normalizeEvidence } from '../utils/image-validation'
import { throwReportDatabaseError } from '../utils/report-errors'

const BUCKET = 'report-evidence'

async function cleanupExpiredEvidence(userId: string) {
  const database = getServiceDatabase()
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString()
  const { data, error } = await database.from('evidence_uploads').select('*')
    .eq('user_id', userId).is('report_id', null).lt('expires_at', cutoff)
    .in('status', ['pending', 'processing', 'finalized']).limit(5)
  if (error) throwReportDatabaseError(error)
  for (const upload of data ?? []) {
    if (upload.processing_expires_at && Date.parse(upload.processing_expires_at) > Date.now()) continue
    // Expired receipts cannot be attached by create/update RPCs, preventing a
    // cleanup race from deleting evidence used by a concurrently created report.
    const removed = await database.storage.from(BUCKET).remove([upload.incoming_path, upload.sealed_path])
    if (removed.error) continue
    const deleted = await database.rpc('delete_expired_evidence_upload', { p_upload_id: upload.id, p_actor_id: userId })
    if (deleted.error && ['PGRST202', '42883'].includes(deleted.error.code)) throwReportDatabaseError(deleted.error)
  }
}

export async function authorizeEvidence(user: SessionUser, declaration: UploadDeclaration): Promise<UploadAuthorizedResponse> {
  await cleanupExpiredEvidence(user.id)
  const database = getServiceDatabase()
  const uploadId = randomUUID()
  const extension = declaration.fileName.split('.').at(-1)!.toLowerCase()
  const path = `${user.id}/incoming/${uploadId}.${extension}`
  const sealedPath = `${user.id}/sealed/${uploadId}.jpg`
  const inserted = await database.from('evidence_uploads').insert({
    id: uploadId, user_id: user.id, incoming_path: path, sealed_path: sealedPath,
    declared_mime_type: declaration.mimeType, declared_size: declaration.size,
  })
  if (inserted.error) throwReportDatabaseError(inserted.error)
  const { data, error } = await database.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error || !data?.signedUrl || !data.token) throw apiError(503, 'UPLOAD_UNAVAILABLE', 'Unggahan belum dapat disiapkan. Coba kembali sebentar lagi.')
  return { uploadId, path, signedUrl: data.signedUrl, token: data.token }
}

export async function finalizeEvidence(user: SessionUser, uploadId: string): Promise<UploadFinalizedResponse> {
  const database = getServiceDatabase()
  const processingToken = randomUUID()
  const claimed = await database.rpc('claim_evidence_upload', { p_upload_id: uploadId, p_actor_id: user.id, p_processing_token: processingToken })
  if (claimed.error) throwReportDatabaseError(claimed.error)
  const receipt = claimed.data
  if (!receipt || receipt.user_id !== user.id) throw apiError(404, 'EVIDENCE_NOT_FOUND', 'Unggahan bukti tidak ditemukan.')
  if (receipt.status === 'finalized' || receipt.status === 'attached') return { evidencePath: receipt.sealed_path }
  if (receipt.status !== 'processing' || receipt.processing_token !== processingToken) throw apiError(409, 'UPLOAD_PROCESSING', 'Foto sedang diperiksa. Coba kembali sebentar lagi.')
  try {
    const incoming = await database.storage.from(BUCKET).download(receipt.incoming_path)
    if (incoming.error || !incoming.data) throw apiError(409, 'UPLOAD_NOT_RECEIVED', 'Foto belum diterima penyimpanan. Ulangi unggahan sebelum melanjutkan.')
    const normalized = await normalizeEvidence(new Uint8Array(await incoming.data.arrayBuffer()), receipt.declared_mime_type, receipt.declared_size)
    const stored = await database.storage.from(BUCKET).upload(receipt.sealed_path, normalized.bytes, {
      contentType: normalized.mimeType, cacheControl: '0', upsert: false,
    })
    if (stored.error) {
      // A previous request can stop after storing bytes but before committing its
      // receipt. Recover only when the immutable stored object matches exactly.
      const existing = await database.storage.from(BUCKET).download(receipt.sealed_path)
      if (existing.error || !existing.data) throw apiError(503, 'UPLOAD_UNAVAILABLE', 'Foto belum dapat disimpan. Coba finalisasi kembali.')
      if (existing.data.size !== normalized.size) throw apiError(409, 'EVIDENCE_CONFLICT', 'Unggahan bertentangan dengan bukti yang sudah disimpan. Pilih ulang foto.')
      const digest = createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')
      if (digest !== normalized.sha256) throw apiError(409, 'EVIDENCE_CONFLICT', 'Unggahan bertentangan dengan bukti yang sudah disimpan. Pilih ulang foto.')
    }
    const completed = await database.rpc('complete_evidence_upload', {
      p_upload_id: uploadId, p_actor_id: user.id, p_processing_token: processingToken,
      p_sealed_size: normalized.size, p_sealed_mime_type: normalized.mimeType, p_sealed_sha256: normalized.sha256,
    })
    if (completed.error) throwReportDatabaseError(completed.error)
    if (!completed.data || !['finalized', 'attached'].includes(completed.data.status)) throw apiError(503, 'UPLOAD_UNAVAILABLE', 'Konfirmasi penyimpanan bukti belum tersedia. Coba kembali.')
    return { evidencePath: completed.data.sealed_path }
  }
  catch (error) {
    // No detached work and no deletion of a sealed object another retry may use.
    try { await database.rpc('fail_evidence_upload', { p_upload_id: uploadId, p_actor_id: user.id, p_processing_token: processingToken }) }
    catch { /* An expired processing lease allows a later retry to recover. */ }
    if (isError(error)) throw error
    throw apiError(503, 'UPLOAD_UNAVAILABLE', 'Pemeriksaan foto belum dapat diselesaikan. Coba kembali sebentar lagi.')
  }
}
