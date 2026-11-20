import type { UploadAuthorizedResponse } from '../../shared/types/report-api'

/** One immutable receipt per selected File; retry finalization without uploading
 * the same bytes twice. Scoped to the current component, never shared users. */
export function useEvidenceUpload() {
  let selected: File | null = null
  let authorization: UploadAuthorizedResponse | null = null
  let finished = false
  let finalized: { uploadId: string; evidencePath: string } | null = null
  function reset() { selected=null; authorization=null; finished=false; finalized=null }
  async function upload(file: File,onProgress: (message:string)=>void) {
    if (selected!==file) { reset(); selected=file }
    if (finalized) return finalized
    onProgress('Menyiapkan unggahan…')
    authorization ??= await $fetch<UploadAuthorizedResponse>('/api/uploads/authorize',{method:'POST',retry:0,timeout:30_000,body:{fileName:file.name,mimeType:file.type,size:file.size}})
    if (!finished) {
      onProgress('Mengunggah foto…')
      let response: Response
      try { response=await fetch(authorization.signedUrl,{method:'PUT',headers:{'content-type':file.type,'x-upsert':'false'},body:file,signal:AbortSignal.timeout(60_000)}) }
      catch { authorization=null; throw new Error('UPLOAD_FAILED') }
      if (!response.ok) { authorization=null; throw new Error('UPLOAD_FAILED') }
      finished=true
    }
    onProgress('Memeriksa foto…')
    const receipt=await $fetch<{evidencePath:string}>('/api/uploads/finalize',{method:'POST',retry:0,timeout:45_000,body:{uploadId:authorization.uploadId}})
    finalized={uploadId:authorization.uploadId,evidencePath:receipt.evidencePath}
    return finalized
  }
  return {upload,reset}
}
