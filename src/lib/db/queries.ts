/**
 * The only place SQL lives. Plain async functions over a `Db`, returning
 * objects shaped exactly to the Zod contract in src/lib/types.ts. No Next
 * request objects here: route handlers and AI tools call these verbatim.
 *
 * Provenance fan-out (entityIds / reportIds) is always one grouped query per
 * result set, never per row.
 */
import { and, or, eq, ilike, inArray, desc, asc, gte, lte, count, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from './index';
import {
  factions, entities, relationships, reports, events, reportLinks, eventEntities,
  type Faction as FactionRow, type Entity as EntityRow, type Relationship as RelationshipRow,
  type Report as ReportRow, type Event as EventRow,
} from './schema';
import { buildAdjacency, neighborhood, shortestPaths, type GraphEdge } from '../graph';
import type {
  Entity, Relationship, ReportSummary, Report, Event, EntityProfile, Faction, Graph, PathResult, SearchResult,
  EntityListQuery, ReportListQuery, EventListQuery, NeighborsQuery, PathQuery, SearchQuery,
} from '../types';

const SNIPPET_LEN = 200;

// ---- serializers -------------------------------------------------------------

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function serializeFaction(row: FactionRow): Faction {
  return { id: row.id, name: row.name, color: row.color, description: row.description };
}

export function serializeEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    aliases: row.aliases,
    factionId: row.factionId,
    description: row.description,
    attributes: row.attributes,
    confidence: row.confidence,
    lon: row.lon,
    lat: row.lat,
    locationKind: row.locationKind,
  };
}

export function serializeRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    type: row.type,
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    confidence: row.confidence,
    attributes: row.attributes,
  };
}

export function serializeReportSummary(row: ReportRow, entityIds: string[]): ReportSummary {
  return {
    id: row.id,
    reportNumber: row.reportNumber,
    type: row.type,
    title: row.title,
    sourceReliability: row.sourceReliability,
    infoCredibility: row.infoCredibility,
    reportedAt: row.reportedAt.toISOString(),
    eventAt: iso(row.eventAt),
    marking: row.marking,
    snippet: row.body.slice(0, SNIPPET_LEN),
    entityIds,
  };
}

export function serializeEvent(row: EventRow, entityIds: string[], reportIds: string[]): Event {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    lon: row.lon,
    lat: row.lat,
    occurredAt: row.occurredAt.toISOString(),
    confidence: row.confidence,
    factionId: row.factionId,
    entityIds,
    reportIds,
  };
}

// ---- helpers -----------------------------------------------------------------

/** `%q%` with LIKE metacharacters escaped so a literal `_` or `%` in a search term matches itself. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

const ftsMatch = (q: string): SQL => sql`${reports.searchVector} @@ plainto_tsquery('english', ${q})`;
const ftsRank = (q: string): SQL => sql`ts_rank(${reports.searchVector}, plainto_tsquery('english', ${q}))`;
// The same parsed query with every AND turned into OR. plainto_tsquery emits only lexemes joined by
// ' & ' (no operators survive from user text), so the text rewrite cannot change its meaning otherwise.
const anyTsQuery = (q: string): SQL => sql`replace(plainto_tsquery('english', ${q})::text, ' & ', ' | ')::tsquery`;
const ftsMatchAny = (q: string): SQL => sql`${reports.searchVector} @@ ${anyTsQuery(q)}`;
const ftsRankAny = (q: string): SQL => sql`ts_rank(${reports.searchVector}, ${anyTsQuery(q)})`;

/** name / any alias / description ILIKE q. */
function entityTextMatch(q: string): SQL {
  const p = likePattern(q);
  return or(
    ilike(entities.name, p),
    sql`array_to_string(${entities.aliases}, ' ') ilike ${p}`,
    ilike(entities.description, p),
  )!;
}

function groupBy<T>(rows: T[], key: (r: T) => string, val: (r: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(val(r));
  }
  return m;
}

