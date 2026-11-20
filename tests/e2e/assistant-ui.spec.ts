import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginQaCitizen } from './helpers/qa-session'
import type { AssistantDraft } from '../../shared/types/report-assistant'

// Synthetic browser-only contract fixtures. Every assistant/write request is
// intercepted; these values are never saved as model output in Supabase.
test.use({ trace: 'off', screenshot: 'off' })
const configured = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)
const story = '[UJI ANTARMUKA] Saya menemukan pohon tumbang di jalur. Saya tidak melihat penyebabnya.'
function fixture(status: 'ready' | 'failed'): AssistantDraft {
  return {
    id: 'b59a3967-d092-4e54-a730-017133b0e176', uploadId: 'b59a3967-d092-4e54-a730-017133b0e177', version: 1,
    status, story, answers: [], description: story, errorCode: status === 'failed' ? 'AI_TIMEOUT' : null,
    evidencePath: 'b59a3967-d092-4e54-a730-017133b0e178/sealed/b59a3967-d092-4e54-a730-017133b0e179.jpg',
    evidenceUrl: '/images/about-rainforest-768.webp', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), reportId: null,
    result: status === 'failed' ? null : {
      visual_observations: ['[UJI] Pembacaan visual terpisah dari keterangan pelapor.'],
      reported_summary: '[UJI] Ringkasan mesin yang tidak boleh disalin menjadi kesaksian.',
      suggested_title: '[UJI] Pohon tumbang di jalur', suggested_category: 'uncertain',
      questions: [{ id: 'q1', text: 'Apakah Anda melihat aktivitas di sana?', reason: 'Membedakan pengamatan langsung dari dugaan.' }],
      limitations: '[UJI] Foto tidak memastikan penyebab atau legalitas.', needs_human_review: true,
    },
  }
}
test('restored assistant questions, source separation and explicit confirmation work on a phone', async ({ page }) => {
  test.skip(!configured, 'Requires the retained QA login. No model/write requests reach the database.')
  test.setTimeout(90_000)
  await loginQaCitizen(page)
  await page.setViewportSize({ width: 375, height: 900 })
  let draft = fixture('ready')
  let writes = 0
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.route('**/api/report-assistant**', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      expect(body.expectedVersion).toBe(draft.version)
      draft = { ...draft, version: draft.version + 1, answers: body.answers, description: `${story}\n\nInformasi pelengkap dari pelapor:\n${body.answers[0].text}` }
    }
    await route.fulfill({ json: { draft } })
  })
  await page.route('**/api/reports', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    writes++
    expect(route.request().postDataJSON().assistant).toEqual({ draftId: draft.id, expectedVersion: draft.version, confirmed: true })
    await route.fulfill({ status: 409, json: { data: { error: { code: 'ASSISTANT_CONFLICT', message: 'Draf berubah. Muat ulang sebelum mengirim.' } } } })
  })
  await page.goto('/report')
  await page.getByRole('button', { name: 'Lanjutkan draf', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pembacaan foto oleh AI' })).toBeVisible()
  await page.getByRole('button', { name: 'Saya tidak tahu', exact: true }).click()
  await expect(page.locator('#assistant-answer-q1')).toHaveValue('Saya tidak tahu.')
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
  expect(scan.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => v.id)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Periksa draf laporan', exact: false }).click()
  await expect(page.locator('#report-review-heading')).toBeFocused()
  const description = await page.getByLabel('Deskripsi kejadian', { exact: true }).inputValue()
  expect(description).toContain(story)
  expect(description).toContain('Saya tidak tahu.')
  expect(description).not.toContain('Ringkasan mesin')
  expect(description).not.toContain('Pembacaan visual')
  await page.getByLabel('Kategori ancaman', { exact: true }).selectOption('other_environmental_threat')
  await page.getByLabel('Waktu kejadian', { exact: true }).fill('2020-01-01T07:00')
  await page.getByLabel('Lintang', { exact: true }).fill('-3.8')
  await page.getByLabel('Bujur', { exact: true }).fill('102.2')
  await page.getByRole('button', { name: 'Kirim laporan', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('konfirmasikan draf')
  expect(writes).toBe(0)
  const confirmation = page.getByRole('checkbox', { name: /Saya telah memeriksa draf/ })
  await confirmation.check()
  await page.getByLabel('Judul laporan', { exact: true }).fill('[UJI] Judul diperiksa ulang')
  await expect(confirmation).not.toBeChecked()
  await confirmation.check()
  await page.getByRole('button', { name: 'Kirim laporan', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Draf berubah')
  expect(writes).toBe(1)
})

test('a saved timeout keeps the original story and photo available in the manual form', async ({ page }) => {
  test.skip(!configured, 'Requires the retained QA login; all assistant requests are intercepted.')
  await loginQaCitizen(page)
  await page.route('**/api/report-assistant**', route => route.fulfill({ json: { draft: fixture('failed') } }))
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.goto('/report')
  await page.getByRole('button', { name: 'Lanjutkan draf', exact: true }).click()
  await expect(page.getByText('AI belum merespons dalam batas waktu.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Isi formulir sendiri', exact: true }).click()
  await expect(page.getByLabel('Deskripsi kejadian', { exact: true })).toHaveValue(story)
  await expect(page.getByRole('img', { name: 'Pratinjau foto yang dipilih untuk laporan' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Saya telah memeriksa draf/ })).toHaveCount(0)
})
