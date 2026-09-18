import { NextResponse } from 'next/server';
import { count } from 'drizzle-orm';
import { getDbHandle, resolveDriver, schema } from '@/lib/db';
import { errorChain } from '@/lib/api';

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
    return NextResponse.json({
      ok: false,
      driver: resolveDriver(),
      databaseUrlSet: Boolean(process.env.DATABASE_URL),
      error: errorChain(err),
    }, { status: 503 });
  }
}
