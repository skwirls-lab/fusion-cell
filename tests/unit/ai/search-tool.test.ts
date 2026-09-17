/**
 * search_reports over the real seed: strict (every term) results first, then an
 * any-term backfill. Found with the real model: it searched "Doss Renley", the
 * reports only ever say "Cmdr Renley", and the ANDed query returned nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb, type DbHandle } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';
import { loadSeed } from '@/lib/db/seed';
import { searchReports } from '@/lib/ai/tools';
import { focusedSnippet } from '@/lib/db/queries';

let h: DbHandle;
beforeAll(async () => {
  h = await createDb({ driver: 'pglite', pgliteDir: 'memory' });
  await runMigrations(h);
  await loadSeed(h);
});
afterAll(async () => { await h.close(); });

type Row = { report_number: string; match: 'all_terms' | 'some_terms' };
async function search(query: string, limit = 10) {
  const ctx = { seenReportNumbers: new Set<string>() };
  const out = await searchReports.run(h.db, searchReports.schema.parse({ query, limit }), ctx) as { total_all_terms: number; reports: Row[] };
  return { ...out, seen: ctx.seenReportNumbers };
}

describe('search_reports', () => {
  it('snippets are the passages that matched, not the report header', async () => {
    const ctx = { seenReportNumbers: new Set<string>() };
    const out = await searchReports.run(h.db, searchReports.schema.parse({ query: 'Renley' }), ctx) as { reports: Array<{ report_number: string; snippet: string }> };
    const circular = out.reports.find((r) => r.report_number === 'R-0049')!;
    expect(circular.snippet).toMatch(/RENLEY/);
    expect(circular.snippet).toMatch(/salvage tender negotiation/); // the exculpatory line, which the first 300 characters cut off
    expect(circular.snippet.length).toBeLessThanOrEqual(360);
  });

  it('reports already returned in the conversation come back as stubs, and an all-stale search says so', async () => {
    const ctx = { seenReportNumbers: new Set<string>() };
    const args = searchReports.schema.parse({ query: 'LANTERN' });
    const first = await searchReports.run(h.db, args, ctx) as { new_reports: number; note?: string; reports: Array<Record<string, unknown>> };
    expect(first.new_reports).toBe(2);
    expect(first.note).toBeUndefined();
    expect(first.reports[0]).toHaveProperty('snippet');
    const again = await searchReports.run(h.db, searchReports.schema.parse({ query: 'LANTERN movement' }), ctx) as typeof first;
    const stale = again.reports.filter((r) => r.already_returned);
    expect(stale.map((r) => r.report_number)).toEqual(expect.arrayContaining(['R-0019']));
    for (const r of stale) expect(r).not.toHaveProperty('snippet');
    const third = await searchReports.run(h.db, args, ctx) as typeof first;
    expect(third.new_reports).toBe(0);
    expect(third.note).toMatch(/already returned/);
  });

  it('a single term is unchanged: LANTERN returns exactly the two SIGINT clue reports', async () => {
    const out = await search('LANTERN');
    expect(out.reports.map((r) => r.report_number).sort()).toEqual(['R-0019', 'R-0042']);
    expect(out.reports.every((r) => r.match === 'all_terms')).toBe(true);
    expect(out.total_all_terms).toBe(2);
  });

  it('a name the reports never spell out in full still surfaces them, marked as partial matches', async () => {
    const out = await search('Doss Renley');
    expect(out.total_all_terms).toBe(0);
    const numbers = out.reports.map((r) => r.report_number);
    expect(numbers).toEqual(expect.arrayContaining(['R-0049', 'R-0053']));
    expect(out.reports.every((r) => r.match === 'some_terms')).toBe(true);
    for (const n of numbers) expect(out.seen.has(n)).toBe(true); // partial matches are citable too
  });

  it('strict matches come first, the backfill never duplicates them, and the limit holds', async () => {
    const out = await search('Brightwater transponder', 6);
    expect(out.reports.length).toBeLessThanOrEqual(6);
    const numbers = out.reports.map((r) => r.report_number);
    expect(new Set(numbers).size).toBe(numbers.length);
    const firstPartial = out.reports.findIndex((r) => r.match === 'some_terms');
    if (firstPartial >= 0) expect(out.reports.slice(firstPartial).every((r) => r.match === 'some_terms')).toBe(true);
    expect(out.reports[0].match).toBe('all_terms');
  });
});

describe('focusedSnippet', () => {
  const body = 'HEADER LINE. DTG 170900Z.\nFirst passage about cargo.\nCmdr D. RENLEY travelled to Kestrel.\nPurpose: salvage tender.\nUnrelated closing line.';
  it('keeps matching passages in document order and matches by word prefix', () => {
    expect(focusedSnippet(body, 'renley kestrel', 200)).toBe('Cmdr D. RENLEY travelled to Kestrel.');
    expect(focusedSnippet(body, 'cargoes purposes', 200)).toBe('First passage about cargo. … Purpose: salvage tender.');
  });
  it('falls back to the start of the body when nothing matches, and never exceeds the cap', () => {
    expect(focusedSnippet(body, 'zzz', 11)).toBe('HEADER LINE');
    expect(focusedSnippet(body, 'renley', 10).length).toBeLessThanOrEqual(10);
    const long = `${'x '.repeat(300)}the RENLEY passage ${'y '.repeat(300)}`;
    const windowed = focusedSnippet(long, 'renley', 80);
    expect(windowed).toContain('RENLEY');
    expect(windowed.length).toBeLessThanOrEqual(80);
  });
});
