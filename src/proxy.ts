/**
 * Shared-password gate (BUILD.md §2). Runs before every request except static
 * assets. API callers get a JSON 401; page requests bounce to /login and keep
 * the path they wanted so login can send them back.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isValidSession } from '@/lib/auth';

const PUBLIC_PATHS = new Set(['/login', '/api/login', '/api/logout', '/api/health', '/favicon.ico']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/_next/')) return true;
  // Anything with a file extension (icons, fonts, manifests) is static.
  return /\.[a-z0-9]+$/i.test(pathname);
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url, 307);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