/** objectId -> reportIds for one object type. */
async function reportIdsFor(db: Db, objectType: 'entity' | 'relationship' | 'event', objectIds: string[]) {
  if (!objectIds.length) return new Map<string, string[]>();
  const rows = await db
    .select({ objectId: reportLinks.objectId, reportId: reportLinks.reportId })
    .from(reportLinks)
    .where(and(eq(reportLinks.objectType, objectType), inArray(reportLinks.objectId, objectIds)))
    .orderBy(asc(reportLinks.reportId));
  return groupBy(rows, (r) => r.objectId, (r) => r.reportId);
}

/** reportId -> entityIds linked to that report. */
async function entityIdsForReports(db: Db, reportIds: string[]) {
  if (!reportIds.length) return new Map<string, string[]>();
  const rows = await db
    .select({ reportId: reportLinks.reportId, objectId: reportLinks.objectId })
    .from(reportLinks)
    .where(and(eq(reportLinks.objectType, 'entity'), inArray(reportLinks.reportId, reportIds)))
    .orderBy(asc(reportLinks.objectId));
  return groupBy(rows, (r) => r.reportId, (r) => r.objectId);
}

/** eventId -> entityIds. */
async function entityIdsForEvents(db: Db, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, string[]>();
  const rows = await db
    .select({ eventId: eventEntities.eventId, entityId: eventEntities.entityId })
    .from(eventEntities)
    .where(inArray(eventEntities.eventId, eventIds))
    .orderBy(asc(eventEntities.entityId));
  return groupBy(rows, (r) => r.eventId, (r) => r.entityId);
}

async function hydrateEvents(db: Db, rows: EventRow[]): Promise<Event[]> {
  const ids = rows.map((r) => r.id);
  const [ents, reps] = await Promise.all([entityIdsForEvents(db, ids), reportIdsFor(db, 'event', ids)]);
  return rows.map((r) => serializeEvent(r, ents.get(r.id) ?? [], reps.get(r.id) ?? []));
}

async function hydrateReportSummaries(db: Db, rows: ReportRow[]): Promise<ReportSummary[]> {
  const ents = await entityIdsForReports(db, rows.map((r) => r.id));
  return rows.map((r) => serializeReportSummary(r, ents.get(r.id) ?? []));
}

async function entitiesByIds(db: Db, ids: string[]): Promise<Entity[]> {
  if (!ids.length) return [];
  const rows = await db.select().from(entities).where(inArray(entities.id, ids)).orderBy(asc(entities.name));
  return rows.map(serializeEntity);
}

async function relationshipsByIds(db: Db, ids: string[]): Promise<RelationshipRow[]> {
  if (!ids.length) return [];
  return db.select().from(relationships).where(inArray(relationships.id, ids)).orderBy(asc(relationships.id));
}

// ---- factions ----------------------------------------------------------------

export async function listFactions(db: Db): Promise<Faction[]> {
  const rows = await db.select().from(factions).orderBy(asc(factions.name));
  return rows.map(serializeFaction);
}

// ---- entities ----------------------------------------------------------------

export async function listEntities(db: Db, q: z.infer<typeof EntityListQuery>): Promise<Entity[]> {
  const where: SQL[] = [];
  if (q.q) where.push(entityTextMatch(q.q));
  if (q.type?.length) where.push(inArray(entities.type, q.type));
  if (q.faction?.length) where.push(inArray(entities.factionId, q.faction));
  const rows = await db
    .select()
    .from(entities)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(entities.name))
    .limit(q.limit);
  return rows.map(serializeEntity);
}

