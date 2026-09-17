import { getDbHandle } from '@/lib/db';
import { adminStats } from '@/lib/db/queries';
import { handle, json } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const h = await getDbHandle();
  const stats = await adminStats(h.db);
  return json({ ...stats, driver: h.driver, model: process.env.OPENROUTER_MODEL ?? null });
});
