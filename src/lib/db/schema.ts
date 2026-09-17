/**
 * Fusion Cell data model. Domain-neutral: nothing here knows about the
 * fictional universe. Every analytic object carries provenance (report_links),
 * confidence, and timestamps.
 *
 * IDs are human-readable text slugs (ent_varro, R-0007, evt_0012) rather than
 * UUIDs. At this scale it costs nothing and it makes seed data, logs, and AI
 * citations legible to a person reading them.
 */
import {
  pgTable, text, real, integer, jsonb, timestamp, primaryKey, index, customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const ENTITY_TYPES = ['person', 'organization', 'vessel', 'location', 'account', 'equipment', 'other'] as const;
export const LOCATION_KINDS = ['system', 'station', 'gate', 'moon', 'city', 'facility', 'lane'] as const;
export const RELATIONSHIP_TYPES = ['member_of', 'communicates_with', 'pays', 'owns', 'commands', 'located_at', 'travels_to', 'meets_with', 'associated_with'] as const;
export const REPORT_TYPES = ['SIGINT', 'HUMINT', 'IMINT', 'OSINT', 'FINANCIAL', 'TRACKING'] as const;
export const EVENT_TYPES = ['movement', 'meeting', 'transaction', 'communication', 'sighting', 'incident'] as const;
export const INGEST_STATUSES = ['pending', 'reviewed', 'committed', 'discarded'] as const;

export const factions = pgTable('factions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  description: text('description').notNull().default(''),
});

export const entities = pgTable('entities', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ENTITY_TYPES }).notNull(),
  name: text('name').notNull(),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
  factionId: text('faction_id').references(() => factions.id),
  description: text('description').notNull().default(''),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
  confidence: real('confidence').notNull().default(0.5),
  // Only meaningful for type='location'; folded in rather than a separate
  // table because location lookup is the hottest join in the app.
  lon: real('lon'),
  lat: real('lat'),
  locationKind: text('location_kind', { enum: LOCATION_KINDS }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('entities_faction_idx').on(t.factionId),
  index('entities_type_idx').on(t.type),
]);

export const relationships = pgTable('relationships', {
  id: text('id').primaryKey(),
  sourceEntityId: text('source_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  targetEntityId: text('target_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  type: text('type', { enum: RELATIONSHIP_TYPES }).notNull(),
  startAt: timestamp('start_at', { withTimezone: true }),
  endAt: timestamp('end_at', { withTimezone: true }),
  confidence: real('confidence').notNull().default(0.5),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [
  index('relationships_source_idx').on(t.sourceEntityId),
  index('relationships_target_idx').on(t.targetEntityId),
]);

export const reports = pgTable('reports', {
  id: text('id').primaryKey(), // same as report_number, e.g. R-0042
  reportNumber: text('report_number').notNull().unique(),
  type: text('type', { enum: REPORT_TYPES }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  sourceReliability: text('source_reliability').notNull(), // Admiralty A-F
  infoCredibility: integer('info_credibility').notNull(),  // Admiralty 1-6
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull(),
  eventAt: timestamp('event_at', { withTimezone: true }),
  marking: text('marking').notNull().default('EXERCISE – FICTIONAL DATA'),
  // Generated in SQL (see migration); Drizzle only needs to know it exists.
  searchVector: tsvector('search_vector'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('reports_reported_at_idx').on(t.reportedAt),
  index('reports_type_idx').on(t.type),
]);

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  type: text('type', { enum: EVENT_TYPES }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  lon: real('lon').notNull(),
  lat: real('lat').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  confidence: real('confidence').notNull().default(0.5),
  factionId: text('faction_id').references(() => factions.id),
}, (t) => [
  index('events_occurred_at_idx').on(t.occurredAt),
  index('events_type_idx').on(t.type),
]);

/** Provenance join: which report supports which entity / relationship / event. */
export const reportLinks = pgTable('report_links', {
  reportId: text('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  objectType: text('object_type', { enum: ['entity', 'relationship', 'event'] }).notNull(),
  objectId: text('object_id').notNull(),
  excerpt: text('excerpt').notNull().default(''),
}, (t) => [
  primaryKey({ columns: [t.reportId, t.objectType, t.objectId] }),
  index('report_links_object_idx').on(t.objectType, t.objectId),
]);

export const eventEntities = pgTable('event_entities', {
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  entityId: text('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('participant'),
}, (t) => [
  primaryKey({ columns: [t.eventId, t.entityId] }),
  index('event_entities_entity_idx').on(t.entityId),
]);

export const ingestJobs = pgTable('ingest_jobs', {
  id: text('id').primaryKey(),
  rawText: text('raw_text').notNull(),
  reportType: text('report_type', { enum: REPORT_TYPES }).notNull(),
  status: text('status', { enum: INGEST_STATUSES }).notNull().default('pending'),
  extraction: jsonb('extraction').$type<unknown>(),
  reportId: text('report_id').references(() => reports.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Faction = typeof factions.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type Relationship = typeof relationships.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Event = typeof events.$inferSelect;
export type ReportLink = typeof reportLinks.$inferSelect;
export type EventEntity = typeof eventEntities.$inferSelect;
export type IngestJob = typeof ingestJobs.$inferSelect;