export async function getEntityProfile(db: Db, id: string): Promise<EntityProfile | null> {
  const [row] = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
  if (!row) return null;

  const [factionRows, relRows, eventRows, reportRows] = await Promise.all([
    row.factionId
      ? db.select().from(factions).where(eq(factions.id, row.factionId)).limit(1)
      : Promise.resolve([] as FactionRow[]),
    db
      .select()
      .from(relationships)
      .where(or(eq(relationships.sourceEntityId, id), eq(relationships.targetEntityId, id)))
      .orderBy(asc(relationships.id)),
    db
      .select({ ev: events })
      .from(eventEntities)
      .innerJoin(events, eq(events.id, eventEntities.eventId))
      .where(eq(eventEntities.entityId, id))
      .orderBy(desc(events.occurredAt)),
    db
      .select({ rep: reports })
      .from(reportLinks)
      .innerJoin(reports, eq(reports.id, reportLinks.reportId))
      .where(and(eq(reportLinks.objectType, 'entity'), eq(reportLinks.objectId, id)))
      .orderBy(desc(reports.reportedAt)),
  ]);

  const otherIds = relRows.map((r) => (r.sourceEntityId === id ? r.targetEntityId : r.sourceEntityId));
  const [relReports, others, evs, reps] = await Promise.all([
    reportIdsFor(db, 'relationship', relRows.map((r) => r.id)),
    otherIds.length
      ? db
          .select({ id: entities.id, name: entities.name, type: entities.type, factionId: entities.factionId })
          .from(entities)
          .where(inArray(entities.id, otherIds))
      : Promise.resolve([]),
    hydrateEvents(db, eventRows.map((r) => r.ev)),
    hydrateReportSummaries(db, reportRows.map((r) => r.rep)),
  ]);
  const otherById = new Map(others.map((o) => [o.id, o]));

  const connections: EntityProfile['connections'] = [];
  for (const r of relRows) {
    const direction = r.sourceEntityId === id ? 'out' : 'in';
    const other = otherById.get(direction === 'out' ? r.targetEntityId : r.sourceEntityId);
    if (!other) continue; // FK guarantees this, but never emit a half-built connection
    connections.push({ ...serializeRelationship(r), other, direction, reportIds: relReports.get(r.id) ?? [] });
  }

  return {
    entity: serializeEntity(row),
    faction: factionRows[0] ? serializeFaction(factionRows[0]) : null,
    connections,
    events: evs,
    reports: reps,
  };
}

// ---- reports -----------------------------------------------------------------

/**
 * `match: 'any'` relaxes the full-text condition from "every term" to "at least one term", ranked so
 * that reports matching more terms come first. The HTTP API never uses it (a search box that ORs is
 * noise); the analyst's search tool does, as a backfill, because a model's natural query ("Doss
 * Renley") returns nothing when the reports only ever say "Cmdr Renley".
 */
export async function listReports(
  db: Db,
  q: z.infer<typeof ReportListQuery>,
  opts: { match?: 'all' | 'any' } = {},
): Promise<{ reports: ReportSummary[]; total: number }> {
  const any = opts.match === 'any';
  const rank = any ? ftsRankAny : ftsRank;
  const where: SQL[] = [];
  if (q.q) where.push(any ? ftsMatchAny(q.q) : ftsMatch(q.q));
  if (q.type?.length) where.push(inArray(reports.type, q.type));
  if (q.entity) {
    where.push(
      inArray(
        reports.id,
        db
          .select({ id: reportLinks.reportId })
          .from(reportLinks)
          .where(and(eq(reportLinks.objectType, 'entity'), eq(reportLinks.objectId, q.entity))),
      ),
    );
  }
  if (q.from) where.push(gte(reports.reportedAt, new Date(q.from)));
  if (q.to) where.push(lte(reports.reportedAt, new Date(q.to)));
  const cond = where.length ? and(...where) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(reports)
      .where(cond)
      .orderBy(...(q.q ? [desc(rank(q.q)), desc(reports.reportedAt), desc(reports.reportNumber)] : [desc(reports.reportedAt), desc(reports.reportNumber)]))
      .limit(q.limit)
      .offset(q.offset),
    db.select({ total: count() }).from(reports).where(cond),
  ]);
  return { reports: await hydrateReportSummaries(db, rows), total };
}

