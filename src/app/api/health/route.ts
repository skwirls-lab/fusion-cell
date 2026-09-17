import { NextResponse } from 'next/server';
import { count } from 'drizzle-orm';
import { getDbHandle, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Liveness + a real round-trip to the database. Public (see proxy.ts). */
export async function GET() {
  try {
    const h = await getDbHandle();
    const [[e], [r]] = await Promise.all([
      h.db.select({ n: count() }).from(schema.entities),
      h.db.select({ n: count() }).from(schema.reports),
    ]);
    return NextResponse.json({
      ok: true,
      driver: h.driver,
      counts: { entities: e?.n ?? 0, reports: r?.n ?? 0 },
      model: process.env.OPENROUTER_MODEL ?? null,
      time: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
