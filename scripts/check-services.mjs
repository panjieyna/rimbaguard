import { existsSync } from 'node:fs'
import {
  classifyServiceFailure,
  isExpectedPermissionDenial,
  isSafeServiceUrl,
  REQUIRED_TABLE_COLUMNS,
} from './lib/service-checks.mjs'

try {
  if (existsSync('.env')) process.loadEnvFile('.env')
}
catch {
  console.error('GAGAL: .env lokal tidak dapat dibaca. Detail sensitif tidak ditampilkan.')
  process.exit(1)
}

const serverUrl = process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NUXT_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
const missing = [!serverUrl && 'SUPABASE_URL', !anonKey && 'SUPABASE_ANON_KEY', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean)

if (missing.length) {
  console.error(`BELUM DIUJI: konfigurasi belum lengkap (${missing.join(', ')}). Isi .env lokal terlebih dahulu.`)
  process.exit(1)
}

if (!isSafeServiceUrl(serverUrl)) {
  console.error('GAGAL: SUPABASE_URL harus berupa origin HTTPS, atau HTTP loopback untuk lokal, tanpa path maupun credential. Nilainya tidak ditampilkan.')
  process.exit(1)
}
const base = new URL(serverUrl)

async function request(path, credential, options = {}) {
  // Publishable/secret keys are not JWTs; only legacy JWT keys belong in Bearer.
  const headers = { apikey: credential }
  if (options.method === 'POST') headers['content-type'] = 'application/json'
  if (credential.startsWith('eyJ')) headers.authorization = `Bearer ${credential}`
  return fetch(new URL(path, base), {
    ...options,
    headers,
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  })
}

async function failurePayload(response) {
  try { return await response.json() }
  catch { return undefined }
}

async function probe(path, credential, options) {
  const response = await request(path, credential, options)
  if (!response.ok) {
    return { passed: false, ...classifyServiceFailure(response.status, await failurePayload(response)) }
  }
  // Admin-user responses contain private data. Discard them without parsing/output.
  await response.body?.cancel().catch(() => {})
  return { passed: true, httpStatus: response.status }
}

const checks = [
  ['Autentikasi Supabase dapat dijangkau', () => probe('/auth/v1/settings', anonKey)],
  ['Credential server diterima API admin Auth', () => probe('/auth/v1/admin/users?page=1&per_page=1', serviceKey)],
  ...Object.entries(REQUIRED_TABLE_COLUMNS).map(([table, columns]) => [
    `Skema dan kolom ${table} tersedia`,
    () => probe(`/rest/v1/${table}?select=${columns}&limit=0`, serviceKey),
  ]),
  ['Akses laporan anonim ditolak oleh izin database', async () => {
    const response = await request('/rest/v1/reports?select=id&limit=0', anonKey)
    const payload = await failurePayload(response)
    return {
      passed: isExpectedPermissionDenial(response.status, payload),
      ...classifyServiceFailure(response.status, payload),
    }
  }],
  ['Bucket bukti bersifat privat dan dibatasi', async () => {
    const response = await request('/storage/v1/bucket/report-evidence', serviceKey)
    if (!response.ok) return { passed: false, ...classifyServiceFailure(response.status, await failurePayload(response)) }
    const bucket = await failurePayload(response)
    const mime = bucket?.allowed_mime_types
    const passed = bucket?.public === false && bucket?.file_size_limit === 5_000_000
      && Array.isArray(mime) && mime.length === 3
      && ['image/jpeg', 'image/png', 'image/webp'].every(value => mime.includes(value))
    return { passed, httpStatus: response.status, ...(passed ? {} : { kind: 'bucket_configuration' }) }
  }],
]

if (process.argv.includes('--reporting')) {
  checks.push(
    ['Ledger unggahan Fase 2 tersedia', () => probe('/rest/v1/evidence_uploads?select=id,user_id,incoming_path,sealed_path,status,report_id,expires_at&limit=0', serviceKey)],
    ['Fungsi statistik Fase 2 tersedia', () => probe('/rest/v1/rpc/platform_statistics', serviceKey, { method: 'POST', body: '{}' })],
  )
}

const DIAGNOSTIC_LABELS = {
  missing_schema: 'skema belum tersedia; terapkan migrasi',
  missing_columns: 'kolom belum sesuai migrasi',
  credentials: 'credential atau otorisasi tidak diterima',
  bucket_configuration: 'konfigurasi bucket belum sesuai',
}

let failed = false
for (const [label, check] of checks) {
  try {
    const result = await check()
    const details = [`HTTP ${result.httpStatus}`]
    if (result.providerCode) details.push(`kode ${result.providerCode}`)
    if (!result.passed && DIAGNOSTIC_LABELS[result.kind]) details.push(DIAGNOSTIC_LABELS[result.kind])
    console.log(`${result.passed ? 'LULUS' : 'GAGAL'}: ${label} (${details.join('; ')})`)
    if (!result.passed) failed = true
  }
  catch {
    console.log(`GAGAL: ${label} (koneksi atau batas waktu; detail sensitif tidak ditampilkan)`)
    failed = true
  }
}
console.log('Pemeriksaan ini hanya menguji koneksi/skema dasar. Pengujian RLS antar pengguna dan alur autentikasi tetap harus dijalankan terpisah.')
process.exitCode = failed ? 1 : 0
