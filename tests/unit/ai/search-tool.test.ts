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
