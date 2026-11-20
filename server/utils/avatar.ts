// Path helpers only: this module is imported by every session check, so it
// must not load the native image library (see normalizeAvatar in image-validation).

/** Private bucket; only the service role can reach it. */
export const AVATAR_BUCKET = 'profile-photos'
/** Keep in step with migration 007, which also adds a restrictive server-only policy. */
export const AVATAR_BUCKET_OPTIONS = { public: false, fileSizeLimit: 262_144, allowedMimeTypes: ['image/webp'] }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const AVATAR_PATH = new RegExp(`^(${UUID})/(${UUID})\\.webp$`, 'u')

export interface AuthIdentity {
  id: string
  app_metadata?: Record<string, unknown> | null
}

/**
 * The current photo path lives in auth app_metadata, which only the service role
 * can write. It is trusted only inside the owner's own `<user-id>/` namespace.
 */
export function avatarPathOf(user: AuthIdentity): string | null {
  const value = user.app_metadata?.avatar_path
  if (typeof value !== 'string') return null
  const match = AVATAR_PATH.exec(value)
  return match && match[1] === user.id ? value : null
}

/** The per-upload object id; it versions the photo URL. */
export function avatarVersionOf(path: string | null): string | null {
  return path ? AVATAR_PATH.exec(path)?.[2] ?? null : null
}

/** A same-origin URL that changes with every upload; never a storage path or signed URL. */
export function avatarUrlOf(path: string | null): string | null {
  const version = avatarVersionOf(path)
  return version ? `/api/account/avatar?v=${version}` : null
}
