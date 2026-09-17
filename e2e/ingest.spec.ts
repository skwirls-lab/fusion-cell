/**
 * Phase 6 gate for ingest (BUILD.md P6.3 / P6.4): review UI → one-transaction
 * commit → the new report, entity and event appear in the workspace (map +
 * graph + profile), all through the HTTP API against the seeded database.
 *
 * The model endpoint is unreachable in this environment, so the job is
 * created through the DEV-ONLY seam POST /api/ingest/manual, which stores a
 * caller-supplied extraction and runs the real matcher. The model-facing
 * extractor is covered by tests/unit/ingest/extract.test.ts. What this spec
 * proves: matching, the review UI, commit, and the workspace showing the
 * result. What it does not prove: that a real model produces a good extraction.
 *
 * The suite reseeds before and after so the report number is deterministic
 * (R-0081 on the pristine 80-report seed) and the run is repeatable.
 */
import { test, expect, type ConsoleMessage, type Page, type APIRequestContext } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';
const errors: string[] = [];

const RAW = [
  'FIELD REPORT — Tessaly picket, day 20.',
  'MV Larkspur observed near Tessaly Gate with two unidentified corvettes at 2026-08-20 14:00Z.',
  'One corvette carried the hull marking VHS Nightglass; no prior catalogue entry. Both corvettes held station 4,000 km off the gate while Larkspur transited.',
  'Picket assesses the escort was deliberate. Source graded B2.',
].join('\n');

const EXTRACTION = {
  title: 'Larkspur transits Tessaly Gate under corvette escort',
  summary: 'MV Larkspur was observed near Tessaly Gate accompanied by two unidentified corvettes, one marked VHS Nightglass, which held station while Larkspur transited.',
  event_at: '2026-08-20T14:00:00Z',
  source_reliability: 'B',
  info_credibility: 2,
  entities: [
    { name: 'MV Larkspur', type: 'vessel', aliases: ['Larkspur'], description: 'Merchant vessel transiting the gate', confidence: 0.92 },
    { name: 'Tessaly Gate', type: 'location', aliases: [], description: 'Jump gate', confidence: 0.97 },
    { name: 'VHS Nightglass', type: 'vessel', aliases: ['Nightglass'], description: 'Corvette, no prior catalogue entry', confidence: 0.7 },
    { name: 'two unidentified corvettes', type: 'vessel', aliases: [], description: '', confidence: 0.4 },
  ],
  relationships: [
    { source_name: 'VHS Nightglass', target_name: 'Tessaly Gate', type: 'located_at', confidence: 0.8, evidence: 'Both corvettes held station 4,000 km off the gate' },
  ],
  events: [
    { title: 'Larkspur sighted at Tessaly Gate with corvette escort', type: 'sighting', occurred_at: '2026-08-20T14:00:00Z', location_name: 'Tessaly Gate', participant_names: ['MV Larkspur', 'VHS Nightglass'], description: 'Two corvettes held station while Larkspur transited', confidence: 0.85 },
  ],
};

async function apiLogin(request: APIRequestContext) {
  const res = await request.post('/api/login', { data: { password: PASSWORD } });
  expect(res.ok()).toBe(true);
}

async function reseed(request: APIRequestContext) {
  await apiLogin(request);
  const res = await request.post('/api/admin/reseed');
  expect(res.ok()).toBe(true);
  const body = await res.json() as { ok: boolean; counts: { reports: number } };
  expect(body.counts.reports).toBe(80);
}

async function login(page: Page) {
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(`[${test.info().title}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${test.info().title}] pageerror: ${e.message}`));
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL('/');
}

const markerCount = (page: Page) => page.locator('#map-canvas-wrap').getAttribute('data-marker-count').then(Number);
const graphNodeCount = (page: Page) => page.locator('#graph-canvas').getAttribute('data-node-count').then(Number);

test.beforeAll(async ({ request }) => { await reseed(request); });
test.afterAll(async ({ request }) => { await reseed(request); expect(errors).toEqual([]); });

