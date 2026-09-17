import { getDb } from '@/lib/db';
import { listEntities } from '@/lib/db/queries';
import { EntityListQuery } from '@/lib/types';
import { handle, json, parseQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = parseQuery(EntityListQuery, req);
  const db = await getDb();
  return json({ entities: await listEntities(db, q) });
});
