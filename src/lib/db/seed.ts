/**
 * Load data/seed/*.json into a database handle. Wipe-and-load inside one
 * transaction, so a reseed is atomic and repeatable. Shared by
 * scripts/seed-db.ts and the AI agent tests (which need the real clue chain,
 * not a miniature fixture).
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { schema, type DbHandle } from './index';

export interface SeedCounts {
  entities: number;
  relationships: number;
  reports: number;
  events: number;
  report_links: number;
  event_entities: number;
}

const dt = (s: string | null | undefined) => (s ? new Date(s) : null);

export async function loadSeed(h: DbHandle, dir = path.resolve('data/seed')): Promise<SeedCounts> {
  const load = <T,>(name: string): T[] => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));

  const factions = load<typeof schema.factions.$inferInsert>('factions');
  const entities = load<Record<string, unknown>>('entities');
  const relationships = load<Record<string, unknown>>('relationships');
  const reports = load<Record<string, unknown>>('reports');
  const events = load<Record<string, unknown>>('events');
  const reportLinks = load<typeof schema.reportLinks.$inferInsert>('report_links');
  const eventEntities = load<typeof schema.eventEntities.$inferInsert>('event_entities');

  await h.db.transaction(async (tx) => {
    await tx.execute(sql`truncate event_entities, report_links, events, reports, relationships, entities, factions, ingest_jobs, briefs cascade`);
    const chunk = async <T,>(table: Parameters<typeof tx.insert>[0], rows: T[], size = 150) => {
      for (let i = 0; i < rows.length; i += size) await tx.insert(table).values(rows.slice(i, i + size) as never);
    };
    await chunk(schema.factions, factions);
    await chunk(schema.entities, entities.map((e) => ({ ...e, attributes: e.attributes ?? {} })) as typeof schema.entities.$inferInsert[]);
    await chunk(schema.relationships, relationships.map((r) => ({ ...r, startAt: dt(r.startAt as string), endAt: dt(r.endAt as string) })) as typeof schema.relationships.$inferInsert[]);
    await chunk(schema.reports, reports.map((r) => ({ ...r, reportedAt: dt(r.reportedAt as string)!, eventAt: dt(r.eventAt as string) })) as typeof schema.reports.$inferInsert[]);
    await chunk(schema.events, events.map((e) => ({ ...e, occurredAt: dt(e.occurredAt as string)! })) as typeof schema.events.$inferInsert[]);
    await chunk(schema.reportLinks, reportLinks);
    await chunk(schema.eventEntities, eventEntities);
  });

  const rows = (await h.db.execute<{ t: keyof SeedCounts; n: number }>(sql`
    select 'entities' t, count(*)::int n from entities union all
    select 'relationships', count(*)::int from relationships union all
    select 'reports', count(*)::int from reports union all
    select 'events', count(*)::int from events union all
    select 'report_links', count(*)::int from report_links union all
    select 'event_entities', count(*)::int from event_entities`)).rows;
  return Object.fromEntries(rows.map((c) => [c.t, c.n])) as unknown as SeedCounts;
}
