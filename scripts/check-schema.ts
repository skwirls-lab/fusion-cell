/** P1.2 gate: migrations applied and every expected table+column exists. */
import './_env.ts';
import { sql } from 'drizzle-orm';
import { createDb } from '../src/lib/db/index';
import { runMigrations } from '../src/lib/db/migrate';

const EXPECT: Record<string, string[]> = {
  factions: ['id', 'name', 'color', 'description'],
  entities: ['id', 'type', 'name', 'aliases', 'faction_id', 'description', 'attributes', 'confidence', 'lon', 'lat', 'location_kind', 'created_at', 'updated_at'],
  relationships: ['id', 'source_entity_id', 'target_entity_id', 'type', 'start_at', 'end_at', 'confidence', 'attributes'],
  reports: ['id', 'report_number', 'type', 'title', 'body', 'source_reliability', 'info_credibility', 'reported_at', 'event_at', 'marking', 'search_vector', 'created_at'],
  events: ['id', 'type', 'title', 'description', 'lon', 'lat', 'occurred_at', 'confidence', 'faction_id'],
  report_links: ['report_id', 'object_type', 'object_id', 'excerpt'],
  event_entities: ['event_id', 'entity_id', 'role'],
  ingest_jobs: ['id', 'raw_text', 'report_type', 'status', 'extraction', 'report_id', 'created_at'],
};

const h = await createDb();
console.log(`driver: ${h.driver}`);
const ran = await runMigrations(h);
if (ran.length) console.log(`applied: ${ran.join(', ')}`);

const rows = (await h.db.execute<{ table_name: string; column_name: string }>(sql`
  select table_name, column_name from information_schema.columns
  where table_schema = 'public'`)).rows;
const have = new Map<string, Set<string>>();
for (const r of rows) { if (!have.has(r.table_name)) have.set(r.table_name, new Set()); have.get(r.table_name)!.add(r.column_name); }

const missing: string[] = [];
for (const [t, cols] of Object.entries(EXPECT)) {
  if (!have.has(t)) { missing.push(`table ${t}`); continue; }
  for (const c of cols) if (!have.get(t)!.has(c)) missing.push(`${t}.${c}`);
}

// The FTS generated column must actually be a tsvector, not silently text.
const fts = (await h.db.execute<{ ok: boolean }>(sql`
  select (select data_type from information_schema.columns
          where table_name='reports' and column_name='search_vector') = 'tsvector' as ok`)).rows[0]?.ok;
if (!fts) missing.push('reports.search_vector is not tsvector');

await h.close();
if (missing.length) { console.error('FAIL\n' + missing.map((m) => `  - ${m}`).join('\n')); process.exit(1); }
console.log(`all ${Object.keys(EXPECT).length} tables present with expected columns\nP1.2 PASS`);
