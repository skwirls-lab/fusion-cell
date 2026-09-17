/**
 * Phase 5 gates P5.4 / P5.6 / P5.7 (BUILD.md §6) against the REAL model: the dev
 * server reads OPENROUTER_* from .env.local and nothing here is intercepted. One
 * LANTERN conversation is shared by the three tests (serial) so the model is
 * called once; a full investigation can take a few minutes.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';
const ANSWER_TIMEOUT = 8 * 60_000;

declare global {
  interface Window {
    __fusionCy?: { nodes: (sel: string) => { length: number } };
  }
}

const errors: string[] = [];
let page: Page;

test.describe.configure({ mode: 'serial', timeout: ANSWER_TIMEOUT + 60_000 });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL('/');
  await expect.poll(() => page.locator('#graph-canvas').getAttribute('data-node-count').then(Number), { timeout: 30_000 }).toBeGreaterThanOrEqual(20);
});

test.afterAll(async () => {
  await page.close();
  expect(errors, 'console errors during the analyst conversation').toEqual([]);
});

test('P5.4 a question streams a trace and then an answer from the real model', async () => {
  await page.getByRole('tab', { name: /analyst/i }).click();
  await page.getByTestId('analyst-input').fill('Who is LANTERN, and what are they enabling?');
  await page.getByTestId('analyst-send').click();

  const answer = page.getByTestId('analyst-answer').last();
  await expect(answer).toHaveAttribute('data-streaming', 'true');
  // The trace arrives while the turn is still streaming: that is the SSE transport working, not a buffered response.
  await expect(answer.getByTestId('analyst-trace').locator('li').first()).toBeVisible({ timeout: 120_000 });
  await expect(answer).toHaveAttribute('data-streaming', 'true');

  await expect(answer).not.toHaveAttribute('data-streaming', 'true', { timeout: ANSWER_TIMEOUT });
  await expect(answer.getByRole('alert')).toHaveCount(0);
  await expect(answer).toContainText('LANTERN');
  await expect(answer).toContainText(/Steps: \d\/8 · \S+/);
  expect((await answer.innerText()).length).toBeGreaterThan(400);
});

test('P5.6 highlight_in_ui lights nodes on the link chart and markers on the map', async () => {
  const answer = page.getByTestId('analyst-answer').last();
  await expect(answer.getByTestId('analyst-trace')).toContainText(/highlight/i);
  await expect.poll(() => page.evaluate(() => window.__fusionCy?.nodes('.ai-pulse').length ?? 0)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => page.locator('#graph-canvas').getAttribute('data-highlighted-count').then(Number)).toBeGreaterThanOrEqual(1);
});

test('P5.7 citation chips are valid and open the cited report', async () => {
  const answer = page.getByTestId('analyst-answer').last();
  const chips = answer.getByTestId('citation-chip');
  expect(await chips.count()).toBeGreaterThanOrEqual(2);
  const valid = answer.locator('[data-testid="citation-chip"]:not([data-invalid])');
  expect(await valid.count()).toBeGreaterThanOrEqual(2);

  const number = await valid.first().getAttribute('data-citation');
  expect(number).toMatch(/^R-\d{4}$/);
  await valid.first().click();
  const reader = page.getByTestId('report-reader');
  await expect(reader).toBeVisible();
  await expect(reader).toContainText(number!);
  await expect(reader.getByTestId('report-title')).not.toBeEmpty();
  await expect(reader).toContainText('EXERCISE');
  await page.keyboard.press('Escape'); // the reader overlays the right panel
  await expect(reader).toHaveCount(0);

  // The trace is collapsible and collapses once the turn is done.
  const trace = answer.getByTestId('analyst-trace');
  await expect(trace).not.toHaveAttribute('open', '');
  await trace.locator('summary').click();
  await expect(trace.locator('li').first()).toBeVisible();
});
