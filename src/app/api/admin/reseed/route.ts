/**
 * POST /api/admin/reseed — wipe and reload data/seed/*.json on the live
 * handle (PRD §5.11 "reset and reseed with one click"). Same loader as
 * scripts/seed-db.ts; one transaction, so a failure leaves the old data.
 */
import { getDbHandle } from '@/lib/db';
import { loadSeed } from '@/lib/db/seed';
import { handle, json } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = handle(async () => {
  const h = await getDbHandle();
  const t0 = Date.now();
  try {
    const counts = await loadSeed(h);
    return json({ ok: true, counts, ms: Date.now() - t0 });
  } catch (e) {
    console.error(e);
    return json({ error: 'reseed_failed', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
