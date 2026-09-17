import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import dotenv from 'dotenv';

// The specs log in with APP_PASSWORD; the dev server reads it from .env.local, so the specs must too.
dotenv.config({ path: '.env.local', quiet: true });

// A dedicated port. :3000 is whatever else the machine runs: with reuseExistingServer, any app that
// answers 200 on /api/health there is silently adopted and every login 404s (seen on the laptop).
const PORT = Number(process.env.E2E_PORT ?? 3187);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// The remote sandbox pre-installs Chromium at a fixed path; a laptop won't
// have it and falls through to Playwright's own managed browser.
const sandboxChromium = '/opt/pw-browsers/chromium';
const executablePath = fs.existsSync(sandboxChromium) ? sandboxChromium : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // ingest.spec reseeds the database in beforeAll/afterAll, so spec files must never run in parallel.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { DB_DRIVER: process.env.DB_DRIVER ?? 'pglite', PGLITE_DIR: '.pglite/e2e' },
  },
});
