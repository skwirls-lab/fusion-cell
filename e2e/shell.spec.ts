import { test, expect, type ConsoleMessage } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';
const BANNER = 'EXERCISE – FICTIONAL DATA – NOT REAL INTELLIGENCE';

test('login lands on the workspace shell with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL('/');

  const banners = page.getByTestId('exercise-banner');
  await expect(banners).toHaveCount(2);
  await expect(banners.nth(0)).toBeVisible();
  await expect(banners.nth(1)).toBeVisible();
  await expect(banners.nth(0)).toHaveText(BANNER);
  await expect(banners.nth(1)).toHaveText(BANNER);

  await expect(page.locator('#map-pane')).toBeVisible();
  await expect(page.locator('#graph-pane')).toBeVisible();

  // No filtering: the shell should produce zero console errors. If a specific
  // benign dev-only message ever appears here, filter it by exact text and say why.
  expect(errors).toEqual([]);
});
