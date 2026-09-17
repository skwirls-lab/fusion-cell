import { getDb } from '@/lib/db';
import { listReports } from '@/lib/db/queries';
import { ReportListQuery } from '@/lib/types';
import { handle, json, parseQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = parseQuery(ReportListQuery, req);
  const db = await getDb();
  return json(await listReports(db, q));
});
