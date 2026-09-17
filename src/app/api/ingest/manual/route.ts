/**
 * DEV-ONLY SEAM — POST /api/ingest/manual
 *
 * Creates an ingest job from a caller-supplied extraction, skipping the model.
 * It exists so the review → commit path (P6.3 / P6.4) can be exercised end to
 * end by e2e/ingest.spec.ts in an environment where the model endpoint is
 * unreachable. It does NOT exercise extractFromReport: the model-facing path
 * is covered by tests/unit/ingest/extract.test.ts with a ScriptedProvider.
 *
 * What it still verifies for real: the extraction is validated against the
 * same Zod contract the model output must satisfy, entity matching runs
 * against the live database, and the job is stored and committed by exactly
 * the same code the model path uses.
 *
 * Refuses with 404 when NODE_ENV === 'production', so it is absent from the
 * deployed app.
 */
import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { parseBody } from '@/lib/ai/request';
import { matchEntities } from '@/lib/ingest/match';
import { createIngestJob, serializeJob, updateIngestJob } from '@/lib/ingest/jobs';
import { ManualIngestBody, type JobExtraction } from '@/lib/ingest/types';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  if (process.env.NODE_ENV === 'production') return json({ error: 'not_found' }, { status: 404 });
  const body = await parseBody(ManualIngestBody, req);
  const db = await getDb();
  const job = await createIngestJob(db, { rawText: body.rawText, reportType: body.reportType });
  const matches = await matchEntities(db, body.extraction.entities);
  const stored: JobExtraction = { extraction: body.extraction, matches, model: 'manual', source: 'manual' };
  const updated = await updateIngestJob(db, job.id, { status: 'reviewed', extraction: stored });
  return json(serializeJob(updated ?? { ...job, status: 'reviewed', extraction: stored }), { status: 201 });
});
