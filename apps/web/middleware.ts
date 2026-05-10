import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require an active session
const PROTECTED_ROUTES = ["/dashboard", "/room"];

// Routes that should redirect authenticated users away (no point showing login if already in)
const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for the lightweight session marker cookie (non-httpOnly, set by auth.store.ts and oauth.controller.ts)
  // Note: this does NOT verify the JWT — it only gates the page navigation.
  // The actual token validation happens inside the protected page via AuthBootstrap + silent refresh.
  const hasSession = request.cookies.get("has_session")?.value === "true";

  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // Redirect unauthenticated users away from protected routes
  if (isProtected && !hasSession) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/auth/signin";
    return NextResponse.redirect(signInUrl);
  }

  // Redirect already-authenticated users away from login/signup pages
  if (isAuthRoute && hasSession) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, logo, public assets
     * - auth/callback (OAuth bridge page — must be accessible without session cookie)
     */
    "/((?!_next/static|_next/image|favicon.ico|logo|.*\\.svg|.*\\.webp|.*\\.png|auth/callback).*)",
  ],
};