test('paste → review (link suggestion) → commit → R-0081 appears on the map and graph', async ({ page }) => {
  await login(page);

  // Baseline from the workspace: how many markers / nodes the seed draws.
  await expect(page.locator('#map-canvas-wrap canvas')).toBeVisible();
  await expect.poll(() => markerCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(40);
  await expect.poll(() => graphNodeCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(20);
  const markersBefore = await markerCount(page);
  const nodesBefore = await graphNodeCount(page);

  // The compose step is real UI; the model call behind "Extract" cannot succeed here (no network),
  // so the job is created through the dev-only seam from the page's own session.
  await page.goto('/ingest');
  await expect(page.getByTestId('ingest-compose')).toBeVisible();
  await expect(page.getByTestId('extract')).toBeDisabled(); // nothing pasted yet
  await page.getByTestId('ingest-text').fill(RAW);
  await expect(page.getByTestId('extract')).toBeEnabled();

  const job = await page.evaluate(async ({ rawText, extraction }) => {
    const res = await fetch('/api/ingest/manual', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawText, reportType: 'IMINT', extraction }),
    });
    if (!res.ok) throw new Error(`manual seam → ${res.status}: ${await res.text()}`);
    return (await res.json()) as { id: string; status: string };
  }, { rawText: RAW, extraction: EXTRACTION });
  expect(job.status).toBe('reviewed');

  // Resume the job in the review step.
  await page.goto(`/ingest?job=${encodeURIComponent(job.id)}`);
  const review = page.getByTestId('ingest-review');
  await expect(review).toBeVisible();
  await expect(page.getByTestId('review-title')).toHaveValue(EXTRACTION.title);

  const rows = page.getByTestId('ingest-entity-row');
  await expect(rows).toHaveCount(4);
  // MV Larkspur: exact seed name → suggested link, candidate MV Larkspur at 100%.
  const larkspur = page.locator('[data-testid="ingest-entity-row"][data-name="MV Larkspur"]');
  await expect(larkspur).toHaveAttribute('data-action', 'link');
  await expect(larkspur.getByRole('radio', { name: 'Link to' })).toBeChecked();
  await expect(larkspur.getByTestId('match-select')).toHaveValue('ves_larkspur');
  await expect(larkspur.getByTestId('match-select').locator('option:checked')).toHaveText(/MV Larkspur \(vessel\) · 100%/);
  // Tessaly Gate links; the new vessel creates; the generic name is discarded.
  await expect(page.locator('[data-testid="ingest-entity-row"][data-name="Tessaly Gate"]')).toHaveAttribute('data-action', 'link');
  await expect(page.locator('[data-testid="ingest-entity-row"][data-name="VHS Nightglass"]')).toHaveAttribute('data-action', 'create');
  await expect(page.locator('[data-testid="ingest-entity-row"][data-name="two unidentified corvettes"]')).toHaveAttribute('data-action', 'discard');
  await expect(page.getByTestId('ingest-relationship-row')).toHaveCount(1);
  await expect(page.getByTestId('ingest-event-row')).toHaveCount(1);

  // Commit.
  await page.getByTestId('commit').click();
  const success = page.getByTestId('ingest-success');
  await expect(success).toBeVisible();
  await expect(page.getByTestId('new-report-number')).toHaveText('R-0081');
  await expect(page.getByTestId('count-entities')).toContainText('1 new');
  await expect(page.getByTestId('count-entities')).toContainText('2 linked');
  await expect(page.getByTestId('count-relationships')).toHaveText('1');
  await expect(page.getByTestId('count-events')).toHaveText('1');
  await expect(page.getByTestId('skipped')).toHaveCount(0);

  // The report is readable in place, body verbatim.
  await page.getByTestId('open-report').click();
  const reader = page.getByTestId('report-reader');
  await expect(reader).toBeVisible();
  await expect(reader.getByTestId('report-title')).toHaveText(EXTRACTION.title);
  await expect(reader.getByTestId('report-body')).toContainText('hull marking VHS Nightglass');
  await expect(reader.locator('mark[data-entity-id="ves_larkspur"]').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Hand-off to the workspace with the new entity selected: profile, map marker, graph node.
  await page.getByTestId('open-workspace').click();
  await expect(page).toHaveURL(/sel=entity(%3A|:)ent_vhs_nightglass_/);
  await expect(page.getByTestId('entity-name')).toHaveText('VHS Nightglass');
  await expect(page.getByTestId('entity-profile')).toContainText('R-0081');
  await expect(page.getByTestId('connection-row').filter({ hasText: 'Tessaly Gate' }).first()).toBeVisible();
  await expect.poll(() => markerCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(markersBefore + 1); // the new sighting event
  await expect.poll(() => graphNodeCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(nodesBefore + 1); // the new vessel node
  const newId = new URL(page.url()).searchParams.get('sel')!.slice('entity:'.length);
  await expect.poll(() => page.evaluate((id) => {
    const cy = (window as unknown as { __fusionCy?: { $: (sel: string) => { length: number } } }).__fusionCy;
    return cy?.$(`#${id}`).length ?? 0;
  }, newId)).toBe(1);

  // And the live feed has it on top.
  await expect(page.locator('[data-testid="feed"] li.feed-row').first()).toHaveAttribute('data-report', 'R-0081');
});

test('a second commit of the same job is refused, and a discarded job cannot be committed', async ({ page, request }) => {
  await login(page);
  const job = await page.evaluate(async ({ rawText, extraction }) => {
    const res = await fetch('/api/ingest/manual', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawText, reportType: 'IMINT', extraction }),
    });
    return (await res.json()) as { id: string };
  }, { rawText: RAW, extraction: EXTRACTION });

  await page.goto(`/ingest?job=${encodeURIComponent(job.id)}`);
  await expect(page.getByTestId('ingest-review')).toBeVisible();
  await page.getByTestId('discard').click();
  await expect(page.getByTestId('ingest-compose')).toBeVisible();
  await expect(page).not.toHaveURL(/job=/);

  await apiLogin(request);
  const res = await request.post(`/api/ingest/${job.id}/commit`, { data: { decisions: { entities: [], relationships: [], events: [] } } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ error: 'discarded' });
});

test('the real extraction path fails honestly when the model is unreachable', async ({ page }) => {
  await login(page);
  await page.goto('/ingest');
  await page.getByTestId('ingest-text').fill(RAW);
  await page.getByTestId('extract').click();
  // Either the 502 (no network) or, on a machine with model access, the review step. Both are honest outcomes.
  const outcome = page.getByTestId('ingest-error').or(page.getByTestId('ingest-review'));
  await expect(outcome.first()).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId('ingest-error').count()) {
    await expect(page.getByTestId('ingest-error')).toContainText(/could not be reached|not configured|Extraction failed|Model call failed/);
    await expect(page.getByTestId('extract')).toHaveText('Retry extraction');
    await expect(page.getByTestId('ingest-text')).toHaveValue(RAW); // text kept for the retry
    // The 502 is the outcome under test. Chromium logs every non-2xx fetch as a console error; that one
    // line, by exact text and only from this test, is not an application error and is dropped here.
    const benign = `[${test.info().title}] Failed to load resource: the server responded with a status of 502 (Bad Gateway)`;
    for (let i = errors.length - 1; i >= 0; i--) if (errors[i] === benign) errors.splice(i, 1);
  }
});
