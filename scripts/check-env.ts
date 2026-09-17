/**
 * P0.1 gate: every required variable is present, and the two external
 * services actually answer. Presence alone is not evidence -- a typo in the
 * connection string passes a presence check and fails four phases later.
 */
import './_env.ts';
import pg from 'pg';

const REQUIRED = [
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'APP_PASSWORD',
] as const;

const fail: string[] = [];

for (const key of REQUIRED) {
  const v = process.env[key];
  if (!v || !v.trim()) fail.push(`missing or empty: ${key}`);
}
if (process.env.DATABASE_URL?.includes('[YOUR-PASSWORD]')) {
  fail.push('DATABASE_URL still contains the [YOUR-PASSWORD] placeholder');
}
// A key pasted from a redacted display ("sk-or-v1-…") passes a presence check and
// fails every request with a ByteString error deep inside fetch. Catch it here.
const key = process.env.OPENROUTER_API_KEY ?? '';
if (key && /[^\x21-\x7e]/.test(key)) {
  fail.push(`OPENROUTER_API_KEY contains characters that cannot be sent in an HTTP header (length ${key.length}); re-copy the full key`);
} else if (key && key.length < 32) {
  fail.push(`OPENROUTER_API_KEY looks truncated (length ${key.length})`);
}
if (process.env.OPENROUTER_MODEL && !process.env.OPENROUTER_MODEL.includes('/')) {
  fail.push(`OPENROUTER_MODEL "${process.env.OPENROUTER_MODEL}" has no vendor prefix; OpenRouter ids look like deepseek/deepseek-v4-flash-0731`);
}

if (fail.length) {
  console.error('FAIL\n' + fail.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('env vars present: OK');

// Postgres reachability
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const { rows } = await client.query('select version()');
  console.log(`postgres: OK (${String(rows[0].version).split(',')[0]})`);
  await client.end();
} catch (e) {
  console.error(`FAIL postgres: ${(e as Error).message}`);
  process.exit(1);
}

// OpenRouter reachability + does the configured model exist on the account
try {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data: Array<{ id: string }> };
  const want = process.env.OPENROUTER_MODEL!;
  const ids = body.data.map((m) => m.id);
  const exact = ids.includes(want);
  const near = ids.filter((id) => id.includes(want.split('-')[0]));
  console.log(`openrouter: OK (${ids.length} models visible)`);
  console.log(
    exact
      ? `model "${want}": listed`
      : `model "${want}": NOT listed exactly. Nearest: ${near.slice(0, 8).join(', ') || '(none)'}`,
  );
} catch (e) {
  console.error(`FAIL openrouter: ${(e as Error).message}`);
  process.exit(1);
}

console.log('\nP0.1 PASS');
