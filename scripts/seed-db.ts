/**
 * Load data/seed/*.json into whichever database the env points at.
 * Wipe-and-load inside one transaction, so a reseed is atomic and repeatable.
 * The loader itself lives in src/lib/db/seed.ts so tests can reuse it.
 */
import './_env.ts';
import { createDb } from '../src/lib/db/index';
import { runMigrations } from '../src/lib/db/migrate';
import { loadSeed } from '../src/lib/db/seed';

const h = await createDb();
console.log(`driver: ${h.driver}`);
await runMigrations(h);

const t0 = Date.now();
const counts = await loadSeed(h);
console.table(counts);
console.log(`seeded in ${Date.now() - t0}ms`);
await h.close();
