import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

// Starts the production build with deliberately broken configuration and
// checks that RimbaGuard fails safely: explicit "unavailable" states instead of
// invented zeros, fast HTTP errors, no secrets in responses, and a refusal to
// start in production without the required services. It never contacts the
// configured Supabase project and writes nothing.
if (!existsSync('.output/server/index.mjs')) {
  console.error('BELUM DIUJI: jalankan npm.cmd run build terlebih dahulu.')
  process.exit(1)
}

const PORT = 3190
const BASE = `http://127.0.0.1:${PORT}`
const APP_URL = 'https://rimbaguard.test'
const SECRETS = ['degraded-anon-key-not-real', 'degraded-service-key-not-real']
const baseEnv = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
  PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'production', NUXT_PUBLIC_APP_URL: APP_URL,
}
const results = []
const check = (label, passed, detail = '') => { results.push(passed); console.log(`${passed ? 'LULUS' : 'GAGAL'}: ${label}${detail ? ` (${detail})` : ''}`) }

function start(env) {
  const child = spawn(process.execPath, ['.output/server/index.mjs'], { env: { ...baseEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const exited = new Promise(resolve => child.on('exit', code => resolve(code)))
  return { child, exited, output: () => output }
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const exitCode = await Promise.race([server.exited, sleep(250).then(() => undefined)])
    if (exitCode !== undefined) return { started: false, exitCode }
    try { await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) }); return { started: true } }
    catch { /* not listening yet */ }
  }
  return { started: false, exitCode: null }
}

async function request(path, init = {}) {
  const started = Date.now()
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...init })
  const text = await response.text()
  return { status: response.status, text, ms: Date.now() - started, location: response.headers.get('location') }
}

async function stop(server) {
  server.child.kill()
  await Promise.race([server.exited, sleep(5000)])
}

// 1. Supabase configured but unreachable (outage, DNS or network failure).
{
  const server = start({
    SUPABASE_URL: 'https://rimbaguard-outage.invalid', SUPABASE_ANON_KEY: SECRETS[0], SUPABASE_SERVICE_ROLE_KEY: SECRETS[1],
  })
  const ready = await waitForServer(server)
  check('Server produksi tetap berjalan saat database tidak terjangkau', ready.started)
  if (ready.started) {
    const health = await request('/api/health')
    check('/api/health hanya melaporkan konfigurasi, bukan klaim koneksi', health.status === 200 && JSON.parse(health.text).services.gemini === 'unavailable')
    for (const path of ['/api/public/statistics', '/api/public/map']) {
      const response = await request(path)
      check(`${path} menjawab 503 eksplisit, bukan data kosong`, response.status === 503 && response.text.includes('DATABASE_UNAVAILABLE') && response.ms < 15_000, `${response.status}, ${response.ms} ms`)
    }
    const home = await request('/')
    check('Beranda tetap tampil dengan pesan statistik tidak tersedia', home.status === 200 && home.text.includes('Statistik belum dapat dimuat'))
    check('Beranda tidak menampilkan angka nol buatan', !home.text.includes('Laporan diterima'))
    const map = await request('/map')
    check('Peta publik menampilkan status gagal yang jelas', map.status === 200 && map.text.includes('Peta laporan belum dapat dimuat'))
    const session = await request('/api/auth/session')
    check('Pengunjung anonim tetap mendapat sesi kosong', session.status === 200 && JSON.parse(session.text).user === null)
    const protectedPage = await request('/reports')
    check('Halaman terlindungi mengarahkan ke login', [301, 302, 307].includes(protectedPage.status) && (protectedPage.location ?? '').includes('/login'), String(protectedPage.status))
    const login = await request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: APP_URL },
      body: JSON.stringify({ email: 'qa-outage@example.invalid', password: 'not-a-real-password-123' }),
    })
    check('Login gagal cepat dengan 503 saat database tidak tersedia', login.status === 503 && login.ms < 15_000, `${login.status}, ${login.ms} ms`)
    const texts = [health, home, map, session, login].map(item => item.text).join('\n')
    check('Tidak ada credential pada respons', SECRETS.every(secret => !texts.includes(secret)))
  }
  await stop(server)
  check('Log server tidak memuat credential', SECRETS.every(secret => !server.output().includes(secret)))
}

// 2. Production without the required Supabase configuration.
for (const [label, env] of [
  ['tanpa konfigurasi Supabase', {}],
  ['dengan setup mode yang hanya untuk development', { RIMBAGUARD_SETUP_MODE: 'true' }],
  ['dengan URL aplikasi non-HTTPS', { NUXT_PUBLIC_APP_URL: 'http://rimbaguard.test', SUPABASE_URL: 'https://rimbaguard-outage.invalid', SUPABASE_ANON_KEY: SECRETS[0], SUPABASE_SERVICE_ROLE_KEY: SECRETS[1] }],
]) {
  const server = start(env)
  const ready = await waitForServer(server)
  let refused = !ready.started
  let detail = refused ? `berhenti, kode ${ready.exitCode}` : ''
  if (ready.started) {
    // Some runtimes keep listening; every request must then fail without data.
    const home = await request('/')
    const api = await request('/api/public/statistics')
    refused = home.status >= 500 && api.status >= 500
    detail = `HTTP ${home.status}/${api.status}`
  }
  check(`Produksi menolak berjalan ${label}`, refused, detail)
  check(`Pesan konfigurasi ${label} tidak memuat credential`, SECRETS.every(secret => !server.output().includes(secret)))
  if (!ready.started) check(`Alasan penolakan ${label} jelas`, server.output().includes('Konfigurasi server tidak lengkap atau tidak valid'))
  await stop(server)
}

const failed = results.filter(passed => !passed).length
console.log(failed ? `${failed} pemeriksaan gagal.` : `Semua ${results.length} pemeriksaan kegagalan layanan lulus.`)
process.exit(failed ? 1 : 0)
