/**
 * Phase 7 gate: the watchlist (PRD §5.10) — star Brightwater Hauling, replay
 * the scenario, and the alert fires as a toast and on the bell; the star
 * survives a reload through localStorage.
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

test('starring Brightwater Hauling raises a toast and a bell alert during replay; the star persists', async ({ page }) => {
  // Select through global search and star it in the profile header.
  await page.keyboard.press('/');
  await page.locator('#global-search').fill('Brightwater');
  await page.getByTestId('search-entity').filter({ hasText: 'Brightwater Hauling' }).first().click();
  await expect(page.getByTestId('entity-name')).toHaveText('Brightwater Hauling');
  const star = page.getByTestId('watchlist-toggle');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('alert-bell')).toHaveAttribute('data-unread', '0');

  // Nothing fires for reports that were already on screen; the feed must have its first page before the rewind.
  await expect.poll(() => page.locator('[data-testid="feed"] li.feed-row').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId('toast')).toHaveCount(0);

  // Replay at 12×: R-0007 (day 5) and R-0023 (day 8) both name Brightwater Hauling.
  await page.getByRole('button', { name: '12×' }).click();
  await page.getByRole('button', { name: 'Replay from day 1' }).click();
  const toast = page.getByTestId('toast').filter({ hasText: 'Brightwater' }).first();
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.getByTestId('alert-bell').getAttribute('data-unread').then(Number)).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('alert-badge')).toBeVisible();
  const alertId = (await toast.getAttribute('data-alert-id'))!;
  const reportNumber = alertId.split(':')[0];
  expect(reportNumber).toMatch(/^R-\d{4}$/);

  // Click-through lands on the entity and opens the report.
  await page.getByRole('button', { name: 'Pause replay' }).click();
  await toast.getByTestId('toast-open').click();
  await expect(page.getByTestId('entity-name')).toHaveText('Brightwater Hauling');
  const reader = page.getByTestId('report-reader');
  await expect(reader).toBeVisible();
  await expect(reader).toContainText(reportNumber);
  await expect(page.getByTestId('toast').filter({ hasText: reportNumber })).toHaveCount(0);

  // The bell lists it, read; the same alert never fires twice. (Esc closes the reader, which overlays the bell.)
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await page.getByTestId('alert-bell').click();
  const menu = page.getByTestId('alert-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').filter({ hasText: reportNumber })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Reload: selection comes back from the URL and the star from localStorage.
  await page.reload();
  await expect(page.getByTestId('entity-name')).toHaveText('Brightwater Hauling');
  await expect(page.getByTestId('watchlist-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('alert-bell').click();
  await expect(page.getByTestId('alert-menu').getByRole('menuitem').filter({ hasText: reportNumber })).toHaveCount(1);
});

test.afterAll(() => {
  expect(errors).toEqual([]);
});
