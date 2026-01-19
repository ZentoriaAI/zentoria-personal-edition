import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login'];

// Static files and API routes to skip
const SKIP_ROUTES = ['/_next', '/api', '/favicon', '/static'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and API routes
  if (SKIP_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Skip public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    // If already authenticated and trying to access login, redirect to dashboard
    const authCookie = request.cookies.get('zentoria_auth');
    if (authCookie?.value) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Check for auth cookie (set by client after login)
  const authCookie = request.cookies.get('zentoria_auth');

  // If no auth cookie, redirect to login
  if (!authCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    // Store the original URL to redirect back after login
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (robots.txt, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
  ],
};
