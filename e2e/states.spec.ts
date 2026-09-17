/**
 * Phase 7 gate: empty / loading / error states and the keyboard shortcut audit.
 *
 * Everything reads the seeded database through the HTTP API. `page.route` is used
 * in exactly one way: to make a real endpoint answer 500 so the error path can be
 * exercised, then removed so Retry is served by the real route. It never fakes data.
 */
import { test, expect, type APIRequestContext, type ConsoleMessage, type Page } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';
const NONSENSE = 'zzqxv-no-such-thing';
const errors: string[] = [];

/** `expected` lets one test name the console errors it causes on purpose; everything else still fails the suite. */
async function login(page: Page, expected: (m: ConsoleMessage) => boolean = () => false) {
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error' && !expected(m)) errors.push(`[${test.info().title}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${test.info().title}] pageerror: ${e.message}`));
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL('/');
}

/** A fresh `.pglite/e2e` has the schema but no rows; load the real seed once (the same route the Admin page uses). */
async function ensureSeeded(request: APIRequestContext) {
  expect((await request.post('/api/login', { data: { password: PASSWORD } })).ok()).toBe(true);
  const health = await (await request.get('/api/health')).json() as { counts: { reports: number } };
  if (health.counts.reports > 0) return;
  expect((await request.post('/api/admin/reseed')).ok()).toBe(true);
}

const feedRows = (page: Page) => page.locator('[data-testid="feed"] li.feed-row');

test.beforeAll(async ({ request }) => { await ensureSeeded(request); });
test.afterAll(() => { expect(errors).toEqual([]); });

test('empty states: feed + map under a day-1 cutoff, /reports, /entities, global search, alerts', async ({ page }) => {
  await login(page);
  await expect.poll(() => feedRows(page).count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId('feed-empty')).toHaveCount(0);
  await expect(page.getByTestId('entity-empty')).toBeVisible(); // nothing selected yet

  // Cutoff at 01 0000Z: no report and no event is that early, so the filter matches nothing.
  const slider = page.getByRole('slider', { name: 'Scenario timeline cursor' });
  await slider.focus();
  await slider.press('Home');
  await expect(page.getByTestId('timeline-label')).toHaveText('DAY 1 · 01 0000Z');
  const feedEmpty = page.getByTestId('feed-empty');
  await expect(feedEmpty).toBeVisible();
  await expect(feedEmpty).toContainText('No reports match the current filters');
  await expect(page.getByTestId('feed')).toHaveCount(0);
  await expect(page.getByTestId('feed-error')).toHaveCount(0);
  await expect(page.getByTestId('map-empty')).toBeVisible();
  await expect(page.getByTestId('map-empty')).toContainText('No events match the current filters');

  // The way out is on the empty state itself.
  await page.getByTestId('feed-reset-filters').click();
  await expect(feedEmpty).toHaveCount(0);
  await expect(page.getByTestId('map-empty')).toHaveCount(0);
  await expect.poll(() => feedRows(page).count()).toBeGreaterThanOrEqual(10);
  await expect(page).not.toHaveURL(/to=/);

  // Global search with no hits.
  await page.locator('#global-search').fill(NONSENSE);
  await expect(page.getByTestId('search-empty')).toBeVisible();
  await expect(page.getByTestId('search-empty')).toContainText(NONSENSE);
  await expect(page.getByTestId('search-entity')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-results')).toHaveCount(0);

  // Alerts dropdown before anything is watched.
  await page.getByTestId('alert-bell').click();
  await expect(page.getByTestId('alerts-empty')).toBeVisible();
  await expect(page.getByTestId('alerts-empty')).toContainText('No alerts yet');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('alert-menu')).toHaveCount(0);

  // /reports
  await page.goto('/reports');
  await expect(page.getByTestId('report-row')).toHaveCount(25);
  await page.getByTestId('reports-search').fill(NONSENSE);
  const reportsEmpty = page.getByTestId('reports-empty');
  await expect(reportsEmpty).toBeVisible();
  await expect(reportsEmpty).toContainText(`No reports match “${NONSENSE}”`);
  await expect(page.getByTestId('report-row')).toHaveCount(0);
  await expect(page.getByTestId('reports-page')).toContainText('0 reports');
  await page.getByTestId('reports-clear').click();
  await expect(page.getByTestId('reports-search')).toHaveValue('');
  await expect(page.getByTestId('report-row')).toHaveCount(25);
  await expect(reportsEmpty).toHaveCount(0);

  // /entities
  await page.goto('/entities');
  await expect.poll(() => page.getByTestId('entity-row').count()).toBeGreaterThanOrEqual(150);
  await page.getByTestId('type-chip-vessel').click();
  await page.getByTestId('entities-search').fill(NONSENSE);
  const entitiesEmpty = page.getByTestId('entities-empty');
  await expect(entitiesEmpty).toBeVisible();
  await expect(entitiesEmpty).toContainText('of type vessel');
  await page.getByTestId('entities-clear').click();
  await expect(entitiesEmpty).toHaveCount(0);
  await expect.poll(() => page.getByTestId('entity-row').count()).toBeGreaterThanOrEqual(150);
});

