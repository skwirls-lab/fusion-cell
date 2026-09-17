/**
 * Phase 3 gate: every /api endpoint answers 200 against the seeded DB, the
 * body validates against its Zod contract, results are non-empty, the seeded
 * clue chain is reachable, and bad input is a 400 (never a 500). Run against
 * an already-running server: `npx tsx scripts/check-api.ts`.
 */
import './_env.ts';
import type { ZodType } from 'zod';
import { SESSION_COOKIE, sessionTokenFor } from '../src/lib/auth';
import {
  FactionOut, EntityOut, EntityProfileOut, ReportSummaryOut, ReportOut, EventOut, GraphOut, PathOut, SearchOut,
  ApiError,
} from '../src/lib/types';
import { z } from 'zod';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
if (!process.env.APP_PASSWORD) { console.error('FAIL: APP_PASSWORD is not set'); process.exit(1); }
const cookie = `${SESSION_COOKIE}=${await sessionTokenFor(process.env.APP_PASSWORD)}`;

interface Row { endpoint: string; status: number | string; ok: boolean; reason?: string }
const rows: Row[] = [];

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* non-JSON body; reported as-is */ }
  return { status: res.status, body };
}

/** 200 + schema-valid + caller's own assertion. Returns the parsed body or null on failure. */
async function expectOk<T extends ZodType>(path: string, schema: T, check?: (b: z.output<T>) => string | null): Promise<z.output<T> | null> {
  let status: number | string = '-';
  try {
    const r = await get(path);
    status = r.status;
    if (r.status !== 200) throw new Error(`expected 200, got ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const parsed = schema.safeParse(r.body);
    if (!parsed.success) throw new Error(`schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    const reason = check?.(parsed.data) ?? null;
    if (reason) throw new Error(reason);
    rows.push({ endpoint: path, status, ok: true });
    return parsed.data;
  } catch (e) {
    rows.push({ endpoint: path, status, ok: false, reason: (e as Error).message });
    return null;
  }
}

async function expectStatus(path: string, want: number): Promise<void> {
  let status: number | string = '-';
  try {
    const r = await get(path);
    status = r.status;
    if (r.status !== want) throw new Error(`expected ${want}, got ${r.status}`);
    const err = ApiError.safeParse(r.body);
    if (!err.success) throw new Error(`error body is not {error, issues?}: ${JSON.stringify(r.body).slice(0, 200)}`);
    rows.push({ endpoint: path, status, ok: true });
  } catch (e) {
    rows.push({ endpoint: path, status, ok: false, reason: (e as Error).message });
  }
}

const nonEmpty = (n: number, what: string) => (n > 0 ? null : `${what} is empty`);

// ---- positive cases ------------------------------------------------------------

await expectOk('/api/factions', z.object({ factions: z.array(FactionOut) }), (b) => nonEmpty(b.factions.length, 'factions'));
const entities = await expectOk('/api/entities', z.object({ entities: z.array(EntityOut) }), (b) => nonEmpty(b.entities.length, 'entities'));
const firstEntity = entities?.entities[0]?.id;
if (firstEntity) await expectOk(`/api/entities/${encodeURIComponent(firstEntity)}`, EntityProfileOut, (b) => (b.entity.id === firstEntity ? null : 'wrong entity returned'));

const reports = await expectOk('/api/reports', z.object({ reports: z.array(ReportSummaryOut), total: z.number().int() }), (b) => nonEmpty(b.reports.length, 'reports') ?? (b.total >= b.reports.length ? null : 'total < page size'));
const firstReport = reports?.reports[0];
if (firstReport) await expectOk(`/api/reports/${encodeURIComponent(firstReport.reportNumber)}`, ReportOut, (b) => (b.id === firstReport.id ? null : 'wrong report returned'));

await expectOk('/api/events', z.object({ events: z.array(EventOut) }), (b) => nonEmpty(b.events.length, 'events'));
await expectOk('/api/graph', GraphOut, (b) => nonEmpty(b.nodes.length, 'nodes') ?? nonEmpty(b.edges.length, 'edges'));
if (firstEntity) await expectOk(`/api/graph/neighbors?id=${encodeURIComponent(firstEntity)}`, GraphOut, (b) => (b.nodes.some((n) => n.id === firstEntity) ? null : 'root not in nodes'));

// Known seeded entity must be retrievable by search and list.
const varroList = await expectOk('/api/entities?q=Varro', z.object({ entities: z.array(EntityOut) }), (b) =>
  b.entities.some((e) => e.name.includes('Varro')) ? null : 'no entity named *Varro*');
await expectOk('/api/search?q=Varro', SearchOut, (b) => nonEmpty(b.entities.length, 'search.entities'));

// The clue chain: Varro -> ... -> Hegemony within 6 hops, no location intermediates (DECISIONS.md D5).
const varro = varroList?.entities.find((e) => e.name === 'Ilsa Varro');
const hegList = await expectOk('/api/entities?q=Hegemony&type=organization', z.object({ entities: z.array(EntityOut) }), (b) =>
  b.entities.some((e) => e.name.includes('Hegemony')) ? null : 'no organization named *Hegemony*');
const hegemony = hegList?.entities.find((e) => e.name.includes('Hegemony') && e.type === 'organization');
if (varro && hegemony) {
  await expectOk(`/api/graph/path?from=${encodeURIComponent(varro.id)}&to=${encodeURIComponent(hegemony.id)}`, PathOut, (b) => {
    if (!b.found) return 'found=false';
    const hops = Math.min(...b.paths.map((p) => p.hops));
    if (hops > 6) return `shortest path is ${hops} hops (> 6)`;
    if (!b.nodes.length || !b.edges.length) return 'path has no nodes/edges';
    return null;
  });
} else {
  rows.push({ endpoint: '/api/graph/path?from=<Varro>&to=<Hegemony>', status: '-', ok: false, reason: 'could not resolve Ilsa Varro / Hegemony ids' });
}

// ---- negative cases: typed 400/404, never 500 ------------------------------------

await expectStatus('/api/events?bbox=garbage', 400);
await expectStatus('/api/graph/neighbors', 400);
await expectStatus('/api/entities?limit=99999', 400);
await expectStatus('/api/reports?from=yesterday', 400);
await expectStatus('/api/search', 400);
await expectStatus('/api/graph/path?from=x', 400);
await expectStatus('/api/reports/NOPE', 404);
await expectStatus('/api/entities/NOPE', 404);

// ---- report --------------------------------------------------------------------

const w = Math.max(...rows.map((r) => r.endpoint.length));
console.log(`base: ${BASE}\n`);
for (const r of rows) {
  console.log(`${r.endpoint.padEnd(w)}  ${String(r.status).padStart(3)}  ${r.ok ? 'ok' : 'FAIL'}${r.reason ? `  ${r.reason}` : ''}`);
}
const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\nFAIL: ${failed.length}/${rows.length} checks failed`);
  process.exit(1);
}
console.log(`\nall ${rows.length} checks passed\nP3 PASS`);
