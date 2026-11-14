import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const executablePath = candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)))
if (!executablePath) throw new Error('Browser lokal tidak ditemukan. Isi PLAYWRIGHT_CHROMIUM_EXECUTABLE dengan path Chrome/Edge yang tersedia.')
if (existsSync('.env.e2e')) process.loadEnvFile('.env.e2e')
const liveReporting = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: { executablePath },
    trace: 'off',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Jakarta',
  },
  webServer: {
    command: liveReporting ? 'node --env-file=.env.e2e node_modules/nuxt/bin/nuxt.mjs dev --host 127.0.0.1 --port 3000' : 'npm.cmd run dev -- --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI && !liveReporting,
    timeout: 90_000,
  },
})
