import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { getIngestJob, serializeJob, updateIngestJob } from '@/lib/ingest/jobs';

export const dynamic = 'force-dynamic';

export const POST = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const job = await getIngestJob(db, id);
  if (!job) return json({ error: 'not_found' }, { status: 404 });
  if (job.status === 'committed') return json({ error: 'already_committed', message: `job ${id} was committed as ${job.reportId ?? '?'}` }, { status: 409 });
  const updated = await updateIngestJob(db, id, { status: 'discarded' });
  return json(serializeJob(updated ?? { ...job, status: 'discarded' }));
});
