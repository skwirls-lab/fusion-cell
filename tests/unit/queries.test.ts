import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb, type DbHandle } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';
import { factions, entities, relationships, reports, events, reportLinks, eventEntities } from '@/lib/db/schema';
import {
  listFactions, listEntities, getEntityProfile, listReports, getReport, listEvents,
  loadGraph, getNeighbors, findPaths, search,
} from '@/lib/db/queries';
import {
  FactionOut, EntityOut, EntityProfileOut, ReportSummaryOut, ReportOut, EventOut, GraphOut, PathOut, SearchOut,
  EntityListQuery, ReportListQuery, EventListQuery, NeighborsQuery, PathQuery, SearchQuery,
} from '@/lib/types';

// Miniature clue chain: a -> b -> c -> d, a location, and a vessel parked there.
const T = (s: string) => new Date(s);
let h: DbHandle;

beforeAll(async () => {
  h = await createDb({ driver: 'pglite', pgliteDir: 'memory' });
  await runMigrations(h);
  const { db } = h;

  await db.insert(factions).values([
    { id: 'f_cartel', name: 'Ashen Cartel', color: '#c44' },
    { id: 'f_heg', name: 'Hegemony', color: '#48c' },
  ]);
  await db.insert(entities).values([
    { id: 'ent_a', type: 'person', name: 'Ilsa Varro', aliases: ['Lantern Lady', 'I. Varro'], factionId: null, description: 'Broker.' },
    { id: 'ent_b', type: 'person', name: 'Tomas Brightwater', aliases: [], factionId: 'f_cartel', description: 'Courier.' },
    { id: 'ent_c', type: 'organization', name: 'Ashen Cartel', aliases: ['the Ash'], factionId: 'f_cartel' },
    { id: 'ent_d', type: 'organization', name: 'Hegemony Directorate', aliases: [], factionId: 'f_heg' },
    { id: 'ent_loc', type: 'location', name: 'Kestrel Station', aliases: [], lon: 10, lat: 20, locationKind: 'station' },
    { id: 'ent_v', type: 'vessel', name: 'MV Ember', aliases: [], factionId: 'f_cartel' },
  ]);
  await db.insert(relationships).values([
    { id: 'rel_ab', sourceEntityId: 'ent_a', targetEntityId: 'ent_b', type: 'pays', startAt: T('2026-01-01T00:00:00Z') },
    { id: 'rel_bc', sourceEntityId: 'ent_b', targetEntityId: 'ent_c', type: 'member_of' },
    { id: 'rel_cd', sourceEntityId: 'ent_c', targetEntityId: 'ent_d', type: 'communicates_with' },
    { id: 'rel_aloc', sourceEntityId: 'ent_a', targetEntityId: 'ent_loc', type: 'travels_to' },
    { id: 'rel_vloc', sourceEntityId: 'ent_v', targetEntityId: 'ent_loc', type: 'located_at' },
  ]);
  await db.insert(reports).values([
    { id: 'R-0001', reportNumber: 'R-0001', type: 'HUMINT', title: 'Broker payment', body: 'Varro paid Brightwater for the LANTERN shipment manifest.', sourceReliability: 'B', infoCredibility: 2, reportedAt: T('2026-03-01T00:00:00Z') },
    { id: 'R-0002', reportNumber: 'R-0002', type: 'SIGINT', title: 'Courier intercept', body: 'Brightwater confirmed cartel membership on an open channel.', sourceReliability: 'A', infoCredibility: 1, reportedAt: T('2026-03-02T00:00:00Z') },
    { id: 'R-0003', reportNumber: 'R-0003', type: 'OSINT', title: 'Directorate contact', body: 'Cartel envoys were seen meeting Directorate staff at Kestrel.', sourceReliability: 'C', infoCredibility: 3, reportedAt: T('2026-03-03T00:00:00Z'), eventAt: T('2026-02-28T12:00:00Z') },
  ]);
  await db.insert(reportLinks).values([
    { reportId: 'R-0001', objectType: 'entity', objectId: 'ent_a' },
    { reportId: 'R-0001', objectType: 'entity', objectId: 'ent_b' },
    { reportId: 'R-0001', objectType: 'relationship', objectId: 'rel_ab', excerpt: 'paid Brightwater' },
    { reportId: 'R-0002', objectType: 'entity', objectId: 'ent_b' },
    { reportId: 'R-0002', objectType: 'relationship', objectId: 'rel_bc' },
    { reportId: 'R-0003', objectType: 'entity', objectId: 'ent_c' },
    { reportId: 'R-0003', objectType: 'relationship', objectId: 'rel_cd' },
    { reportId: 'R-0003', objectType: 'event', objectId: 'evt_1' },
  ]);
  await db.insert(events).values([
    { id: 'evt_1', type: 'meeting', title: 'Kestrel meeting', lon: 10, lat: 20, occurredAt: T('2026-02-28T12:00:00Z'), factionId: 'f_cartel' },
    { id: 'evt_2', type: 'movement', title: 'Far transit', lon: 100, lat: 50, occurredAt: T('2026-02-20T12:00:00Z') },
  ]);
  await db.insert(eventEntities).values([
    { eventId: 'evt_1', entityId: 'ent_c' },
    { eventId: 'evt_1', entityId: 'ent_a', role: 'observer' },
    { eventId: 'evt_2', entityId: 'ent_v' },
  ]);
});

