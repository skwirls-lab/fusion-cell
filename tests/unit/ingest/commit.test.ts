import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb, schema, type DbHandle } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';
import { loadSeed } from '@/lib/db/seed';
import { listReports, getReport, getEntityProfile, listEvents } from '@/lib/db/queries';
import { createIngestJob, getIngestJob, updateIngestJob } from '@/lib/ingest/jobs';
import { matchEntities } from '@/lib/ingest/match';
import { commitIngest, CommitError, nextReportNumber } from '@/lib/ingest/commit';
import type { Extraction, JobExtraction } from '@/lib/ingest/types';

const RAW = 'FIELD REPORT. VHS Nightglass, a Hegemony corvette not previously catalogued, was observed holding station at Tessaly Gate at 2026-08-22 06:30Z. Lt Cmdr Ilsa Varro was named in the escort manifest as the releasing officer. Nightglass exchanged burst traffic with an unidentified station.';

const extraction: Extraction = {
  title: 'Nightglass at Tessaly Gate',
  summary: 'A new Hegemony corvette, VHS Nightglass, held station at Tessaly Gate; Ilsa Varro released the escort manifest.',
  event_at: '2026-08-22T06:30:00Z',
  source_reliability: 'B',
  info_credibility: 2,
  entities: [
    { name: 'Ilsa Varro', type: 'person', aliases: ['Lt Cmdr Varro'], description: 'Releasing officer', confidence: 0.9 },
    { name: 'VHS Nightglass', type: 'vessel', aliases: ['Nightglass'], description: 'Hegemony corvette, not previously catalogued', confidence: 0.7 },
    { name: 'Tessaly Gate', type: 'location', aliases: [], description: 'Jump gate', confidence: 0.95 },
    { name: 'unidentified station', type: 'location', aliases: [], description: '', confidence: 0.3 },
  ],
  relationships: [
    { source_name: 'Nightglass', target_name: 'Tessaly Gate', type: 'located_at', confidence: 0.8, evidence: 'observed holding station at Tessaly Gate' },
    { source_name: 'VHS Nightglass', target_name: 'unidentified station', type: 'communicates_with', confidence: 0.5, evidence: 'exchanged burst traffic with an unidentified station' },
  ],
  events: [
    { title: 'Nightglass holds station at Tessaly Gate', type: 'sighting', occurred_at: '2026-08-22T06:30:00Z', location_name: 'Tessaly Gate', participant_names: ['VHS Nightglass', 'Ilsa Varro'], description: 'Corvette observed holding station', confidence: 0.85 },
    { title: 'Burst traffic with unknown station', type: 'communication', occurred_at: null, location_name: 'unidentified station', participant_names: ['Nightglass'], description: '', confidence: 0.4 },
  ],
};

let h: DbHandle;

beforeAll(async () => {
  h = await createDb({ driver: 'pglite', pgliteDir: 'memory' });
  await runMigrations(h);
  const counts = await loadSeed(h);
  expect(counts.reports).toBe(80);
});

afterAll(async () => { await h.close(); });

async function makeReviewedJob() {
  const job = await createIngestJob(h.db, { rawText: RAW, reportType: 'HUMINT' });
  const matches = await matchEntities(h.db, extraction.entities);
  const stored: JobExtraction = { extraction, matches, model: 'scripted', source: 'model' };
  await updateIngestJob(h.db, job.id, { status: 'reviewed', extraction: stored });
  return { job, matches };
}

