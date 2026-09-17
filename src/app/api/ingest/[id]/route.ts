import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { getIngestJob, serializeJob } from '@/lib/ingest/jobs';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const job = await getIngestJob(db, id);
  if (!job) return json({ error: 'not_found' }, { status: 404 });
  return json(serializeJob(job));
});
