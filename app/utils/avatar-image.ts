import { MAX_AVATAR_UPLOAD_BYTES } from '#shared/constants/domain'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SOURCE_BYTES = 15_000_000
const SIDE = 384

export interface PreparedAvatar {
  /** Local preview; never uploaded as a URL. */
  dataUrl: string
  /** JPEG bytes as base64, sent in the JSON body. */
  base64: string
}

/** A message that is safe to show to the person who chose the file. */
export class AvatarImageError extends Error {}

/**
 * Crop the centre square of the chosen photo and shrink it in the browser, so
 * the upload stays far below the API body limit. The server still decodes and
 * re-encodes it; nothing here is trusted.
 */
export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new AvatarImageError('Pilih foto berformat JPG, PNG, atau WebP.')
  if (file.size > MAX_SOURCE_BYTES) throw new AvatarImageError('Ukuran foto maksimal 15 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    try { await image.decode() }
    catch { throw new AvatarImageError('Foto tidak dapat dibuka. Pilih foto lain.') }
    // Image elements apply EXIF orientation, so an upright phone photo stays upright.
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    if (!side) throw new AvatarImageError('Foto tidak dapat dibuka. Pilih foto lain.')
    const canvas = document.createElement('canvas')
    canvas.width = SIDE
    canvas.height = SIDE
    const context = canvas.getContext('2d')
    if (!context) throw new AvatarImageError('Browser ini belum dapat menyiapkan foto. Coba browser lain.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, SIDE, SIDE)
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, SIDE, SIDE)
    for (const quality of [0.86, 0.76, 0.64, 0.5]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (Math.floor(base64.length * 3 / 4) <= MAX_AVATAR_UPLOAD_BYTES) return { dataUrl, base64 }
    }
    throw new AvatarImageError('Foto terlalu rumit untuk diperkecil. Pilih foto lain.')
  }
  finally { URL.revokeObjectURL(url) }
}
