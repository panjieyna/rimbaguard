import type { Page } from '@playwright/test'

/** Public navigation keeps sign-out inside the separate account disclosure. */
export async function logoutFromAccount(page: Page) {
  const account = page.getByRole('button', { name: 'Akun saya', exact: true })
  if (!await account.isVisible()) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
  }
  const logout = page.getByRole('button', { name: 'Keluar', exact: true })
  if (!await logout.isVisible()) await account.click()
  await logout.click()
}