export async function getReport(db: Db, idOrNumber: string): Promise<Report | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(or(eq(reports.id, idOrNumber), eq(reports.reportNumber, idOrNumber)))
    .limit(1);
  if (!row) return null;

  const links = await db
    .select()
    .from(reportLinks)
    .where(eq(reportLinks.reportId, row.id))
    .orderBy(asc(reportLinks.objectType), asc(reportLinks.objectId));
  const entityIds = links.filter((l) => l.objectType === 'entity').map((l) => l.objectId);
  const eventIds = links.filter((l) => l.objectType === 'event').map((l) => l.objectId);
  const [entNames, evNames] = await Promise.all([
    entityIds.length
      ? db.select({ id: entities.id, name: entities.name }).from(entities).where(inArray(entities.id, entityIds))
      : Promise.resolve([]),
    eventIds.length
      ? db.select({ id: events.id, name: events.title }).from(events).where(inArray(events.id, eventIds))
      : Promise.resolve([]),
  ]);
  const names = new Map([...entNames, ...evNames].map((n) => [n.id, n.name]));

  const { snippet: _snippet, ...summary } = serializeReportSummary(row, entityIds);
  return {
    ...summary,
    body: row.body,
    links: links.map((l) => ({
      objectType: l.objectType,
      objectId: l.objectId,
      excerpt: l.excerpt,
      name: l.objectType === 'relationship' ? null : (names.get(l.objectId) ?? null),
    })),
  };
}

// ---- events ------------------------------------------------------------------

export async function listEvents(db: Db, q: z.infer<typeof EventListQuery>): Promise<Event[]> {
  const where: SQL[] = [];
  if (q.bbox) {
    const [minLon, minLat, maxLon, maxLat] = q.bbox.split(',').map(Number);
    where.push(gte(events.lon, minLon), lte(events.lon, maxLon), gte(events.lat, minLat), lte(events.lat, maxLat));
  }
  if (q.from) where.push(gte(events.occurredAt, new Date(q.from)));
  if (q.to) where.push(lte(events.occurredAt, new Date(q.to)));
  if (q.type?.length) where.push(inArray(events.type, q.type));
  if (q.faction?.length) where.push(inArray(events.factionId, q.faction));
  if (q.minConfidence !== undefined) where.push(gte(events.confidence, q.minConfidence));
  const rows = await db
    .select()
    .from(events)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(events.occurredAt))
    .limit(q.limit);
  return hydrateEvents(db, rows);
}

// ---- graph -------------------------------------------------------------------

export async function loadGraphEdges(db: Db): Promise<GraphEdge[]> {
  const rows = await db
    .select({
      id: relationships.id,
      source: relationships.sourceEntityId,
      target: relationships.targetEntityId,
      type: relationships.type,
      confidence: relationships.confidence,
    })
    .from(relationships);
  return rows;
}

/** Everything, for the initial link-chart render. ~150 nodes / ~400 edges. */
export async function loadGraph(db: Db): Promise<Graph> {
  const [nodes, edges] = await Promise.all([
    db.select().from(entities).orderBy(asc(entities.name)),
    db.select().from(relationships).orderBy(asc(relationships.id)),
  ]);
  return { nodes: nodes.map(serializeEntity), edges: edges.map(serializeRelationship) };
}

export async function getNeighbors(db: Db, q: z.infer<typeof NeighborsQuery>): Promise<Graph> {
  const adj = buildAdjacency(await loadGraphEdges(db));
  const nh = neighborhood(adj, q.id, q.depth, q.relTypes);
  const [nodes, edges] = await Promise.all([entitiesByIds(db, nh.nodeIds), relationshipsByIds(db, nh.edgeIds)]);
  return { nodes, edges: edges.map(serializeRelationship) };
}

