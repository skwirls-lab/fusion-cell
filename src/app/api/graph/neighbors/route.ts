import { getDb } from '@/lib/db';
import { getNeighbors } from '@/lib/db/queries';
import { NeighborsQuery } from '@/lib/types';
import { handle, json, parseQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = parseQuery(NeighborsQuery, req);
  const db = await getDb();
  return json(await getNeighbors(db, q));
});
