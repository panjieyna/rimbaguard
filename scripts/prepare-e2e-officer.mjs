import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { isSafeServiceUrl } from './lib/service-checks.mjs'

// Provisions a retained QA officer identity for browser tests of officer pages.
// It creates an ordinary confirmed account only. Granting the admin role stays a
// manual operator step in the SQL Editor (supabase/README.md); no API can do it.
const target = '.env.e2e'
const KEYS = ['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD', 'E2E_ADMIN_USER_ID', 'E2E_ADMIN_PROVISIONED_BY_RIMBAGUARD']
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

const officer = {
  email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD,
  id: process.env.E2E_ADMIN_USER_ID, managed: process.env.E2E_ADMIN_PROVISIONED_BY_RIMBAGUARD === 'true',
}
const others = [process.env.RIMBAGUARD_TEST_USER_ID, process.env.E2E_READER_USER_ID].filter(Boolean)

async function save() {
  const values = new Map([[KEYS[0], officer.email || ''], [KEYS[1], officer.password || ''], [KEYS[2], officer.id || ''], [KEYS[3], String(officer.managed)]])
  const previous = existsSync(target) ? await readFile(target, 'utf8') : '# Private retained RimbaGuard QA credentials. Never commit or print this file.\n'
  const lines = previous.trimEnd().split(/\r?\n/).map(line => {
    const name = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]
    if (!name || !values.has(name)) return line
    const value = `${name}=${values.get(name)}`
    values.delete(name)
    return value
  })
  for (const [name, value] of values) lines.push(`${name}=${value}`)
  await writeFile(target, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
}

try {
  if (!officer.id) {
    if ((officer.email || officer.password) && !officer.managed) fail('Konfigurasi akun petugas QA belum lengkap dan tidak dikelola script. Tidak ada perubahan.')
    const recover = officer.managed
    officer.email ||= `qa-officer-rimba-${randomUUID().replaceAll('-', '').slice(0, 16)}@example.invalid`
    officer.password ||= randomBytes(32).toString('base64url')
    officer.managed = true
    await save() // Save recovery material before any remote mutation.
    if (recover) {
      const recovery = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      const result = await recovery.auth.signInWithPassword({ email: officer.email, password: officer.password })
      if (result.data.user) { officer.id = result.data.user.id; await recovery.auth.signOut({ scope: 'local' }) }
    }
    if (!officer.id) {
      const { data, error } = await database.auth.admin.createUser({
        email: officer.email, password: officer.password, email_confirm: true,
        user_metadata: { full_name: 'Akun Petugas Pengujian RimbaGuard', rimbaguard_qa: true },
      })
      if (error || !data.user) fail('Akun petugas QA belum dapat dibuat. Credential pemulihan tersimpan privat; detail provider tidak ditampilkan.')
      officer.id = data.user.id
    }
    await save()
  }
  if (others.includes(officer.id)) fail('Akun petugas QA harus berbeda dari akun simulasi dan pembaca.')
  const authUser = await database.auth.admin.getUserById(officer.id)
  const profile = await database.from('profiles').select('id,role').eq('id', officer.id).single()
  if (authUser.error || profile.error || authUser.data.user?.email?.toLowerCase() !== officer.email?.toLowerCase()
    || !authUser.data.user?.email_confirmed_at || authUser.data.user.user_metadata?.rimbaguard_qa !== true) {
    fail('Identitas atau konfirmasi akun petugas QA belum sesuai. Tidak mengubah akun.')
  }
  if (profile.data.role === 'admin') {
    console.log('Akun petugas QA siap dan sudah ber-role admin. Credential hanya berada di .env.e2e yang diabaikan Git.')
  }
  else {
    console.log('Akun petugas QA dibuat dengan role public. Operator perlu memberi role admin melalui SQL Editor:')
    console.log(`update public.profiles set role = 'admin' where id = '${officer.id}'::uuid and exists (select 1 from auth.users u where u.id = profiles.id and u.email_confirmed_at is not null and (u.raw_user_meta_data->>'rimbaguard_qa')::boolean);`)
  }
}
catch {
  fail('Persiapan akun petugas QA belum dapat diselesaikan. Credential pemulihan dipertahankan privat; detail layanan tidak ditampilkan.')
}
