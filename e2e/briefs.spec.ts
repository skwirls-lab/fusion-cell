/**
 * Phase 6 briefs (BUILD.md P6.5) — the editor, versioning, preview, citation
 * chips → report reader, print export, and delete, against the seeded database
 * through the HTTP API only.
 *
 * WHAT THIS DOES NOT COVER: model drafting. The real model is unreachable in
 * this sandbox, so the brief is inserted through the dev-only seam
 * `POST /api/briefs/manual` (404 in production), which writes the row exactly
 * as POST /api/briefs would after Steps A–C. The pipeline itself (analyst loop,
 * structuring call, citation enforcement, rendering) is verified only by
 * tests/unit/brief/draft.test.ts with a scripted model.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

const PASSWORD = process.env.APP_PASSWORD ?? 'oxymoron';
const BANNER = 'EXERCISE – FICTIONAL DATA – NOT REAL INTELLIGENCE';

const errors: string[] = [];

async function login(page: Page) {
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(`[${test.info().title}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${test.info().title}] pageerror: ${e.message}`));
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL('/');
}

const TITLE = `E2E Threat Assessment ${Date.now()}`;
const MARKDOWN = [
  `# ${TITLE}`,
  '**EXERCISE – FICTIONAL DATA**',
  '',
  'Template: Threat Assessment · Date: 2026-09-17 · Subject: LANTERN',
  '',
  '## Bottom Line Up Front',
  'Ilsa Varro is likely LANTERN. Moderate confidence.',
  '',
  '## Key Judgments',
  '1. **[MODERATE]** Varro is LANTERN. — likely',
  '',
  '## Evidence',
  '- A HUMINT source names a Concord logistics officer. [R-0019]',
  '',
  '## Intelligence Gaps',
  '- No SIGINT on Varro.',
  '',
  '## Assumptions',
  '- None stated.',
  '',
  '## Entities of Interest',
  '- Ilsa Varro (`per_ilsa_varro`)',
  '',
].join('\n');

test.describe.serial('briefs', () => {
  let id = '';

  test('dev seam inserts a brief; the list shows it; the editor opens it', async ({ page }) => {
    await login(page);

    // The seam shares the browser context's session cookie.
    const created = await page.request.post('/api/briefs/manual', {
      data: { title: TITLE, template: 'threat_assessment', markdown: MARKDOWN, citations: ['R-0019'], topic: 'LANTERN' },
    });
    expect(created.status()).toBe(201);
    const body = await created.json() as { id: string; version: number; title: string };
    expect(body.id).toMatch(/^brf_[0-9a-f]{8}$/);
    expect(body.version).toBe(1);
    id = body.id;

    await page.goto('/briefs');
    await expect(page.getByTestId('briefs-page')).toBeVisible();
    await expect(page.getByTestId('exercise-banner')).toHaveCount(2);
    const row = page.getByTestId('brief-row').filter({ hasText: TITLE });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('THREAT');
    await expect(row).toContainText('v1');

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/briefs\\?id=${id}$`));
    const editor = page.getByTestId('brief-editor');
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('brief-title-input')).toHaveValue(TITLE);
    await expect(page.getByTestId('brief-markdown')).toHaveValue(MARKDOWN);
    await expect(page.getByTestId('brief-version')).toHaveText('v1');
    await expect(page.getByTestId('brief-clean')).toBeVisible();
    await expect(page.getByTestId('brief-save')).toBeDisabled();
  });

  test('editing and saving makes version 2; the unsaved indicator tracks the draft', async ({ page }) => {
    await login(page);
    await page.goto(`/briefs?id=${id}`);
    const md = page.getByTestId('brief-markdown');
    await expect(md).toHaveValue(MARKDOWN);
    await md.focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n## Analyst Note\n- Reviewed by the duty analyst. [R-0007]\n');
    await expect(page.getByTestId('brief-dirty')).toBeVisible();
    await expect(page.getByTestId('brief-save')).toBeEnabled();

    await page.getByTestId('brief-save').click();
    await expect(page.getByTestId('brief-version')).toHaveText('v2');
    await expect(page.getByTestId('brief-clean')).toBeVisible();
    await expect(page.getByTestId('brief-row').filter({ hasText: TITLE })).toContainText('v2');

    // The new version is what the API now returns.
    const res = await page.request.get(`/api/briefs/${id}`);
    const b = await res.json() as { version: number; markdown: string };
    expect(b.version).toBe(2);
    expect(b.markdown).toContain('## Analyst Note');
  });

  test('preview renders headings and citation chips; a chip opens the report reader', async ({ page }) => {
    await login(page);
    await page.goto(`/briefs?id=${id}`);
    await expect(page.getByTestId('brief-markdown')).toBeVisible();
    await page.getByTestId('brief-mode-preview').click();
    const preview = page.getByTestId('brief-preview');
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expect(preview.getByRole('heading', { name: 'Bottom Line Up Front' })).toBeVisible();
    await expect(preview.getByRole('heading', { name: 'Analyst Note' })).toBeVisible();
    const chips = preview.getByTestId('brief-citation');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveAttribute('data-citation', 'R-0019');
    await expect(chips.nth(0)).not.toHaveAttribute('data-invalid');
    // [R-0007] was typed by hand in the previous test and is not among the brief's validated citations.
    await expect(chips.nth(1)).toHaveAttribute('data-citation', 'R-0007');
    await expect(chips.nth(1)).toHaveAttribute('data-invalid', 'true');

    await chips.nth(0).click();
    const reader = page.getByTestId('report-reader');
    await expect(reader).toBeVisible();
    await expect(reader).toContainText('R-0019');
    await expect(reader.getByTestId('report-title')).not.toBeEmpty();
    await reader.getByRole('button', { name: 'Close report' }).click();
    await expect(reader).toHaveCount(0);

    // Back to edit keeps the text.
    await page.getByTestId('brief-mode-edit').click();
    await expect(page.getByTestId('brief-markdown')).toHaveValue(/## Analyst Note/);
  });

  test('print export carries the banner top and bottom, the title and the chips; Print opens it', async ({ page, context }) => {
    await login(page);
    const res = await page.request.get(`/api/briefs/${id}/print`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    const html = await res.text();
    expect(html).toContain(`<div class="banner top" role="note">${BANNER}</div>`);
    expect(html).toContain(`<div class="banner bottom" role="note">${BANNER}</div>`);
    expect(html).toContain(`<h1>${TITLE}</h1>`);
    expect(html).toContain('<span class="cite">R-0019</span>');
    // The hand-typed [R-0007] is not a validated citation of this brief: rendered as an invalid chip.
    expect(html).toContain('<span class="cite invalid" title="not among this brief\'s validated citations">R-0007</span>');
    expect(html).toContain('.cite.invalid');
    expect(html).toContain('position: fixed');
    expect(html).toContain('@page');
    expect(html).toContain('data-version="2"');
    expect(html).not.toContain('window.print()},50)'); // no auto-print without ?print=1
    const auto = await page.request.get(`/api/briefs/${id}/print?print=1`);
    expect(await auto.text()).toContain('window.print()},50)');

    // The editor's button opens the auto-print page in a new tab.
    await page.goto(`/briefs?id=${id}`);
    await expect(page.getByTestId('brief-print')).toBeVisible();
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('brief-print').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toContain(`/api/briefs/${id}/print?print=1`);
    await expect(popup.locator('.banner.top')).toHaveText(BANNER);
    await expect(popup.locator('.banner.bottom')).toHaveText(BANNER);
    await expect(popup.locator('main.brief h1')).toHaveText(TITLE);
    await popup.close();

    const missing = await page.request.get('/api/briefs/brf_00000000/print');
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found', id: 'brf_00000000' });
  });

  test('delete removes the brief from the list and the API', async ({ page }) => {
    await login(page);
    await page.goto(`/briefs?id=${id}`);
    await expect(page.getByTestId('brief-editor')).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('brief-delete').click();
    await expect(page).toHaveURL('/briefs');
    await expect(page.getByTestId('brief-editor')).toHaveCount(0);
    await expect(page.getByTestId('brief-row').filter({ hasText: TITLE })).toHaveCount(0);
    const res = await page.request.get(`/api/briefs/${id}`);
    expect(res.status()).toBe(404);
  });

  test('typed 4xx: bad body, unknown id, entity_profile without an entity', async ({ page }) => {
    await login(page);
    const bad = await page.request.post('/api/briefs', { data: { template: 'nope' } });
    expect(bad.status()).toBe(400);
    expect((await bad.json() as { error: string }).error).toBe('invalid_request');
    const noEntity = await page.request.post('/api/briefs', { data: { template: 'entity_profile' } });
    expect(noEntity.status()).toBe(400);
    const unknownEntity = await page.request.post('/api/briefs', { data: { template: 'entity_profile', subject: { entityId: 'ent_nope' } } });
    expect(unknownEntity.status()).toBe(404);
    const patch = await page.request.patch('/api/briefs/brf_00000000', { data: { title: 'x' } });
    expect(patch.status()).toBe(404);
    const emptyPatch = await page.request.patch('/api/briefs/brf_00000000', { data: {} });
    expect(emptyPatch.status()).toBe(400);
  });

  test('a brief with no validated citations shows the amber notice', async ({ page }) => {
    await login(page);
    const created = await page.request.post('/api/briefs/manual', {
      data: { title: `E2E Uncited ${Date.now()}`, template: 'daily_summary', markdown: '# Uncited\n\nNothing retrieved.', citations: [] },
    });
    expect(created.status()).toBe(201);
    const { id: uncited } = await created.json() as { id: string };
    await page.goto(`/briefs?id=${uncited}`);
    await expect(page.getByTestId('brief-editor')).toBeVisible();
    const notice = page.getByRole('status').filter({ hasText: 'No validated citations' });
    await expect(notice).toHaveText('No validated citations — this brief cites no retrieved reports');
    // The cited brief from the first test never showed it.
    expect(await page.request.delete(`/api/briefs/${uncited}`).then((r) => r.status())).toBe(200);
  });

  test.afterAll(() => {
    expect(errors).toEqual([]);
  });
});
