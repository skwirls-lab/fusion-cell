/**
 * Phase 6 model-facing paths against the REAL model (BUILD.md P6.1, P6.4, P6.5).
 * ingest.spec.ts and briefs.spec.ts cover the human-review halves through the
 * dev-only `manual` seams; this spec uses no seam and intercepts nothing:
 *
 *   ingest: paste → POST /api/ingest (model extraction) → review → commit → workspace
 *   briefs: template + topic → POST /api/briefs (analyst run + structuring call) → editor
 *
 * Assertions on model output are about substance the text forces (a named
 * vessel is extracted and matched to its seed row; citations are validated
 * report numbers), never about exact wording. Reseeds before and after.
 */
import { test, expect, type ConsoleMessage, type Page, type APIRequestContext } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';
const MODEL_TIMEOUT = 8 * 60_000;
const errors: string[] = [];

const RAW = [
  'FIELD REPORT — Tessaly picket, day 20.',
  'MV Larkspur observed near Tessaly Gate with two unidentified corvettes at 2026-08-20 14:00Z.',
  'One corvette carried the hull marking VHS Nightglass; no prior catalogue entry. Both corvettes held station 4,000 km off the gate while Larkspur transited.',
  'Picket assesses the escort was deliberate. Source graded B2.',
].join('\n');

async function reseed(request: APIRequestContext) {
  const login = await request.post('/api/login', { data: { password: PASSWORD } });
  expect(login.ok()).toBe(true);
  const res = await request.post('/api/admin/reseed');
  expect(res.ok()).toBe(true);
}

async function login(page: Page) {
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(`[${test.info().title}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${test.info().title}] pageerror: ${e.message}`));
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL('/');
}

test.describe.configure({ timeout: MODEL_TIMEOUT + 120_000 });
test.beforeAll(async ({ request }) => { await reseed(request); });
test.afterAll(async ({ request }) => { await reseed(request); expect(errors).toEqual([]); });

test('ingest: the real model extracts a pasted report; matches link to seed rows; commit lands in the workspace', async ({ page }) => {
  await login(page);
  await page.goto('/ingest');
  await page.getByTestId('ingest-text').fill(RAW);
  await page.getByTestId('extract').click();

  const review = page.getByTestId('ingest-review');
  await expect(review.or(page.getByTestId('ingest-error')).first()).toBeVisible({ timeout: MODEL_TIMEOUT });
  await expect(page.getByTestId('ingest-error'), 'extraction must succeed with a real model').toHaveCount(0);
  await expect(page.getByTestId('review-title')).not.toHaveValue('');
  await expect(page.getByTestId('review-summary')).not.toHaveText('No summary.');

  // The text names these three outright; any competent extraction has them, and the matcher must resolve the known two.
  // Rows carry data-name; a row set to "create" shows its name in an input, which hasText cannot see.
  const row = (name: string) => page.locator(`[data-testid="ingest-entity-row"][data-name*="${name}"]`).first();
  const larkspur = row('Larkspur');
  await expect(larkspur).toHaveAttribute('data-action', 'link');
  await expect(larkspur.getByTestId('match-select')).toHaveValue('ves_larkspur');
  await expect(row('Tessaly Gate')).toHaveAttribute('data-action', 'link');
  await expect(row('Nightglass')).toHaveAttribute('data-action', 'create');
  expect(await page.getByTestId('ingest-event-row').count()).toBeGreaterThanOrEqual(1);

  await page.getByTestId('commit').click();
  await expect(page.getByTestId('ingest-success')).toBeVisible();
  await expect(page.getByTestId('new-report-number')).toHaveText('R-0081');
  await expect(page.getByTestId('count-entities')).toContainText(/[1-9]\d* new/);

  await page.getByTestId('open-report').click();
  const reader = page.getByTestId('report-reader');
  await expect(reader.getByTestId('report-body')).toContainText('hull marking VHS Nightglass'); // body is the pasted text, verbatim
  await page.keyboard.press('Escape');

  await page.goto('/');
  await expect(page.locator('[data-testid="feed"] li.feed-row[data-report="R-0081"]')).toBeVisible({ timeout: 30_000 });
});

test('briefs: the real model drafts a threat assessment whose citations are validated report numbers', async ({ page }) => {
  await login(page);
  await page.goto('/briefs');
  await page.getByTestId('brief-template').selectOption('threat_assessment');
  await page.getByTestId('brief-topic').fill('Convoy 7 at Tessaly Gate');
  await page.getByTestId('brief-draft').click();

  // The analyst's trace streams while it gathers evidence.
  await expect(page.getByTestId('brief-trace').locator('li').first()).toBeVisible({ timeout: 120_000 });

  const editor = page.getByTestId('brief-editor');
  await expect(editor.or(page.getByTestId('brief-draft-error')).first()).toBeVisible({ timeout: MODEL_TIMEOUT });
  await expect(page.getByTestId('brief-draft-error'), 'drafting must succeed with a real model').toHaveCount(0);
  await expect(page.getByTestId('brief-version')).toHaveText('v1');
  await expect(page.getByTestId('brief-markdown')).toHaveValue(/## Bottom Line Up Front[\s\S]+## Key Judgments[\s\S]+## Evidence/);
  await expect(page.getByTestId('brief-markdown')).toHaveValue(/Tessaly/);
  await expect(page.getByTestId('brief-no-citations')).toHaveCount(0);

  await page.getByTestId('brief-mode-preview').click();
  const chips = page.getByTestId('brief-preview').getByTestId('brief-citation');
  expect(await chips.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-testid="brief-citation"][data-invalid]')).toHaveCount(0); // the pipeline strips anything a tool did not return

  // Every cited number is a real report row.
  const numbers = [...new Set(await chips.evaluateAll((els) => els.map((e) => e.getAttribute('data-citation')!)))];
  for (const n of numbers) {
    const res = await page.request.get(`/api/reports/${n}`); // shares the page's session cookie
    expect(res.status(), `${n} exists`).toBe(200);
  }

  await chips.first().click();
  await expect(page.getByTestId('report-reader')).toContainText(numbers[0]);
});
