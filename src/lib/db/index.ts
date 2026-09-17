/**
 * Database handle. One module, two drivers:
 *
 *   pg      — production. Supabase Postgres via DATABASE_URL (session pooler).
 *   pglite  — local dev and every test. Real Postgres compiled to WASM, running
 *             in-process. Same SQL, same Drizzle queries, zero network, zero setup.
 *
 * Driver selection: DB_DRIVER=pg|pglite wins; otherwise pg if DATABASE_URL is
 * set, else pglite. PGLITE_DIR is a directory (persists across restarts) or
 * "memory" for an ephemeral instance (tests).
 *
 * The Drizzle query API is identical across both; we type the handle as the
 * node-postgres flavour and cast the pglite one. That is the only cast in the
 * data layer and it exists so every query in the app is written exactly once.
 */
import * as schema from './schema';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Db = NodePgDatabase<typeof schema>;
export type Driver = 'pg' | 'pglite';

export interface DbHandle {
  db: Db;
  driver: Driver;
  /** Multi-statement raw SQL (migrations). Bypasses the extended protocol. */
  rawExec: (sqlText: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  driver?: Driver;
  connectionString?: string;
  pgliteDir?: string; // path or "memory"
}

export function resolveDriver(opts: CreateDbOptions = {}): Driver {
  if (opts.driver) return opts.driver;
  const env = process.env.DB_DRIVER;
  if (env === 'pg' || env === 'pglite') return env;
  return (opts.connectionString ?? process.env.DATABASE_URL) ? 'pg' : 'pglite';
}

export async function createDb(opts: CreateDbOptions = {}): Promise<DbHandle> {
  const driver = resolveDriver(opts);

  if (driver === 'pg') {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const connectionString = opts.connectionString ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required for the pg driver');
    // Serverless: keep the pool tiny. Supabase's session pooler multiplexes for us.
    const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
    const db = drizzle(pool, { schema });
    return {
      db,
      driver,
      rawExec: async (t) => { await pool.query(t); },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const dir = opts.pgliteDir ?? process.env.PGLITE_DIR ?? '.pglite/dev';
  if (dir !== 'memory') {
    // PGlite does not create parent directories; a nested PGLITE_DIR fails with ENOENT.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dir, { recursive: true });
  }
  const client = dir === 'memory' ? new PGlite() : new PGlite(dir);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  return {
    db,
    driver,
    rawExec: async (t) => { await client.exec(t); },
    close: () => client.close(),
  };
}

// ---- process-wide singleton for the Next.js server -------------------------
// Next dev reloads modules on edit; stash on globalThis so we don't open a new
// pool (or a second PGlite on the same directory, which locks) every reload.
const g = globalThis as unknown as { __fusionDb?: Promise<DbHandle> };

export function getDbHandle(): Promise<DbHandle> {
  if (!g.__fusionDb) {
    g.__fusionDb = createDb().then(async (h) => {
      // Local PGlite is self-provisioning: migrate on first touch so `npm run dev`
      // just works. Production is migrated explicitly by scripts/migrate.ts.
      if (h.driver === 'pglite') {
        const { runMigrations } = await import('./migrate');
        await runMigrations(h);
      }
      return h;
    });
    // Don't cache a rejection: a transient failure would otherwise pin every
    // later request to 503 until the process restarts.
    g.__fusionDb.catch(() => { g.__fusionDb = undefined; });
  }
  return g.__fusionDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

export { schema };