describe('commitIngest (real seed, in-memory PGlite)', () => {
  it('allocates R-0081 on the pristine seed', async () => {
    await h.db.transaction(async (tx) => { expect(await nextReportNumber(tx)).toBe('R-0081'); });
  });

  it('links Varro, creates a vessel, one relationship, one event at Tessaly Gate — all provenance present', async () => {
    const { job, matches } = await makeReviewedJob();
    expect(matches.map((m) => m.suggested)).toEqual(['link', 'create', 'link', 'discard']);

    const result = await commitIngest(h.db, job.id, {
      entities: [
        { index: 0, action: 'link', entityId: 'per_ilsa_varro' },
        { index: 1, action: 'create' },
        { index: 2, action: 'link', entityId: 'loc_tessaly_gate' },
        { index: 3, action: 'discard' },
      ],
      relationships: [{ index: 0, action: 'create' }, { index: 1, action: 'create' }],
      events: [{ index: 0, action: 'create' }, { index: 1, action: 'create' }],
    });

    expect(result.reportNumber).toBe('R-0081');
    expect(result.linked.map((l) => l.id).sort()).toEqual(['loc_tessaly_gate', 'per_ilsa_varro']);
    expect(result.created.entities).toHaveLength(1);
    const vessel = result.created.entities[0];
    expect(vessel.id).toMatch(/^ent_vhs_nightglass_[0-9a-f]{4}$/);
    expect(result.created.relationships).toHaveLength(1);
    // The discarded "unidentified station" takes its relationship down with it, with a reason. The second
    // event loses its named place too, but falls back to where its participant (Nightglass) is now
    // located_at — the relationship created a few lines earlier in this same transaction.
    expect(result.created.events).toHaveLength(2);
    expect(result.skipped).toEqual([expect.stringMatching(/relationship VHS Nightglass → unidentified station .*neither linked nor created/)]);
    const [fallbackEv] = await h.db.select().from(schema.events).where(eq(schema.events.id, result.created.events[1]));
    expect(fallbackEv).toMatchObject({ title: 'Burst traffic with unknown station', lon: 6, lat: -2 });
    expect(fallbackEv.occurredAt.toISOString()).toBe('2026-08-22T06:30:00.000Z'); // occurred_at null → the report's event_at

    // Report row: type from the job, body = raw text, grading from the extraction, default marking.
    const report = await getReport(h.db, 'R-0081');
    expect(report).not.toBeNull();
    expect(report).toMatchObject({ type: 'HUMINT', title: extraction.title, body: RAW, sourceReliability: 'B', infoCredibility: 2, marking: 'EXERCISE – FICTIONAL DATA', eventAt: '2026-08-22T06:30:00.000Z' });
    expect(report!.entityIds.sort()).toEqual([vessel.id, 'loc_tessaly_gate', 'per_ilsa_varro'].sort());
    const byType = (t: string) => report!.links.filter((l) => l.objectType === t);
    expect(byType('entity')).toHaveLength(3);
    expect(byType('relationship').map((l) => l.objectId)).toEqual(result.created.relationships);
    expect(byType('relationship')[0].excerpt).toBe('observed holding station at Tessaly Gate');
    expect(byType('event').map((l) => l.objectId).sort()).toEqual([...result.created.events].sort());
    expect(byType('entity').find((l) => l.objectId === vessel.id)?.excerpt).toBe('observed holding station at Tessaly Gate');

    // Entity row.
    const [row] = await h.db.select().from(schema.entities).where(eq(schema.entities.id, vessel.id));
    expect(row).toMatchObject({ name: 'VHS Nightglass', type: 'vessel', aliases: ['Nightglass'], confidence: 0.7, attributes: { ingested: true, source_report: 'R-0081' } });

    // Relationship row, with the evidence in attributes.
    const [rel] = await h.db.select().from(schema.relationships).where(eq(schema.relationships.id, result.created.relationships[0]));
    expect(rel).toMatchObject({ sourceEntityId: vessel.id, targetEntityId: 'loc_tessaly_gate', type: 'located_at', confidence: 0.8, attributes: { ingested: true, evidence: 'observed holding station at Tessaly Gate' } });

    // Event row at Tessaly Gate's coordinates (seed: lon 6, lat -2), participants + the gate as location.
    const evId = result.created.events[0];
    const [ev] = await h.db.select().from(schema.events).where(eq(schema.events.id, evId));
    expect(ev).toMatchObject({ type: 'sighting', lon: 6, lat: -2, confidence: 0.85, factionId: 'kestrel' });
    expect(ev.occurredAt.toISOString()).toBe('2026-08-22T06:30:00.000Z');
    const ee = await h.db.select().from(schema.eventEntities).where(eq(schema.eventEntities.eventId, evId));
    expect(ee.map((e) => `${e.entityId}:${e.role}`).sort()).toEqual([`${vessel.id}:participant`, 'loc_tessaly_gate:location', 'per_ilsa_varro:participant'].sort());

    // Visible through the read API the views use: the event lists, the profile shows the report, FTS finds it.
    const evs = await listEvents(h.db, { limit: 500 });
    expect(evs.find((e) => e.id === evId)).toMatchObject({ entityIds: expect.arrayContaining([vessel.id, 'per_ilsa_varro']), reportIds: ['R-0081'] });
    const profile = await getEntityProfile(h.db, vessel.id);
    expect(profile!.reports.map((r) => r.reportNumber)).toEqual(['R-0081']);
    expect(profile!.connections.map((c) => c.other.id)).toEqual(['loc_tessaly_gate']);
    expect(profile!.connections[0].reportIds).toEqual(['R-0081']);
    const fts = await listReports(h.db, { q: 'Nightglass', limit: 10, offset: 0 });
    expect(fts.reports.map((r) => r.reportNumber)).toContain('R-0081');
    const newest = await listReports(h.db, { limit: 1, offset: 0 });
    expect(newest.reports[0].reportNumber).toBe('R-0081'); // reported_at = now → top of the feed

    // Job flipped.
    const after = await getIngestJob(h.db, job.id);
    expect(after).toMatchObject({ status: 'committed', reportId: 'R-0081' });

    // A second commit of the same job is refused, and nothing was written twice.
    const again = await commitIngest(h.db, job.id, { entities: [], relationships: [], events: [] }).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(CommitError);
    expect((again as CommitError).code).toBe('already_committed');
    const [{ n }] = (await h.db.execute<{ n: number }>(sql`select count(*)::int n from reports`)).rows;
    expect(n).toBe(81);
  });

  it('is one transaction: a bad link id rolls everything back, including the report number', async () => {
    const { job } = await makeReviewedJob();
    const err = await commitIngest(h.db, job.id, {
      entities: [{ index: 1, action: 'create' }, { index: 0, action: 'link', entityId: 'per_does_not_exist' }],
      relationships: [], events: [],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommitError);
    expect((err as CommitError).code).toBe('bad_decision');
    const [{ n }] = (await h.db.execute<{ n: number }>(sql`select count(*)::int n from reports`)).rows;
    expect(n).toBe(81); // still only the first commit's report
    expect(await h.db.select().from(schema.entities).where(eq(schema.entities.name, 'VHS Nightglass'))).toHaveLength(1);
    expect((await getIngestJob(h.db, job.id))?.status).toBe('reviewed');
    // The next commit takes R-0082, not R-0083: the failed one consumed nothing.
    await h.db.transaction(async (tx) => { expect(await nextReportNumber(tx)).toBe('R-0082'); });
  });

  it('falls back to a participant\'s located_at place when the event names no location', async () => {
    const job = await createIngestJob(h.db, { rawText: RAW, reportType: 'SIGINT' });
    const x: Extraction = {
      ...extraction,
      entities: [extraction.entities[0]],
      relationships: [],
      events: [{ title: 'Varro call intercept', type: 'communication', occurred_at: null, location_name: null, participant_names: ['Ilsa Varro'], description: '', confidence: 0.6 }],
    };
    await updateIngestJob(h.db, job.id, { status: 'reviewed', extraction: { extraction: x, matches: [] } satisfies JobExtraction });
    const r = await commitIngest(h.db, job.id, { entities: [{ index: 0, action: 'link', entityId: 'per_ilsa_varro' }], relationships: [], events: [{ index: 0, action: 'create' }] });
    expect(r.reportNumber).toBe('R-0082');
    expect(r.created.events).toHaveLength(1);
    const [ev] = await h.db.select().from(schema.events).where(eq(schema.events.id, r.created.events[0]));
    // Wherever the seed says Varro is located_at, that is where the event lands; it inherits the extraction's event_at.
    const [home] = await h.db
      .select({ lon: schema.entities.lon, lat: schema.entities.lat })
      .from(schema.relationships)
      .innerJoin(schema.entities, eq(schema.entities.id, schema.relationships.targetEntityId))
      .where(sql`${schema.relationships.sourceEntityId} = 'per_ilsa_varro' and ${schema.relationships.type} = 'located_at' and ${schema.entities.lon} is not null`)
      .limit(1);
    expect(home.lon).not.toBeNull();
    expect(ev).toMatchObject({ lon: home.lon, lat: home.lat });
    expect(ev.occurredAt.toISOString()).toBe('2026-08-22T06:30:00.000Z');
  });

  it('refuses unknown, discarded and extraction-less jobs with typed codes', async () => {
    expect(((await commitIngest(h.db, 'job_nope', { entities: [], relationships: [], events: [] }).catch((e: unknown) => e)) as CommitError).code).toBe('not_found');
    const pending = await createIngestJob(h.db, { rawText: RAW, reportType: 'OSINT' });
    expect(((await commitIngest(h.db, pending.id, { entities: [], relationships: [], events: [] }).catch((e: unknown) => e)) as CommitError).code).toBe('no_extraction');
    await updateIngestJob(h.db, pending.id, { status: 'discarded' });
    expect(((await commitIngest(h.db, pending.id, { entities: [], relationships: [], events: [] }).catch((e: unknown) => e)) as CommitError).code).toBe('discarded');
  });
});
