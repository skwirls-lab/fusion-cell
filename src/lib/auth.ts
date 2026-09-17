/**
 * Shared-password auth. One cookie, one derived token, no user table.
 * Web Crypto only, so it runs identically in the proxy (edge or node),
 * route handlers, and tsx scripts.
 */
export const SESSION_COOKIE = 'fc_session';
const SALT = 'fusion-cell-v1';

export async function sessionTokenFor(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${SALT}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isValidSession(token: string | undefined | null): Promise<boolean> {
  const pw = process.env.APP_PASSWORD;
  if (!pw || !token) return false;
  const expected = await sessionTokenFor(pw);
  // constant-time-ish compare; lengths are fixed (64 hex chars)
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
