import { expect, test } from '@playwright/test'

test('loopback registration navigation uses the configured origin before a mutation', async ({ page }) => {
  const response = await page.goto('http://127.0.0.1:3000/register?next=%2Freports')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveURL('http://localhost:3000/register?next=%2Freports')
  await expect(page.getByRole('button', { name: 'Buat akun', exact: true })).toBeEnabled()
  // Deliberately invalid data reaches validation after CSRF checks, without
  // creating an identity, sending email, or consuming signup-provider quota.
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: 'A', email: 'invalid', password: 'short' }),
    })
    const body = await response.json()
    return { status: response.status, code: body.data?.error?.code }
  })
  expect(result).toEqual({ status: 422, code: 'VALIDATION_FAILED' })
})

test('local navigation redirects are temporary and ignore forwarded headers', async ({ request }) => {
  const alias = await request.get('http://127.0.0.1:3000/register?next=%2Freports', {
    maxRedirects: 0, headers: { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' },
  })
  expect(alias.status()).toBe(307)
  expect(alias.headers().location).toBe('http://localhost:3000/register?next=%2Freports')
  expect(alias.headers()['cache-control']).toContain('no-store')
  expect(alias.headers()['referrer-policy']).toBe('no-referrer')
})

test('registration still rejects alias, foreign and malformed mutation origins', async ({ request }) => {
  for (const origin of ['http://127.0.0.1:3000', 'https://attacker.example', 'http://localhost:3000/path']) {
    const response = await request.post('http://localhost:3000/api/auth/register', {
      headers: { origin }, data: { fullName: 'A', email: 'invalid', password: 'short' },
    })
    expect(response.status()).toBe(403)
    expect((await response.json()).data.error.code).toBe('INVALID_ORIGIN')
    expect(response.headers().location).toBeUndefined()
  }
})
