/**
 * P2 gate. Verifies, by querying the database, that the seed is the dataset
 * the story bible promises — most importantly that the LANTERN clue chain is
 * present, findable, and not drowned. Phase 5 cannot succeed if this fails.
 */
import './_env.ts';
import { sql } from 'drizzle-orm';
import { createDb } from '../src/lib/db/index';
import { buildAdjacency, shortestPaths, type GraphEdge } from '../src/lib/graph/index';
import { FORBIDDEN_IN_NOISE, canonReports } from './seed/canon';

const REQUIRED: Record<string, string[]> = {
  'R-0019': ['LANTERN', 'movement tables'],
  'R-0042': ['LANTERN', 'Convoy Seven'],
  'R-0023': ['Brightwater Hauling', 'Tallow & Wick'],
  'R-0031': ['Brightwater Hauling', 'Ansel Varro'],
  'R-0038': ['Halloway & Sons', 'Tallow & Wick'],
  'R-0007': ['Cinder Moth', 'transponder'],
  'R-0064': ['Cinder Moth', 'transponder', '48'],
  'R-0047': ['Lindqvist', 'Lieutenant Commander', 'logistics'],
  'R-0053': ['Renley', 'Halloway'],
  'R-0071': ['Tessaly Gate', 'raider'],
  'R-0077': ['Tessaly Gate', 'Ironvale'],
  'R-0060': ['Brightwater'],
  'R-0011': ['Varro', 'Kestrel'],
  'R-0049': ['Renley', 'Kestrel'],
  'R-0068': ['Convoy 7', 'Tessaly Gate'],
  'R-0003': ['Varro', 'Ansel Varro'],
};

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg); };

const h = await createDb();
const q = <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => h.db.execute<T>(s).then((r) => r.rows);
console.log(`driver: ${h.driver}\n`);

// Counts
const c = (await q<{ t: string; n: number }>(sql`
  select 'entities' t, count(*)::int n from entities union all
  select 'relationships', count(*)::int from relationships union all
  select 'reports', count(*)::int from reports union all
  select 'events', count(*)::int from events`)).reduce((m, r) => ({ ...m, [r.t]: r.n }), {} as Record<string, number>);
check(c.entities >= 150, `entities ≥150 (${c.entities})`);
check(c.relationships >= 400, `relationships ≥400 (${c.relationships})`);
check(c.reports >= 80, `reports ≥80 (${c.reports})`);
check(c.events >= 120, `events ≥120 (${c.events})`);

// Clue reports present with required keywords
const bodies = new Map((await q<{ id: string; body: string; title: string }>(sql`select id, body, title from reports`)).map((r) => [r.id, `${r.title}\n${r.body}`]));
for (const [id, words] of Object.entries(REQUIRED)) {
  const text = bodies.get(id);
  check(!!text, `clue report ${id} exists`);
  // Case-insensitive on purpose: report bodies capitalise names (I. VARRO), and
  // the FTS the analyst uses is case-insensitive too.
  if (text) for (const w of words) check(text.toLowerCase().includes(w.toLowerCase()), `${id} contains "${w}"`);
}

// LANTERN is findable and not drowned: exactly the two SIGINT reports.
const lantern = (await q<{ report_number: string }>(sql`select report_number from reports where search_vector @@ plainto_tsquery('english', 'LANTERN') order by 1`)).map((r) => r.report_number);
check(lantern.length === 2 && lantern[0] === 'R-0019' && lantern[1] === 'R-0042', `FTS "LANTERN" returns exactly R-0019, R-0042 (got ${lantern.join(', ') || 'none'})`);

// Forbidden words never leak into noise
const canonIds = new Set(canonReports.map((r) => r.id));
let leaks = 0;
for (const [id, text] of bodies) {
  if (canonIds.has(id)) continue;
  const lower = text.toLowerCase();
  for (const w of FORBIDDEN_IN_NOISE) if (lower.includes(w.toLowerCase())) { leaks++; console.log(`      leak: ${id} contains "${w}"`); }
}
check(leaks === 0, `no forbidden words in noise reports (${leaks} leaks)`);

