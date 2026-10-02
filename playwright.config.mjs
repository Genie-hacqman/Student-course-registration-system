import { defineConfig, devices } from '@playwright/test'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// End-to-end tests drive the real app in a real browser. They use their own ports and the
// `<DB_NAME>_test` database (reset by e2e/global-setup.js), so they never touch your dev data.
const root = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(root, 'server', 'package.json'))
require('dotenv').config({ path: path.join(root, 'server', '.env'), quiet: true })
// Test runs must never report to a real error tracker, whatever server/.env holds.
delete process.env.SENTRY_DSN

export const API_PORT = 6061
export const WEB_PORT = 5273
const origin = `http://localhost:${WEB_PORT}`

export default defineConfig({
  testDir: './e2e',
  // One shared database: specs run in order, one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL || undefined } },
  ],
  webServer: [
    {
      command: 'npm --prefix server start',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        CORS_ORIGIN: origin,
        FRONTEND_URL: origin,
        // Email is only logged under NODE_ENV=test; blank these so nothing real can ever be sent.
        RESEND_API_KEY: '',
        SMTP_HOST: '',
      },
    },
    {
      command: `npm --prefix client run dev -- --port ${WEB_PORT} --strictPort`,
      url: origin,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
})