afterAll(async () => { await h.close(); });

describe('factions + entities', () => {
  it('listFactions matches the contract', async () => {
    const out = await listFactions(h.db);
    expect(out.map((f) => FactionOut.parse(f))).toHaveLength(2);
  });

  it('listEntities finds by alias, name, and filters', async () => {
    const byAlias = await listEntities(h.db, EntityListQuery.parse({ q: 'lantern lady' }));
    expect(byAlias.map((e) => EntityOut.parse(e).id)).toEqual(['ent_a']);

    const byName = await listEntities(h.db, EntityListQuery.parse({ q: 'varro' }));
    expect(byName.map((e) => e.id)).toEqual(['ent_a']);

    const orgs = await listEntities(h.db, EntityListQuery.parse({ type: 'organization', faction: 'f_cartel' }));
    expect(orgs.map((e) => e.id)).toEqual(['ent_c']);

    const all = await listEntities(h.db, EntityListQuery.parse({}));
    expect(all).toHaveLength(6);
    for (const e of all) EntityOut.parse(e);
  });

  it('getEntityProfile has directed connections with provenance, events and reports', async () => {
    const p = await getEntityProfile(h.db, 'ent_b');
    expect(p).not.toBeNull();
    EntityProfileOut.parse(p);
    expect(p!.faction?.id).toBe('f_cartel');

    const inbound = p!.connections.find((c) => c.id === 'rel_ab')!;
    expect(inbound.direction).toBe('in');
    expect(inbound.other.id).toBe('ent_a');
    expect(inbound.other.name).toBe('Ilsa Varro');
    expect(inbound.reportIds).toEqual(['R-0001']);
    expect(inbound.startAt).toBe('2026-01-01T00:00:00.000Z');

    const outbound = p!.connections.find((c) => c.id === 'rel_bc')!;
    expect(outbound.direction).toBe('out');
    expect(outbound.other.id).toBe('ent_c');
    expect(outbound.reportIds).toEqual(['R-0002']);

    // newest first, snippet from body, entityIds of every linked entity
    expect(p!.reports.map((r) => r.id)).toEqual(['R-0002', 'R-0001']);
    expect(p!.reports[1].snippet.startsWith('Varro paid')).toBe(true);
    expect(p!.reports[1].entityIds).toEqual(['ent_a', 'ent_b']);

    const a = await getEntityProfile(h.db, 'ent_a');
    EntityProfileOut.parse(a);
    expect(a!.faction).toBeNull();
    expect(a!.events.map((e) => e.id)).toEqual(['evt_1']);
    expect(a!.events[0].entityIds).toEqual(['ent_a', 'ent_c']);
    expect(a!.events[0].reportIds).toEqual(['R-0003']);

    expect(await getEntityProfile(h.db, 'nope')).toBeNull();
  });
});

describe('reports', () => {
  it('listReports FTS finds the report with the word and not the ones without', async () => {
    const hit = await listReports(h.db, ReportListQuery.parse({ q: 'lantern' }));
    expect(hit.total).toBe(1);
    expect(hit.reports.map((r) => ReportSummaryOut.parse(r).id)).toEqual(['R-0001']);
    expect(hit.reports[0].entityIds).toEqual(['ent_a', 'ent_b']);

    const miss = await listReports(h.db, ReportListQuery.parse({ q: 'zeppelin' }));
    expect(miss.total).toBe(0);
    expect(miss.reports).toEqual([]);
  });

  it('listReports orders newest first, filters, and paginates', async () => {
    const all = await listReports(h.db, ReportListQuery.parse({}));
    expect(all.total).toBe(3);
    expect(all.reports.map((r) => r.id)).toEqual(['R-0003', 'R-0002', 'R-0001']);

    const byEntity = await listReports(h.db, ReportListQuery.parse({ entity: 'ent_b' }));
    expect(byEntity.reports.map((r) => r.id)).toEqual(['R-0002', 'R-0001']);

    const byType = await listReports(h.db, ReportListQuery.parse({ type: 'SIGINT,OSINT' }));
    expect(byType.reports.map((r) => r.id)).toEqual(['R-0003', 'R-0002']);

    const window = await listReports(h.db, ReportListQuery.parse({ from: '2026-03-02T00:00:00Z', to: '2026-03-02T23:59:59Z' }));
    expect(window.reports.map((r) => r.id)).toEqual(['R-0002']);

    const page = await listReports(h.db, ReportListQuery.parse({ limit: '1', offset: '1' }));
    expect(page.total).toBe(3);
    expect(page.reports.map((r) => r.id)).toEqual(['R-0002']);
  });

  it('getReport accepts id or report_number and names its links', async () => {
    const byNumber = await getReport(h.db, 'R-0003');
    expect(byNumber).not.toBeNull();
    ReportOut.parse(byNumber);
    expect(byNumber!.body).toContain('Directorate');
    expect(byNumber!.eventAt).toBe('2026-02-28T12:00:00.000Z');
    expect(byNumber!.entityIds).toEqual(['ent_c']);
    expect(byNumber!.links).toEqual([
      { objectType: 'entity', objectId: 'ent_c', excerpt: '', name: 'Ashen Cartel' },
      { objectType: 'event', objectId: 'evt_1', excerpt: '', name: 'Kestrel meeting' },
      { objectType: 'relationship', objectId: 'rel_cd', excerpt: '', name: null },
    ]);

    const byId = await getReport(h.db, 'R-0001');
    expect(byId!.id).toBe('R-0001');
    expect(await getReport(h.db, 'NOPE')).toBeNull();
  });
});

