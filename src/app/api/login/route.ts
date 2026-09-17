import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionTokenFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  let password: unknown;
  try {
    ({ password } = (await req.json()) as { password?: unknown });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const expected = process.env.APP_PASSWORD;
  if (!expected || typeof password !== 'string' || password !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionTokenFor(password), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: THIRTY_DAYS,
  });
  return res;
}
