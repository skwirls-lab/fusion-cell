import { getDb } from '@/lib/db';
import { getEntityProfile } from '@/lib/db/queries';
import { handle, json } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const profile = await getEntityProfile(db, id);
  if (!profile) return json({ error: 'not_found' }, { status: 404 });
  return json(profile);
});
