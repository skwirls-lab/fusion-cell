/** Apply pending migrations to whichever database the env points at. */
import './_env.ts';
import { createDb } from '../src/lib/db/index';
import { runMigrations } from '../src/lib/db/migrate';

const h = await createDb();
console.log(`driver: ${h.driver}`);
const ran = await runMigrations(h);
console.log(ran.length ? `applied: ${ran.join(', ')}` : 'nothing to apply');
await h.close();
