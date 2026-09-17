import { getDb } from '@/lib/db';
import { getReport } from '@/lib/db/queries';
import { handle, json } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const report = await getReport(db, id);
  if (!report) return json({ error: 'not_found' }, { status: 404 });
  return json(report);
});
