import { z } from 'zod'

const optionalText = z.preprocess(value => typeof value === 'string' && value.trim() === '' ? undefined : value, z.string().trim().optional())

const environmentSchema = z.object({
  supabaseUrl: optionalText,
  supabaseAnonKey: optionalText,
  supabaseServiceRoleKey: optionalText,
  geminiApiKey: optionalText,
  geminiModel: optionalText,
  appUrl: z.url(),
  setupMode: z.boolean(),
})

export type ServerEnvironment = z.infer<typeof environmentSchema> & { mode: 'setup' | 'configured'; development: boolean }

export class EnvironmentError extends Error {
  constructor(public readonly invalidFields: string[]) {
    super(`Konfigurasi server tidak lengkap atau tidak valid: ${invalidFields.join(', ')}. Periksa .env.example.`)
    this.name = 'EnvironmentError'
  }
}

export function isAllowedServiceUrl(value: string, development: boolean): boolean {
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === 'https:' || (development && local && url.protocol === 'http:'))
  }
  catch { return false }
}

export function resolveEnvironment(input: unknown, development: boolean): ServerEnvironment {
  const result = environmentSchema.safeParse(input)
  if (!result.success) throw new EnvironmentError([...new Set(result.error.issues.map(issue => String(issue.path[0] ?? 'environment')))])
  const values = result.data
  const invalid: string[] = []
  const supplied = [values.supabaseUrl, values.supabaseAnonKey, values.supabaseServiceRoleKey].filter(Boolean).length
  if (!isAllowedServiceUrl(values.appUrl, development)) invalid.push('NUXT_PUBLIC_APP_URL')
  if (values.supabaseUrl && !isAllowedServiceUrl(values.supabaseUrl, development)) invalid.push('SUPABASE_URL')
  if (supplied !== 0 && supplied !== 3) invalid.push('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  if (!development && values.setupMode) invalid.push('RIMBAGUARD_SETUP_MODE (hanya untuk development)')
  if (supplied === 0 && !(development && values.setupMode)) invalid.push('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  if (values.supabaseAnonKey && values.supabaseAnonKey === values.supabaseServiceRoleKey) invalid.push('SUPABASE_SERVICE_ROLE_KEY (harus berbeda dari anon key)')
  if (invalid.length) throw new EnvironmentError(invalid)
  return { ...values, mode: supplied === 3 ? 'configured' : 'setup', development }
}
