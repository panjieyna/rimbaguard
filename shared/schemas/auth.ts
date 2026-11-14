import { z } from 'zod'

const emailSchema = z.email('Masukkan alamat email yang valid.')
  .max(254, 'Alamat email terlalu panjang.')
  .transform(value => value.toLowerCase())

const fullNameSchema = z.string()
  .trim()
  .min(2, 'Nama lengkap minimal 2 karakter.')
  .max(100, 'Nama lengkap maksimal 100 karakter.')
  .regex(/^[^\u0000-\u001f\u007f]+$/u, 'Nama lengkap memuat karakter yang tidak didukung.')

export const registerSchema = z.strictObject({
  fullName: fullNameSchema,
  email: z.string().trim().pipe(emailSchema),
  // Preserve the password exactly; trimming changes the credential the user chose.
  password: z.string()
    .min(12, 'Kata sandi minimal 12 karakter.')
    .max(128, 'Kata sandi maksimal 128 karakter.')
    .refine(value => /\S/u.test(value), 'Kata sandi tidak boleh hanya berisi spasi.'),
})

export const loginSchema = z.strictObject({
  email: z.string().trim().pipe(emailSchema),
  password: z.string()
    .min(1, 'Masukkan kata sandi.')
    .max(128, 'Kata sandi maksimal 128 karakter.'),
})