test('error states: a 500 from /api/reports shows the typed message; Retry recovers once the route is real again', async ({ page }) => {
  // The browser logs every failed fetch ("Failed to load resource … 500"). Those — for this endpoint only — are this test's doing.
  await login(page, (m) => m.location().url.includes('/api/reports') && /\b500\b/.test(m.text()));

  let failed = 0;
  const fail = async (route: import('@playwright/test').Route) => {
    failed += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'simulated outage' }) });
  };
  const REPORTS_API = /\/api\/reports\?/; // the list endpoint (feed, /reports table, scenario clock); not /api/reports/:id
  await page.route(REPORTS_API, fail);

  // ---- /reports: the first load fails (after the client's own two re-tries).
  await page.goto('/reports');
  const reportsError = page.getByTestId('reports-error');
  await expect(reportsError).toBeVisible();
  await expect(page.getByTestId('reports-error-message')).toContainText('500');
  await expect(page.getByTestId('reports-error-message')).toContainText('internal_error — simulated outage');
  await expect(page.getByTestId('report-row')).toHaveCount(0);
  await expect(page.getByTestId('reports-empty')).toHaveCount(0);
  await expect(page.getByTestId('reports-loading')).toHaveCount(0);
  expect(failed).toBeGreaterThanOrEqual(3);

  // Still failing: Retry comes back to the error, it does not spin forever or go blank.
  const before = failed;
  await page.getByTestId('reports-error-retry').click();
  await expect.poll(() => failed).toBeGreaterThan(before);
  await expect(reportsError).toBeVisible();
  await expect(page.getByTestId('reports-error-retry')).toHaveText('Retry', { timeout: 20_000 }); // the re-tries ran out again
  await expect(page.getByTestId('report-row')).toHaveCount(0);

  await page.unroute(REPORTS_API, fail);
  await page.getByTestId('reports-error-retry').click();
  await expect(page.getByTestId('report-row')).toHaveCount(25);
  await expect(reportsError).toHaveCount(0);

  // ---- workspace feed: loads, then the poll starts failing, then Retry.
  await page.goto('/');
  await expect.poll(() => feedRows(page).count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  await page.route(REPORTS_API, fail);
  const feedError = page.getByTestId('feed-error');
  await expect(feedError).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('feed-error-message')).toContainText('simulated outage');
  await expect(page.getByTestId('feed')).toHaveCount(0);
  // The rest of the workspace is unaffected by one failing endpoint.
  await expect(page.getByTestId('map-error')).toHaveCount(0);
  await expect(page.getByTestId('graph-error')).toHaveCount(0);
  await page.unroute(REPORTS_API, fail);
  await page.getByTestId('feed-error-retry').click();
  await expect.poll(() => feedRows(page).count()).toBeGreaterThanOrEqual(10);
  await expect(feedError).toHaveCount(0);
});

