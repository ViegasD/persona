import { NextRequest, NextResponse } from 'next/server';

/**
 * Basic authentication middleware for the admin panel.
 * Credentials come from ADMIN_USER / ADMIN_PASS env vars (runtime, server-only).
 */
export function middleware(request: NextRequest) {
  const user = process.env.ADMIN_USER ?? 'admin';
  const pass = process.env.ADMIN_PASS ?? '';

  // If no password is configured, skip auth (dev mode)
  if (!pass) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const [u, p] = decoded.split(':');
      if (u === user && p === pass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Persona Admin"',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/debug|api/preview|api/images).*)'],
};
