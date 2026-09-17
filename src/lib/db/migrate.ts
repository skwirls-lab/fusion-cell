/**
 * Minimal, transparent migration runner. Applies supabase/migrations/*.sql in
 * filename order, once each, tracked in _migrations. Works on both drivers
 * because it only needs multi-statement raw exec.
 *
 * Deliberately not drizzle-kit: the SQL is hand-written so a person can read
 * exactly what the database looks like, and so it runs identically in-process
 * for tests and against Supabase in production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { DbHandle } from './index';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');

export async function runMigrations(h: DbHandle): Promise<string[]> {
  await h.rawExec(`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );`);
  const applied = new Set(
    (await h.db.execute<{ name: string }>(sql`select name from _migrations`)).rows.map((r) => r.name),
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    await h.rawExec(`begin;\n${text}\ninsert into _migrations(name) values ('${f.replace(/'/g, "''")}');\ncommit;`);
    ran.push(f);
  }
  return ran;
}
