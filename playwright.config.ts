import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// The remote sandbox pre-installs Chromium at a fixed path; a laptop won't
// have it and falls through to Playwright's own managed browser.
const sandboxChromium = '/opt/pw-browsers/chromium';
const executablePath = fs.existsSync(sandboxChromium) ? sandboxChromium : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { DB_DRIVER: process.env.DB_DRIVER ?? 'pglite', PGLITE_DIR: '.pglite/e2e' },
  },
});
