import { getDb } from '@/lib/db';
import { listFactions } from '@/lib/db/queries';
import { handle, json } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const db = await getDb();
  return json({ factions: await listFactions(db) });
});
