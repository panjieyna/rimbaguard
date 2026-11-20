import assert from 'node:assert/strict'

const base = process.env.RIMBAGUARD_SMOKE_URL || 'http://localhost:3000'
const privateNames = ['supabaseAnonKey', 'supabaseServiceRoleKey', 'geminiApiKey', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY']
let passed = 0

async function check(label, operation) {
  await operation()
  passed += 1
  console.log(`LULUS: ${label}`)
}

async function request(path, options) {
  return fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(20_000), redirect: 'manual' })
}

try {
  await check('Beranda SSR dapat dimuat dan runtime privat tidak diserialisasi', async () => {
    const response = await request('/')
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /Bersama menjaga(?:\s|<[^>]*>)*hutan kita\./)
    for (const field of privateNames) assert.ok(!html.includes(field))
  })
  await check('Halaman tentang dapat dimuat', async () => {
    const response = await request('/about')
    assert.equal(response.status, 200)
    assert.ok((await response.text()).includes('Verifikasi petugas'))
  })
  await check('Health hanya mengungkap ketersediaan konfigurasi', async () => {
    const response = await request('/api/health')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.match(response.headers.get('cache-control') || '', /no-store/)
    const body = await response.json()
    assert.deepEqual(Object.keys(body).sort(), ['mode', 'services'])
    assert.ok(['setup', 'configured'].includes(body.mode))
    assert.deepEqual(Object.keys(body.services).sort(), ['gemini', 'supabase'])
    for (const state of Object.values(body.services)) assert.ok(['configured', 'unavailable'].includes(state))
  })
  await check('Permintaan tanpa cookie tidak memperoleh token atau sesi palsu', async () => {
    const response = await request('/api/auth/session')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { user: null })
  })
  await check('Endpoint admin menolak pengguna anonim', async () => {
    const response = await request('/api/admin/dashboard')
    assert.equal(response.status, 401)
    const body = await response.json()
    assert.equal(body.data.error.code, 'AUTHENTICATION_REQUIRED')
  })
  await check('Halaman admin menolak pengguna anonim', async () => {
    assert.equal((await request('/admin/dashboard')).status, 401)
  })
  await check('Mutasi dari origin asing ditolak', async () => {
    const response = await request('/api/foundation-check', {
      method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: '{}',
    })
    assert.equal(response.status, 403)
    assert.equal((await response.json()).data.error.code, 'INVALID_ORIGIN')
  })
  await check('Mutasi non-JSON ditolak', async () => {
    const response = await request('/api/foundation-check', {
      method: 'POST', headers: { origin: new URL(base).origin, 'content-type': 'text/plain' }, body: '{}',
    })
    assert.equal(response.status, 415)
  })
  await check('Permintaan yang melampaui batas metadata ditolak', async () => {
    const response = await request('/api/foundation-check', {
      method: 'POST', headers: { origin: new URL(base).origin, 'content-type': 'application/json' }, body: JSON.stringify({ value: 'a'.repeat(65_536) }),
    })
    assert.equal(response.status, 413)
  })
  console.log(`${passed} pemeriksaan HTTP fondasi lulus. Koneksi Supabase/Gemini dan tampilan browser belum dibuktikan oleh smoke test ini.`)
}
catch (error) {
  console.error(`GAGAL: smoke test fondasi setelah ${passed} pemeriksaan lulus.`)
  console.error(error instanceof Error ? error.message : 'Pemeriksaan gagal.')
  process.exitCode = 1
}