export async function findPaths(db: Db, q: z.infer<typeof PathQuery>): Promise<PathResult> {
  const adj = buildAdjacency(await loadGraphEdges(db));
  // Locations are hubs (everyone is located_at Kestrel); passing through them
  // makes every pair 2 hops apart and hides the evidence chain. Endpoints may
  // still be locations.
  const locationIds = new Set((await db.select({ id: entities.id }).from(entities).where(eq(entities.type, 'location'))).map((r) => r.id));
  const paths = shortestPaths(adj, q.from, q.to, q.maxHops, 5, { excludeIntermediate: locationIds });
  const nodeIds = [...new Set(paths.flatMap((p) => p.nodeIds))];
  const edgeIds = [...new Set(paths.flatMap((p) => p.edgeIds))];
  const [nodes, edgeRows, provenance] = await Promise.all([
    entitiesByIds(db, nodeIds),
    relationshipsByIds(db, edgeIds),
    reportIdsFor(db, 'relationship', edgeIds),
  ]);
  return {
    found: paths.length > 0,
    paths,
    nodes,
    edges: edgeRows.map((e) => ({ ...serializeRelationship(e), reportIds: provenance.get(e.id) ?? [] })),
  };
}

// ---- search ------------------------------------------------------------------

export async function search(db: Db, q: z.infer<typeof SearchQuery>): Promise<SearchResult> {
  const p = likePattern(q.q);
  const [ents, reps] = await Promise.all([
    db
      .select({ id: entities.id, name: entities.name, type: entities.type, factionId: entities.factionId })
      .from(entities)
      .where(or(ilike(entities.name, p), sql`array_to_string(${entities.aliases}, ' ') ilike ${p}`))
      .orderBy(asc(entities.name))
      .limit(q.limit),
    db
      .select({
        id: reports.id,
        reportNumber: reports.reportNumber,
        type: reports.type,
        title: reports.title,
        reportedAt: reports.reportedAt,
      })
      .from(reports)
      .where(ftsMatch(q.q))
      .orderBy(desc(ftsRank(q.q)), desc(reports.reportedAt))
      .limit(q.limit),
  ]);
  return {
    entities: ents,
    reports: reps.map((r) => ({ ...r, reportedAt: r.reportedAt.toISOString() })),
  };
}

// ---- AI analyst helpers ------------------------------------------------------
// Appended for the Phase 5 tools. Same style as above: one grouped query per
// result set, results shaped to the contract types.

export type EntityHead = Pick<Entity, 'id' | 'name' | 'type' | 'factionId'>;

/** Compact id/name/type lookup used to label graph results for the model. */
export async function entityHeadsByIds(db: Db, ids: string[]): Promise<EntityHead[]> {
  if (!ids.length) return [];
  return db
    .select({ id: entities.id, name: entities.name, type: entities.type, factionId: entities.factionId })
    .from(entities)
    .where(inArray(entities.id, ids))
    .orderBy(asc(entities.name));
}

/** Every event any of `entityIds` took part in, oldest first, with provenance. */
export async function getTimeline(db: Db, entityIds: string[]): Promise<Event[]> {
  if (!entityIds.length) return [];
  const rows = await db
    .selectDistinctOn([events.occurredAt, events.id], { ev: events })
    .from(eventEntities)
    .innerJoin(events, eq(events.id, eventEntities.eventId))
    .where(inArray(eventEntities.entityId, entityIds))
    .orderBy(asc(events.occurredAt), asc(events.id));
  return hydrateEvents(db, rows.map((r) => r.ev));
}

/** Which of `numbers` are real report numbers. One query; used by citation validation. */
export async function existingReportNumbers(db: Db, numbers: string[]): Promise<Set<string>> {
  if (!numbers.length) return new Set();
  const rows = await db
    .select({ reportNumber: reports.reportNumber })
    .from(reports)
    .where(inArray(reports.reportNumber, numbers));
  return new Set(rows.map((r) => r.reportNumber));
}

// ---- briefs ------------------------------------------------------------------
// Appended for Phase 6 (P6.5). Ids are brf_<8 hex>; every write bumps updated_at
// and every content edit bumps version, so the list can show "v3 · 2 min ago".

import { randomBytes } from 'node:crypto';
import { briefs, type Brief as BriefRow } from './schema';

