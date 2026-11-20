import { z } from 'zod'
import { MAX_AVATAR_UPLOAD_BYTES } from '../constants/domain'
import { fullNameSchema, newPasswordSchema } from './auth'

export const profileUpdateSchema = z.strictObject({
  fullName: fullNameSchema,
})

export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string()
    .min(1, 'Masukkan kata sandi saat ini.')
    .max(128, 'Kata sandi maksimal 128 karakter.'),
  newPassword: newPasswordSchema,
}).refine(input => input.newPassword !== input.currentPassword, {
  path: ['newPassword'],
  message: 'Kata sandi baru harus berbeda dari kata sandi saat ini.',
})

// Base64 grows bytes by 4/3; this cap keeps the JSON body inside the 64 KB API limit.
export const avatarUploadSchema = z.strictObject({
  image: z.base64('Foto profil tidak dapat dibaca. Pilih foto lain.')
    .min(4, 'Pilih foto profil.')
    .max(Math.ceil(MAX_AVATAR_UPLOAD_BYTES / 3) * 4, 'Foto profil terlalu besar. Pilih foto lain.'),
})

/** Removing a photo carries no fields; an empty JSON object satisfies the API JSON rule. */
export const avatarRemovalSchema = z.strictObject({})