describe('events', () => {
  it('listEvents bbox excludes the out-of-box event and hydrates links', async () => {
    const all = await listEvents(h.db, EventListQuery.parse({}));
    expect(all.map((e) => EventOut.parse(e).id)).toEqual(['evt_1', 'evt_2']);

    const boxed = await listEvents(h.db, EventListQuery.parse({ bbox: '0,0,50,30' }));
    expect(boxed.map((e) => e.id)).toEqual(['evt_1']);
    expect(boxed[0].entityIds).toEqual(['ent_a', 'ent_c']);
    expect(boxed[0].reportIds).toEqual(['R-0003']);

    const byType = await listEvents(h.db, EventListQuery.parse({ type: 'movement' }));
    expect(byType.map((e) => e.id)).toEqual(['evt_2']);
    expect(byType[0].entityIds).toEqual(['ent_v']);
    expect(byType[0].reportIds).toEqual([]);

    const after = await listEvents(h.db, EventListQuery.parse({ from: '2026-02-25T00:00:00Z' }));
    expect(after.map((e) => e.id)).toEqual(['evt_1']);
  });
});

describe('graph', () => {
  it('loadGraph returns every node and edge', async () => {
    const g = GraphOut.parse(await loadGraph(h.db));
    expect(g.nodes).toHaveLength(6);
    expect(g.edges).toHaveLength(5);
  });

  it('getNeighbors walks depth and honours relTypes', async () => {
    const d1 = GraphOut.parse(await getNeighbors(h.db, NeighborsQuery.parse({ id: 'ent_a' })));
    expect(new Set(d1.nodes.map((n) => n.id))).toEqual(new Set(['ent_a', 'ent_b', 'ent_loc']));
    expect(new Set(d1.edges.map((e) => e.id))).toEqual(new Set(['rel_ab', 'rel_aloc']));

    const d2 = await getNeighbors(h.db, NeighborsQuery.parse({ id: 'ent_a', depth: '2', relTypes: 'pays,member_of' }));
    expect(new Set(d2.nodes.map((n) => n.id))).toEqual(new Set(['ent_a', 'ent_b', 'ent_c']));
  });

  it('findPaths a->d returns the 3-hop chain with nodes and edge provenance', async () => {
    const r = PathOut.parse(await findPaths(h.db, PathQuery.parse({ from: 'ent_a', to: 'ent_d' })));
    expect(r.found).toBe(true);
    expect(r.paths).toHaveLength(1);
    expect(r.paths[0]).toEqual({ nodeIds: ['ent_a', 'ent_b', 'ent_c', 'ent_d'], edgeIds: ['rel_ab', 'rel_bc', 'rel_cd'], hops: 3 });
    expect(new Set(r.nodes.map((n) => n.id))).toEqual(new Set(['ent_a', 'ent_b', 'ent_c', 'ent_d']));
    expect(r.edges.map((e) => [e.id, e.reportIds])).toEqual([
      ['rel_ab', ['R-0001']], ['rel_bc', ['R-0002']], ['rel_cd', ['R-0003']],
    ]);

    const tooShort = PathOut.parse(await findPaths(h.db, PathQuery.parse({ from: 'ent_a', to: 'ent_d', maxHops: '2' })));
    expect(tooShort).toEqual({ found: false, paths: [], nodes: [], edges: [] });
  });
});

describe('search', () => {
  it('returns both entities and reports for a shared term', async () => {
    const r = SearchOut.parse(await search(h.db, SearchQuery.parse({ q: 'Varro' })));
    expect(r.entities.map((e) => e.id)).toEqual(['ent_a']);
    expect(r.reports.map((x) => x.id)).toEqual(['R-0001']);

    const byAlias = await search(h.db, SearchQuery.parse({ q: 'the ash' }));
    expect(byAlias.entities.map((e) => e.id)).toEqual(['ent_c']);
  });
});