export interface BriefSummary {
  id: string;
  title: string;
  template: BriefRow['template'];
  version: number;
  subjectEntityId: string | null;
  topic: string;
  citations: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BriefFull extends BriefSummary {
  content: unknown;
  markdown: string;
}

export function serializeBriefSummary(row: BriefRow): BriefSummary {
  return {
    id: row.id, title: row.title, template: row.template, version: row.version,
    subjectEntityId: row.subjectEntityId, topic: row.topic, citations: row.citations,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeBrief(row: BriefRow): BriefFull {
  return { ...serializeBriefSummary(row), content: row.content, markdown: row.markdown };
}

export const newBriefId = (): string => `brf_${randomBytes(4).toString('hex')}`;

export interface CreateBriefInput {
  title: string;
  template: BriefRow['template'];
  content: unknown;
  markdown: string;
  subjectEntityId?: string | null;
  topic?: string;
  citations?: string[];
}

export async function createBrief(db: Db, input: CreateBriefInput): Promise<BriefFull> {
  const [row] = await db
    .insert(briefs)
    .values({
      id: newBriefId(),
      title: input.title,
      template: input.template,
      content: input.content,
      markdown: input.markdown,
      subjectEntityId: input.subjectEntityId ?? null,
      topic: input.topic ?? '',
      citations: input.citations ?? [],
    })
    .returning();
  return serializeBrief(row);
}

export async function getBrief(db: Db, id: string): Promise<BriefFull | null> {
  const row = await db.query.briefs.findFirst({ where: eq(briefs.id, id) });
  return row ? serializeBrief(row) : null;
}

export async function listBriefs(db: Db, limit = 200): Promise<BriefSummary[]> {
  const rows = await db.select().from(briefs).orderBy(desc(briefs.updatedAt), desc(briefs.id)).limit(limit);
  return rows.map(serializeBriefSummary);
}

/** Title and/or markdown; each save is a new version. Null when the id is unknown. */
export async function updateBrief(db: Db, id: string, patch: { title?: string; markdown?: string }): Promise<BriefFull | null> {
  const [row] = await db
    .update(briefs)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.markdown !== undefined ? { markdown: patch.markdown } : {}),
      version: sql`${briefs.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(briefs.id, id))
    .returning();
  return row ? serializeBrief(row) : null;
}

export async function deleteBrief(db: Db, id: string): Promise<boolean> {
  const rows = await db.delete(briefs).where(eq(briefs.id, id)).returning({ id: briefs.id });
  return rows.length > 0;
}

// ---- admin (Phase 6a) ------------------------------------------------------------
// Appended for the /admin page: one round trip for every table's row count.

export interface AdminStatsRow {
  counts: Record<'factions' | 'entities' | 'relationships' | 'reports' | 'events' | 'report_links' | 'event_entities' | 'ingest_jobs' | 'briefs', number>;
  newestReportAt: string | null;
  ingestByStatus: Record<string, number>;
}

export async function adminStats(db: Db): Promise<AdminStatsRow> {
  const [countRows, [newest], statusRows] = await Promise.all([
    db.execute<{ t: keyof AdminStatsRow['counts']; n: number }>(sql`
      select 'factions' t, count(*)::int n from factions union all
      select 'entities', count(*)::int from entities union all
      select 'relationships', count(*)::int from relationships union all
      select 'reports', count(*)::int from reports union all
      select 'events', count(*)::int from events union all
      select 'report_links', count(*)::int from report_links union all
      select 'event_entities', count(*)::int from event_entities union all
      select 'ingest_jobs', count(*)::int from ingest_jobs union all
      select 'briefs', count(*)::int from briefs`).then((r) => r.rows),
    db.select({ at: sql<Date | null>`max(${reports.reportedAt})` }).from(reports),
    db.execute<{ status: string; n: number }>(sql`select status, count(*)::int n from ingest_jobs group by status`).then((r) => r.rows),
  ]);
  const counts = { factions: 0, entities: 0, relationships: 0, reports: 0, events: 0, report_links: 0, event_entities: 0, ingest_jobs: 0, briefs: 0 };
  for (const r of countRows) counts[r.t] = r.n;
  const at = newest?.at;
  return {
    counts,
    newestReportAt: at ? new Date(at).toISOString() : null,
    ingestByStatus: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
  };
}
