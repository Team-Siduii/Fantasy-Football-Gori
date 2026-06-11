import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseSessionEmail } from "@/lib/auth-session-codec";

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password";
}

function isPublicPage(pathname: string) {
  return pathname === "/" || isAuthPage(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = parseSessionEmail(request.cookies.get(AUTH_COOKIE_NAME)?.value) !== null;

  if (!isPublicPage(pathname) && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return response;
  }

  if (isAuthPage(pathname) && isAuthenticated) {
    // Stuur WK-managers naar de WK-pagina — de home page routeert dan
    // via resolvePreferredManagerRoute naar de juiste modus.
    const response = NextResponse.redirect(new URL("/", request.url));
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return response;
  }

  // Protected pages: never cache
  const response = NextResponse.next();
  if (!isPublicPage(pathname)) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