// Marking on every report
const unmarked = (await q<{ n: number }>(sql`select count(*)::int n from reports where marking <> 'EXERCISE – FICTIONAL DATA'`))[0].n;
check(unmarked === 0, `every report carries the exercise marking (${unmarked} without)`);

// The evidence path Varro → Hegemony exists, excluding location hubs as intermediates.
const locIds = new Set((await q<{ id: string }>(sql`select id from entities where type = 'location'`)).map((r) => r.id));
const edges: GraphEdge[] = (await q<{ id: string; s: string; t: string; type: string; confidence: number }>(sql`select id, source_entity_id s, target_entity_id t, type, confidence from relationships`))
  .filter((e) => !locIds.has(e.s) && !locIds.has(e.t))
  .map((e) => ({ id: e.id, source: e.s, target: e.t, type: e.type, confidence: e.confidence }));
const adj = buildAdjacency(edges);
const paths = shortestPaths(adj, 'per_ilsa_varro', 'org_vantor_hegemony', 6);
check(paths.length > 0, `path Ilsa Varro → Vantor Hegemony within 6 hops, no location intermediates (${paths[0] ? paths[0].hops + ' hops: ' + paths[0].nodeIds.join(' → ') : 'none'})`);
const viaMoney = paths.some((p) => p.nodeIds.includes('org_brightwater') && p.nodeIds.includes('org_ashen_cartel'));
check(viaMoney, `a shortest path passes through Brightwater Hauling and the Ashen Cartel`);

// Red herrings are real: each has ≥2 supporting reports.
for (const [id, name] of [['per_doss_renley', 'Doss Renley'], ['org_halloway', 'Halloway & Sons']]) {
  const n = (await q<{ n: number }>(sql`select count(distinct report_id)::int n from report_links where object_type = 'entity' and object_id = ${id}`))[0].n;
  check(n >= 2, `red herring ${name} has ≥2 supporting reports (${n})`);
}

// Provenance integrity
const relNoLink = (await q<{ n: number }>(sql`select count(*)::int n from relationships r where not exists (select 1 from report_links l where l.object_type = 'relationship' and l.object_id = r.id)`))[0].n;
check(relNoLink === 0, `every relationship has ≥1 source report (${relNoLink} without)`);
const evNoLink = (await q<{ n: number }>(sql`select count(*)::int n from events e where not exists (select 1 from report_links l where l.object_type = 'event' and l.object_id = e.id)`))[0].n;
check(evNoLink === 0, `every event has ≥1 source report (${evNoLink} without)`);
const evNoEnt = (await q<{ n: number }>(sql`select count(*)::int n from events e where not exists (select 1 from event_entities x where x.event_id = e.id)`))[0].n;
check(evNoEnt === 0, `every event has ≥1 participant (${evNoEnt} without)`);
const dangling = (await q<{ n: number }>(sql`
  select count(*)::int n from report_links l where
    (l.object_type = 'entity' and not exists (select 1 from entities e where e.id = l.object_id)) or
    (l.object_type = 'relationship' and not exists (select 1 from relationships r where r.id = l.object_id)) or
    (l.object_type = 'event' and not exists (select 1 from events e where e.id = l.object_id))`))[0].n;
check(dangling === 0, `no dangling report_links (${dangling})`);

// Geography: every location inside the bounding box; every event has coordinates inside it.
const outOfBox = (await q<{ n: number }>(sql`select count(*)::int n from entities where type = 'location' and (lon < -30 or lon > 30 or lat < -20 or lat > 20 or lon is null)`))[0].n;
check(outOfBox === 0, `all locations inside the bounding box (${outOfBox} outside)`);

await h.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nP2 PASS');
process.exit(fails.length ? 1 : 0);
