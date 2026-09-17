/**
 * Phase 6a list/admin pages: /reports (search, filter, reader), /entities
 * (type filter), /admin (counts match /api/health). Read-only against the
 * seeded database through the HTTP API.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';
const errors: string[] = [];

async function login(page: Page) {
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(`[${test.info().title}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${test.info().title}] pageerror: ${e.message}`));
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => { await login(page); });
test.afterAll(() => { expect(errors).toEqual([]); });

test('/reports: 25 rows a page, "transponder" narrows to the tracking reports, a row opens the reader', async ({ page }) => {
  await page.goto('/reports');
  const rows = page.getByTestId('report-row');
  await expect(rows).toHaveCount(25);
  await expect(page.getByTestId('reports-page')).toContainText(/\d+ reports/);
  // Newest first by default.
  const first = await rows.first().getAttribute('data-report');
  expect(first).toMatch(/^R-\d{4}$/);

  // Full-text search through GET /api/reports?q=…
  await page.getByTestId('reports-search').fill('transponder');
  await expect.poll(() => rows.count()).toBeLessThan(25);
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(2);
  // The transponder-gap clue reports (BUILD.md §8.2 #6/#7) are TRACKING; every hit shown carries a type badge.
  const types = await rows.evaluateAll((els) => els.map((e) => e.querySelector('td:nth-child(2)')?.textContent?.trim() ?? ''));
  expect(types).toContain('TRACKING');
  await expect(page.getByTestId('reports-page')).toContainText('matching “transponder”');

  // Type chips narrow further (server-side filter).
  await page.getByTestId('type-chip-TRACKING').click();
  await expect.poll(async () => (await rows.evaluateAll((els) => els.map((e) => e.querySelector('td:nth-child(2)')?.textContent?.trim()))).every((t) => t === 'TRACKING')).toBe(true);
  await page.getByTestId('type-chip-TRACKING').click();

  // Row click opens the reader on this page with that report.
  const target = await rows.first().getAttribute('data-report');
  await rows.first().click();
  const reader = page.getByTestId('report-reader');
  await expect(reader).toBeVisible();
  await expect(reader).toContainText(target!);
  await expect(reader.getByTestId('report-body')).toContainText(/transponder/i);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);

  // Pagination: page 2 exists when unfiltered.
  await page.getByTestId('reports-search').fill('');
  await expect(rows).toHaveCount(25);
  await page.getByTestId('reports-page').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('reports-page')).toContainText('page 2 /');
  await expect(rows.first()).not.toHaveAttribute('data-report', first!);

  // Column sort by type is a real sort across the whole set: page 1 starts with FINANCIAL.
  await page.getByRole('button', { name: /^Type/ }).click();
  await expect(page.getByTestId('reports-page')).toContainText('page 1 /');
  await expect(rows.first().locator('td:nth-child(2)')).toHaveText('FINANCIAL');
});

test('/entities: type=vessel shows only vessels; a row hands off to the workspace', async ({ page }) => {
  await page.goto('/entities');
  const rows = page.getByTestId('entity-row');
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(150);
  await page.getByTestId('type-chip-vessel').click();
  await expect.poll(() => rows.count()).toBeLessThan(100);
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(20);
  const types = await rows.evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-type')))]);
  expect(types).toEqual(['vessel']);

  await page.getByTestId('entities-search').fill('Larkspur');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-entity-id', 'ves_larkspur');
  await rows.first().click();
  await expect(page).toHaveURL(/sel=entity(%3A|:)ves_larkspur/);
  await expect(page.getByTestId('entity-name')).toHaveText('MV Larkspur');
});

test('/admin: counts match /api/health', async ({ page, request }) => {
  const health = await (await request.get('/api/health')).json() as { counts: { entities: number; reports: number } };
  await page.goto('/admin');
  await expect(page.getByTestId('stat-entities')).toHaveAttribute('data-value', String(health.counts.entities));
  await expect(page.getByTestId('stat-reports')).toHaveAttribute('data-value', String(health.counts.reports));
  await expect(page.getByTestId('stat-relationships')).toHaveAttribute('data-value', /^\d+$/);
  await expect(page.getByTestId('newest-report-at')).not.toHaveText('—');
  // Reseed is behind a confirm step and cancel backs out without a request.
  await page.getByTestId('reseed').click();
  await expect(page.getByTestId('reseed-confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('reseed-confirm')).toHaveCount(0);
  await expect(page.getByText('post-hackathon').first()).toBeVisible();
});