test('shortcut help: `?` opens it, Escape closes it, and Escape only ever closes the topmost layer', async ({ page }) => {
  await login(page);
  await expect.poll(() => feedRows(page).count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  const help = page.getByTestId('shortcut-help');
  await expect(help).toHaveCount(0);

  await page.keyboard.press('?');
  await expect(help).toBeVisible();
  await expect(help).toBeFocused();
  // Rendered from the table: every binding is listed, including itself.
  await expect(help.locator('[data-shortcut="help"]')).toContainText('?');
  await expect(help.locator('[data-shortcut="focus-search"]')).toContainText('Focus global search');
  await expect(help.locator('[data-shortcut="toggle-replay"]')).toContainText('Space');
  expect(await help.getByTestId('shortcut-row').count()).toBeGreaterThanOrEqual(7);
  // Modal: other shortcuts are inert underneath it.
  await page.keyboard.press('/');
  await expect(page.locator('#global-search')).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  // The top-bar button opens the same overlay; `?` toggles it shut.
  await page.getByTestId('shortcut-help-button').click();
  await expect(help).toBeVisible();
  await page.keyboard.press('?');
  await expect(help).toHaveCount(0);

  // Layer order. Select an entity, open a report, open help: three Escapes peel them one at a time.
  await page.keyboard.press('/');
  await expect(page.locator('#global-search')).toBeFocused();
  await expect(page.locator('#global-search')).toHaveValue(''); // the slash was not typed
  await page.locator('#global-search').fill('Kestrel');
  await page.getByTestId('search-entity').filter({ hasText: 'Free Port of Kestrel' }).first().click();
  await expect(page.getByTestId('entity-name')).toHaveText('Free Port of Kestrel');
  await feedRows(page).first().locator('button').click();
  const reader = page.getByTestId('report-reader');
  await expect(reader).toBeVisible();
  await page.keyboard.press('?');
  await expect(help).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await expect(reader).toBeVisible();

  // A dropdown sits above the reader, even with focus in a text field: Escape closes the result list, not the report.
  await page.keyboard.press('/');
  await page.locator('#global-search').fill('Larkspur');
  await expect(page.getByTestId('search-results')).toBeVisible();
  await expect(page.getByTestId('search-entity').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-results')).toHaveCount(0);
  await expect(page.locator('#global-search')).not.toBeFocused();
  await expect(reader).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(page.getByTestId('entity-name')).toHaveText('Free Port of Kestrel'); // the selection outlived the overlays

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('entity-empty')).toBeVisible();
  await expect(page).not.toHaveURL(/sel=/);
});

test('shortcuts stand down while typing, under modifiers, and where Space already means "click"', async ({ page }) => {
  await login(page);
  await expect.poll(() => feedRows(page).count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  const search = page.locator('#global-search');
  const help = page.getByTestId('shortcut-help');
  const timeline = page.getByTestId('timeline');

  // In the search box every shortcut key is just a character.
  await search.focus();
  await page.keyboard.type('?gma/');
  await expect(search).toHaveValue('?gma/');
  await expect(search).toBeFocused();
  await expect(help).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'AI Analyst' })).toHaveAttribute('aria-selected', 'false');
  await search.fill('');
  await page.keyboard.press('Escape'); // leaves the field
  await expect(search).not.toBeFocused();

  // Outside a field they work: G and M move focus to the panes, A opens the analyst and focuses its box without typing into it.
  await page.keyboard.press('g');
  await expect(page.locator('#graph-canvas')).toBeFocused();
  await page.keyboard.press('m');
  await expect(page.locator('#map-canvas-wrap')).toBeFocused();
  // Shift+G is not ours: focus stays where it was.
  await page.keyboard.press('Shift+G');
  await expect(page.locator('#map-canvas-wrap')).toBeFocused();
  await page.keyboard.press('a');
  await expect(page.getByRole('tab', { name: 'AI Analyst' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('analyst-input')).toBeFocused();
  await expect(page.getByTestId('analyst-input')).toHaveValue('');
  // …and in the analyst box, `?` and letters type.
  await page.keyboard.type('m?');
  await expect(page.getByTestId('analyst-input')).toHaveValue('m?');
  await expect(help).toHaveCount(0);
  await page.getByTestId('analyst-input').fill('');
  await page.getByRole('tab', { name: 'Entity Profile' }).click();

  // Space: on a focused button it is that button's click and nothing more.
  await page.getByRole('button', { name: '12×' }).click();          // focus stays on the speed button, pointer over the drawer
  await page.keyboard.press('Space');
  await expect(timeline).toHaveAttribute('data-playing', 'false');
  await expect(timeline).toHaveAttribute('data-speed', '12');
  // On the play button, one Space is exactly one toggle (not the shortcut and the click cancelling out).
  await page.getByRole('button', { name: 'Play replay' }).focus();
  await page.keyboard.press('Space');
  await expect(timeline).toHaveAttribute('data-playing', 'true');
  await page.keyboard.press('Space');
  await expect(timeline).toHaveAttribute('data-playing', 'false');
  // On the scrubber (a range input) Space is the shortcut, and the page does not scroll.
  await page.getByTestId('timeline-scrubber').focus();
  await page.keyboard.press('Space');
  await expect(timeline).toHaveAttribute('data-playing', 'true');
  await page.keyboard.press('Space');
  await expect(timeline).toHaveAttribute('data-playing', 'false');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Reset timeline' }).click();
  await expect(page).not.toHaveURL(/to=/);
});
