import { getDb } from '@/lib/db';
import { listEvents } from '@/lib/db/queries';
import { EventListQuery } from '@/lib/types';
import { handle, json, parseQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = parseQuery(EventListQuery, req);
  const db = await getDb();
  return json({ events: await listEvents(db, q) });
});
