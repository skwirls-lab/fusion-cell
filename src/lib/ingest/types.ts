/**
 * The ingest contract, shared by the extractor (model output), the matcher,
 * the commit step, the /api/ingest routes and the review UI. Same role as
 * src/lib/types.ts for the read API: written once, validated everywhere.
 *
 * Model-facing schema (Extraction) is deliberately lenient on the ends the
 * model tends to get wrong — over-long quotes are clipped, not rejected — and
 * strict on the things the database cannot absorb (enum values, ranges).
 */
import { z } from 'zod';
import { ENTITY_TYPES, RELATIONSHIP_TYPES, REPORT_TYPES, EVENT_TYPES, INGEST_STATUSES } from '../db/schema';

export const EVIDENCE_MAX = 160;
const clip = (n: number) => (s: string) => (s.length > n ? s.slice(0, n) : s);

/** ISO-8601 that Date can parse. Refined, not `.datetime()`: models emit `2026-08-20T14:00Z` and `2026-08-20 14:00`. */
const looseIso = z.string().trim().min(4).refine((s) => !Number.isNaN(Date.parse(s)), 'not a parseable date-time');

export const ExtractedEntity = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(ENTITY_TYPES),
  aliases: z.array(z.string().trim().min(1).max(120)).default([]),
  description: z.string().max(600).default(''),
  confidence: z.number().min(0).max(1),
  lon: z.number().optional(),
  lat: z.number().optional(),
});

export const ExtractedRelationship = z.object({
  source_name: z.string().trim().min(1).max(120),
  target_name: z.string().trim().min(1).max(120),
  type: z.enum(RELATIONSHIP_TYPES),
  confidence: z.number().min(0).max(1),
  evidence: z.string().transform(clip(EVIDENCE_MAX)),
});

export const ExtractedEvent = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(EVENT_TYPES),
  occurred_at: looseIso.nullable(),
  location_name: z.string().trim().max(120).nullable(),
  participant_names: z.array(z.string().trim().min(1).max(120)).default([]),
  description: z.string().max(600).default(''),
  confidence: z.number().min(0).max(1),
});

export const Extraction = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(800),
  event_at: looseIso.nullable(),
  source_reliability: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).nullable(),
  info_credibility: z.number().int().min(1).max(6).nullable(),
  entities: z.array(ExtractedEntity).max(60),
  relationships: z.array(ExtractedRelationship).max(80),
  events: z.array(ExtractedEvent).max(40),
});

export type ExtractedEntity = z.output<typeof ExtractedEntity>;
export type ExtractedRelationship = z.output<typeof ExtractedRelationship>;
export type ExtractedEvent = z.output<typeof ExtractedEvent>;
export type Extraction = z.output<typeof Extraction>;
export type ExtractionInput = z.input<typeof Extraction>;

// ---- matching -------------------------------------------------------------------

export const MatchCandidate = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(ENTITY_TYPES),
  factionId: z.string().nullable(),
  score: z.number().min(0).max(1),
});

export const EntityMatch = z.object({
  candidates: z.array(MatchCandidate).max(3),
  suggested: z.enum(['link', 'create', 'discard']),
  suggestedId: z.string().nullable(),
});

export type MatchCandidate = z.infer<typeof MatchCandidate>;
export type EntityMatch = z.infer<typeof EntityMatch>;

// ---- what ingest_jobs.extraction holds --------------------------------------------

/**
 * Stored on the job. A failed extraction keeps `error` (and `raw`, the model
 * text) with no `extraction`, so the review page can explain and offer retry.
 */
export const JobExtraction = z.object({
  extraction: Extraction.optional(),
  matches: z.array(EntityMatch).optional(),
  model: z.string().optional(),
  /** 'manual' when the extraction came from the dev-only seam, not a model. */
  source: z.enum(['model', 'manual']).optional(),
  error: z.string().optional(),
  raw: z.string().optional(),
});
export type JobExtraction = z.infer<typeof JobExtraction>;

export const IngestJobOut = z.object({
  id: z.string(),
  reportType: z.enum(REPORT_TYPES),
  status: z.enum(INGEST_STATUSES),
  extraction: JobExtraction.nullable(),
  reportId: z.string().nullable(),
  createdAt: z.string(),
  rawText: z.string(),
});
export type IngestJobOut = z.infer<typeof IngestJobOut>;

export const IngestJobSummaryOut = IngestJobOut.omit({ rawText: true, extraction: true }).extend({
  title: z.string().nullable(),
  chars: z.number().int(),
  error: z.string().nullable(),
});
export type IngestJobSummaryOut = z.infer<typeof IngestJobSummaryOut>;

// ---- request bodies -------------------------------------------------------------

export const IngestRequestBody = z.object({
  rawText: z.string().min(20).max(20_000),
  reportType: z.enum(REPORT_TYPES),
});

/** Dev-only seam (see src/app/api/ingest/manual/route.ts). */
export const ManualIngestBody = IngestRequestBody.extend({ extraction: Extraction });

export const EntityDecision = z.object({
  index: z.number().int().min(0),
  action: z.enum(['link', 'create', 'discard']),
  entityId: z.string().min(1).optional(),
  overrides: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    type: z.enum(ENTITY_TYPES).optional(),
    aliases: z.array(z.string().trim().min(1).max(120)).optional(),
    description: z.string().max(600).optional(),
  }).optional(),
});
export const KeepDecision = z.object({ index: z.number().int().min(0), action: z.enum(['create', 'discard']) });

export const IngestDecisions = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  entities: z.array(EntityDecision).default([]),
  relationships: z.array(KeepDecision).default([]),
  events: z.array(KeepDecision).default([]),
});
export type IngestDecisions = z.input<typeof IngestDecisions>;
export type IngestDecisionsOut = z.output<typeof IngestDecisions>;

export const CommitBody = z.object({ decisions: IngestDecisions });

// ---- results -------------------------------------------------------------------

export const CommitResult = z.object({
  reportNumber: z.string(),
  reportId: z.string(),
  created: z.object({
    entities: z.array(z.object({ id: z.string(), name: z.string() })),
    relationships: z.array(z.string()),
    events: z.array(z.string()),
  }),
  linked: z.array(z.object({ id: z.string(), name: z.string() })),
  skipped: z.array(z.string()),
});
export type CommitResult = z.infer<typeof CommitResult>;

export const AdminStatsOut = z.object({
  counts: z.object({
    factions: z.number().int(),
    entities: z.number().int(),
    relationships: z.number().int(),
    reports: z.number().int(),
    events: z.number().int(),
    report_links: z.number().int(),
    event_entities: z.number().int(),
    ingest_jobs: z.number().int(),
    briefs: z.number().int(),
  }),
  newestReportAt: z.string().nullable(),
  ingestByStatus: z.record(z.string(), z.number().int()),
  driver: z.string(),
  model: z.string().nullable(),
});
export type AdminStats = z.infer<typeof AdminStatsOut>;

export const ReseedOut = z.object({
  ok: z.literal(true),
  counts: z.record(z.string(), z.number().int()),
  ms: z.number().int(),
});
export type ReseedResult = z.infer<typeof ReseedOut>;
