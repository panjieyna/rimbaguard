import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

// The complete citizen-to-officer path through the real UI, Supabase and
// Gemini. It sends one paid Gemini request, so it runs only when explicitly
// enabled. The report is created by the designated simulation account and is
// therefore labeled, excluded from public totals and never publishable.
const configured = Boolean(process.env.E2E_GEMINI_LIVE === 'true' && process.env.E2E_EMAIL && process.env.E2E_PASSWORD
  && process.env.RIMBAGUARD_TEST_USER_ID && process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)
test.use({ trace: 'off', screenshot: 'off' })

async function login(page: Page, email: string, password: string, landing: RegExp) {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled()
  await page.evaluate(({ email, password }) => {
    for (const [id, value] of [['email', email], ['password', password]] as const) {
      const input = document.getElementById(id) as HTMLInputElement
      input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, { email, password })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page).toHaveURL(landing, { timeout: 30_000 })
}

const OFFICER_NOTE = 'Catatan internal QA perjalanan: tim lapangan simulasi menutup kasus.'

test('a report travels from the citizen through AI analysis to an officer resolution and survives new sessions', async ({ page }) => {
  test.skip(!configured, 'Requires E2E_GEMINI_LIVE=true and the retained QA citizen and officer identities.')
  test.setTimeout(300_000)
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  const title = `[SIMULASI] Perjalanan lengkap QA ${Date.now().toString(36)}`
  const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#eaf0e9"/><text x="40" y="215" font-size="40" fill="#173d32">SIMULASI PERJALANAN QA</text></svg>')).jpeg({ quality: 80 }).toBuffer()
  // Yesterday in WIB, in the datetime-local format the form uses.
  const incident = new Date(Date.now() + 7 * 3_600_000 - 24 * 3_600_000).toISOString().slice(0, 16)

  // 1. The citizen submits; the saved report starts AI analysis automatically.
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!, /\/reports$/)
  await page.goto('/report')
  await expect(page.getByText('Akun ini menggunakan mode simulasi.', { exact: false })).toBeVisible()
  await page.getByLabel('Judul laporan', { exact: true }).fill(title)
  await page.getByLabel('Kategori ancaman', { exact: true }).selectOption('forest_fire')
  await page.getByLabel('Deskripsi kejadian', { exact: true }).fill('Data simulasi pengujian perjalanan lengkap. Gambar dan koordinat bukan bukti kejadian lingkungan nyata; jangan ditindaklanjuti.')
  await page.getByLabel('Waktu kejadian', { exact: true }).fill(incident)
  await page.getByLabel('Lintang', { exact: true }).fill('-3.79')
  await page.getByLabel('Bujur', { exact: true }).fill('102.26')
  await page.getByLabel('Nama lokasi (opsional)', { exact: true }).fill('Lokasi simulasi perjalanan')
  await page.locator('#evidence-image').setInputFiles({ name: 'perjalanan.jpg', mimeType: 'image/jpeg', buffer: image })
  await page.getByRole('button', { name: 'Kirim laporan', exact: true }).click()
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+\?submitted=1/, { timeout: 90_000 })
  const reportId = new URL(page.url()).pathname.split('/').at(-1)!
  const code = (await page.locator('header .font-mono').first().textContent())!.trim()
  // Either a validated AI result or an explicit persisted failure is acceptable.
  const outcome = page.getByRole('heading', { name: 'Pengamatan visual', exact: true }).or(page.getByRole('button', { name: 'Coba analisis lagi', exact: true }))
  await expect(outcome.first()).toBeVisible({ timeout: 120_000 })
  await page.reload()
  await expect(page.locator('header').getByText(/^(Menunggu verifikasi|Analisis gagal)$/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })

  // 2. An officer reviews, responds and resolves it.
  await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!, /\/admin\/dashboard$/)
  await page.goto(`/admin/reports/${reportId}`)
  const actions = page.getByRole('complementary', { name: 'Tindakan petugas dan riwayat' })
  for (const [action, note] of [['Verifikasi laporan', ''], ['Tandai sedang ditindaklanjuti', ''], ['Tandai selesai ditangani', OFFICER_NOTE]] as const) {
    await actions.getByRole('button', { name: action, exact: true }).click()
    if (note) await actions.getByLabel('Catatan petugas (opsional)').fill(note)
    await actions.getByRole('button', { name: `Konfirmasi: ${action}` }).click()
    await expect(actions.getByText(`Status diperbarui: ${action.toLowerCase()} berhasil.`)).toBeVisible({ timeout: 30_000 })
  }
  await expect(page.locator('header').getByText('Selesai ditangani', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })

  // 3. A new citizen session sees the persisted outcome, but not the internal note.
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!, /\/reports$/)
  const row = page.getByRole('listitem').filter({ hasText: code })
  await expect(row.getByText('Selesai ditangani')).toBeVisible({ timeout: 30_000 })
  await page.goto(`/reports/${reportId}`)
  await expect(page.locator('header').getByText('Selesai ditangani', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Status: Selesai ditangani')).toBeVisible()
  await expect(page.getByText(OFFICER_NOTE)).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Status: Terverifikasi')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
})
