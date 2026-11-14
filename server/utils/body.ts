import { apiError } from './response'

// Count real bytes even when Content-Length is absent or untrusted.
export async function readBoundedJson(stream: ReadableStream<Uint8Array>, maximumBytes = 65_536): Promise<unknown> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      length += result.value.byteLength
      if (length > maximumBytes) {
        await reader.cancel().catch(() => {})
        throw apiError(413, 'REQUEST_TOO_LARGE', 'Ukuran permintaan melebihi batas.')
      }
      chunks.push(result.value)
    }
  }
  finally { reader.releaseLock() }
  try {
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  }
  catch { throw apiError(400, 'INVALID_BODY', 'Isi permintaan harus berupa JSON yang valid.') }
}
