/**
 * ingest_jobs persistence. Lives here rather than in db/queries.ts so the
 * ingest feature is one directory; same rules (plain functions over a Db,
 * results shaped to the contract in ./types).
 */
import { desc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { ingestJobs, type IngestJob } from '../db/schema';
import { JobExtraction, type IngestJobOut, type IngestJobSummaryOut } from './types';

export const newJobId = () => `job_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;

/** The stored jsonb, validated; malformed or absent → null so the UI degrades instead of crashing. */
export function parseJobExtraction(raw: unknown): JobExtraction | null {
  if (raw === null || raw === undefined) return null;
  const r = JobExtraction.safeParse(raw);
  return r.success ? r.data : null;
}

export function serializeJob(row: IngestJob): IngestJobOut {
  return {
    id: row.id,
    reportType: row.reportType,
    status: row.status,
    extraction: parseJobExtraction(row.extraction),
    reportId: row.reportId,
    createdAt: row.createdAt.toISOString(),
    rawText: row.rawText,
  };
}

export function serializeJobSummary(row: IngestJob): IngestJobSummaryOut {
  const x = parseJobExtraction(row.extraction);
  return {
    id: row.id,
    reportType: row.reportType,
    status: row.status,
    reportId: row.reportId,
    createdAt: row.createdAt.toISOString(),
    title: x?.extraction?.title ?? null,
    chars: row.rawText.length,
    error: x?.error ?? null,
  };
}

export async function createIngestJob(db: Db, input: { rawText: string; reportType: IngestJob['reportType'] }): Promise<IngestJob> {
  const [row] = await db.insert(ingestJobs).values({ id: newJobId(), rawText: input.rawText, reportType: input.reportType, status: 'pending' }).returning();
  return row;
}

export async function getIngestJob(db: Db, id: string): Promise<IngestJob | null> {
  const [row] = await db.select().from(ingestJobs).where(eq(ingestJobs.id, id)).limit(1);
  return row ?? null;
}

export async function updateIngestJob(
  db: Db,
  id: string,
  patch: Partial<Pick<IngestJob, 'status' | 'extraction' | 'reportId'>>,
): Promise<IngestJob | null> {
  const [row] = await db.update(ingestJobs).set(patch).where(eq(ingestJobs.id, id)).returning();
  return row ?? null;
}

export async function listIngestJobs(db: Db, limit = 20): Promise<IngestJob[]> {
  return db.select().from(ingestJobs).orderBy(desc(ingestJobs.createdAt), desc(ingestJobs.id)).limit(limit);
}
