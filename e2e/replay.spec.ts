/**
 * Phase 7 gate: the scenario timeline (MAP-7) drives replay through the
 * shared `filters.to` — rewinding empties the map and feed, playing fills
 * them back in, resetting restores the live picture.
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

const markerCount = (page: Page) => page.locator('#map-canvas-wrap').getAttribute('data-marker-count').then(Number);
const feedRows = (page: Page) => page.locator('[data-testid="feed"] li.feed-row').count();

test.beforeEach(async ({ page }) => { await login(page); });

test('scrubber renders with per-day density bars and the cursor at the end', async ({ page }) => {
  const timeline = page.getByTestId('timeline');
  await expect(timeline).toBeVisible();
  const bars = page.locator('[data-testid="timeline-density"] [data-day]');
  await expect(bars).toHaveCount(30);
  // Density comes from the unfiltered events query: most days have activity.
  await expect.poll(() => bars.evaluateAll((els) => els.filter((e) => Number(e.getAttribute('data-count')) > 0).length), { timeout: 30_000 }).toBeGreaterThanOrEqual(20);
  await expect(page.getByTestId('timeline-label')).toHaveText('DAY 31 · 31 0000Z');
  await expect(timeline).toHaveAttribute('data-playing', 'false');
  await expect(page.getByRole('button', { name: 'Reset timeline' })).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'Scenario timeline cursor' })).toBeVisible();
});

test('replay from day 1 empties the views, play at 12× fills them, reset restores the baseline', async ({ page }) => {
  // Baseline: locations + all 165 events on the map, a full first page in the feed, clock at day 30.
  await expect.poll(() => markerCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(150);
  await expect.poll(() => feedRows(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(500); // let the events query settle before taking the baseline
  const baseline = await markerCount(page);
  const baselineRows = await feedRows(page);
  await expect(page.getByTestId('scenario-clock')).toHaveText('SCENARIO DAY 30');

  // 1× first so the day-1 picture holds still for ten real seconds while we look at it.
  await page.getByRole('button', { name: '1×' }).click();
  await page.getByRole('button', { name: 'Replay from day 1' }).click();
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-playing', 'true');
  // Only the 38 locations survive the day-1 cutoff; the feed has nothing before 01 0000Z.
  await expect.poll(() => markerCount(page), { timeout: 10_000 }).toBeLessThanOrEqual(45);
  await expect.poll(() => markerCount(page)).toBeGreaterThanOrEqual(38);
  const locationsOnly = await markerCount(page);
  await expect.poll(() => feedRows(page)).toBe(0);
  await expect(page.getByText('No reports match the current filters.')).toBeVisible();
  await expect(page.getByTestId('scenario-clock')).toHaveAttribute('data-replay', 'true');
  await expect(page.getByTestId('scenario-clock')).toHaveText('SCENARIO DAY 1');
  await expect(page).toHaveURL(/to=2026-08-01/);

  // 12×: a scenario day every 0.83s, so day-2 events land on the map within seconds.
  await page.getByRole('button', { name: '12×' }).click();
  await expect.poll(() => markerCount(page), { timeout: 15_000 }).toBeGreaterThan(locationsOnly);
  await expect.poll(() => feedRows(page), { timeout: 15_000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Pause replay' }).click();
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-playing', 'false');
  const clockDay = Number(await page.getByTestId('scenario-clock').getAttribute('data-day'));
  expect(clockDay).toBeGreaterThan(1);
  expect(clockDay).toBeLessThan(30);
  // Paused: the cursor holds (the last throttled push may still land, then nothing moves).
  await page.waitForTimeout(600);
  const paused = await page.getByTestId('timeline').getAttribute('data-cursor');
  await page.waitForTimeout(600);
  expect(await page.getByTestId('timeline').getAttribute('data-cursor')).toBe(paused);

  await page.getByRole('button', { name: 'Reset timeline' }).click();
  await expect.poll(() => markerCount(page), { timeout: 15_000 }).toBe(baseline);
  await expect.poll(() => feedRows(page), { timeout: 15_000 }).toBe(baselineRows);
  await expect(page.getByTestId('scenario-clock')).toHaveText('SCENARIO DAY 30');
  await expect(page.getByTestId('scenario-clock')).not.toHaveAttribute('data-replay', 'true');
  await expect(page.getByTestId('timeline-label')).toHaveText('DAY 31 · 31 0000Z');
  await expect(page).not.toHaveURL(/to=/);
});

test('dragging the scrubber sets the cutoff; Space toggles play over the drawer', async ({ page }) => {
  await expect.poll(() => markerCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(150);
  const slider = page.getByRole('slider', { name: 'Scenario timeline cursor' });
  // Keyboard-drive the range to the middle of the window: Home then a fifty percent jump.
  await slider.focus();
  await slider.press('Home');
  await expect(page.getByTestId('timeline-label')).toHaveText('DAY 1 · 01 0000Z');
  await slider.fill('5000');
  await expect(page.getByTestId('timeline-label')).toHaveText('DAY 16 · 16 0000Z');
  await expect(page.getByTestId('scenario-clock')).toHaveText('SCENARIO DAY 16');
  await expect.poll(() => markerCount(page), { timeout: 15_000 }).toBeLessThan(150);
  // Space with the drawer focused starts the replay; Space again pauses it. In the search box it types.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-playing', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-playing', 'false');
  await page.locator('#global-search').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-playing', 'false');
  await expect(page.locator('#global-search')).toHaveValue(' ');
});

test.afterAll(() => {
  expect(errors).toEqual([]);
});
