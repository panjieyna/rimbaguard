import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { isSafeServiceUrl } from './lib/service-checks.mjs'

// This provisions retained, low-privilege simulation and reader identities.
// It does not send email, alter application roles, or create incident reports.
const target = '.env.e2e'
if (existsSync('.env')) process.loadEnvFile('.env')
if (existsSync(target)) process.loadEnvFile(target)

function fail(message) { console.error(message); process.exit(1) }
const url = process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NUXT_SUPABASE_ANON_KEY
if (!isSafeServiceUrl(url) || !key || !anonKey) fail('Konfigurasi Supabase privat belum lengkap. Nilai credential tidak ditampilkan.')
const ignored = spawnSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'check-ignore', '--', target], { encoding: 'utf8', windowsHide: true })
if (ignored.status !== 0) fail('.env.e2e harus diabaikan Git sebelum credential uji dibuat.')
const database = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const ledger = await database.from('evidence_uploads').select('id').limit(0)
if (ledger.error) fail('Migrasi Fase 2 belum tersedia; tidak membuat akun uji.')

const primary = {
  email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD,
  id: process.env.RIMBAGUARD_TEST_USER_ID,
  managed: process.env.E2E_PROVISIONED_BY_RIMBAGUARD === 'true',
  keys: ['E2E_EMAIL', 'E2E_PASSWORD', 'RIMBAGUARD_TEST_USER_ID', 'E2E_PROVISIONED_BY_RIMBAGUARD'],
  prefix: 'qa-rimba', name: 'Akun Simulasi Pengujian RimbaGuard',
}
const reader = {
  email: process.env.E2E_READER_EMAIL, password: process.env.E2E_READER_PASSWORD,
  id: process.env.E2E_READER_USER_ID,
  managed: process.env.E2E_READER_PROVISIONED_BY_RIMBAGUARD === 'true',
  keys: ['E2E_READER_EMAIL', 'E2E_READER_PASSWORD', 'E2E_READER_USER_ID', 'E2E_READER_PROVISIONED_BY_RIMBAGUARD'],
  prefix: 'qa-reader-rimba', name: 'Akun Pembaca Pengujian RimbaGuard',
}

async function save() {
  // Preserve unrelated settings and the primary values while adding the reader.
  const entries = new Map()
  for (const identity of [primary, reader]) {
    if (!identity.email && !identity.password && !identity.id && !identity.managed) continue
    const values = [identity.email || '', identity.password || '', identity.id || '', String(identity.managed)]
    identity.keys.forEach((key, index) => entries.set(key, values[index]))
  }
  const previous = existsSync(target) ? await readFile(target, 'utf8') : '# Private retained RimbaGuard QA credentials. Never commit or print this file.\n'
  const lines = previous.trimEnd().split(/\r?\n/).map(line => {
    const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]
    if (!key || !entries.has(key)) return line
    const value = `${key}=${entries.get(key)}`
    entries.delete(key)
    return value
  })
  for (const [key, value] of entries) lines.push(`${key}=${value}`)
  await writeFile(target, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
}

async function prepare(identity) {
  if (!identity.id) {
    const hasMaterial = identity.email || identity.password || (identity === primary && existsSync(target))
    if (hasMaterial && !identity.managed) fail('Konfigurasi akun uji belum lengkap dan tidak dikelola script. Credential dipertahankan tanpa perubahan.')
    const recover = identity.managed
    identity.email ||= `${identity.prefix}-${randomUUID().replaceAll('-', '').slice(0, 16)}@example.invalid`
    identity.password ||= randomBytes(32).toString('base64url')
    identity.managed = true
    await save() // Save recovery material before any remote mutation.
    if (recover) {
      const recovery = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      const result = await recovery.auth.signInWithPassword({ email: identity.email, password: identity.password })
      if (result.data.user) {
        identity.id = result.data.user.id
        await recovery.auth.signOut({ scope: 'local' })
      }
    }
    if (!identity.id) {
      const { data, error } = await database.auth.admin.createUser({
        email: identity.email, password: identity.password, email_confirm: true,
        user_metadata: { full_name: identity.name, rimbaguard_qa: true },
      })
      if (error || !data.user) fail('Akun uji belum dapat dibuat. Credential pemulihan tersimpan privat; detail provider tidak ditampilkan.')
      identity.id = data.user.id
    }
    await save()
  }
  if (!identity.email || !identity.password) fail('Email/password akun uji belum tersedia; tidak mengubah akun yang sudah ada.')
  const authUser = await database.auth.admin.getUserById(identity.id)
  const profile = await database.from('profiles').select('id,role').eq('id', identity.id).single()
  if (authUser.error || profile.error || authUser.data.user?.email?.toLowerCase() !== identity.email.toLowerCase()
    || !authUser.data.user?.email_confirmed_at || profile.data?.role !== 'public') {
    fail('Identitas, konfirmasi, atau role akun uji belum sesuai. Tidak mengubah akun atau role pengguna.')
  }
}

try {
  await prepare(primary)
  if ((reader.id && reader.id === primary.id) || (reader.email && reader.email.toLowerCase() === primary.email.toLowerCase())) {
    fail('Akun pembaca harus berbeda dari akun simulasi utama. Tidak mengubah akun.')
  }
  await prepare(reader)
  if (reader.id === primary.id) fail('Akun pembaca harus berbeda dari akun simulasi utama.')
  console.log('Dua akun QA publik siap: simulasi utama dan pembaca. Credential hanya berada di .env.e2e yang diabaikan Git; tidak ada email atau laporan insiden yang dikirim.')
}
catch {
  fail('Persiapan akun QA belum dapat diselesaikan. Credential pemulihan dipertahankan privat; detail layanan tidak ditampilkan.')
}
