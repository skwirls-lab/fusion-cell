/**
 * P3 gate: the shared-password gate actually gates. Runs against a server that
 * is already up (E2E_BASE_URL); it does not start one.
 */
import './_env.ts';
import { sessionTokenFor } from '../src/lib/auth';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.APP_PASSWORD;
if (!PASSWORD) { console.error('FAIL: APP_PASSWORD is not set'); process.exit(1); }

let failures = 0;
function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failures++;
}

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { redirect: 'manual', headers });
const postJson = (path: string, body: unknown) =>
  fetch(BASE + path, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

{
  const r = await get('/');
  const loc = r.headers.get('location') ?? '';
  report('GET / without cookie redirects to /login', r.status === 307 && loc.includes('/login'), `${r.status} -> ${loc}`);
}
{
  const r = await get('/api/entities');
  report('GET /api/entities without cookie is 401', r.status === 401, `${r.status}`);
}
{
  const r = await get('/api/health');
  const body = (await r.json().catch(() => null)) as { ok?: boolean } | null;
  report('GET /api/health is public and ok', r.status === 200 && body?.ok === true, `${r.status} ok=${body?.ok}`);
}
{
  const token = await sessionTokenFor(PASSWORD);
  const r = await get('/', { cookie: `fc_session=${token}` });
  report('GET / with valid cookie is 200', r.status === 200, `${r.status}`);
}
{
  const r = await postJson('/api/login', { password: `${PASSWORD}-wrong` });
  report('POST /api/login wrong password is 401', r.status === 401, `${r.status}`);
}
{
  const r = await postJson('/api/login', { password: PASSWORD });
  const setCookie = r.headers.get('set-cookie') ?? '';
  report('POST /api/login right password sets fc_session', r.status === 200 && setCookie.includes('fc_session='), `${r.status} set-cookie=${setCookie ? 'yes' : 'no'}`);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\ncheck-auth PASS');
