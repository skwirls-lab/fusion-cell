/**
 * Phase 4 gate (BUILD.md §6): map, chart, cross-highlight both ways, profile,
 * feed, filters — against the seeded database through the HTTP API only.
 * Run with a dev server on :3000 over the seeded `.pglite/dev`.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';

declare global {
  interface Window {
    __fusionMap?: { project: (lon: number, lat: number) => [number, number] | null; ids: { locations: string[]; events: string[] } };
    __fusionCy?: {
      $: (sel: string) => { length: number; hasClass: (c: string) => boolean; renderedPosition: () => { x: number; y: number } };
      center: (eles: unknown) => void;
      container: () => HTMLElement;
    };
  }
}

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
const graphCount = (page: Page, attr: 'data-node-count' | 'data-highlighted-count') => page.locator('#graph-canvas').getAttribute(attr).then(Number);
const mapHighlighted = (page: Page) => page.locator('#map-canvas-wrap').getAttribute('data-highlighted-count').then(Number);
const graphNodeHighlighted = (page: Page, id: string) => page.evaluate((nodeId) => window.__fusionCy?.$(`#${nodeId}`).hasClass('highlighted') ?? false, id);

/**
 * A real pointer click on a chart node: centre it, read its rendered position,
 * click through the page. Never returns a Cytoscape collection from evaluate —
 * serialising the cyclic object hangs Playwright.
 */
async function clickGraphNode(page: Page, id: string) {
  const [x, y] = await page.evaluate((nodeId) => {
    const cy = window.__fusionCy!;
    const n = cy.$(`#${nodeId}`);
    if (!n.length) throw new Error(`${nodeId} not in the chart`);
    cy.center(n);
    const p = n.renderedPosition();
    const r = cy.container().getBoundingClientRect();
    return [r.left + p.x, r.top + p.y] as [number, number];
  }, id);
  await page.mouse.click(x, y);
}

