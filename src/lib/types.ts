/**
 * The API contract. Every route validates its input against these and every
 * response is shaped by them; check-api.ts validates live responses against
 * the same schemas. Written before the routes so parallel work converges.
 */
import { z } from 'zod';
import { ENTITY_TYPES, RELATIONSHIP_TYPES, REPORT_TYPES, EVENT_TYPES, LOCATION_KINDS } from './db/schema';

export const EntityType = z.enum(ENTITY_TYPES);
export const RelationshipType = z.enum(RELATIONSHIP_TYPES);
export const ReportType = z.enum(REPORT_TYPES);
export const EventType = z.enum(EVENT_TYPES);
export const LocationKind = z.enum(LOCATION_KINDS);

const isoDate = z.string().datetime({ offset: true });

export const FactionOut = z.object({
  id: z.string(), name: z.string(), color: z.string(), description: z.string(),
});

export const EntityOut = z.object({
  id: z.string(),
  type: EntityType,
  name: z.string(),
  aliases: z.array(z.string()),
  factionId: z.string().nullable(),
  description: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  confidence: z.number(),
  lon: z.number().nullable(),
  lat: z.number().nullable(),
  locationKind: LocationKind.nullable(),
});

export const RelationshipOut = z.object({
  id: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  type: RelationshipType,
  startAt: isoDate.nullable(),
  endAt: isoDate.nullable(),
  confidence: z.number(),
  attributes: z.record(z.string(), z.unknown()),
});

export const ReportSummaryOut = z.object({
  id: z.string(),
  reportNumber: z.string(),
  type: ReportType,
  title: z.string(),
  sourceReliability: z.string(),
  infoCredibility: z.number().int(),
  reportedAt: isoDate,
  eventAt: isoDate.nullable(),
  marking: z.string(),
  snippet: z.string(),
  entityIds: z.array(z.string()),
});

export const ReportOut = ReportSummaryOut.omit({ snippet: true }).extend({
  body: z.string(),
  links: z.array(z.object({
    objectType: z.enum(['entity', 'relationship', 'event']),
    objectId: z.string(),
    excerpt: z.string(),
    name: z.string().nullable(),
  })),
});

export const EventOut = z.object({
  id: z.string(),
  type: EventType,
  title: z.string(),
  description: z.string(),
  lon: z.number(),
  lat: z.number(),
  occurredAt: isoDate,
  confidence: z.number(),
  factionId: z.string().nullable(),
  entityIds: z.array(z.string()),
  reportIds: z.array(z.string()),
});

export const EntityProfileOut = z.object({
  entity: EntityOut,
  faction: FactionOut.nullable(),
  connections: z.array(RelationshipOut.extend({
    other: EntityOut.pick({ id: true, name: true, type: true, factionId: true }),
    direction: z.enum(['out', 'in']),
    reportIds: z.array(z.string()),
  })),
  events: z.array(EventOut),
  reports: z.array(ReportSummaryOut),
});

// ---- query params ------------------------------------------------------------

const csv = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.length ? v.split(',') : v === undefined ? undefined : v), z.array(inner).optional());

export const EntityListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  type: csv(EntityType),
  faction: csv(z.string()),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const ReportListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  type: csv(ReportType),
  entity: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const EventListQuery = z.object({
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional(), // minLon,minLat,maxLon,maxLat
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: csv(EventType),
  faction: csv(z.string()),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

export const NeighborsQuery = z.object({
  id: z.string().min(1),
  depth: z.coerce.number().int().min(1).max(3).default(1),
  relTypes: csv(RelationshipType),
});

export const PathQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  // Evidence paths through the money trail run 5 hops; locations are excluded as
  // intermediates so this is not a hub-inflated number. See DECISIONS.md D5.
  maxHops: z.coerce.number().int().min(1).max(8).default(6),
});

export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const GraphOut = z.object({
  nodes: z.array(EntityOut),
  edges: z.array(RelationshipOut),
});

export const PathOut = z.object({
  found: z.boolean(),
  paths: z.array(z.object({
    nodeIds: z.array(z.string()),
    edgeIds: z.array(z.string()),
    hops: z.number().int(),
  })),
  nodes: z.array(EntityOut),
  edges: z.array(RelationshipOut.extend({ reportIds: z.array(z.string()) })),
});

export const SearchOut = z.object({
  entities: z.array(EntityOut.pick({ id: true, name: true, type: true, factionId: true })),
  reports: z.array(ReportSummaryOut.pick({ id: true, reportNumber: true, type: true, title: true, reportedAt: true })),
});

export const ApiError = z.object({ error: z.string(), issues: z.unknown().optional() });

export type Entity = z.infer<typeof EntityOut>;
export type Relationship = z.infer<typeof RelationshipOut>;
export type ReportSummary = z.infer<typeof ReportSummaryOut>;
export type Report = z.infer<typeof ReportOut>;
export type Event = z.infer<typeof EventOut>;
export type EntityProfile = z.infer<typeof EntityProfileOut>;
export type Faction = z.infer<typeof FactionOut>;
export type Graph = z.infer<typeof GraphOut>;
export type PathResult = z.infer<typeof PathOut>;
export type SearchResult = z.infer<typeof SearchOut>;
