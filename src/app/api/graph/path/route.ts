import { getDb } from '@/lib/db';
import { findPaths } from '@/lib/db/queries';
import { PathQuery } from '@/lib/types';
import { handle, json, parseQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = parseQuery(PathQuery, req);
  const db = await getDb();
  return json(await findPaths(db, q));
});
