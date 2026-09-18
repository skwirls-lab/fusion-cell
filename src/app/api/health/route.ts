import { NextResponse } from 'next/server';
import { count } from 'drizzle-orm';
import { getDbHandle, resolveDriver, schema } from '@/lib/db';

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
    // Drizzle wraps driver errors ("Failed query: …"); the cause chain holds the real reason
    // (SSL, DNS, auth, missing table). No connection string or credential is ever in there.
    const chain: string[] = [];
    for (let e: unknown = err, i = 0; e && i < 6; e = (e as { cause?: unknown }).cause, i++) {
      const o = e as { message?: unknown; code?: unknown };
      chain.push([typeof o.code === 'string' ? `[${o.code}]` : '', typeof o.message === 'string' ? o.message.split('\n')[0] : String(e)].filter(Boolean).join(' '));
    }
    return NextResponse.json({
      ok: false,
      driver: resolveDriver(),
      databaseUrlSet: Boolean(process.env.DATABASE_URL),
      error: chain,
    }, { status: 503 });
  }
}
