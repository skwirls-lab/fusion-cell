import { getDb } from '@/lib/db';
import { search } from '@/lib/db/queries';
import { SearchQuery } from '@/lib/types';
import { handle, json, parseQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = parseQuery(SearchQuery, req);
  const db = await getDb();
  return json(await search(db, q));
});
