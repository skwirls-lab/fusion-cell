/**
 * POST /api/ingest — start an ingest job: store the text, run the one-shot
 * extraction against the configured model, match entities, park the result
 * on the job as status 'reviewed'. A failed extraction leaves the job
 * 'pending' with the error stored and answers 502 so the UI can retry.
 *
 * GET /api/ingest — recent jobs (admin page, resume list).
 */
import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { parseBody } from '@/lib/ai/request';
import { getProvider, isNetworkBlocked, type ChatProvider } from '@/lib/ai/provider';
import { extractFromReport, ExtractionError } from '@/lib/ai/extract';
import { matchEntities } from '@/lib/ingest/match';
import { createIngestJob, listIngestJobs, serializeJob, serializeJobSummary, updateIngestJob } from '@/lib/ingest/jobs';
import { IngestRequestBody, type JobExtraction } from '@/lib/ingest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const GET = handle(async () => {
  const db = await getDb();
  const jobs = await listIngestJobs(db, 25);
  return json({ jobs: jobs.map(serializeJobSummary) });
});

export const POST = handle(async (req) => {
  const body = await parseBody(IngestRequestBody, req);
  const db = await getDb();
  const job = await createIngestJob(db, body);

  let provider: ChatProvider;
  try {
    provider = getProvider();
  } catch (e) {
    const message = `Model provider is not configured: ${errMsg(e)}`;
    await updateIngestJob(db, job.id, { extraction: { error: message } satisfies JobExtraction });
    return json({ error: 'extraction_failed', message, jobId: job.id }, { status: 502 });
  }

  try {
    const { extraction, raw, model } = await extractFromReport({ provider, rawText: body.rawText, reportType: body.reportType, signal: req.signal });
    const matches = await matchEntities(db, extraction.entities);
    const stored: JobExtraction = { extraction, matches, model, source: 'model', raw };
    const updated = await updateIngestJob(db, job.id, { status: 'reviewed', extraction: stored });
    return json(serializeJob(updated ?? { ...job, status: 'reviewed', extraction: stored }));
  } catch (e) {
    const message = e instanceof ExtractionError
      ? e.message
      : isNetworkBlocked(e)
        ? `The model endpoint could not be reached: ${errMsg(e)}`
        : `Model call failed: ${errMsg(e)}`;
    const stored: JobExtraction = { error: message, model: provider.model, source: 'model', raw: e instanceof ExtractionError ? e.raw : undefined };
    await updateIngestJob(db, job.id, { extraction: stored });
    return json({ error: 'extraction_failed', message, jobId: job.id }, { status: 502 });
  }
});