/** Both canvases populated from the API. */
async function waitForViews(page: Page) {
  await expect(page.locator('#map-canvas-wrap canvas')).toBeVisible();
  await expect.poll(() => markerCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(40);
  await expect.poll(() => graphCount(page, 'data-node-count'), { timeout: 30_000 }).toBeGreaterThanOrEqual(20);
}

test.beforeEach(async ({ page }) => { await login(page); });

test('map renders ≥40 markers on a live canvas', async ({ page }) => {
  await expect(page.locator('#map-canvas-wrap canvas')).toBeVisible();
  await expect.poll(() => markerCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(40);
});

test('link chart renders ≥20 non-location nodes', async ({ page }) => {
  await expect.poll(() => graphCount(page, 'data-node-count'), { timeout: 30_000 }).toBeGreaterThanOrEqual(20);
  // Locations hidden by default: the toggle is on.
  await expect(page.locator('[data-toggle="hide-locations"]')).toBeChecked();
});

test('cross-highlight map → graph: clicking Kestrel on the canvas selects it everywhere', async ({ page }) => {
  await waitForViews(page);
  // Free Port of Kestrel sits at lon 0 / lat 0 (seed data); project through the live deck viewport
  // (null until deck's view manager exists, hence the poll).
  const project = () => page.evaluate(() => window.__fusionMap?.project(0, 0) ?? null);
  await expect.poll(project).not.toBeNull();
  const [x, y] = (await project())!;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('entity-name')).toHaveText('Free Port of Kestrel');
  // The selection lights Kestrel and its neighbours: Ilsa Varro is `located_at` Kestrel in the seed.
  await expect.poll(() => graphCount(page, 'data-highlighted-count')).toBeGreaterThanOrEqual(2);
  await expect.poll(() => graphNodeHighlighted(page, 'per_ilsa_varro')).toBe(true);
  await expect(page.getByTestId('connection-row').filter({ hasText: 'Ilsa Varro' }).first()).toBeVisible();
  await expect.poll(() => mapHighlighted(page)).toBeGreaterThanOrEqual(1);
  await expect(page).toHaveURL(/sel=entity%3Aloc_kestrel|sel=entity:loc_kestrel/);
});

test('cross-highlight search → graph + map: picking Kestrel from global search', async ({ page }) => {
  await waitForViews(page);
  await page.keyboard.press('/');
  await expect(page.locator('#global-search')).toBeFocused();
  await page.locator('#global-search').fill('Kestrel');
  await page.getByTestId('search-entity').filter({ hasText: 'Free Port of Kestrel' }).first().click();
  await expect(page.getByTestId('entity-name')).toHaveText('Free Port of Kestrel');
  await expect.poll(() => graphCount(page, 'data-highlighted-count')).toBeGreaterThanOrEqual(2);
  await expect.poll(() => graphNodeHighlighted(page, 'per_ilsa_varro')).toBe(true);
  await expect(page.getByTestId('connection-row').filter({ hasText: 'Ilsa Varro' }).first()).toBeVisible();
  await expect.poll(() => mapHighlighted(page)).toBeGreaterThanOrEqual(1);
});

test('cross-highlight graph → map: tapping Ilsa Varro on the chart lights up her locations', async ({ page }) => {
  await waitForViews(page);
  await clickGraphNode(page, 'per_ilsa_varro');
  await expect(page.getByTestId('entity-name')).toHaveText('Ilsa Varro');
  await expect.poll(() => graphCount(page, 'data-highlighted-count')).toBeGreaterThanOrEqual(1);
  await expect.poll(() => mapHighlighted(page)).toBeGreaterThanOrEqual(1);
});

test('profile: connections, source report chip, and the reader', async ({ page }) => {
  await waitForViews(page);
  await clickGraphNode(page, 'per_ilsa_varro');
  await expect(page.getByTestId('entity-name')).toHaveText('Ilsa Varro');
  const ansel = page.getByTestId('connection-row').filter({ hasText: 'Ansel Varro' });
  await expect(ansel.first()).toBeVisible();
  await ansel.first().getByRole('button', { name: 'R-0003' }).click();
  const reader = page.getByTestId('report-reader');
  await expect(reader).toBeVisible();
  await expect(reader.getByTestId('report-title')).toContainText('Personnel index');
  // Inline entity highlight: the body marks Ansel Varro; clicking selects him everywhere.
  await reader.locator('mark[data-entity-id="per_ansel_varro"]').first().click();
  await expect(page.getByTestId('entity-name')).toHaveText('Ansel Varro');
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
});

test('feed: ≥10 rows, newest first, row opens the reader', async ({ page }) => {
  const rows = page.locator('[data-testid="feed"] li.feed-row');
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  // Newest first: reportedAt must be non-increasing down the list (polled: the feed refetches every 3s).
  await expect.poll(async () => {
    const at = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-reported-at') ?? ''));
    if (at.length < 10 || at.some((v) => !v)) return 'incomplete';
    for (let i = 1; i < at.length; i++) if (Date.parse(at[i]) > Date.parse(at[i - 1])) return `row ${i} (${at[i]}) is newer than row ${i - 1} (${at[i - 1]})`;
    return 'sorted';
  }).toBe('sorted');
  const first = await rows.first().getAttribute('data-report');
  await rows.first().locator('button').click();
  const reader = page.getByTestId('report-reader');
  await expect(reader).toBeVisible();
  await expect(reader).toContainText(first!);
});

test('filters: a faction filter drops the marker count', async ({ page }) => {
  await waitForViews(page);
  const before = await markerCount(page);
  await page.getByLabel('Vantor Hegemony').check();
  await expect.poll(() => markerCount(page), { timeout: 20_000 }).toBeLessThan(before);
  await expect(page).toHaveURL(/factions=hegemony/);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect.poll(() => markerCount(page), { timeout: 20_000 }).toBe(before);
});

test.afterAll(() => {
  // No filtering: any console error anywhere in the run fails the gate.
  expect(errors).toEqual([]);
});
