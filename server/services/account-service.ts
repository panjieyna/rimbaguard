import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import type { Database } from '../../shared/types/database'
import type { PasswordChangeInput, PasswordChangeResponse, SessionUser } from '../../shared/types/domain'
import { sessionAuthUser } from '../utils/auth'
import { AVATAR_BUCKET, AVATAR_BUCKET_OPTIONS, avatarPathOf, avatarUrlOf, avatarVersionOf } from '../utils/avatar'
import { getServerEnvironment } from '../utils/config'
import { normalizeAvatar } from '../utils/image-validation'
import { apiError, databaseUnavailable } from '../utils/response'
import { createServiceFetch } from '../utils/service-fetch'
import { getServiceDatabase, getUserDatabase } from '../utils/supabase'

interface ProviderFailure { status?: number; statusCode?: string; code?: string; message?: string }

const authUnavailable = () => apiError(503, 'AUTH_UNAVAILABLE', 'Layanan autentikasi belum dapat dihubungi. Silakan coba kembali.')
const authRateLimited = () => apiError(429, 'AUTH_RATE_LIMITED', 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.')
const fieldError = (field: string, message: string) => apiError(422, 'VALIDATION_FAILED', 'Periksa kembali data yang Anda masukkan.', { [field]: [message] })
const avatarNotFound = () => apiError(404, 'AVATAR_NOT_FOUND', 'Foto profil tidak ditemukan.')
const avatarUnavailable = () => apiError(503, 'AVATAR_UNAVAILABLE', 'Foto profil belum dapat disimpan. Coba kembali sebentar lagi.')

function storageMissing(error: ProviderFailure) {
  return /bucket not found/iu.test(error.message ?? '') || error.statusCode === '404' || error.status === 404
}

/** The service role may update only full_name on profiles (grant in migration 001). */
export async function updateFullName(user: SessionUser, fullName: string): Promise<SessionUser> {
  const { data, error } = await getServiceDatabase().from('profiles')
    .update({ full_name: fullName }).eq('id', user.id).select('full_name').single()
  if (error || typeof data?.full_name !== 'string') throw databaseUnavailable()
  return { ...user, fullName: data.full_name }
}

export async function changePassword(event: H3Event, user: SessionUser, input: PasswordChangeInput): Promise<PasswordChangeResponse> {
  const environment = getServerEnvironment()
  if (!environment.supabaseUrl || !environment.supabaseAnonKey) throw databaseUnavailable()
  // An unlocked, borrowed session alone must not be enough to take over the
  // account. The current password is proven on a separate memory-only client,
  // so this browser's session cookies are untouched.
  const verifier = createClient<Database>(environment.supabaseUrl, environment.supabaseAnonKey, {
    global: { fetch: createServiceFetch() },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const proof = await verifier.auth.signInWithPassword({ email: user.email, password: input.currentPassword })
  if (proof.error || !proof.data.session) {
    const failure = (proof.error ?? {}) as ProviderFailure
    if (failure.status === 429 || failure.code === 'over_request_rate_limit') throw authRateLimited()
    if (failure.code === 'invalid_credentials' || failure.status === 400) throw fieldError('currentPassword', 'Kata sandi saat ini tidak sesuai.')
    throw authUnavailable()
  }
  // That session was only proof of the current password; end it at once.
  await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined)

  const client = getUserDatabase(event)
  const { error } = await client.auth.updateUser({ password: input.newPassword })
  if (error) {
    const failure = error as ProviderFailure
    if (failure.code === 'same_password') throw fieldError('newPassword', 'Kata sandi baru harus berbeda dari kata sandi saat ini.')
    if (failure.code === 'weak_password') throw fieldError('newPassword', 'Kata sandi belum memenuhi persyaratan keamanan layanan. Gunakan kata sandi yang lebih kuat.')
    if (failure.code === 'reauthentication_needed') throw apiError(409, 'REAUTHENTICATION_REQUIRED', 'Demi keamanan, keluar lalu masuk kembali sebelum mengganti kata sandi.')
    if (failure.status === 429) throw authRateLimited()
    throw authUnavailable()
  }
  // Devices still signed in with the old password are signed out; this one stays.
  const others = await client.auth.signOut({ scope: 'others' }).catch(() => ({ error: new Error('sign_out_failed') }))
  return { success: true, otherSessionsSignedOut: !others.error }
}

async function storeAvatar(database: ReturnType<typeof getServiceDatabase>, path: string, bytes: Buffer) {
  const upload = () => database.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: 'image/webp', cacheControl: '0', upsert: false })
  let stored = await upload()
  if (stored.error && storageMissing(stored.error as ProviderFailure)) {
    // First photo on a project without migration 007: create the same private
    // bucket (no browser policy grants access to it), then retry once.
    const created = await database.storage.createBucket(AVATAR_BUCKET, AVATAR_BUCKET_OPTIONS)
    const failure = created.error as ProviderFailure | null
    if (failure && !/already exists/iu.test(failure.message ?? '') && failure.statusCode !== '409') {
      throw apiError(503, 'AVATAR_STORAGE_NOT_READY', 'Penyimpanan foto profil belum dapat disiapkan. Coba kembali nanti.')
    }
    stored = await upload()
  }
  if (stored.error) throw avatarUnavailable()
}

export async function saveAvatar(event: H3Event, user: SessionUser, image: string): Promise<SessionUser> {
  const normalized = await normalizeAvatar(new Uint8Array(Buffer.from(image, 'base64')))
  const previous = avatarPathOf(sessionAuthUser(event))
  const path = `${user.id}/${randomUUID()}.webp`
  const database = getServiceDatabase()
  await storeAvatar(database, path, normalized)
  // app_metadata is writable only with the service role, so a user cannot point
  // their photo at another object. The path is rechecked on every read as well.
  const updated = await database.auth.admin.updateUserById(user.id, { app_metadata: { avatar_path: path } })
  if (updated.error) {
    await database.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined)
    throw avatarUnavailable()
  }
  if (previous) await database.storage.from(AVATAR_BUCKET).remove([previous]).catch(() => undefined)
  return { ...user, avatarUrl: avatarUrlOf(path) }
}

export async function removeAvatar(event: H3Event, user: SessionUser): Promise<SessionUser> {
  const previous = avatarPathOf(sessionAuthUser(event))
  if (!previous) return { ...user, avatarUrl: null }
  const database = getServiceDatabase()
  // A null value deletes the key from app_metadata.
  const updated = await database.auth.admin.updateUserById(user.id, { app_metadata: { avatar_path: null } })
  if (updated.error) throw apiError(503, 'AVATAR_UNAVAILABLE', 'Foto profil belum dapat dihapus. Coba kembali sebentar lagi.')
  await database.storage.from(AVATAR_BUCKET).remove([previous]).catch(() => undefined)
  return { ...user, avatarUrl: null }
}

/** Only the signed-in user's own current photo; an outdated version is gone rather than replaced. */
export async function readAvatar(event: H3Event, version: string | undefined): Promise<Buffer> {
  const path = avatarPathOf(sessionAuthUser(event))
  if (!path || (version !== undefined && version !== avatarVersionOf(path))) throw avatarNotFound()
  const { data, error } = await getServiceDatabase().storage.from(AVATAR_BUCKET).download(path)
  if (error || !data) throw avatarNotFound()
  return Buffer.from(await data.arrayBuffer())
}
